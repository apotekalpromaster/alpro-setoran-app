import * as XLSX from 'xlsx';

// Supported sheet names mapped to standard issue category names
const SHEET_CATEGORY_MAP = {
    'TIDAK SETOR': 'TIDAK SETOR',
    'KURANG SETOR RECEH': 'KURANG SETOR RECEH',
    'LEBIH SETOR': 'LEBIH SETOR',
    'HARI SETOR': 'HARI SETOR',
    'TRANSFER BANK': 'TRANSFER BANK',
    'KURANG GESEK': 'KURANG GESEK',
    'LEBIH GESEK': 'LEBIH GESEK',
    'BELUM SETTLEMENT': 'BELUM SETTLEMENT',
    'SALAH INPUT SALES': 'SALAH INPUT SALES',
    'TUNAI': 'TUNAI'
};

/**
 * Parses Lusi's multi-sheet Troubleshooting Excel template into database rows.
 * @param {ArrayBuffer} arrayBuffer - Excel file binary buffer
 * @param {Object} profilesMap - Map of kode_toko/username -> profile object
 * @returns {Array} List of issue records
 */
export function parseTroubleshootingExcel(arrayBuffer, profilesMap = {}) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const parsedIssues = [];
    const batchId = `BATCH-${Date.now()}`;

    workbook.SheetNames.forEach((sheetName) => {
        const categoryKey = sheetName.trim().toUpperCase();
        if (!SHEET_CATEGORY_MAP[categoryKey]) return;

        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (rawRows.length < 3) return;

        // Header is on Row 2 (Index 1)
        const headers = (rawRows[1] || []).map((h) => (h || '').toString().trim());

        // Dynamic column index lookup
        const findColIndex = (keywords) => {
            return headers.findIndex((h) => keywords.some((k) => h.toLowerCase().includes(k.toLowerCase())));
        };

        const colPeriode = findColIndex(['periode']);
        const colCode = findColIndex(['outlet code', 'outcode', 'outlet']);
        const colCompany = findColIndex(['nama pt', 'company']);
        const colKet = findColIndex(['keterangan', 'penjelasan']);
        const colNominal = findColIndex(['nominal']);
        const colTglSales = findColIndex(['tanggal sales', 'tgl sales']);
        const colStatus = findColIndex(['status']);

        // Data starts on Row 3 (Index 2)
        for (let i = 2; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            const kodeTokoRaw = colCode !== -1 ? (row[colCode] || '').toString().trim() : '';
            if (!kodeTokoRaw || kodeTokoRaw.toLowerCase().includes('total') || kodeTokoRaw.length < 4) {
                continue;
            }

            const cleanCodeKey = kodeTokoRaw.toLowerCase();
            const profileObj = profilesMap[cleanCodeKey] || {};
            const userId = profileObj.id || null;

            const periodeMinggu = colPeriode !== -1 ? (row[colPeriode] || '').toString().trim() : '';
            const company = colCompany !== -1 ? (row[colCompany] || '').toString().trim() : '';
            const keterangan = colKet !== -1 ? (row[colKet] || '').toString().trim() : '';
            const rawNominal = colNominal !== -1 ? row[colNominal] : 0;
            const nominalSelisih = parseInt(rawNominal.toString().replace(/[^0-9-]/g, ''), 10) || 0;

            let tanggalSales = null;
            if (colTglSales !== -1 && row[colTglSales]) {
                const tVal = row[colTglSales].toString().trim();
                if (/^\d+(\.\d+)?$/.test(tVal)) {
                    const excelNum = parseFloat(tVal);
                    const d = new Date((excelNum - 25569) * 86400 * 1000);
                    if (!isNaN(d.getTime())) tanggalSales = d.toISOString().split('T')[0];
                } else {
                    const d = new Date(tVal);
                    if (!isNaN(d.getTime())) tanggalSales = d.toISOString().split('T')[0];
                }
            }

            // Status from Excel column if present, default to PENDING_STORE_RESPONSE
            let status = 'PENDING_STORE_RESPONSE';
            if (colStatus !== -1 && row[colStatus]) {
                const stStr = row[colStatus].toString().trim().toUpperCase();
                if (stStr.includes('CLOSE') || stStr.includes('APPROV')) {
                    status = 'APPROVED';
                } else if (stStr.includes('REJECT')) {
                    status = 'REJECTED';
                }
            }

            // SLA Deadline: 2 Days (48 Hours) from now
            const slaDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

            parsedIssues.push({
                batch_id: batchId,
                kategori_issue: categoryKey,
                periode_minggu: periodeMinggu,
                kode_toko: kodeTokoRaw,
                user_id: userId,
                company,
                tanggal_sales: tanggalSales,
                keterangan_finance: keterangan,
                nominal_selisih: nominalSelisih,
                sla_deadline: slaDeadline,
                status,
            });
        }
    });

    return parsedIssues;
}

/**
 * Exports issue list to CSV format for audit documentation.
 * @param {Array} issuesList - Array of issue objects
 * @param {String} fileName - Desired CSV file name
 */
export function exportTroubleshootingToCSV(issuesList, fileName = 'Audit_Troubleshooting_Bank.csv') {
    if (!issuesList || !issuesList.length) {
        alert('Tidak ada data issue untuk di-export.');
        return;
    }

    const headers = [
        'ID Issue',
        'Batch ID',
        'Kode Toko',
        'Company',
        'PIC Finance',
        'Kategori Issue',
        'Periode Minggu',
        'Tanggal Sales',
        'Keterangan Finance',
        'Nominal Selisih',
        'Status',
        'Action / Penjelasan Toko',
        'PIC Outlet',
        'Link Bukti Foto / Drive',
        'Tanggal Respon Toko',
        'Tanggal Approved Finance',
        'Catatan Reject'
    ];

    const rows = issuesList.map((item) => [
        `"${item.id || ''}"`,
        `"${item.batch_id || ''}"`,
        `"${item.kode_toko || ''}"`,
        `"${item.company || ''}"`,
        `"${item.pic_finance || ''}"`,
        `"${item.kategori_issue || ''}"`,
        `"${item.periode_minggu || ''}"`,
        `"${item.tanggal_sales || ''}"`,
        `"${(item.keterangan_finance || '').replace(/"/g, '""')}"`,
        item.nominal_selisih || 0,
        `"${item.status || ''}"`,
        `"${(item.action_outlet || '').replace(/"/g, '""')}"`,
        `"${item.pic_outlet || ''}"`,
        `"${item.bukti_url || ''}"`,
        `"${item.responded_at || ''}"`,
        `"${item.approved_at || ''}"`,
        `"${(item.reject_notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
