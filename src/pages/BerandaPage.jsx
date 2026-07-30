import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserLayout from '../components/UserLayout';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';

export default function BerandaPage() {
    const { profile } = useAuth();
    const navigate = useNavigate();

    const [recentReports, setRecentReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [hariBelumLapor, setHariBelumLapor] = useState(0);
    const [lastReportDate, setLastReportDate] = useState(null);
    const [tunggakanDates, setTunggakanDates] = useState([]);
    const [duplikatDates, setDuplikatDates] = useState([]);

    const fetchData = async () => {
        if (!profile?.id) {
            setLoading(false);
            return;
        }
            setLoading(true);
            setFetchError(null);
            try {
                // Fetch ALL reports for this user to calculate total missed working dates accurately
                const { data, error } = await supabase
                    .from('laporan')
                    .select('*')
                    .eq('user_id', profile.id)
                    .order('tanggal_setor', { ascending: false })
                    .order('tanggal_jual', { ascending: false, nullsFirst: false })
                    .order('id', { ascending: false });

                if (error) throw error;

                const allReports = data || [];

                // Show only the 10 most recent in 'Aktivitas Terkini'
                setRecentReports(allReports.slice(0, 10));

                // 1. Last Report Date (Based on 3 primary report types)
                const primaryReports = allReports.filter(r => 
                    ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                );
                if (primaryReports.length > 0) {
                    setLastReportDate(primaryReports[0].tanggal_jual);
                } else {
                    setLastReportDate(null);
                }

                // 2. Calculate missing sales dates (from profile.tanggal_aktif or 2026-04-01 up to yesterday)
                const startStr = profile?.tanggal_aktif || '2026-04-01';
                const start = new Date(startStr);
                start.setHours(0, 0, 0, 0);

                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);

                const targetDates = [];
                let currentLoop = new Date(start);
                while (currentLoop <= yesterday) {
                    targetDates.push(currentLoop.toLocaleDateString('sv-SE'));
                    currentLoop.setDate(currentLoop.getDate() + 1);
                }
                targetDates.reverse();

                const missingDates = [];
                targetDates.forEach(date => {
                    const hasReport = allReports.some(r => 
                        r.tanggal_jual === date && 
                        ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                    );
                    if (!hasReport) {
                        const formatted = new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                        missingDates.push({ date, formatted });
                    }
                });

                setHariBelumLapor(missingDates.length);
                setTunggakanDates(missingDates);

                // Calculate duplicate dates for primary reports
                const counts = {};
                allReports.forEach(r => {
                    const isPrimary = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
                    if (isPrimary && r.tanggal_jual) {
                        counts[r.tanggal_jual] = (counts[r.tanggal_jual] || 0) + 1;
                    }
                });
                const duplicates = Object.keys(counts).filter(d => counts[d] > 1).map(d => {
                    const formatted = new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    return { date: d, formatted };
                });
                setDuplikatDates(duplicates);

            } catch (error) {
                console.error("Error fetching dashboard data:", error);
                setFetchError("Gagal memuat data penjualan. Silakan periksa koneksi internet Anda.");
            } finally {
                setLoading(false);
            }
        };

    useEffect(() => {
        if (profile?.id) {
            fetchData();
        } else {
            setLoading(false);
        }
    }, [profile?.id, profile?.frekuensi_setoran]);

    // Format date string (YYYY-MM-DD -> DD MMM YYYY)
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const d = new Date(dateString);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Format currency
    const formatRp = (number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number || 0);
    };

    return (
        <UserLayout title="Beranda" activeRoute="/beranda">
            <div className="max-w-screen-2xl mx-auto space-y-6">

                {/* Welcome Banner */}
                <div className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
                    <h2 className="text-2xl font-bold text-gray-800">Halo, {profile?.username || 'Tim Alpro'}!</h2>
                    <p className="text-gray-500 mt-1">Selamat datang di Sistem Pelaporan Sales Harian.</p>
                </div>

                {/* ALERT BANNERS */}
                {!loading && (hariBelumLapor > 0 || duplikatDates.length > 0) && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm animate-fade-in">
                        <div className="flex items-start">
                            <span className="material-symbols-outlined text-red-500 mr-3">error</span>
                            <div>
                                <h3 className="text-sm font-bold text-red-800 uppercase">Pemberitahuan Penting</h3>
                                <div className="mt-1 text-sm text-red-700">
                                    <ul className="list-disc pl-5 space-y-1">
                                        {hariBelumLapor > 0 && (
                                            <>
                                                <li>Anda belum melakukan pelaporan sales untuk <strong>{hariBelumLapor} hari penjualan</strong>.</li>
                                                <li>
                                                    Tanggal sales yang belum dilaporkan: {' '}
                                                    <span className="font-extrabold text-red-950 underline decoration-red-400">
                                                        {tunggakanDates.map(d => d.formatted).join(', ')}
                                                    </span>
                                                </li>
                                            </>
                                        )}
                                        {duplikatDates.length > 0 && (
                                            <li>
                                                Terdapat laporan tanggal sales duplikat untuk tanggal {' '}
                                                <span className="font-extrabold text-red-950 underline decoration-red-400">
                                                    {duplikatDates.map(d => d.formatted).join(', ')}
                                                </span>
                                                , mohon periksa kembali tanggal pada laporan Anda.
                                            </li>
                                        )}
                                        {hariBelumLapor > 0 && (
                                            <li>Mohon segera lengkapi laporan sales yang tertunda.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {fetchError && (
                    <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-orange-600">wifi_off</span>
                            <div>
                                <p className="text-sm font-bold text-orange-900">{fetchError}</p>
                                <p className="text-xs text-orange-700">Koneksi sempat terputus saat aplikasi idle.</p>
                            </div>
                        </div>
                        <button
                            onClick={fetchData}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">refresh</span> Muat Ulang Data
                        </button>
                    </div>
                )}
                
                {/* KPI CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* KPI 1 : Hari Belum Lapor */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            {loading ? (
                                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mb-1"></div>
                            ) : (
                                <h3 className="text-3xl font-extrabold text-gray-800 leading-none">{hariBelumLapor}</h3>
                            )}
                            <p className="text-sm text-gray-500 mt-1 font-medium">Hari Belum Lapor Sales</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-primary-500 text-2xl">assignment_late</span>
                        </div>
                    </div>

                    {/* KPI 2 : Kasus Duplikasi Tanggal */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            {loading ? (
                                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mb-1"></div>
                            ) : (
                                <h3 className="text-3xl font-extrabold text-gray-800 leading-none">{duplikatDates.length}</h3>
                            )}
                            <p className="text-sm text-gray-500 mt-1 font-medium">Tanggal Sales Duplikat</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                        </div>
                    </div>

                    {/* KPI 3 : Tanggal Sales Terakhir Dilaporkan */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            {loading ? (
                                <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-1"></div>
                            ) : (
                                <h3 className="text-xl font-bold text-gray-800 leading-none mt-1.5">{formatDate(lastReportDate)}</h3>
                            )}
                            <p className="text-sm text-gray-500 mt-2 font-medium">Tanggal Sales Terakhir Dilaporkan</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-green-500 text-2xl">event_available</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-gray-400">bolt</span> Aksi Cepat
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => navigate('/setoran')}
                            className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-primary-600 transition-all shadow-md transform hover:-translate-y-0.5 text-sm"
                        >
                            <span className="material-symbols-outlined text-xl">add_circle</span> Lapor Sales Baru
                        </button>
                        <button
                            onClick={() => navigate('/riwayat')}
                            className="flex items-center gap-2 bg-white text-gray-700 font-semibold py-2.5 px-5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all shadow-sm text-sm"
                        >
                            <span className="material-symbols-outlined text-xl">history</span> Riwayat Laporan
                        </button>
                    </div>
                </div>

                {/* Activity Container */}
                <div className="pb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-gray-400">list_alt</span> Aktivitas Terkini
                    </h3>

                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="animate-pulse flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-full bg-gray-200 h-10 w-10 shrink-0"></div>
                                        <div className="space-y-2">
                                            <div className="h-4 bg-gray-200 rounded w-32"></div>
                                            <div className="h-3 bg-gray-200 rounded w-24"></div>
                                        </div>
                                    </div>
                                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                                </div>
                            ))}
                        </div>
                    ) : recentReports.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {recentReports.map((laporan) => {
                                // Tentukan Ikon & Warna berdasarkan jenis pelaporan
                                let icon = "receipt_long";
                                let colorClass = "text-gray-500 bg-gray-100";
                                let NominalEl = null;

                                if (laporan.jenis_pelaporan === 'Setoran Harian') {
                                    icon = "payments";
                                    colorClass = "text-green-600 bg-green-50";
                                    NominalEl = <span className="font-bold text-gray-800 whitespace-nowrap">{formatRp(laporan.nominal_setoran)}</span>;
                                } else if (laporan.jenis_pelaporan === 'Uang Pecahan Kecil (UPK)') {
                                    icon = "savings";
                                    colorClass = "text-orange-600 bg-orange-50";
                                    NominalEl = (
                                        <div className="text-right">
                                            <span className="font-bold text-gray-800 block text-xs md:text-sm">Tukar: {formatRp(laporan.nominal_jual)}</span>
                                            <span className="font-bold text-gray-600 block text-xs md:text-sm">Terima: {formatRp(laporan.nominal_setoran)}</span>
                                        </div>
                                    );
                                } else if (laporan.jenis_pelaporan === 'Pemberitahuan Retur') {
                                    icon = "assignment_return";
                                    colorClass = "text-red-500 bg-red-50";
                                } else if (laporan.jenis_pelaporan === 'Pemberitahuan Libur') {
                                    icon = "event_busy";
                                    colorClass = "text-blue-500 bg-blue-50";
                                }

                                return (
                                    <div key={laporan.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-4 mb-2 sm:mb-0">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                <span className="material-symbols-outlined text-xl">{icon}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-gray-800 truncate">{laporan.jenis_pelaporan}</p>
                                                <div className="flex items-center text-xs text-gray-500 mt-0.5 gap-2">
                                                    <span className="flex items-center gap-1"><span className="material-symbols-outlined scale-[0.7] -mx-1">calendar_today</span> {formatDate(laporan.tanggal_jual || laporan.tanggal_setor)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100">
                                            {NominalEl}
                                            <div className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold shrink-0">
                                                <span className="material-symbols-outlined text-[14px]">check_circle</span> Selesai
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
                            <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="material-symbols-outlined text-gray-400 text-2xl">description</span>
                            </div>
                            <p className="text-gray-500 font-medium text-sm">Belum ada riwayat laporan sales.</p>
                            <p className="text-gray-400 text-xs mt-1">Riwayat laporan sales Anda akan muncul di sini.</p>
                        </div>
                    )}
                </div>

            </div>
        </UserLayout>
    );
}

