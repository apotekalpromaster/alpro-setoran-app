import { useState } from 'react';
import UserLayout from '../components/UserLayout';

/* ─── Data FAQ ────────────────────────────────────────────────────────────────
   Organised into thematic categories. Each category has an icon, title, and
   a list of Q&A items.
─────────────────────────────────────────────────────────────────────────────── */
const FAQ_CATEGORIES = [
    {
        id: 'cara-laporan',
        icon: 'description',
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        title: 'Cara Mengisi Laporan Setoran',
        items: [
            {
                q: 'Bagaimana alur pengisian laporan setoran harian?',
                a: 'Alur terdiri dari 3 langkah mudah:\n1. **Pilih Jenis & Tanggal** — pilih jenis pelaporan (Normal, Selisih Kurang, dsb.), tanggal penjualan, dan metode setoran.\n2. **Isi Detail Setoran** — masukkan nominal penjualan, potongan (jika ada), nominal setoran, dan unggah bukti foto struk/bukti transfer.\n3. **Ringkasan & Kirim** — periksa ulang semua data sebelum menekan tombol Kirim.',
            },
            {
                q: 'Apakah saya bisa melaporkan lebih dari satu hari penjualan sekaligus?',
                a: 'Ya. Di Step 1, tekan tombol "+ Tambah Tanggal" untuk menambahkan tanggal penjualan kedua, ketiga, dan seterusnya. Sistem akan membuat baris laporan terpisah untuk setiap tanggal secara otomatis.',
            },
            {
                q: 'Bukti foto apa saja yang perlu diunggah?',
                a: 'Unggah struk ATM, bukti transfer, atau tangkapan layar notifikasi perbankan sebagai bukti setoran. Ukuran file maksimal 10 MB per file. Format yang didukung: JPG, PNG, HEIC.',
            },
            {
                q: 'Apakah laporan bisa diedit setelah dikirim?',
                a: 'Laporan yang sudah terkirim bersifat final dan tidak dapat diedit dari aplikasi ini untuk menjaga integritas data. Jika ada kesalahan, segera hubungi tim Finance atau Admin untuk koreksi manual.',
            },
        ],
    },
    {
        id: 'selisih-anomali',
        icon: 'warning',
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        title: 'Menangani Selisih & Kasus Anomali',
        items: [
            {
                q: 'Apa yang harus saya lakukan jika ada selisih/kurang setor?',
                a: 'Pilih jenis pelaporan **"Setoran Uang Kurang"**. Isi nominal penjualan sesungguhnya dan nominal yang berhasil disetorkan, lalu jelaskan penyebab selisih di kolom Keterangan. Sistem akan secara otomatis menghitung dan menampilkan jumlah selisih.',
            },
            {
                q: 'Apa yang harus dilakukan jika Deposit Card terblokir?',
                a: 'Pilih jenis pelaporan **"Deposit Card Terblokir (Salah Input PIN 3x)"**. Isi nomor kartu, KCP terdekat, dan waktu kejadian. Setelah laporan terkirim, sistem kami akan **otomatis mengirim email darurat** ke tim Finance untuk penanganan segera.',
            },
            {
                q: 'Deposit Card saya tertelan mesin ATM, apa yang harus dilakukan?',
                a: 'Pilih jenis pelaporan **"Deposit Card Tertelan Mesin ATM"**. Lengkapi nomor mesin ATM dan lokasi mesin. Simpan nomor referensi dari petugas bank dan lampirkan sebagai bukti foto jika tersedia. Tim Finance akan menerima notifikasi darurat segera.',
            },
            {
                q: 'Bagaimana jika jaringan internet sedang bermasalah saat submit?',
                a: 'Jangan menutup aplikasi. Tunggu beberapa saat hingga koneksi pulih, lalu coba kembali menekan tombol Kirim. Data formulir Anda tersimpan sementara di sesi browser dan tidak akan hilang selama Anda tidak me-refresh halaman.',
            },
        ],
    },
    {
        id: 'asisten-ai',
        icon: 'smart_toy',
        color: 'text-purple-500',
        bg: 'bg-purple-50',
        title: 'Menggunakan Asisten AI (Alpro Assistant)',
        items: [
            {
                q: 'Apa itu Alpro Assistant dan bagaimana cara menggunakannya?',
                a: 'Alpro Assistant adalah asisten AI berbasis Groq (Llama 3) yang siap menjawab pertanyaan Anda seputar prosedur pelaporan setoran. Anda dapat mengaksesnya dari widget chat di sudut kanan bawah halaman Beranda.',
            },
            {
                q: 'Pertanyaan apa saja yang bisa dijawab oleh Alpro Assistant?',
                a: 'Asisten dapat menjawab pertanyaan seputar:\n- Cara mengisi formulir laporan\n- Jenis-jenis pelaporan yang tersedia\n- Prosedur penanganan deposit card bermasalah\n- Metode dan jadwal setoran\n- Alur kerja pelaporan harian',
            },
            {
                q: 'Apakah Asisten AI menyimpan data percakapan saya?',
                a: 'Tidak. Setiap sesi percakapan dengan Asisten AI bersifat stateless (tidak tersimpan). Riwayat chat hanya ada selama sesi browser aktif dan akan hilang saat Anda me-refresh atau menutup halaman.',
            },
        ],
    },
    {
        id: 'riwayat-akun',
        icon: 'history',
        color: 'text-green-500',
        bg: 'bg-green-50',
        title: 'Riwayat & Manajemen Akun',
        items: [
            {
                q: 'Bagaimana cara melihat laporan yang sudah pernah saya kirim?',
                a: 'Kunjungi menu **Riwayat Laporan** di sidebar. Sistem menampilkan hingga 50 laporan terbaru. Gunakan filter tanggal dan pencarian untuk menemukan laporan spesifik. Klik baris laporan untuk melihat detail lengkapnya.',
            },
            {
                q: 'Bagaimana cara mengganti kata sandi saya?',
                a: 'Buka menu **Pengaturan** → bagian "Keamanan — Ubah Kata Sandi". Masukkan kata sandi saat ini untuk verifikasi, lalu ketik kata sandi baru (minimal 8 karakter) dan konfirmasikan.',
            },
            {
                q: 'Bagaimana cara memperbarui data Deposit Card atau KCP saya?',
                a: 'Buka menu **Pengaturan** → bagian "Data Profil & Deposit Card". Perbarui nomor kartu dan/atau KCP terdekat, lalu tekan "Simpan Profil". Data ini akan otomatis muncul sebagai nilai default di formulir laporan berikutnya.',
            },
            {
                q: 'Siapa yang harus saya hubungi untuk masalah teknis yang tidak bisa diselesaikan sendiri?',
                a: 'Hubungi tim Admin atau Finance cabang Anda melalui jalur komunikasi internal (WhatsApp/email). Berikan tangkapan layar (screenshot) pesan error yang muncul agar tim dapat membantu dengan lebih cepat.',
            },
        ],
    },
];

/* ─── Accordion Item ─────────────────────────────────────────────────────────── */
function AccordionItem({ item, isOpen, onToggle }) {
    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left bg-white hover:bg-gray-50 transition-colors"
            >
                <span className="font-semibold text-gray-800 text-sm leading-snug">{item.q}</span>
                <span className={`material-symbols-outlined text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {isOpen && (
                <div className="px-5 pb-5 bg-white border-t border-gray-100">
                    <div className="pt-3 text-sm text-gray-600 leading-relaxed space-y-2">
                        {item.a.split('\n').map((line, i) => {
                            if (!line.trim()) return null;
                            // Render bold **text**
                            const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
                                p.startsWith('**') && p.endsWith('**')
                                    ? <strong key={j} className="text-gray-800">{p.slice(2, -2)}</strong>
                                    : p
                            );
                            const isList = line.match(/^\d+\./);
                            return isList
                                ? <p key={i} className="ml-3">{parts}</p>
                                : <p key={i}>{parts}</p>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Category Section ───────────────────────────────────────────────────────── */
function FaqCategory({ category }) {
    const [openIdx, setOpenIdx] = useState(null);

    const toggle = (i) => setOpenIdx(prev => prev === i ? null : i);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Category header */}
            <div className={`px-6 py-4 border-b border-gray-100 flex items-center gap-3 ${category.bg}`}>
                <span className={`material-symbols-outlined ${category.color}`}>{category.icon}</span>
                <h2 className="text-base font-bold text-gray-800">{category.title}</h2>
            </div>

            {/* Accordion items */}
            <div className="p-4 space-y-2">
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

/* ═══════════════════════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════════════════════ */
export default function BantuanPage() {
    const [search, setSearch] = useState('');

    const filteredCats = search.trim().length < 2
        ? FAQ_CATEGORIES
        : FAQ_CATEGORIES.map(cat => ({
            ...cat,
            items: cat.items.filter(item =>
                item.q.toLowerCase().includes(search.toLowerCase()) ||
                item.a.toLowerCase().includes(search.toLowerCase())
            ),
        })).filter(cat => cat.items.length > 0);

    return (
        <UserLayout title="Panduan Pengguna" activeRoute="/bantuan">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* Hero */}
                <div className="relative bg-gradient-to-br from-primary-500 to-orange-600 rounded-2xl p-8 text-white overflow-hidden shadow-lg">
                    <div className="absolute -top-6 -right-6 w-36 h-36 bg-white/10 rounded-full" />
                    <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-black/5 rounded-full" />
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="material-symbols-outlined text-3xl">help</span>
                            <h1 className="text-2xl font-extrabold">Panduan Pengguna</h1>
                        </div>
                        <p className="text-sm text-white/80 max-w-md">
                            Temukan jawaban atas pertanyaan umum seputar penggunaan Sistem Pelaporan Setoran Harian Apotek Alpro.
                        </p>
                    </div>
                </div>

                {/* Search bar */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-gray-400">search</span>
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari pertanyaan atau kata kunci..."
                        className="form-input pl-12 py-3 text-sm"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                {/* FAQ categories */}
                {filteredCats.length > 0 ? (
                    filteredCats.map(cat => (
                        <FaqCategory key={cat.id} category={cat} />
                    ))
                ) : (
                    <div className="flex flex-col items-center py-16 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-3">search_off</span>
                        <p className="font-medium">Pertanyaan tidak ditemukan untuk "{search}".</p>
                        <p className="text-sm mt-1">Coba kata kunci yang berbeda atau hubungi Admin Anda.</p>
                    </div>
                )}

                {/* Contact footer */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm text-center">
                    <span className="material-symbols-outlined text-3xl text-gray-300 mb-2 block">support_agent</span>
                    <h3 className="font-bold text-gray-800 mb-1">Masih Butuh Bantuan?</h3>
                    <p className="text-sm text-gray-500">
                        Hubungi tim Admin atau Finance cabang Anda, atau gunakan{' '}
                        <a href="/beranda" className="text-primary-600 font-semibold hover:underline">Alpro Assistant</a>
                        {' '}di halaman Beranda.
                    </p>
                </div>

            </div>
        </UserLayout>
    );
}
