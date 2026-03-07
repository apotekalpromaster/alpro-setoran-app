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
                                    <p className="text-gray-500 leading-relaxed">Gunakan kolom pencarian di atas untuk mencari nama apotek tertentu atau ubah rentang tanggal untuk melihat data masa lalu.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs font-mono">2</div>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Pantau Selisih (Alarm)</p>
                                    <p className="text-gray-500 leading-relaxed">Tabel akan otomatis menandai laporan dengan warna merah jika setoran tidak sesuai dengan angka penjualan (Selisih). Klik ikon 'Mata' untuk melihat bukti foto setoran mereka.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs font-mono">3</div>
                                <div className="text-sm">
                                    <p className="font-bold text-gray-800">Toggle Selisih &gt; 50rb</p>
                                    <p className="text-gray-500 leading-relaxed">Aktifkan tombol geser di pojok kanan atas untuk menyaring laporan bermasalah saja (selisih di atas 50 ribu) guna mempercepat proses audit.</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Analytics Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 font-bold">bar_chart</span>
                        <h3 className="font-bold text-gray-800">3. Analitik & Export Data</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-gray-600 text-sm">Halaman ini digunakan untuk kebutuhan laporan mingguan/bulanan atau presentasi ke pimpinan.</p>
                        <div className="flex flex-col sm:flex-row gap-6">
                            <div className="flex-1 space-y-3">
                                <p className="font-bold text-gray-800 text-sm">Ekspor ke Excel / CSV</p>
                                <p className="text-gray-500 text-xs leading-relaxed">Klik tombol hijau 'CSV' untuk mengunduh seluruh data yang sedang tampil di layar menjadi file tabel yang bisa dibuka di Excel.</p>
                            </div>
                            <div className="flex-1 space-y-3">
                                <p className="font-bold text-gray-800 text-sm">Pantau Anomali</p>
                                <p className="text-gray-500 text-xs leading-relaxed">Sistem akan menghitung berapa kali terjadi "Anomali" (seperti kartu tertelan atau salah PIN) agar Anda bisa mengevaluasi kendala teknis di lapangan.</p>
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
