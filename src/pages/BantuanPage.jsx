import React, { useState } from 'react';
import UserLayout from '../components/UserLayout';

/* ==========================================================================
   EXHAUSTIVE USER MANUAL DATA (COMPREHENSIVE MULTI-ROLE GUIDE V2.0)
   ========================================================================== */

const PANDUAN_JENIS_PELAPORAN = [
    {
        nama: 'Normal (Harian)',
        badge: 'bg-green-100 text-green-800 border-green-200',
        deskripsi: 'Setoran tunai / transfer harian rutin sesuai 100% dengan total penjualan kasir tanpa selisih.',
        instruksi: 'Masukkan nominal penjualan, upload struk ATM/transfer, lalu kirim.',
    },
    {
        nama: 'Setoran 3x Seminggu',
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        deskripsi: 'Pelaporan setoran khusus bagi outlet yang memiliki jadwal setoran 3 kali dalam seminggu.',
        instruksi: 'Pastikan tanggal penjualan yang disetorkan sesuai dengan jadwal periode yang ditentukan.',
    },
    {
        nama: 'Setoran Uang Kurang',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        deskripsi: 'Terdapat selisih minus antara nominal penjualan kasir dengan nominal setoran aktual.',
        instruksi: 'Isi nominal penjualan asli dan nominal setoran aktual. Sistem akan menghitung selisih otomatis. Tuliskan penyebab selisih di kolom keterangan.',
    },
    {
        nama: 'Setoran Uang Lebih',
        badge: 'bg-purple-100 text-purple-800 border-purple-200',
        deskripsi: 'Terdapat selisih surplus di mana nominal fisik yang disetor lebih besar dari penjualan kasir.',
        instruksi: 'Masukkan nominal penjualan dan nominal setoran aktual. Tuliskan sumber kelebihan dana pada catatan.',
    },
    {
        nama: 'Deposit Card Terblokir (Salah PIN 3x)',
        badge: 'bg-red-100 text-red-800 border-red-200',
        deskripsi: 'Kartu Deposit ATM terblokir akibat salah memasukkan PIN sebanyak 3 kali berturut-turut.',
        instruksi: 'Penting! Masukkan nomor kartu dan KCP bank terdekat. Sistem akan otomatis mengirimkan Email Notifikasi Darurat ke tim Finance secara instant.',
    },
    {
        nama: 'Deposit Card Tertelan Mesin ATM',
        badge: 'bg-rose-100 text-rose-800 border-rose-200',
        deskripsi: 'Kartu Deposit tertelan di dalam mesin ATM bank saat hendak melakukan transaksi setoran.',
        instruksi: 'Isi nomor mesin ATM, lokasi KCP, dan nomor pengaduan bank. Notifikasi darurat akan langsung terkirim ke Finance.',
    },
    {
        nama: 'Mesin ATM Rusak / Out of Service',
        badge: 'bg-orange-100 text-orange-800 border-orange-200',
        deskripsi: 'Mesin ATM di lokasi/KCP terdekat mengalami kerusakan atau mati listrik sehingga setoran tertunda.',
        instruksi: 'Pilih jenis ini dan berikan keterangan lokasi ATM yang rusak serta estimasi waktu setoran susulan.',
    },
    {
        nama: 'Setoran Gabungan (2 Hari / Libur)',
        badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        deskripsi: 'Setoran akumulasi dana penjualan untuk 2 hari berturut-turut (misalnya akibat hari libur nasional).',
        instruksi: 'Gunakan fitur Multi-Tanggal (+ Tambah Tanggal) agar setiap hari penjualan memiliki rincian tersendiri.',
    },
    {
        nama: 'Pencairan QRIS / EDC Belum Masuk Rekening',
        badge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        deskripsi: 'Transaksi non-tunai (QRIS/EDC) tercatat di POS tetapi dana settlement belum masuk mutasi bank.',
        instruksi: 'Lampirkan rekap settlement EDC/QRIS dan beri catatan nama penyedia layanan (MDR/Bank).',
    },
    {
        nama: 'Lain-lain (Kasus Khusus)',
        badge: 'bg-gray-100 text-gray-800 border-gray-200',
        deskripsi: 'Pelaporan kendala spesifik lainnya yang tidak tercakup pada kategori di atas.',
        instruksi: 'Wajib memberikan penjelasan kronologi yang lengkap dan melampirkan dokumen pendukung.',
    },
];
const PANDUAN_ROLE_TOKO = [
    {
        modul: 'Formulir Pelaporan Setoran Harian (3-Step Form)',
        icon: 'edit_note',
        penjelasan: 'Menu utama bagi kasir/staf toko untuk menginput data penjualan dan bukti setoran harian.',
        langkah: [
            'Langkah 1 (Tanggal & Jenis): Buka menu "Buat Laporan". Pilih Jenis Pelaporan yang sesuai dari 10 pilihan, pilih Tanggal Penjualan, dan tentukan Metode Setoran (Bank/ATM). Jika melaporkan > 1 hari, klik "+ Tambah Tanggal Penjualan".',
            'Langkah 2 (Nominal & Bukti Foto): Masukkan Total Penjualan Kasir, Potongan Admin (jika ada), dan Nominal Setoran. Unggah bukti foto struk ATM/transfer (max 10 MB, format JPG/PNG/HEIC).',
            'Langkah 3 (Verifikasi & Kirim): Periksa ringkasan kalkulasi otomatis dari sistem. Jika sudah tepat, tekan tombol "Kirim Laporan".',
        ],
        tips: 'Nominal setoran akan dihitung secara otomatis oleh sistem (Penjualan - Potongan). Selalu pastikan foto struk tidak buram.',
    },
    {
        modul: 'Riwayat Laporan Setoran',
        icon: 'history',
        penjelasan: 'Tempat memantau status seluruh laporan setoran yang pernah dikirimkan oleh toko Anda.',
        langkah: [
            'Filter Rentang Tanggal: Gunakan pemilih tanggal untuk mencari laporan periode lalu.',
            'Status Pelaporan: Perhatikan badge warna status (Hijau = Verifikasi Matched, Oranye = Pending Review, Merah = Anomali/Selisih).',
            'Detail & Unduh: Klik ikon mata untuk melihat rincian formulir atau mengunduh ulang bukti foto struk.',
        ],
        tips: 'Gunakan fitur pencarian untuk menemukan laporan spesifik berdasarkan nomor transaksi atau tanggal.',
    },
    {
        modul: 'Pengajuan Koreksi Laporan',
        icon: 'edit_document',
        penjelasan: 'Fasilitas resmi untuk mengajukan perbaikan angka atau bukti foto pada laporan yang sudah terkirim.',
        langkah: [
            'Langkah 1: Masuk ke menu "Koreksi Laporan" di sidebar.',
            'Langkah 2: Pilih laporan yang hendak dikoreksi, lalu klik "Ajukan Koreksi".',
            'Langkah 3: Masukkan nominal perbaikan, unggah bukti foto baru (jika ada), dan tuliskan alasan koreksi secara rinci.',
            'Langkah 4: Pantau status pengajuan. Koreksi akan diproses oleh Area Manager (AM) terlebih dahulu sebelum diteruskan ke Finance.',
        ],
        tips: 'Anda akan menerima notifikasi lonceng saat pengajuan koreksi Anda disetujui atau ditolak oleh Area Manager.',
    },
    {
        modul: 'Troubleshooting Bank Toko',
        icon: 'troubleshoot',
        penjelasan: 'Pusat penanganan isu dispute perbankan / selisih audit bank yang diterbitkan oleh Tim Finance.',
        langkah: [
            'Langkah 1: Jika ada kendala bank pada toko Anda, angka indikator lonceng & badge sidebar menu ini akan menyala.',
            'Langkah 2: Buka menu "Troubleshooting Bank", cari isu yang berstatus "Need Info" atau "Pending".',
            'Langkah 3: Klik tombol "Tanggapi Isu" / "Detail". Tuliskan klarifikasi toko pada kolom Respon Cabang dan unggah foto bukti pendukung.',
            'Langkah 4: Klik "Kirim Respon". Status akan otomatis ter-update dan Tim Finance & AM akan menerima notifikasi.',
        ],
        tips: 'Segera tanggapi isu bank agar proses rekonsiliasi keuangan cabang Anda tidak tertunda.',
    },
];

const PANDUAN_ROLE_AM = [
    {
        modul: 'Dashboard Area Manager (Monitoring Wilayah)',
        icon: 'dashboard',
        penjelasan: 'Pusat kendali bagi Area Manager untuk memantau kepatuhan setoran seluruh toko binaannya secara real-time.',
        langkah: [
            'Kartu KPI Utama: Memantau Total Jumlah Outlet Binaan, Persentase Outlet Patuh Setor, dan Total Nominal Setoran Wilayah.',
            'Filter Jenis Pelaporan: Memfilter tampilan tabel berdasarkan jenis laporan, termasuk pilihan khusus "Belum Dilaporkan" untuk mendeteksi toko yang terlambat mengisi setoran.',
            'Filter Kasus Khusus (Audit): Menyaring toko dengan kendala Terblokir, Tertelan, Uang Kurang, atau Mesin ATM Rusak.',
            'Detail Outlet: Klik nama toko untuk melihat rincian historis laporan setoran cabang tersebut.',
        ],
        tips: 'Gunakan filter "Belum Dilaporkan" pada pukul 10:00 WIB setiap pagi untuk langsung menindaklanjuti toko yang belum menyetorkan laporan.',
    },
    {
        modul: 'Persetujuan Koreksi Laporan (Approval)',
        icon: 'task_alt',
        penjelasan: 'Halaman khusus untuk mengevaluasi dan menyetujui/menolak pengajuan koreksi laporan dari toko binaan.',
        langkah: [
            'Langkah 1: Buka menu "Persetujuan Koreksi". Antrean pengajuan yang membutuhkan persetujuan Anda akan tampil di atas.',
            'Langkah 2: Bandingkan data awal laporan vs data koreksi yang diajukan toko, serta baca alasan koreksinya.',
            'Langkah 3: Klik "Setujui (Approve)" untuk mengesahkan koreksi, atau "Tolak (Reject)" jika koreksi tidak valid.',
            'Langkah 4: Tuliskan catatan persetujuan/penolakan agar toko memahami alasan keputusan Anda.',
        ],
        tips: 'Koreksi yang Anda setujui akan otomatis diteruskan ke sistem Finance untuk penyesuaian rekapitulasi akhir.',
    },
    {
        modul: 'Troubleshooting Bank Area Manager',
        icon: 'troubleshoot',
        penjelasan: 'Menu pemantauan seluruh isu dispute perbankan pada toko-toko binaan di wilayah Area Manager.',
        langkah: [
            'Stat Cards Wilayah: Melihat ringkasan total isu di area, berapa yang butuh respon toko, diproses finance, dan selesai.',
            'Filter Cabang & Status: Memfilter isu berdasarkan cabang binaan tertentu atau status kendala.',
            'Fitur Ingatkan via WA: Klik tombol "Ingatkan Toko via WA" pada baris toko yang belum merespon. Sistem akan otomatis menyalin pesan pengingat standar dan membuka aplikasi WhatsApp.',
            'Modal Detail: Klik "Detail" untuk melihat klarifikasi toko, bukti foto terlampir, dan catatan dari tim Finance.',
        ],
        tips: 'Gunakan fitur pengingat WA untuk mempercepat komunikasi dua arah antara toko binaan dan tim Finance.',
    },
];
const PANDUAN_ROLE_FINANCE = [
    {
        modul: 'Dashboard Admin & Rekap Setoran',
        icon: 'admin_panel_settings',
        penjelasan: 'Dashboard konsolidasi nasional untuk memantau rekapitulasi setoran dari seluruh cabang di Indonesia.',
        langkah: [
            'Matching POS Auto-Sync: Membandingkan data setoran toko dengan data penjualan POS Xilnex yang disinkronkan otomatis dari Google Drive setiap harinya.',
            'Export Excel: Mengunduh rekapitulasi data setoran seluruh toko ke format spreadsheet untuk keperluan audit.',
            'Verifikasi Laporan: Memverifikasi dan menandai laporan toko yang telah cocok dengan mutasi rekening bank perusahaan.',
        ],
        tips: 'Edge function `sync-pos-sales-from-drive` berjalan secara otomatis untuk menyinkronkan berkas POS Xilnex dari folder Google Drive.',
    },
    {
        modul: 'Manajemen Troubleshooting Bank (Finance)',
        icon: 'account_balance',
        penjelasan: 'Fasilitas bagi Tim Finance untuk menerbitkan dan mengelola isu selisih / dispute perbankan cabang.',
        langkah: [
            'Langkah 1 (Buat Isu Baru): Klik "+ Buat Isu Baru". Pilih Toko, Tanggal Penjualan, Nama Bank, Nominal Dispute, dan jelaskan deskripsi kendala.',
            'Langkah 2 (Notifikasi Automatis): Begitu disimpan, sistem otomatis menembakkan notifikasi lonceng ke Toko dan Area Manager terkait.',
            'Langkah 3 (Update Status): Setelah toko mengirimkan respon & bukti foto, Finance dapat memperbarui status menjadi "In Progress" atau "Resolved" serta memberikan Catatan Admin.',
        ],
        tips: 'Status "Resolved" menandakan bahwa isu audit perbankan tersebut telah tuntas diselesaikan.',
    },
];

/* Component for Accordion Items */
function AccordionGuideItem({ title, icon, penjelasan, langkah, tips, isOpen, onToggle }) {
    return (
        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm transition-all">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-white hover:bg-gray-50 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0 font-bold">
                        <span className="material-symbols-outlined text-xl">{icon}</span>
                    </div>
                    <span className="font-extrabold text-gray-900 text-sm md:text-base">{title}</span>
                </div>
                <span className={`material-symbols-outlined text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary-600' : ''}`}>
                    expand_more
                </span>
            </button>

            {isOpen && (
                <div className="px-6 pb-6 pt-2 bg-white border-t border-gray-100 space-y-4">
                    <p className="text-xs md:text-sm text-gray-600 leading-relaxed font-medium">
                        {penjelasan}
                    </p>

                    {langkah && langkah.length > 0 && (
                        <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-primary-600">format_list_numbered</span>
                                Langkah-Langkah Penggunaan:
                            </h4>
                            <ul className="space-y-2 text-xs md:text-sm text-gray-700">
                                {langkah.map((l, idx) => (
                                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                        <span className="h-5 w-5 rounded-full bg-primary-100 text-primary-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                                            {idx + 1}
                                        </span>
                                        <span>{l}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {tips && (
                        <div className="flex items-start gap-2.5 bg-amber-50/80 border border-amber-200/80 p-3.5 rounded-xl text-amber-900 text-xs md:text-sm">
                            <span className="material-symbols-outlined text-amber-600 text-lg flex-shrink-0">lightbulb</span>
                            <div>
                                <strong className="font-bold">Tips Operasional: </strong>
                                <span>{tips}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
export default function BantuanPage() {
    const [activeTab, setActiveTab] = useState('jenis-pelaporan');
    const [searchTerm, setSearchTerm] = useState('');
    const [openIdx, setOpenIdx] = useState(0);

    const toggleAccordion = (idx) => {
        setOpenIdx(prev => prev === idx ? null : idx);
    };

    return (
        <UserLayout title="Panduan Pengguna Komprehensif" activeRoute="/bantuan">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Hero Header */}
                <div className="relative bg-gradient-to-r from-primary-600 via-orange-600 to-indigo-700 rounded-2xl p-6 md:p-8 text-white overflow-hidden shadow-lg">
                    <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/10 rounded-full blur-xl" />
                    <div className="relative z-10 space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-bold text-white border border-white/20">
                            <span className="material-symbols-outlined text-sm">verified</span> Version 2.0 Updated
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black">Pusat Panduan & SOP Operasional</h1>
                        <p className="text-xs md:text-sm text-white/90 max-w-2xl leading-relaxed">
                            Buku petunjuk komprehensif pelaporan setoran harian, penanganan kasus khusus, persetujuan koreksi, dan audit perbankan untuk seluruh peran pengguna.
                        </p>
                    </div>
                </div>

                {/* Main Tab Navigation */}
                <div className="bg-white rounded-2xl p-3 border border-gray-200 shadow-sm flex flex-wrap gap-2">
                    <button
                        onClick={() => { setActiveTab('jenis-pelaporan'); setOpenIdx(null); }}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'jenis-pelaporan'
                                ? 'bg-primary-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">category</span> 10 Jenis Pelaporan
                    </button>

                    <button
                        onClick={() => { setActiveTab('toko'); setOpenIdx(0); }}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'toko'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">storefront</span> Role Toko (User)
                    </button>

                    <button
                        onClick={() => { setActiveTab('am'); setOpenIdx(0); }}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'am'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">badge</span> Role Area Manager
                    </button>

                    <button
                        onClick={() => { setActiveTab('finance'); setOpenIdx(0); }}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'finance'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">account_balance</span> Role Admin Finance
                    </button>

                    <button
                        onClick={() => { setActiveTab('notifikasi'); setOpenIdx(null); }}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'notifikasi'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">notifications_active</span> Notifikasi & AI
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-gray-400">search</span>
                    </span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Cari kata kunci panduan (misal: 'terblokir', 'koreksi', 'multi-tanggal', 'selisih')..."
                        className="form-input pl-12 py-3 text-xs md:text-sm w-full bg-white border-gray-200 rounded-2xl shadow-sm"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                </div>

                {/* CONTENT AREA BASED ON TAB */}

                {/* TAB 1: 10 JENIS PELAPORAN */}
                {activeTab === 'jenis-pelaporan' && (
                    <div className="space-y-4">
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-primary-600">view_list</span>
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-base">Katalog 10 Jenis Pelaporan Setoran</h3>
                                <p className="text-xs text-gray-500">Setiap jenis pelaporan memiliki perlakuan dan alur verifikasi khusus pada sistem.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {PANDUAN_JENIS_PELAPORAN
                                .filter(item => !searchTerm || item.nama.toLowerCase().includes(searchTerm.toLowerCase()) || item.deskripsi.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map((item, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <h4 className="font-extrabold text-gray-900 text-sm">{item.nama}</h4>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${item.badge}`}>
                                                    Kategori #{idx + 1}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 leading-relaxed font-medium">{item.deskripsi}</p>
                                        </div>

                                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs text-gray-700">
                                            <span className="font-bold text-gray-900">SOP Pengisian: </span>
                                            {item.instruksi}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* TAB 2: ROLE TOKO */}
                {activeTab === 'toko' && (
                    <div className="space-y-4">
                        <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-100 flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-blue-600">storefront</span>
                            <div>
                                <h3 className="font-extrabold text-blue-900 text-base">Panduan Pengguna - Role Toko / User (Kasir)</h3>
                                <p className="text-xs text-blue-700">Petunjuk komprehensif mengoperasikan formulir setoran, pengajuan koreksi, dan tanggapan isu perbankan.</p>
                            </div>
                        </div>

                        {PANDUAN_ROLE_TOKO
                            .filter(item => !searchTerm || item.modul.toLowerCase().includes(searchTerm.toLowerCase()) || item.penjelasan.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((item, idx) => (
                                <AccordionGuideItem
                                    key={idx}
                                    title={item.modul}
                                    icon={item.icon}
                                    penjelasan={item.penjelasan}
                                    langkah={item.langkah}
                                    tips={item.tips}
                                    isOpen={openIdx === idx}
                                    onToggle={() => toggleAccordion(idx)}
                                />
                            ))}
                    </div>
                )}

                {/* TAB 3: ROLE AREA MANAGER */}
                {activeTab === 'am' && (
                    <div className="space-y-4">
                        <div className="bg-indigo-50/70 p-5 rounded-2xl border border-indigo-100 flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-indigo-600">badge</span>
                            <div>
                                <h3 className="font-extrabold text-indigo-900 text-base">Panduan Pengguna - Role Area Manager (AM)</h3>
                                <p className="text-xs text-indigo-700">Petunjuk supervisi outlet binaan, evaluasi pengajuan koreksi, dan monitoring troubleshooting perbankan.</p>
                            </div>
                        </div>

                        {PANDUAN_ROLE_AM
                            .filter(item => !searchTerm || item.modul.toLowerCase().includes(searchTerm.toLowerCase()) || item.penjelasan.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((item, idx) => (
                                <AccordionGuideItem
                                    key={idx}
                                    title={item.modul}
                                    icon={item.icon}
                                    penjelasan={item.penjelasan}
                                    langkah={item.langkah}
                                    tips={item.tips}
                                    isOpen={openIdx === idx}
                                    onToggle={() => toggleAccordion(idx)}
                                />
                            ))}
                    </div>
                )}

                {/* TAB 4: ROLE ADMIN FINANCE */}
                {activeTab === 'finance' && (
                    <div className="space-y-4">
                        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-100 flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-emerald-600">account_balance</span>
                            <div>
                                <h3 className="font-extrabold text-emerald-900 text-base">Panduan Pengguna - Role Admin Finance</h3>
                                <p className="text-xs text-emerald-700">Petunjuk rekonsiliasi data setoran nasional, penerbitan isu troubleshooting bank, dan POS sync.</p>
                            </div>
                        </div>

                        {PANDUAN_ROLE_FINANCE
                            .filter(item => !searchTerm || item.modul.toLowerCase().includes(searchTerm.toLowerCase()) || item.penjelasan.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((item, idx) => (
                                <AccordionGuideItem
                                    key={idx}
                                    title={item.modul}
                                    icon={item.icon}
                                    penjelasan={item.penjelasan}
                                    langkah={item.langkah}
                                    tips={item.tips}
                                    isOpen={openIdx === idx}
                                    onToggle={() => toggleAccordion(idx)}
                                />
                            ))}
                    </div>
                )}

                {/* TAB 5: NOTIFIKASI & AI */}
                {activeTab === 'notifikasi' && (
                    <div className="space-y-4">
                        <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-100 flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-purple-600">notifications_active</span>
                            <div>
                                <h3 className="font-extrabold text-purple-900 text-base">Sistem Notifikasi Real-time & Alpro Assistant AI</h3>
                                <p className="text-xs text-purple-700">Cara kerja lonceng notifikasi, indikator sidebar badge, dan asisten kecerdasan buatan 24/7.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                                <div className="flex items-center gap-2 text-purple-600 font-extrabold text-sm">
                                    <span className="material-symbols-outlined">notifications</span> Lonceng Header & Sidebar Badges
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Sistem memantau perubahan data secara real-time via WebSocket Supabase.
                                </p>
                                <ul className="text-xs text-gray-700 space-y-2">
                                    <li className="flex items-start gap-1.5">
                                        <span className="text-purple-600 font-bold">•</span>
                                        <span><strong>Lonceng Header:</strong> Menampilkan popover pesan teratas saat ada update persetujuan koreksi atau isu bank baru.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="text-purple-600 font-bold">•</span>
                                        <span><strong>Badge Sidebar:</strong> Menampilkan bulatan indikator oranye pada menu spesifik jika ada tugas yang membutuhkan tindakan Anda.</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                                <div className="flex items-center gap-2 text-indigo-600 font-extrabold text-sm">
                                    <span className="material-symbols-outlined">smart_toy</span> Alpro Assistant AI Chatbot
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Asisten cerdas berbasis Groq Llama-3 yang dapat diakses dari widget kanan bawah Beranda.
                                </p>
                                <ul className="text-xs text-gray-700 space-y-2">
                                    <li className="flex items-start gap-1.5">
                                        <span className="text-indigo-600 font-bold">•</span>
                                        <span><strong>Fungsi:</strong> Menjawab pertanyaan SOP setoran, jenis pelaporan, dan solusi penanganan deposit card.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="text-indigo-600 font-bold">•</span>
                                        <span><strong>Kerahasiaan:</strong> Chat bersifat stateless dan tidak menyimpan data sensitif perusahaan.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Help */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-left">
                        <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">support_agent</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Butuh Bantuan Langsung?</h3>
                            <p className="text-xs text-gray-500">Tanyakan pada Alpro Assistant AI di Beranda atau hubungi tim Finance cabang Anda.</p>
                        </div>
                    </div>
                    <a
                        href="/beranda"
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-sm">smart_toy</span> Buka Alpro Assistant
                    </a>
                </div>

            </div>
        </UserLayout>
    );
}
