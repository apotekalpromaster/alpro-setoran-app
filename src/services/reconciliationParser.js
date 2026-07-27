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

        rows.push({
            tanggal_jual: dateStr,
            raw_store: rawStore,
            outcode: outcode.toUpperCase(),
            merchant_bank: merchantId.toUpperCase(), // BRI / BCA / dll
            card_type: cardType,
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
            // Strip leading zeros for clean matching e.g. 001999633624 -> 1999633624
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
            // BCA MID 7 digits
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
export function parseBriMutationExcel(arrayBuffer, briMidMap = {}) {
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

        // Filter: contains "OffUs", "OnUs", "QRIS"
        const isOffUs = desc.includes('OffUs');
        const isOnUs = desc.includes('OnUs');
        const isQris = desc.includes('QRIS');

        if (!isOffUs && !isOnUs && !isQris) continue;

        const tag = isOnUs ? 'OnUs' : isOffUs ? 'OffUs' : 'QRIS';
        const dateStr = parseExcelDate(rawDate);

        // Regex for MID: 10-12 digit number after transaction date token
        const midMatch = desc.match(/\b0*(\d{10,12})\b/);
        const rawMid = midMatch ? midMatch[1] : '';
        const cleanMid = rawMid.replace(/^0+/, '');

        // Gross AMT: AMT:1.523.185,00
        const amtMatch = desc.match(/AMT:\s*([\d\.\,]+)/);
        const grossAmount = amtMatch ? parseNumber(amtMatch[1].replace(/\./g, '').replace(',', '.')) : netCredit;

        // MDR Fee: MDR:2.285,00
        const mdrMatch = desc.match(/MDR:\s*([\d\.\,]+)/);
        const mdrAmount = mdrMatch ? parseNumber(mdrMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

        const outcode = briMidMap[cleanMid] || briMidMap[rawMid] || '';

        records.push({
            bank_name: 'BRI',
            tanggal_mutasi: dateStr,
            category_tag: tag,
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
export function parseBcaMutationExcel(arrayBuffer, bcaMidMap = {}) {
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

        // Filter: contains "KR OTOMATIS MID", "KARTU KREDIT", "KR OTOMATIS TANGGAL"
        const isKrMid = desc.includes('KR OTOMATIS MID');
        const isKartuKredit = desc.includes('KARTU KREDIT');
        const isKrTanggal = desc.includes('KR OTOMATIS TANGGAL');

        if (!isKrMid && !isKartuKredit && !isKrTanggal) continue;

        const tag = isKrMid ? 'KR OTOMATIS MID' : isKartuKredit ? 'KARTU KREDIT' : 'KR OTOMATIS TANGGAL';
        const dateStr = parseExcelDate(rawDate);

        // MID 7 digits
        let midMatch = desc.match(/MID\s*:\s*\d*?(\d{7})\b/);
        if (!midMatch) midMatch = desc.match(/\b(\d{7})\b/);

        const rawMid = midMatch ? midMatch[1] : '';
        const cleanMid = rawMid.replace(/^0+/, '');

        // Gross TGH: TGH: 695086.00
        const tghMatch = desc.match(/TGH:\s*([\d\.]+)/);
        const grossAmount = tghMatch ? parseNumber(tghMatch[1]) : netCredit;

        // MDR DDR/ADM: DDR: 1042.62
        const ddrMatch = desc.match(/(?:DDR|ADM):\s*([\d\.]+)/);
        const mdrAmount = ddrMatch ? parseNumber(ddrMatch[1]) : 0;

        const outcode = bcaMidMap[cleanMid] || bcaMidMap[rawMid] || '';

        records.push({
            bank_name: 'BCA',
            tanggal_mutasi: dateStr,
            category_tag: tag,
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