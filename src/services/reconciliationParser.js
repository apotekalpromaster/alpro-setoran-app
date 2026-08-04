
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
    if (!rawVal) return '';
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

    const ddmmyyyyMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyyMatch) {
        const day = ddmmyyyyMatch[1].padStart(2, '0');
        const month = ddmmyyyyMatch[2].padStart(2, '0');
        const year = ddmmyyyyMatch[3];
        return `${year}-${month}-${day}`;
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
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const mappings = [];
    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const mid = (row[0] || '').toString().trim();
        const outcode = (row[1] || '').toString().trim();

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
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const mappings = [];
    for (let i = 2; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row) continue;
        const storeName = (row[1] || '').toString().trim();
        const mid = (row[2] || '').toString().trim();
        const outcode = (row[3] || '').toString().trim();

        if (mid && outcode) {
            const cleanMid = mid.replace(/^0+/, '');
            mappings.push({
                mid_bca: cleanMid,
                raw_mid_bca: mid,
                outcode: outcode.toUpperCase(),
                store_name: storeName
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
