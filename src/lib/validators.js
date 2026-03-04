/**
 * @file validators.js
 * @description Port presisi dari fungsi validateSetoranData() di FormHandler.gs
 * DISCREPANCY_THRESHOLD dipertahankan dari Constants.gs
 */

export const DISCREPANCY_THRESHOLD = 50000;

export const JENIS_PELAPORAN_LIST = [
    'Setoran Harian',
    'Setoran 3x Seminggu',
    'Setoran Sales Dengan Potongan Penjualan',
    'Setoran Uang Pecahan Kecil',
    'Setoran Uang Lebih',
    'Pengembalian Petty Cash',
    'Deposit Card Terblokir (Salah Input PIN 3x)',
    'Deposit Card Tertelan Mesin ATM',
];

export const NON_FINANCIAL_TYPES = [
    'Deposit Card Terblokir (Salah Input PIN 3x)',
    'Deposit Card Tertelan Mesin ATM',
];

/**
 * Parse string rupiah ke integer.
 * Misal: "Rp 1.250.000" -> 1250000
 */
export function parseRupiah(value) {
    return parseInt(String(value || '0').replace(/[^0-9]/g, ''), 10) || 0;
}

/**
 * Format integer ke string rupiah.
 * Misal: 1250000 -> "Rp 1.250.000"
 */
export function formatRupiah(num) {
    if (typeof num !== 'number' || isNaN(num)) return 'Rp 0';
    return 'Rp ' + num.toLocaleString('id-ID');
}

/**
 * Validasi penuh data setoran — port dari validateSetoranData() di FormHandler.gs
 * Melempar Error dengan message yang bisa langsung ditampilkan di UI.
 * @param {Object} data - Form state gabungan dari semua wizard steps
 * @throws {Error} Jika validasi gagal
 */
export function validateSetoranData(data) {
    if (!data) throw new Error('Data tidak ditemukan.');

    // 1. Validasi Username
    if (!data.username || data.username.trim() === '') {
        throw new Error('Sesi pengguna tidak valid. Silakan refresh halaman.');
    }

    // 2. Validasi Jenis Pelaporan
    if (!JENIS_PELAPORAN_LIST.includes(data.jenisPelaporan)) {
        throw new Error('Jenis pelaporan tidak valid.');
    }

    // 3. Validasi Tanggal
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const checkDate = (dateStr, label) => {
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) throw new Error(`Format tanggal ${label} salah.`);
        if (d > today) throw new Error(`Tanggal ${label} tidak boleh lebih dari hari ini.`);
    };

    checkDate(data.tanggalPenjualan, 'Penjualan');
    checkDate(data.tanggalSetoran, 'Setoran');

    // 4. Strict Math Check (hanya untuk tipe finansial)
    if (!NON_FINANCIAL_TYPES.includes(data.jenisPelaporan)) {
        const nominalSetoran = parseRupiah(data.nominalSetoran);
        const potongan = parseRupiah(data.potonganPenjualan);

        if (nominalSetoran <= 0) throw new Error('Nominal setoran harus lebih besar dari 0.');
        if (potongan < 0) throw new Error('Potongan tidak boleh negatif.');

        let totalPenjualan = 0;
        if (Array.isArray(data.nominalPenjualan)) {
            totalPenjualan = data.nominalPenjualan.reduce((acc, curr) => acc + parseRupiah(curr), 0);
        } else {
            totalPenjualan = parseRupiah(data.nominalPenjualan);
        }

        // Khusus "Setoran Uang Lebih": skip math check, bisa lebih dari dana tersedia
        if (data.jenisPelaporan !== 'Setoran Uang Lebih') {
            const danaTersedia = totalPenjualan - potongan;
            if (nominalSetoran > danaTersedia) {
                throw new Error(
                    `Nominal setoran (${formatRupiah(nominalSetoran)}) melebihi dana tersedia (${formatRupiah(danaTersedia)}).`
                );
            }
        }
    }
}
