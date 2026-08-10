
// Helper function to resolve Outcode from MID with multi-strategy matching
export function resolveOutcodeFromMid(rawMid, desc = "", primaryMidMap = {}, masterMappings = {}) {
    const depositMap = masterMappings.deposit_cards || {};
    const bcaMidMap = masterMappings.bca_mids || {};
    const briMidMap = masterMappings.bri_mids || {};

    const mapsToSearch = [primaryMidMap, depositMap, bcaMidMap, briMidMap];

    // Extract digit sequences from Keterangan (Kolom B Ref 6 / Kolom G Ref 5)
    const descDigits = (desc || '').match(/\d+/g) || [];

    // 1. Direct key match with extracted rawMid or cleanMid
    if (rawMid) {
        const strMid = rawMid.toString().trim();
        const cleanMid = strMid.replace(/^0+/, '');
        for (const m of mapsToSearch) {
            if (!m) continue;
            if (m[strMid]) return m[strMid];
            if (m[cleanMid]) return m[cleanMid];
        }
    }

    // 2. Pure MID String Snippet Match between Master MIDs (Ref 2, 3, 4) and Keterangan text (Ref 5, 6)
    for (const m of mapsToSearch) {
        if (!m) continue;
        for (const [key, outcode] of Object.entries(m)) {
            if (!key || !outcode) continue;
            const cleanKey = key.toString().trim().replace(/^0+/, '');

            if (cleanKey.length >= 5) {
                // A. Check if Keterangan string contains Master MID key snippet
                if (desc.includes(cleanKey)) {
                    return outcode;
                }

                // B. Check numeric digit snippets extracted from Keterangan
                for (const d of descDigits) {
                    const cleanD = d.replace(/^0+/, '');
                    if (cleanD.length >= 5) {
                        if (cleanD === cleanKey || cleanD.includes(cleanKey) || cleanKey.includes(cleanD)) {
                            return outcode;
                        }
                    }
                }
            }
        }
    }

    return '';
}

import * as XLSX from 'xlsx';

/**
 * Clean numeric string from rupiah formatting or currency noise
 */
function parseNumber(val) {
    if (!val && val !== 0) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().trim().replace(/[^0-9\.-]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

/**
 * Format date value from Excel into YYYY-MM-DD
 */
function parseExcelDate(rawVal) {
    if (!rawVal && rawVal !== 0) return '';
    const strVal = rawVal.toString().trim();

    if (/^\d+(\.\d+)?$/.test(strVal)) {
        const excelDateNum = parseFloat(strVal);
        if (excelDateNum > 40000 && excelDateNum < 60000) {
            const d = new Date((excelDateNum - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
    }

    const isoMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];

    const yyyymmddMatch = strVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (yyyymmddMatch) {
        const year = yyyymmddMatch[1];
        const month = yyyymmddMatch[2].padStart(2, '0');
        const day = yyyymmddMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const ddmmyyyyMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyyMatch) {
        const dayNum = parseInt(ddmmyyyyMatch[1], 10);
        const monthNum = parseInt(ddmmyyyyMatch[2], 10);
        const yearNum = parseInt(ddmmyyyyMatch[3], 10);

        if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 2000) {
            const day = ddmmyyyyMatch[1].padStart(2, '0');
            const month = ddmmyyyyMatch[2].padStart(2, '0');
            return `${yearNum}-${month}-${day}`;
        }
    }

    const d = new Date(strVal);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return '';
}

/**
 * Extract OUTCODE from store string like "0001-JKJSTT1" -> "JKJSTT1"
 */
function extractOutcode(storeStr) {
    if (!storeStr) return '';
    const clean = storeStr.toString().trim();
    if (clean.includes('-')) {
        const parts = clean.split('-');
        return parts[1] ? parts[1].trim() : parts[0].trim();
    }
    return clean;
}

/**
 * Helper to determine Sub-Group key for Xilnex daily sales
 */
export function determineXilnexSubGroup(merchantBank, cardType) {
    const bank = (merchantBank || '').toUpperCase();
    const card = (cardType || '').toUpperCase();

    const isBca = bank.includes('BCA');
    const isBri = bank.includes('BRI');

    if (isBca) {
        if (card.includes('QRIS')) return 'BCA_QRIS';
        if (card.includes('DEBIT')) return 'BCA_DEBIT';
        return 'BCA_CREDIT';
    }

    if (isBri) {
        if (card.includes('QRIS')) return 'BRI_QRIS';
        if (card.includes('DEBIT BANK SAMA') || card.includes('DEBIT SAMA') || card.includes('ONUS')) {
            return 'BRI_ONUS';
        }
        return 'BRI_OFFUS';
    }

    return 'OTHER';
}

// ============================================================
// REFERENSI 1: Cash & Card Automation (Xilnex Daily Sales)
// ============================================================
export function parseXilnexSalesExcel(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    if (workbook.SheetNames.length === 0) throw new Error('File Excel tidak memiliki sheet data.');

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (rawRows.length < 14) throw new Error('File Xilnex tidak memiliki baris data (Header minimal di baris 14).');

    const rows = [];

    // Header at Row 14 (Index 13): Date(0), Store(1), Card Type(2), Merchant ID(3), Cash Amount(4), Card Amount(5), Other Amount(6)
    for (let i = 14; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length < 2) continue;

        const rawDate = (row[0] || '').toString().trim();
        const rawStore = (row[1] || '').toString().trim();
        const cardType = (row[2] || '').toString().trim();
        const merchantId = (row[3] || '').toString().trim();
        const cardAmount = parseNumber(row[5]);
        const otherAmount = parseNumber(row[6]);

        if (!rawDate || !rawStore) continue;

        // Skip rows containing "Total" (case-insensitive) in Col A, B, C, D
        const combinedText = `${rawDate} ${rawStore} ${cardType} ${merchantId}`.toLowerCase();
        if (combinedText.includes('total')) continue;

        // Filter: Card Amount > 0 OR Other Amount > 0
        if (cardAmount <= 0 && otherAmount <= 0) continue;

        const dateStr = parseExcelDate(rawDate);
        const outcode = extractOutcode(rawStore);
        const subGroup = determineXilnexSubGroup(merchantId, cardType);

        rows.push({
            tanggal_jual: dateStr,
            raw_store: rawStore,
            outcode: outcode.toUpperCase(),
            merchant_bank: merchantId.toUpperCase(),
            card_type: cardType,
            sub_group: subGroup,
            card_amount: cardAmount,
            other_amount: otherAmount,
            total_xilnex: cardAmount + otherAmount
        });
    }

    return rows;
}

// ============================================================
// REFERENSI 2: DEPOSIT CARD (Nomor Kartu BCA Deposit Card -> Outcode)
// ============================================================
export function parseDepositCardExcel(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const mappings = [];
    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const depositCardNo = (row[0] || '').toString().trim();
        const outcode = (row[2] || '').toString().trim();
        const storeName = (row[3] || '').toString().trim();

        if (depositCardNo && outcode) {
            mappings.push({
                bca_deposit_card: depositCardNo,
                outcode: outcode.toUpperCase(),
                store_name: storeName
            });
        }
    }
    return mappings;
}

// ============================================================
// REFERENSI 3: MASTER MID BRI (MID -> Outcode)
// ============================================================
export function parseBriMidExcel(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    if (workbook.SheetNames.length === 0) return [];
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (rawRows.length === 0) return [];

    let headerIdx = 0;
    let colMid = 0;
    let colOutcode = 1;

    for (let r = 0; r < Math.min(10, rawRows.length); r++) {
        const row = rawRows[r];
        if (!row) continue;
        const midIdx = row.findIndex(cell => cell && cell.toString().toUpperCase().trim() === 'MID');
        const outcodeIdx = row.findIndex(cell => cell && (cell.toString().toUpperCase().trim() === 'OUTCODE' || cell.toString().toUpperCase().trim().includes('KODE TOKO')));

        if (midIdx !== -1 && outcodeIdx !== -1) {
            headerIdx = r;
            colMid = midIdx;
            colOutcode = outcodeIdx;
            break;
        }
    }

    const mappings = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const mid = (row[colMid] || '').toString().trim();
        const outcode = (row[colOutcode] || '').toString().trim();

        if (mid && outcode) {
            const cleanMid = mid.replace(/^0+/, '');
            mappings.push({
                mid_bri: cleanMid,
                raw_mid_bri: mid,
                outcode: outcode.toUpperCase()
            });
        }
    }
    return mappings;
}

// ============================================================
// REFERENSI 4: MASTER MID BCA (MID -> Outcode)
// ============================================================
export function parseBcaMidExcel(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    if (workbook.SheetNames.length === 0) return [];
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (rawRows.length === 0) return [];

    let headerIdx = 0;
    let colMid = 1;
    let colOutcode = 2;

    for (let r = 0; r < Math.min(10, rawRows.length); r++) {
        const row = rawRows[r];
        if (!row) continue;
        const midIdx = row.findIndex(cell => cell && cell.toString().toUpperCase().trim() === 'MID');
        const outcodeIdx = row.findIndex(cell => cell && (cell.toString().toUpperCase().trim() === 'OUTCODE' || cell.toString().toUpperCase().trim().includes('KODE TOKO')));

        if (midIdx !== -1 && outcodeIdx !== -1) {
            headerIdx = r;
            colMid = midIdx;
            colOutcode = outcodeIdx;
            break;
        }
    }

    const mappings = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const mid = (row[colMid] || '').toString().trim();
        const outcode = (row[colOutcode] || '').toString().trim();

        if (mid && outcode) {
            const cleanMid = mid.replace(/^0+/, '');
            mappings.push({
                mid_bca: cleanMid,
                raw_mid_bca: mid,
                outcode: outcode.toUpperCase()
            });
        }
    }
    return mappings;
}

// ============================================================
// REFERENSI 7: MASTER CABANG PKU (Outcode -> Cabang)
// ============================================================
export function parsePkuCabangExcel(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const mappings = [];
    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const outcode = (row[0] || '').toString().trim();
        const cabangPku = (row[1] || '').toString().trim();

        if (outcode && cabangPku) {
            mappings.push({
                outcode: outcode.toUpperCase(),
                cabang_pku: cabangPku
            });
        }
    }
    return mappings;
}

// ============================================================
// REFERENSI 5: BRI PKU JULI (Mutasi Bank BRI)
// ============================================================
export function parseBriMutationExcel(arrayBuffer, briMidMap = {}, masterMappings = {}) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const records = [];

    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length < 7) continue;

        const rawDate = (row[2] || '').toString().trim();
        const desc = (row[6] || '').toString().trim();
        const netCredit = parseNumber(row[9]);

        if (!rawDate || !desc) continue;

        const hasQris = desc.includes('QRIS');
        const hasOffUs = desc.includes('OffUs');
        const hasOnUs = desc.includes('OnUs');

        if (!hasQris && !hasOffUs && !hasOnUs) continue;

        let tag = 'BRI';
        let subGroup = 'OTHER';

        if (hasQris) {
            tag = hasOffUs ? 'QRISOffUs' : hasOnUs ? 'QRISOnUs' : 'QRIS';
            subGroup = 'BRI_QRIS';
        } else if (hasOffUs) {
            tag = 'OffUs';
            subGroup = 'BRI_OFFUS';
        } else if (hasOnUs) {
            tag = 'OnUs';
            subGroup = 'BRI_ONUS';
        }

        const dateStr = parseExcelDate(rawDate);

        // Regex for MID: 10-12 digit number after transaction date token
        const midMatch = desc.match(/0*(\d{10,12})/);
        const rawMid = midMatch ? midMatch[1] : '';
        const cleanMid = rawMid.replace(/^0+/, '');

        // Gross AMT: AMT:1.523.185,00
        const amtMatch = desc.match(/AMT:\s*([\d\.\,]+)/);
        const grossAmount = amtMatch ? parseNumber(amtMatch[1].replace(/\./g, '').replace(',', '.')) : netCredit;

        // MDR Fee: MDR:2.285,00
        const mdrMatch = desc.match(/MDR:\s*([\d\.\,]+)/);
        const mdrAmount = mdrMatch ? parseNumber(mdrMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

        const outcode = resolveOutcodeFromMid(rawMid || cleanMid, desc, briMidMap, masterMappings);

        // Extract YYMMDD token from description (handles spaces and underscores, e.g. QRISOffUs_3_260720_ or OffUs 1 260720 )
        let briSalesDate = '';
        const briDateMatch = desc.match(/(?:OffUs|OnUs|QRIS|TRSF)[\s\d_]*?(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/i) || desc.match(/[\s_](\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[\s_]/);
        if (briDateMatch) {
            const yy = briDateMatch[1];
            const mm = briDateMatch[2];
            const dd = briDateMatch[3];
            briSalesDate = `20${yy}-${mm}-${dd}`;
        }

        records.push({
            bank_name: 'BRI',
            tanggal_mutasi: dateStr,
            explicit_sales_date: briSalesDate,
            category_tag: tag,
            sub_group: subGroup,
            mid: cleanMid,
            outcode: outcode.toUpperCase(),
            gross_amount: grossAmount,
            mdr_amount: mdrAmount,
            net_amount: netCredit,
            raw_keterangan: desc
        });
    }

    return records;
}

// ============================================================
// REFERENSI 6: BCA PKU JULI (Mutasi Bank BCA)
// ============================================================
export function parseBcaMutationExcel(arrayBuffer, bcaMidMap = {}, masterMappings = {}) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const records = [];

    for (let i = 7; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length < 4) continue;

        const rawDate = (row[0] || '').toString().trim();
        const desc = (row[1] || '').toString().trim();
        const rawNetStr = (row[3] || '').toString().replace('CR', '').replace(/,/g, '').trim();
        const netCredit = parseNumber(rawNetStr);

        if (!rawDate || !desc) continue;

        const isKrMid = desc.includes('KR OTOMATIS MID');
        const isKartuKredit = desc.includes('KARTU KREDIT');
        const isKrTanggal = desc.includes('KR OTOMATIS TANGGAL');

        if (!isKrMid && !isKartuKredit && !isKrTanggal) continue;

        let tag = 'KARTU KREDIT MID';
        let subGroup = 'BCA_CREDIT';

        if (isKrMid) {
            tag = 'KR OTOMATIS MID';
            subGroup = 'BCA_DEBIT';
        } else if (isKrTanggal) {
            tag = 'KR OTOMATIS TANGGAL';
            subGroup = 'BCA_QRIS';
        } else if (isKartuKredit) {
            tag = 'KARTU KREDIT MID';
            subGroup = 'BCA_CREDIT';
        }

        const dateStr = parseExcelDate(rawDate);

        // MID 7 digits
        let midMatch = desc.match(/MID\s*:\s*\d*?(\d{7})/);
        if (!midMatch) midMatch = desc.match(/(\d{7})/);

        const rawMid = midMatch ? midMatch[1] : '';
        const cleanMid = rawMid.replace(/^0+/, '');

        // Gross Amount extraction:
        // Use TGH: if available. If no TGH:, extract value before DDR: or ADM: (do NOT use Column D Net Credit directly)
        let grossAmount = 0;
        const tghMatch = desc.match(/TGH:\s*([\d\.]+)/i);
        if (tghMatch) {
            grossAmount = parseNumber(tghMatch[1]);
        } else {
            const beforeDdrMatch = desc.match(/:\s*([\d\.]+)\s*(?:DDR|ADM):/i) || desc.match(/([\d\.]+)\s*(?:DDR|ADM):/i);
            if (beforeDdrMatch) {
                grossAmount = parseNumber(beforeDdrMatch[1]);
            } else {
                const ddrMatch = desc.match(/(?:DDR|ADM):\s*([\d\.]+)/i);
                const mdrAmount = ddrMatch ? parseNumber(ddrMatch[1]) : 0;
                grossAmount = netCredit > 0 ? (netCredit + mdrAmount) : netCredit;
            }
        }

        // MDR DDR/ADM: DDR: 1042.62
        const ddrMatch = desc.match(/(?:DDR|ADM):\s*([\d\.]+)/);
        const mdrAmount = ddrMatch ? parseNumber(ddrMatch[1]) : 0;

        let explicitSalesDate = '';
        if (isKrTanggal) {
            const dateTagMatch = desc.match(/KR OTOMATIS TANGGAL\s*:\s*(\d{1,2})\/(\d{1,2})/i);
            if (dateTagMatch) {
                const tagDay = dateTagMatch[1].padStart(2, '0');
                const tagMonth = dateTagMatch[2].padStart(2, '0');
                const mutYear = dateStr ? dateStr.split('-')[0] : new Date().getFullYear().toString();
                explicitSalesDate = `${mutYear}-${tagMonth}-${tagDay}`;
            }
        }

        const outcode = resolveOutcodeFromMid(rawMid || cleanMid, desc, bcaMidMap, masterMappings);

        records.push({
            bank_name: 'BCA',
            tanggal_mutasi: dateStr,
            explicit_sales_date: explicitSalesDate,
            category_tag: tag,
            sub_group: subGroup,
            mid: cleanMid,
            outcode: outcode.toUpperCase(),
            gross_amount: grossAmount,
            mdr_amount: mdrAmount,
            net_amount: netCredit,
            raw_keterangan: desc
        });
    }

    return records;
}

// ============================================================
// PARSER MUTASI BCA FOR SUPABASE (recon_bank_mutations_bca)
// ============================================================
export function parseBcaMutationExcelForSupabase(arrayBuffer, masterMidMap = {}, fileName = '', storeProfiles = []) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) return [];

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const records = [];

    // Pre-build 2-way outcode indexing from storeProfiles & masterMidMap
    const storeCodeToOutcode = {};
    const knownOutcodesMap = {};
    const knownOutcodesSet = new Set();

    (storeProfiles || []).forEach(p => {
        if (!p) return;
        
        let outcodeCandidate = '';
        if (p.kode_toko && p.kode_toko.includes('-')) {
            const parts = p.kode_toko.split('-');
            const numPart = parts[0].trim();
            const outPart = parts[1].trim().toUpperCase();
            
            outcodeCandidate = outPart;
            if (numPart) {
                storeCodeToOutcode[numPart] = outPart;
                storeCodeToOutcode[numPart.replace(/^0+/, '')] = outPart;
            }
        } else if (p.kode_toko) {
            const codeMatch = p.kode_toko.toString().match(/\b(\d{1,4})\b/);
            if (codeMatch) {
                const numPart = codeMatch[1];
                outcodeCandidate = p.username ? p.username.trim().toUpperCase() : numPart;
                storeCodeToOutcode[numPart] = outcodeCandidate;
                storeCodeToOutcode[numPart.replace(/^0+/, '')] = outcodeCandidate;
            }
        }

        if (p.email && p.email.includes('.')) {
            const emailPrefix = p.email.split('.')[0].trim().toUpperCase();
            if (emailPrefix.length >= 5) {
                knownOutcodesMap[emailPrefix] = outcodeCandidate || emailPrefix;
                knownOutcodesSet.add(emailPrefix);
            }
        }

        if (outcodeCandidate) {
            knownOutcodesMap[outcodeCandidate] = outcodeCandidate;
            knownOutcodesSet.add(outcodeCandidate);
        }
        if (p.username) {
            const uUpper = p.username.toString().trim().toUpperCase();
            knownOutcodesMap[uUpper] = outcodeCandidate || uUpper;
            knownOutcodesSet.add(uUpper);
        }
    });

    Object.values(masterMidMap || {}).forEach(out => {
        if (out && typeof out === 'string') {
            const cleanOut = out.trim().toUpperCase();
            if (cleanOut.length >= 5 && cleanOut !== 'UNMAPPED') {
                knownOutcodesMap[cleanOut] = cleanOut;
                knownOutcodesSet.add(cleanOut);
            }
        }
    });

    for (let i = 7; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length < 4) continue;

        const rawDate = (row[0] || '').toString().trim();
        const desc = (row[1] || '').toString().trim();
        const rawAmountStr = (row[3] || '').toString().trim();

        if (!rawDate || !desc) continue;

        const isKartuKredit = desc.includes('KARTU KREDIT');
        const isKrMid = desc.includes('KR OTOMATIS MID');
        const isKrTanggal = desc.includes('KR OTOMATIS TANGGAL');
        const isSetoranTunai = desc.includes('SETORAN TUNAI');
        const isSetoranViaCdm = desc.includes('SETORAN VIA CDM');

        if (isKartuKredit || isKrMid || isKrTanggal || isSetoranTunai || isSetoranViaCdm) {
            const keterangan = desc;
            let kategori = 'KARTU KREDIT MID';
            if (isSetoranViaCdm) kategori = 'SETORAN VIA CDM';
            else if (isSetoranTunai) kategori = 'SETORAN TUNAI';
            else if (isKrTanggal) kategori = 'KR OTOMATIS TANGGAL';
            else if (isKrMid) kategori = 'KR OTOMATIS MID';

            const tanggalMutasi = parseExcelDate(rawDate);
            const isDebit = rawAmountStr.toUpperCase().includes('DB');
            const dbCr = isDebit ? 'DB' : 'CR';
            const cleanAmountStr = rawAmountStr.replace(/[^0-9.-]/g, '');
            const parsedAmount = parseFloat(cleanAmountStr) || 0;

            let tanggalSales = null;
            let midCode = '';
            let outcode = 'UNMAPPED';
            let grossAmount = 0;
            let adminFeeMdr = null;
            let jumlah = null;

            if (isSetoranViaCdm) {
                grossAmount = parsedAmount;
                jumlah = 0;
                adminFeeMdr = 0;

                // Extract tanggal_sales from DD/MM token after SETORAN VIA CDM (e.g. SETORAN VIA CDM 02/07 WSID:...)
                const cdmDateMatch = desc.match(/SETORAN VIA CDM\s*(\d{1,2})\/(\d{1,2})/i);
                if (cdmDateMatch) {
                    const tagDay = cdmDateMatch[1].padStart(2, '0');
                    const tagMonth = cdmDateMatch[2].padStart(2, '0');
                    const mutYear = tanggalMutasi ? tanggalMutasi.split('-')[0] : new Date().getFullYear().toString();

                    let salesYear = parseInt(mutYear, 10);
                    if (tanggalMutasi) {
                        const mutMonth = parseInt(tanggalMutasi.split('-')[1], 10);
                        const sMonth = parseInt(tagMonth, 10);
                        if (sMonth === 12 && mutMonth === 1) {
                            salesYear -= 1;
                        }
                    }
                    tanggalSales = `${salesYear}-${tagMonth}-${tagDay}`;
                }

                // Extract 16-digit deposit card number (e.g. 0147000101080293)
                const depositCardMatch = desc.match(/\b(0147\d{12})\b/) || desc.match(/\b(\d{16})\b/);
                if (depositCardMatch) {
                    midCode = depositCardMatch[1];
                    const cleanCard = midCode.replace(/^0+/, '');

                    if (masterMidMap[midCode]) {
                        outcode = masterMidMap[midCode];
                    } else if (masterMidMap[cleanCard]) {
                        outcode = masterMidMap[cleanCard];
                    } else {
                        outcode = resolveOutcodeFromMid(midCode, desc, masterMidMap) || 'UNMAPPED';
                    }
                }
            } else if (isSetoranTunai) {
                grossAmount = parsedAmount;
                jumlah = 0;
                adminFeeMdr = 0;

                // Clean single spaces between digits in desc (e.g. "2 045" -> "2045", "03/07/2 026" -> "03/07/2026", "09072 026" -> "09072026")
                const cleanedDesc = desc
                    .replace(/(\b\d{1,3})\s+(\d{1,3}\b)/g, '$1$2')
                    .replace(/(\b\d{1,6})\s+(\d{1,3}\b)/g, '$1$2');
                const descUpper = cleanedDesc.toUpperCase();
                const descNoSpace = descUpper.replace(/[^A-Z0-9]/g, '');

                // Extract tanggal_sales if clean DD/MM/YYYY or DDMMYYYY pattern found
                const cleanDateMatch = cleanedDesc.match(/\b(0[1-9]|[12]\d|3[01])[\/\s\-]*?(0[1-9]|1[0-2])[\/\s\-]*?(20\d{2})\b/) || cleanedDesc.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/);
                if (cleanDateMatch && cleanDateMatch[1] && cleanDateMatch[2] && cleanDateMatch[3]) {
                    const dd = cleanDateMatch[1].padStart(2, '0');
                    const mm = cleanDateMatch[2].padStart(2, '0');
                    const yyyy = cleanDateMatch[3];
                    tanggalSales = `${yyyy}-${mm}-${dd}`;
                }

                // 2-Way Outcode Matching Algorithm with Space Normalization
                // Priority 1: Direct Outcode Match (e.g. BTTSPR1, JKJSRD1, BTTSRF1, BTTSSU1, JBDPMR1, JKJSPC1, JKJSTT1, JKJSRR1, JKJTA21, JKJBSR1, JKBGV1, JKJBDK1)
                let foundOutcode = '';

                // A. Check against descNoSpace (resolves split outcodes like "J KBGV1" -> "JKBGV1")
                for (const candidateOutcode of knownOutcodesSet) {
                    if (candidateOutcode && candidateOutcode.length >= 5) {
                        if (descNoSpace.includes(candidateOutcode)) {
                            foundOutcode = knownOutcodesMap[candidateOutcode] || candidateOutcode;
                            break;
                        }
                    }
                }

                // B. Check against cleanedDesc regex word boundary
                if (!foundOutcode) {
                    for (const candidateOutcode of knownOutcodesSet) {
                        if (candidateOutcode && candidateOutcode.length >= 5) {
                            const outRegex = new RegExp(`\\b${candidateOutcode}\\b`, 'i');
                            if (outRegex.test(descUpper) || descUpper.includes(candidateOutcode)) {
                                foundOutcode = knownOutcodesMap[candidateOutcode] || candidateOutcode;
                                break;
                            }
                        }
                    }
                }

                if (foundOutcode) {
                    outcode = foundOutcode;
                } else {
                    // Priority 2: Store Code Lookup from cleanedDesc (e.g. 2045 from "2 045", 2006, 3009, 2018, 2027, 0065)
                    const storeCodeMatch = cleanedDesc.match(/\b[D]?(\d{3,4})\b/i);
                    if (storeCodeMatch) {
                        const rawCode = storeCodeMatch[1];
                        const cleanCode = rawCode.replace(/^0+/, '');
                        if (storeCodeToOutcode[rawCode]) {
                            outcode = storeCodeToOutcode[rawCode];
                        } else if (storeCodeToOutcode[cleanCode]) {
                            outcode = storeCodeToOutcode[cleanCode];
                        }
                    }
                }
                // If neither matched, outcode remains 'UNMAPPED' (never defaults to Kahfi Jagakarsa!)
            } else {
                jumlah = parsedAmount;

                if (isKrTanggal) {
                    const dateTagMatch = desc.match(/KR OTOMATIS TANGGAL\s*:\s*(\d{1,2})\/(\d{1,2})/i);
                    if (dateTagMatch) {
                        const tagDay = dateTagMatch[1].padStart(2, '0');
                        const tagMonth = dateTagMatch[2].padStart(2, '0');
                        const mutYear = tanggalMutasi ? tanggalMutasi.split('-')[0] : new Date().getFullYear().toString();

                        let salesYear = parseInt(mutYear, 10);
                        if (tanggalMutasi) {
                            const mutMonth = parseInt(tanggalMutasi.split('-')[1], 10);
                            const sMonth = parseInt(tagMonth, 10);
                            if (sMonth === 12 && mutMonth === 1) {
                                salesYear -= 1;
                            }
                        }
                        tanggalSales = `${salesYear}-${tagMonth}-${tagDay}`;
                    }
                }

                // Extract MID
                let fullMid = '';
                const midMatch = desc.match(/MID\s*:\s*([0-9]+)/i);
                if (midMatch) {
                    fullMid = midMatch[1];
                    midCode = fullMid.length >= 7 ? fullMid.slice(-7) : fullMid.replace(/^0+/, '');
                } else {
                    const rawDigitMatch = desc.match(/\b([0-9]{7,15})\b/);
                    if (rawDigitMatch) {
                        fullMid = rawDigitMatch[1];
                        midCode = fullMid.length >= 7 ? fullMid.slice(-7) : fullMid.replace(/^0+/, '');
                    }
                }

                // Extract Gross Amount from QR: or TGH:
                const qrMatch = desc.match(/QR\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
                const tghMatch = desc.match(/TGH\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);

                if (qrMatch) {
                    grossAmount = parseFloat(qrMatch[1]) || 0;
                } else if (tghMatch) {
                    grossAmount = parseFloat(tghMatch[1]) || 0;
                }

                // Extract Admin Fee MDR from DDR: or ADM:
                const ddrMatch = desc.match(/(?:DDR|ADM)\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
                if (ddrMatch) {
                    adminFeeMdr = parseFloat(ddrMatch[1]) || 0;
                }

                // Multi-tier lookup for outcode from masterMidMap
                const cleanFullMid = fullMid.replace(/^0+/, '');
                const clean7Mid = midCode.replace(/^0+/, '');

                if (midCode && masterMidMap[midCode]) {
                    outcode = masterMidMap[midCode];
                } else if (clean7Mid && masterMidMap[clean7Mid]) {
                    outcode = masterMidMap[clean7Mid];
                } else if (clean7Mid && masterMidMap[clean7Mid.padStart(7, '0')]) {
                    outcode = masterMidMap[clean7Mid.padStart(7, '0')];
                } else if (fullMid && masterMidMap[fullMid]) {
                    outcode = masterMidMap[fullMid];
                } else if (cleanFullMid && masterMidMap[cleanFullMid]) {
                    outcode = masterMidMap[cleanFullMid];
                } else {
                    outcode = resolveOutcodeFromMid(midCode || fullMid, desc, masterMidMap) || 'UNMAPPED';
                }
            }

            // Final safety guard for tanggalSales format YYYY-MM-DD
            if (tanggalSales && (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalSales) || tanggalSales.includes('undefined'))) {
                tanggalSales = null;
            }

            records.push({
                tanggal_mutasi: tanggalMutasi,
                tanggal_sales: tanggalSales,
                keterangan: keterangan,
                kategori: kategori,
                outcode: outcode ? outcode.toUpperCase() : 'UNMAPPED',
                jumlah: (typeof jumlah === 'number' && !isNaN(jumlah)) ? jumlah : 0,
                admin_fee_mdr: (typeof adminFeeMdr === 'number' && !isNaN(adminFeeMdr)) ? adminFeeMdr : 0,
                gross_amount: (typeof grossAmount === 'number' && !isNaN(grossAmount)) ? grossAmount : 0,
                mid_code: midCode || '',
                db_cr: dbCr || 'CR',
                rekening_no: '1784455991',
                source_file: fileName || 'BCA PKU Excel'
            });
        }
    }

    return records;
}
