import AdminLayout from '../components/AdminLayout';

export default function BantuanAdminPage() {
    return (
        <AdminLayout title="Petunjuk Penggunaan">
            <div className="max-w-4xl mx-auto space-y-8 pb-10">

                {/* Header Section */}
                <div className="bg-gradient-to-r from-primary-500 to-orange-400 rounded-2xl p-8 text-white shadow-lg shadow-primary-500/20">
                    <h2 className="text-2xl font-bold mb-2">Halo Admin Alpro! 👋</h2>
                    <p className="opacity-90 leading-relaxed text-sm sm:text-base">
                        Halaman ini adalah panduan singkat agar Anda lancar menggunakan sistem pelaporan setoran harian.
                        Sistem ini dirancang untuk memantau aliran uang dari cabang ke pusat dengan lebih transparan.
                    </p>
                </div>

                {/* Dashboard Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">dashboard</span>
                        <h3 className="font-bold text-gray-800">1. Memahami Dashboard</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <p className="text-gray-600 text-sm">Dashboard adalah ringkasan performa keuangan seluruh cabang. Ada 4 kartu utama yang harus dipantau:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                                <p className="font-bold text-orange-700 text-sm mb-1">Total Sales Tunai</p>
                                <p className="text-xs text-orange-600 leading-relaxed">Jumlah seluruh penjualan tunai yang diinput oleh apotek. Ini adalah target uang yang seharusnya disetor.</p>
                            </div>
                            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                                <p className="font-bold text-green-700 text-sm mb-1">Total Setoran</p>
                                <p className="text-xs text-green-600 leading-relaxed">Jumlah uang yang benar-benar sudah masuk/dikonfirmasi lewat bukti transfer atau ATM oleh cabang.</p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                <p className="font-bold text-red-700 text-sm mb-1">Uang Belum Disetor</p>
                                <p className="text-xs text-red-600 leading-relaxed">Sisa uang yang masih dipegang cabang (Selisih antara Penjualan vs Setoran). Bagian ini yang perlu segera ditindaklanjuti.</p>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                <p className="font-bold text-blue-700 text-sm mb-1">Apotek Belum Lapor</p>
                                <p className="text-xs text-blue-600 leading-relaxed">Menunjukkan berapa banyak cabang yang hari ini (atau di periode terpilih) sama sekali belum mengirim laporan.</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg flex gap-3 items-start">
                            <span className="material-symbols-outlined text-gray-400">info</span>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                <strong>Tips Grafik:</strong> Grafik di dashboard membantu Anda melihat tren. Garis oranye adalah Tren Penjualan, sedangkan batang hijau adalah Realisasi Setoran. Jika batang jauh di bawah garis, artinya banyak uang yang belum disetor.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Management Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">table_view</span>
                        <h3 className="font-bold text-gray-800">2. Manajemen Laporan</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-gray-600 text-sm italic">Digunakan untuk melihat rincian laporan per cabang secara detail.</p>
                        <ul className="space-y-4">
                            <li className="flex gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs font-mono">1</div>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Filter Tanggal & Apotek</p>
                                    <p className="text-gray-500 leading-relaxed font-medium">Gunakan kolom pencarian di atas untuk mencari nama apotek tertentu atau ubah rentang tanggal untuk melihat data masa lalu.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs font-mono">2</div>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Pantau Selisih (Alarm)</p>
                                    <p className="text-gray-500 leading-relaxed">Tabel akan otomatis menandai laporan dengan warna merah jika setoran tidak sesuai dengan angka penjualan (Selisih). Klik ikon 'Mata' untuk melihat rincian foto bukti setoran mereka.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs font-mono">3</div>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Filter KCP & Selisih Besar</p>
                                    <p className="text-gray-500 leading-relaxed text-xs">Anda bisa memfilter berdasarkan KCP tertentu. Aktifkan saklar <strong>"Selisih &gt; 50rb"</strong> untuk hanya memunculkan laporan dengan perbedaan angka yang cukup signifikan.</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Pending Reports Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">pending_actions</span>
                        <h3 className="font-bold text-gray-800">3. Monitoring Laporan Pending</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <p className="text-gray-600 text-sm">Halaman ini adalah "detektif" sistem. Ia secara otomatis mencocokkan jadwal wajib lapor cabang (Senin-Jumat) dengan data yang benar-benar masuk.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-500">event_busy</span>
                                    Deteksi Hari Bolong
                                </p>
                                <p className="text-xs text-gray-500 leading-relaxed">Sistem akan menampilkan daftar tanggal di mana cabang seharusnya melapor namun datanya tidak ditemukan. Ini menyesuaikan dengan frekuensi lapor cabang (misal: 1x seminggu atau setiap hari).</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary-500">mail</span>
                                    Kirim Pengingat Masal
                                </p>
                                <p className="text-xs text-gray-500 leading-relaxed">Klik tombol <strong>"Kirim Email Pengingat"</strong> untuk mengirimkan teguran otomatis ke seluruh cabang yang nunggak laporan secara sekaligus. Email berisi rincian tanggal yang belum mereka laporkan.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Analytics Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">bar_chart</span>
                        <h3 className="font-bold text-gray-800">4. Analitik & Export Data</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-gray-600 text-sm">Digunakan untuk melihat gambaran besar performa keuangan cabang dalam periode tertentu.</p>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-green-500 text-lg">download</span>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Fitur CSV (Export Excel)</p>
                                    <p className="text-gray-500 text-xs">Klik tombol hijau 'CSV' untuk mengunduh rekap laporan dalam format file tabel. File ini sangat berguna untuk proses audit manual di Excel atau lampiran laporan bulanan.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-orange-500 text-lg">donut_large</span>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Distribusi Jenis Laporan</p>
                                    <p className="text-gray-500 text-xs">Lihat grafik lingkaran untuk memahami jenis setoran apa yang paling dominan di lapangan (misal: Setoran via ATM atau Kasir).</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Settings Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">settings</span>
                        <h3 className="font-bold text-gray-800">5. Pengaturan Akun</h3>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <p className="font-bold text-gray-800 text-sm">Ganti Password</p>
                                <p className="text-[11px] text-gray-500 leading-relaxed">Hanya bisa dilakukan jika Anda ingat password lama. Sangat disarankan untuk mengganti password secara berkala.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-bold text-gray-800 text-sm">Data KCP & Profil</p>
                                <p className="text-[11px] text-gray-500 leading-relaxed">Penting bagi Admin untuk memastikan data KCP terdekat dan nomor kartu deposit sudah benar agar identitas laporan tidak salah.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-bold text-gray-800 text-sm">Notifikasi Email</p>
                                <p className="text-[11px] text-gray-500 leading-relaxed">Aktifkan saklar "Email Pengingat" agar sistem bisa mengirimkan email otomatis ke Anda atau cabang terkait.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer Quote */}
                <div className="text-center pt-4">
                    <p className="text-gray-400 text-xs italic">
                        "Keakuratan data adalah kunci kepercayaan perusahaan. Mohon verifikasi setiap selisih yang ditemukan."
                    </p>
                    <p className="text-gray-400 text-[10px] mt-2 font-mono uppercase tracking-widest">Alpro Logistics & Finance System v2.0</p>
                </div>

            </div>
        </AdminLayout>
    );
}
