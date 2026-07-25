import { supabase } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const LOCAL_SOP_GUIDE = [
    {
        keywords: ['koreksi', 'salah input', 'salah lapor', 'salah angka', 'salah foto', 'edit setoran', 'memperbaiki setoran', 'ubah setoran'],
        answer: `📌 **SOP Pengajuan Koreksi Laporan (Salah Input/Foto)**:\n\n1. Buka menu **Koreksi Laporan** pada sidebar kiri.\n2. Cari tanggal laporan yang ingin diperbaiki, lalu klik **Ajukan Koreksi**.\n3. Masukkan nominal perbaikan, unggah bukti foto baru (jika ada), dan tuliskan alasan koreksi secara jelas.\n4. Klik **Kirim Pengajuan Koreksi**.\n5. Pengajuan akan diteruskan ke **Area Manager (AM)** untuk persetujuan. Anda akan menerima notifikasi lonceng saat disetujui/ditolak.`
    },
    {
        keywords: ['terblokir', 'pin', 'deposit card terblokir', 'salah pin'],
        answer: `📌 **SOP Deposit Card Terblokir (Salah PIN 3x)**:\n\n1. Buka menu **Buat Laporan**.\n2. Pilih Jenis Pelaporan: **Deposit Card Terblokir (Salah PIN 3x)**.\n3. Masukkan Nomor Kartu Deposit dan Lokasi KCP Bank terdekat.\n4. Sistem akan **otomatis mengirimkan Email Notifikasi Darurat** ke Tim Finance secara instant untuk pembukaan blokir.`
    },
    {
        keywords: ['tertelan', 'atm tertelan', 'kartu tertelan'],
        answer: `📌 **SOP Deposit Card Tertelan Mesin ATM**:\n\n1. Buka menu **Buat Laporan**.\n2. Pilih Jenis Pelaporan: **Deposit Card Tertelan Mesin ATM**.\n3. Masukkan ID/Nomor Mesin ATM, Lokasi KCP, dan Nomor Pengaduan Bank.\n4. Sistem akan **otomatis mengirimkan Email Notifikasi Darurat** ke Tim Finance.`
    },
    {
        keywords: ['troubleshooting', 'dispute', 'kendala bank', 'selisih bank', 'audit bank'],
        answer: `📌 **SOP Troubleshooting Bank**:\n\n1. Jika ada isu dispute/selisih bank dari Finance, indikator lonceng & badge menu **Troubleshooting Bank** akan menyala.\n2. Buka menu **Troubleshooting Bank**, klik **Tanggapi Isu**.\n3. Tuliskan tanggapan/penjelasan toko dan unggah foto bukti pendukung, lalu klik **Kirim Respon**.`
    },
    {
        keywords: ['lapor', 'cara lapor', 'melakukan pelaporan', 'buat laporan', 'setor', 'bagaimana lapor', 'cara setor'],
        answer: `📌 **SOP Cara Melakukan Pelaporan Setoran Harian (3-Step Form)**:\n\n1. Buka menu **Buat Laporan** di sidebar.\n2. **Langkah 1 (Tanggal & Jenis)**: Pilih Jenis Pelaporan dari 10 kategori, tentukan Tanggal Penjualan & Metode Setoran. (Gunakan *+ Tambah Tanggal* jika melapor > 1 hari).\n3. **Langkah 2 (Nominal & Bukti Foto)**: Input Total Penjualan, Potongan Admin (jika ada), Nominal Setoran, dan unggah foto struk/resi transfer.\n4. **Langkah 3 (Verifikasi & Kirim)**: Periksa kalkulasi otomatis, lalu klik **Kirim Laporan**.`
    },
    {
        keywords: ['halo', 'hi', 'selamat', 'pagi', 'siang', 'malam', 'tes', 'test', 'siapa'],
        answer: `Halo! Saya Asisten AI Apotek Alpro. Saya siap membantu Anda mengenai SOP pelaporan setoran, pengajuan koreksi, deposit card terblokir/tertelan, dan kendala troubleshooting bank. Ada yang bisa saya bantu?`
    }
];

function getLocalFallbackAnswer(query) {
    const q = (query || '').toLowerCase();
    for (const item of LOCAL_SOP_GUIDE) {
        if (item.keywords.some(kw => q.includes(kw))) {
            return item.answer;
        }
    }
    return `📌 **Asisten AI Apotek Alpro**:\n\nAnda dapat melihat panduan komprehensif seluruh modul pada menu **Petunjuk Penggunaan** di sidebar kiri. Jika butuh bantuan langsung mengenai transaksi cabang, silakan hubungi tim Area Manager atau Finance setempat.`;
}

/**
 * Mengirim riwayat percakapan ke Edge Function 'groq-ai-service'
 * Edge Function menyimpan token GROQ API dengan aman.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} username (opsional)
 */
export async function sendChatMessages(messages, username = '') {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${supabaseUrl}/functions/v1/groq-ai-service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ action: 'chat_history', messages, username }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("Groq Edge Function error status:", response.status);
            return getLocalFallbackAnswer(lastUserMsg);
        }

        const data = await response.json();
        if (data && data.reply) {
            return data.reply;
        }
        return getLocalFallbackAnswer(lastUserMsg);

    } catch (error) {
        console.warn("Groq Service Fetch Error / Fallback activated:", error);
        return getLocalFallbackAnswer(lastUserMsg);
    }
}

export async function askAssistant(userQuery, username) {
    return sendChatMessages([{ role: 'user', content: userQuery }], username);
}

function generateLocalAnalyticsSummary(payload) {
    if (!payload || typeof payload !== 'object') {
        return "Data laporan tidak cukup untuk dianalisis.";
    }

    const formatRp = (num) => 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');

    const totalSales = formatRp(payload.total_sales_manual);
    const totalSetoran = formatRp(payload.total_setoran);
    const totalPotongan = formatRp(payload.total_potongan);
    const totalPos = formatRp(payload.total_pos_sales);
    const countAnomali = payload.total_anomali_selisih || 0;
    const totalRecords = payload.total_records || 0;

    let narrative = `### 📊 Analisis Keuangan Virtual (Senior Financial Analyst)\n\n`;
    narrative += `**1. Ringkasan Konsolidasi Penjualan & Setoran**:\n`;
    narrative += `- **Total Omzet Sales Manual**: ${totalSales}\n`;
    narrative += `- **Total Dana Disetorkan (Bank/ATM)**: ${totalSetoran}\n`;
    narrative += `- **Total Potongan Operational Expense**: ${totalPotongan}\n`;
    narrative += `- **Total Penjualan POS Xilnex**: ${totalPos}\n\n`;

    narrative += `**2. Audit Anomali & Rekonsiliasi**:\n`;
    if (countAnomali > 0) {
        narrative += `- ⚠️ Terdeteksi **${countAnomali} transaksi** dengan selisih penjualan vs POS Xilnex melebihi ambang batas Rp 50.000.\n`;
    } else {
        narrative += `- ✅ Seluruh **${totalRecords} transaksi** setoran cabang berada dalam batas aman selisih rekonsiliasi.\n`;
    }

    narrative += `\n**3. Saran Rekomendasi Strategis**:\n`;
    narrative += `1. **Prioritas Audit**: Lakukan pengecekan khusus pada toko yang memiliki catatan selisih POS terbesar.\n`;
    narrative += `2. **Disiplin Harian**: Imbau Area Manager (AM) untuk mengawasi ketepatan waktu penginputan setoran sebelum closing harian.\n`;
    narrative += `3. **Sinkronisasi POS**: Pastikan data POS Xilnex di Google Drive disinkronkan harian agar matching otomatis berjalan presisi.`;

    return narrative;
}

export async function generateAnalyticsSummary(tableData) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(`${supabaseUrl}/functions/v1/groq-ai-service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ action: 'admin_summary', prompt: JSON.stringify(tableData) }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("Groq Admin Summary status error, activating local analytics generator:", response.status);
            return generateLocalAnalyticsSummary(tableData);
        }

        const data = await response.json();
        return data?.reply || generateLocalAnalyticsSummary(tableData);

    } catch (error) {
        console.warn("Admin Summary Error / Fallback activated:", error);
        return generateLocalAnalyticsSummary(tableData);
    }
}
