import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function AdminBerandaPage() {
    const { profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterPeriod, setFilterPeriod] = useState('last_30');

    const [metrics, setMetrics] = useState({
        totalSales: 0,
        totalSetoran: 0,
        potonganPenjualan: 0,
        selisihPerluDiperiksa: 0,
        belumLapor: 0,
        totalApotek: 0
    });

    const [chartData, setChartData] = useState(null);
    const [fraudAnomalies, setFraudAnomalies] = useState([]);
    const [anomalyCollapsed, setAnomalyCollapsed] = useState(false);

    useEffect(() => {
        fetchDashboardData();
    }, [filterPeriod]);

    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch Total Active Users (Role 'User')
            const { count: totalApotek, error: profileErr } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'User');

            if (profileErr) throw profileErr;

            // 2. Determine Date Range
            const todayDate = new Date();
            let startDate = new Date();

            if (filterPeriod === 'today') {
                startDate = new Date(todayDate);
            } else if (filterPeriod === 'yesterday') {
                startDate.setDate(todayDate.getDate() - 1);
                todayDate.setDate(todayDate.getDate() - 1);
            } else if (filterPeriod === 'last_7') {
                startDate.setDate(todayDate.getDate() - 6);
            } else if (filterPeriod === 'last_30') {
                startDate.setDate(todayDate.getDate() - 29);
            } else if (filterPeriod === 'this_month') {
                startDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
            }

            const startStr = startDate.toLocaleDateString('sv-SE');
            const endStr = todayDate.toLocaleDateString('sv-SE');

            // 3. Sequential Fetch reports - using YYYY-MM-DD local timezone on sales date (tanggal_jual)
            const PAGE_SIZE = 500;
            const MAX_ROWS = 5000;
            let allLaporan = [];
            let from = 0;
            let done = false;

            while (!done) {
                const to = from + PAGE_SIZE - 1;
                const { data: batch, error: laporanErr } = await supabase
                    .from('laporan')
                    .select('id, user_id, tanggal_jual, tanggal_setor, nominal_jual, nominal_setoran, potongan')
                    .gte('tanggal_jual', startStr)
                    .lte('tanggal_jual', endStr)
                    .range(from, to);

                if (laporanErr) throw laporanErr;

                const rows = batch || [];
                allLaporan = allLaporan.concat(rows);

                if (allLaporan.length >= MAX_ROWS || rows.length < PAGE_SIZE) {
                    done = true;
                } else {
                    from += PAGE_SIZE;
                }
            }

            // 3.5 Fetch POS Sales Data for the selected period
            let allPosSales = [];
            let posFrom = 0;
            let posDone = false;

            while (!posDone) {
                const posTo = posFrom + PAGE_SIZE - 1;
                const { data: posBatch, error: posErr } = await supabase
                    .from('pos_sales_data')
                    .select('sales_pos, tanggal_jual')
                    .gte('tanggal_jual', startStr)
                    .lte('tanggal_jual', endStr)
                    .range(posFrom, posTo);

                if (posErr) throw posErr;
                const posRows = posBatch || [];
                allPosSales = allPosSales.concat(posRows);

                if (posRows.length < PAGE_SIZE) {
                    posDone = true;
                } else {
                    posFrom += PAGE_SIZE;
                }
            }

            // 4. Calculate Metrics & Chart Data
            let sumPosSales = 0;
            let sumSetoran = 0;
            let sumPotongan = 0;
            const uniqueReporters = new Set();
            const dailyData = {};

            // Initialize daily data from POS sales
            allPosSales.forEach(item => {
                const dateKey = item.tanggal_jual;
                const val = Number(item.sales_pos) || 0;
                sumPosSales += val;
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = { sales: 0, setoran: 0 };
                }
                dailyData[dateKey].sales += val;
            });

            // Process Laporan deposits
            allLaporan.forEach(item => {
                const setoran = Number(item.nominal_setoran) || 0;
                const potongan = Number(item.potongan) || 0;

                sumSetoran += setoran;
                sumPotongan += potongan;
                uniqueReporters.add(item.user_id);

                const dateKey = item.tanggal_jual; // Align on sales date
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = { sales: 0, setoran: 0 };
                }
                dailyData[dateKey].setoran += setoran;
            });

            const selisihPerluDiperiksa = sumPosSales - sumSetoran - sumPotongan;
            const belumLapor = (totalApotek || 0) - uniqueReporters.size;

            setMetrics({
                totalSales: sumPosSales,
                totalSetoran: sumSetoran,
                potonganPenjualan: sumPotongan,
                selisihPerluDiperiksa,
                belumLapor: Math.max(0, belumLapor),
                totalApotek: totalApotek || 0
            });

            // Fetch fraud anomalies
            const { data: anomalies, error: aErr } = await supabase
                .rpc('detect_missing_primary_sales');
            if (!aErr) {
                setFraudAnomalies(anomalies || []);
            }

            // 5. Build Chart Data
            const sortedDates = Object.keys(dailyData).sort();
            const labels = sortedDates.map(d => {
                const dateObj = new Date(d + 'T00:00:00');
                return dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            });

            setChartData({
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Tren Penjualan Tunai (Xilnex)',
                        borderColor: '#f97316',
                        backgroundColor: '#f97316',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 4,
                        data: sortedDates.map(d => dailyData[d].sales),
                    },
                    {
                        type: 'bar',
                        label: 'Total Setoran',
                        backgroundColor: '#22c55e',
                        data: sortedDates.map(d => dailyData[d].setoran),
                        borderRadius: 4,
                        barPercentage: 0.6,
                    }
                ]
            });

        } catch (err) {
            setError(err.message || 'Gagal memuat data dashboard. Coba refresh halaman.');
        } finally {
            setLoading(false);
        }
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: '#f3f4f6',
                },
                ticks: {
                    font: { size: 11 },
                    color: '#9ca3af',
                    callback: function (value) {
                        if (value >= 1000000) return 'Rp ' + (value / 1000000).toFixed(1) + ' jt';
                        if (value >= 1000) return 'Rp ' + (value / 1000) + ' rb';
                        return 'Rp ' + value;
                    }
                }
            },
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    font: { size: 11 },
                    color: '#9ca3af',
                }
            }
        },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { size: 12, weight: '500' }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#1f2937',
                bodyColor: '#4b5563',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                padding: 12,
                boxPadding: 4,
                usePointStyle: true,
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                            label += new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        }
    };

    return (
        <AdminLayout title="Dashboard Keuangan">

            {/* Error Banner */}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <span><strong>Gagal memuat data:</strong> {error}</span>
                    <button onClick={fetchDashboardData} className="ml-auto text-xs font-bold underline hover:text-red-900">Coba Lagi</button>
                </div>
            )}

                        {/* Anomali Fraud Warning Banner */}
            {fraudAnomalies.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 space-y-3">
                    <div className="flex items-center justify-between text-red-700">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                            <h4 className="font-bold text-sm">Peringatan: Terdeteksi Anomali Penjualan Tanpa Setoran Utama</h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAnomalyCollapsed(p => !p)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-100 text-red-500 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined">
                                {anomalyCollapsed ? 'expand_more' : 'expand_less'}
                            </span>
                        </button>
                    </div>
                    {!anomalyCollapsed && (
                        <>
                            <p className="text-xs text-red-600">
                                Sistem mendeteksi toko-toko berikut melaporkan setoran jenis pecahan/lain tetapi belum mengunggah laporan setoran utama (Setoran Harian/3x Seminggu/Potongan) pada tanggal penjualan berikut:
                            </p>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {fraudAnomalies.map((anom, idx) => (
                                    <span key={idx} className="inline-flex items-center bg-red-100/70 text-red-800 text-xs px-2.5 py-1 rounded-lg border border-red-200 font-semibold shadow-xs">
                                        <span className="material-symbols-outlined text-xs mr-1">storefront</span>
                                        {anom.username} ({new Date(anom.tanggal_jual).toLocaleDateString('id-ID', {day: '2-digit', month: 'short'})})
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined">filter_alt</span><span className="font-semibold text-sm">Filter Periode:</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <select
                        value={filterPeriod}
                        onChange={(e) => setFilterPeriod(e.target.value)}
                        className="form-input py-2 pl-3 pr-8 text-sm border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
                        disabled={loading}
                    >
                        <option value="today">Hari Ini</option>
                        <option value="yesterday">Kemarin</option>
                        <option value="last_7">7 Hari Terakhir</option>
                        <option value="last_30">30 Hari Terakhir</option>
                        <option value="this_month">Bulan Ini</option>
                    </select>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {/* Sales */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-primary-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Total Sales Tunai (Data Xilnex)
                                {loading && <span className="material-symbols-outlined animate-spin text-[10px] text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : formatRupiah(metrics.totalSales)}
                            </h3>
                        </div>
                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg"><span className="material-symbols-outlined text-lg">payments</span></div>
                    </div>
                </div>

                {/* Deposit */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Total Setoran
                                {loading && <span className="material-symbols-outlined animate-spin text-[10px] text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : formatRupiah(metrics.totalSetoran)}
                            </h3>
                        </div>
                        <div className="p-1.5 bg-green-50 text-green-600 rounded-lg"><span className="material-symbols-outlined text-lg">account_balance</span></div>
                    </div>
                </div>

                {/* Potongan Penjualan */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-red-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Potongan Penjualan
                                {loading && <span className="material-symbols-outlined animate-spin text-[10px] text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-xl font-bold text-red-600 mt-1">
                                {loading ? '...' : formatRupiah(metrics.potonganPenjualan)}
                            </h3>
                        </div>
                        <div className="p-1.5 bg-red-50 text-red-600 rounded-lg"><span className="material-symbols-outlined text-lg">money_off</span></div>
                    </div>
                </div>

                {/* Selisih Uang Perlu Diperiksa */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className={`absolute right-0 top-0 h-full w-1 ${metrics.selisihPerluDiperiksa > 0 ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Selisih Perlu Diperiksa
                                {loading && <span className="material-symbols-outlined animate-spin text-[10px] text-gray-300">sync</span>}
                            </p>
                            <h3 className={`text-xl font-bold mt-1 ${metrics.selisihPerluDiperiksa > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                {loading ? '...' : formatRupiah(metrics.selisihPerluDiperiksa)}
                            </h3>
                        </div>
                        <div className={`p-1.5 rounded-lg ${metrics.selisihPerluDiperiksa > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                            <span className="material-symbols-outlined text-lg">
                                {metrics.selisihPerluDiperiksa > 0 ? 'question_mark' : 'done_all'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Pending Reporters */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Apotek Belum Lapor
                                {loading && <span className="material-symbols-outlined animate-spin text-[10px] text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : `${metrics.belumLapor} / ${metrics.totalApotek}`}
                            </h3>
                        </div>
                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg"><span className="material-symbols-outlined text-lg">storefront</span></div>
                    </div>
                </div>
            </div>

            {/* Chart Section Container */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            Tren Setoran vs Penjualan
                            {loading && <span className="material-symbols-outlined animate-spin text-lg text-gray-400">sync</span>}
                        </h3>
                        <p className="text-sm text-gray-500">Perbandingan total penjualan dan uang yang disetor per hari.</p>
                    </div>
                </div>
                <div className="relative h-80 w-full flex items-center justify-center">
                    {loading && !chartData ? (
                        <div className="text-center text-gray-400">
                            <span className="material-symbols-outlined text-4xl mb-2 animate-spin text-primary-500">sync</span>
                            <p className="text-sm font-medium">Memuat data grafik...</p>
                        </div>
                    ) : chartData && chartData.labels?.length > 0 ? (
                        <Chart type="bar" data={chartData} options={chartOptions} />
                    ) : (
                        <div className="text-center text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg w-full h-full flex flex-col items-center justify-center">
                            <span className="material-symbols-outlined text-4xl mb-2 text-gray-300">show_chart</span>
                            <p className="text-sm font-medium">Belum ada data di periode ini.</p>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
