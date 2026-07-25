import React, { useState } from 'react';
import UserLayout from '../components/UserLayout';

/* ==========================================================================
   Comprehensive FAQ & User Manual Data organized by Role & Module
   ========================================================================== */
const FAQ_CATEGORIES = [
    {
        id: 'role-toko-laporan',
        role: 'user',
        icon: 'edit_note',
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        title: '🛒 Toko (User) - Pengisian Laporan Setoran',
        items: [
            {
                q: 'Bagaimana alur lengkap pengisian laporan setoran harian toko?',
                a: 'Pengisian laporan setoran dilakukan dalam 3 langkah intuitif:\n1. **Step 1: Pilih Tanggal & Jenis Pelaporan** - Tentukan jenis pelaporan (Setoran Normal, Selisih Kurang, dsb.), tanggal penjualan, dan metode setoran (Bank, Setor Tunai ATM, dsb.).\n2. **Step 2: Isi Nominal & Upload Bukti** - Masukkan nominal penjualan kasir, potongan (jika ada), nominal setoran aktual, dan unggah foto struk ATM/transfer.\n3. **Step 3: Ringkasan & Submit** - Periksa ulang rincian kalkulasi setoran lalu tekan **Kirim Laporan**.',
            },
            {
                q: 'Apakah bisa mengisi laporan untuk beberapa tanggal penjualan sekaligus (Multi-Tanggal)?',
                a: 'Bisa! Pada **Step 1**, Anda dapat menekan tombol **"+ Tambah Tanggal Penjualan"** untuk menyisipkan tanggal penjualan lain. Sistem akan otomatis memisahkan baris laporan per tanggal penjualan sehingga Anda tidak perlu keluar-masuk formulir.',
            },
            {
                q: 'Ketentuan file bukti setoran foto apa saja yang didukung?',
                a: 'Foto bukti setoran harus jelas, tidak buram, dan menampilkan nomor referensi/nominal secara utuh.\n- **Ukuran Maksimal**: 10 MB per file.\n- **Format**: JPG, PNG, atau HEIC.\n- **Tips**: Pastikan pencahayaan cukup dan foto tegak lurus.',
            },
            {
                q: 'Bagaimana jika ada selisih kurang atau lebih pada setoran?',
                a: 'Pilih jenis pelaporan **"Setoran Uang Kurang"** atau **"Setoran Uang Lebih"**. Masukkan nominal penjualan sesungguhnya dan nominal yang berhasil disetor. Jelaskan kronologi selisih di kolom keterangan agar tim Finance dan Area Manager dapat melakukan audit.',
            },
        ],
    },
    {
        id: 'role-toko-anomali-koreksi',
        role: 'user',
        icon: 'warning',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        title: '🛒 Toko (User) - Anomali, Darurat & Koreksi Laporan',
        items: [
            {
                q: 'Apa yang harus dilakukan jika Deposit Card Terblokir atau Tertelan ATM?',
                a: 'Segera pilih Jenis Pelaporan Khusus:\n- **Deposit Card Terblokir (PIN Salah 3x)**: Isi nomor kartu & KCP terdekat. Sistem akan **otomatis mengirimkan email darurat** ke tim Finance untuk proses reset.\n- **Deposit Card Tertelan Mesin ATM**: Isi nomor mesin ATM dan lokasi kejadian. Notifikasi darurat akan langsung terkirim ke Finance.',
            },
            {
                q: 'Bagaimana cara mengajukan Koreksi Laporan jika ada salah input?',
                a: 'Jika laporan yang sudah terkirim memiliki kesalahan angka atau bukti foto:\n1. Buka menu **Koreksi Laporan** di sidebar.\n2. Cari tanggal laporan yang ingin dikoreksi lalu tekan **"Ajukan Koreksi"**.\n3. Masukkan nominal/bukti foto perbaikan beserta alasan koreksi.\n4. Pengajuan Anda akan masuk ke antrean **Persetujuan Area Manager (AM)**.',
            },
            {
                q: 'Bagaimana menanggapi Isu Troubleshooting Bank dari Tim Finance?',
                a: 'Jika tim Finance menemukan ketidakcocokan setoran bank di toko Anda:\n1. Anda akan menerima notifikasi lonceng & badge di menu **Troubleshooting Bank**.\n2. Buka menu **Troubleshooting Bank**, klik **"Tanggapi Isu"** pada baris laporan.\n3. Tuliskan penjelasan/klarifikasi toko dan lampirkan bukti foto tambahan (jika ada).\n4. Setelah dikirim, status akan berubah dan Finance akan memverifikasi ulang.',
            },
        ],
    },
    {
        id: 'role-am-monitoring',
        role: 'areamanager',
        icon: 'dashboard',
        color: 'text-indigo-600',
        bg: 'bg-indigo-50',
        title: '👔 Area Manager - Monitoring & Dashboard Area',
        items: [
            {
                q: 'Fitur apa saja yang tersedia di Dashboard Area Manager?',
                a: 'Dashboard AM memberikan visibilitas penuh terhadap toko binaan di wilayahnya:\n- **Ringkasan Outlet**: Total jumlah outlet, persentase kepatuhan setoran, dan total nominal setoran.\n- **Filter Jenis Pelaporan**: Memfilter laporan Normal, Selisih, hingga toko yang **"Belum Dilaporkan"**.\n- **Filter Kasus Khusus**: Menampilkan toko dengan kasus terblokir, tertelan, atau selisih audit.',
            },
            {
                q: 'Bagaimana cara memproses Persetujuan Koreksi Laporan (Approval)?',
                a: '1. Buka menu **Persetujuan Koreksi** di sidebar.\n2. Tinjau rincian angka awal toko vs angka koreksi yang diajukan serta alasannya.\n3. Tekan **"Setujui (Approve)"** jika sesuai, atau **"Tolak (Reject)"** dengan memberikan catatan revisi.\n4. Toko dan Finance akan menerima notifikasi otomatis atas keputusan Anda.',
            },
            {
                q: 'Bagaimana cara kerja monitoring Troubleshooting Bank di role Area Manager?',
                a: '1. Buka menu **Troubleshooting Bank** di sidebar AM.\n2. Anda dapat melihat seluruh isu perbankan outlet binaan beserta statusnya (*Need Info*, *In Progress*, *Resolved*).\n3. Gunakan tombol **"Ingatkan Toko via WA"** untuk mengirim pesan pengingat otomatis ke toko yang belum merespon isu dari Finance.',
            },
        ],
    },
    {
        id: 'role-admin-finance',
        role: 'admin',
        icon: 'account_balance_wallet',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        title: '💳 Admin / Finance - Rekap, POS Sync & Audit Bank',
        items: [
            {
                q: 'Bagaimana alur kerja Rekap Setoran & Auto-Sync Sales POS Xilnex?',
                a: 'Sistem secara otomatis mengsinkronkan data penjualan POS Xilnex dari Google Drive setiap harinya via Edge Function (`sync-pos-sales-from-drive`). Tim Finance dapat membandingkan data penjualan POS dengan setoran aktual toko di menu **Rekap Setoran**.',
            },
            {
                q: 'Bagaimana cara membuat Isu Troubleshooting Bank baru untuk toko?',
                a: '1. Buka menu **Troubleshooting Bank** (Admin Finance).\n2. Klik **"+ Buat Isu Baru"**.\n3. Pilih toko, tanggal penjualan, nama bank, nominal dispute, dan deskripsi kendala.\n4. Setelah disimpan, sistem otomatis mengirim notifikasi lonceng ke Toko dan Area Manager terkait.',
            },
            {
                q: 'Bagaimana mengelola status isu Troubleshooting Bank hingga selesai?',
                a: 'Finance dapat mengupdate status isu:\n- **Need Info**: Menunggu tindakan/bukti foto dari toko.\n- **In Progress**: Sedang dalam pengurusan dengan pihak bank.\n- **Resolved**: Kendala tuntas diselesaikan. Finance dapat memberikan catatan penjelasan final.',
            },
            {
                q: 'Bagaimana alur pemrosesan final Koreksi Laporan di sisi Finance?',
                a: 'Setelah pengajuan koreksi disetujui oleh Area Manager, data koreksi akan masuk ke antrean Finance untuk penyesuaian saldo/rekapitulasi akhir.',
            },
        ],
    },
    {
        id: 'fitur-notifikasi-ai',
        role: 'all',
        icon: 'notifications_active',
        color: 'text-purple-600',
        bg: 'bg-purple-50',
        title: '🔔 Pusat Notifikasi & Asisten AI (Alpro Assistant)',
        items: [
            {
                q: 'Bagaimana cara kerja Pusat Notifikasi (Header Lonceng & Sidebar Badge)?',
                a: 'Sistem dilengkapi notifikasi real-time via Supabase Channel:\n- **Lonceng Header**: Menampilkan popover daftar notifikasi terbaru (koreksi disetujui/ditolak, isu bank baru, respon toko).\n- **Badge Sidebar**: Menampilkan jumlah angka bulatan oranye (*unread counter*) pada menu spesifik jika ada item yang membutuhkan perhatian Anda.',
            },
            {
                q: 'Apa itu Alpro Assistant dan pertanyaan apa saja yang bisa dijawab?',
                a: 'Alpro Assistant adalah AI berbasis Groq Llama-3 di sudut kanan bawah Beranda yang siap membantu 24/7 menjawab pertanyaan SOP setoran, penanganan kartu terblokir, hingga alur pelaporan.',
            },
        ],
    },
    {
        id: 'pengaturan-keamanan',
        role: 'all',
        icon: 'settings',
        color: 'text-slate-600',
        bg: 'bg-slate-100',
        title: '⚙️ Pengaturan Akun & Keamanan',
        items: [
            {
                q: 'Bagaimana cara memperbarui kata sandi atau profil Deposit Card?',
                a: 'Buka menu **Pengaturan** di sidebar:\n- **Keamanan**: Masukkan password lama dan password baru (minimal 8 karakter).\n- **Profil Deposit Card**: Perbarui nomor deposit card atau KCP terdekat agar tersimpan sebagai nilai default di formulir berikutnya.',
            },
        ],
    },
];

/* Accordion Component */
function AccordionItem({ item, isOpen, onToggle }) {
    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden transition-all duration-150">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left bg-white hover:bg-gray-50 transition-colors cursor-pointer"
            >
                <span className="font-bold text-gray-800 text-sm leading-snug">{item.q}</span>
                <span className={`material-symbols-outlined text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary-600' : ''}`}>
                    expand_more
                </span>
            </button>

            {isOpen && (
                <div className="px-5 pb-5 bg-white border-t border-gray-100">
                    <div className="pt-3 text-xs md:text-sm text-gray-600 leading-relaxed space-y-2">
                        {item.a.split('\n').map((line, i) => {
                            if (!line.trim()) return null;
                            const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
                                p.startsWith('**') && p.endsWith('**')
                                    ? <strong key={j} className="text-gray-900 font-bold">{p.slice(2, -2)}</strong>
                                    : p
                            );
                            const isList = line.match(/^\d+\./);
                            return isList
                                ? <p key={i} className="ml-3 font-medium text-gray-700">{parts}</p>
                                : <p key={i}>{parts}</p>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* Category Section */
function FaqCategory({ category }) {
    const [openIdx, setOpenIdx] = useState(null);
    const toggle = (i) => setOpenIdx(prev => prev === i ? null : i);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className={`px-6 py-4 border-b border-gray-100 flex items-center gap-3 ${category.bg}`}>
                <span className={`material-symbols-outlined text-2xl ${category.color}`}>{category.icon}</span>
                <h2 className="text-base font-extrabold text-gray-900">{category.title}</h2>
            </div>

            <div className="p-4 space-y-2.5">
                {category.items.map((item, i) => (
                    <AccordionItem
                        key={i}
                        item={item}
                        isOpen={openIdx === i}
                        onToggle={() => toggle(i)}
                    />
                ))}
            </div>
        </div>
    );
}

export default function BantuanPage() {
    const [search, setSearch] = useState('');
    const [activeRoleTab, setActiveRoleTab] = useState('all');

    // Filter by role tab and search text
    const filteredCats = FAQ_CATEGORIES
        .filter(cat => {
            if (activeRoleTab === 'all') return true;
            return cat.role === activeRoleTab || cat.role === 'all';
        })
        .map(cat => ({
            ...cat,
            items: cat.items.filter(item =>
                !search.trim() ||
                item.q.toLowerCase().includes(search.toLowerCase()) ||
                item.a.toLowerCase().includes(search.toLowerCase())
            ),
        }))
        .filter(cat => cat.items.length > 0);

    return (
        <UserLayout title="Panduan Pengguna" activeRoute="/bantuan">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Hero Header */}
                <div className="relative bg-gradient-to-r from-primary-600 via-orange-600 to-indigo-700 rounded-2xl p-6 md:p-8 text-white overflow-hidden shadow-lg">
                    <div className="absolute -top-6 -right-6 w-36 h-36 bg-white/10 rounded-full blur-xl" />
                    <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-black/10 rounded-full blur-lg" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-3xl md:text-4xl">menu_book</span>
                            <h1 className="text-2xl md:text-3xl font-black">Pusat Panduan & Dokumentasi</h1>
                        </div>
                        <p className="text-xs md:text-sm text-white/90 max-w-xl leading-relaxed">
                            Panduan operasional lengkap untuk role **Toko (User)**, **Area Manager (AM)**, dan **Admin Finance**.
                        </p>
                    </div>
                </div>

                {/* Role Tabs & Search */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-4">
                    {/* Role Filter Buttons */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setActiveRoleTab('all')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeRoleTab === 'all'
                                    ? 'bg-gray-900 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">apps</span> Semua Panduan
                        </button>
                        <button
                            onClick={() => setActiveRoleTab('user')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeRoleTab === 'user'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">storefront</span> Toko (User)
                        </button>
                        <button
                            onClick={() => setActiveRoleTab('areamanager')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeRoleTab === 'areamanager'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">badge</span> Area Manager
                        </button>
                        <button
                            onClick={() => setActiveRoleTab('admin')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeRoleTab === 'admin'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">account_balance</span> Admin Finance
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                            <span className="material-symbols-outlined text-gray-400">search</span>
                        </span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari panduan, kata kunci, atau fitur..."
                            className="form-input pl-11 py-2.5 text-xs md:text-sm w-full bg-gray-50 border-gray-200"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* FAQ Categories Grid */}
                {filteredCats.length > 0 ? (
                    <div className="space-y-4">
                        {filteredCats.map(cat => (
                            <FaqCategory key={cat.id} category={cat} />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 text-gray-500">
                        <span className="material-symbols-outlined text-5xl text-gray-300 mb-2">search_off</span>
                        <p className="font-bold text-sm">Tidak ada panduan ditemukan untuk "{search}".</p>
                        <p className="text-xs text-gray-400 mt-1">Coba gunakan kata kunci lain atau pilih tab role yang sesuai.</p>
                    </div>
                )}

                {/* Support Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-left">
                        <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">support_agent</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Butuh bantuan lebih lanjut?</h3>
                            <p className="text-xs text-gray-500">Gunakan Alpro Assistant AI di Beranda atau hubungi tim Finance cabang Anda.</p>
                        </div>
                    </div>
                    <a
                        href="/beranda"
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                        <span className="material-symbols-outlined text-sm">smart_toy</span> Buka Alpro Assistant
                    </a>
                </div>

            </div>
        </UserLayout>
    );
}
