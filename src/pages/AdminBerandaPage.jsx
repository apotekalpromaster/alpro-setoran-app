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
    const [filterPeriod, setFilterPeriod] = useState('last_30');

    const [metrics, setMetrics] = useState({
        totalSales: 0,
        totalSetoran: 0,
        uangBelumDisetor: 0,
        belumLapor: 0,
        totalApotek: 0
    });

    const [chartData, setChartData] = useState(null);

    useEffect(() => {
        fetchDashboardData();
    }, [filterPeriod]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Total Active Users (Role 'User')
            const { count: totalApotek, error: profileErr } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'User');

            if (profileErr) throw profileErr;

            // 2. Determine Date Range
            const today = new Date();
            let startDate = new Date();

            if (filterPeriod === 'today') {
                startDate = new Date(today);
            } else if (filterPeriod === 'yesterday') {
                startDate.setDate(today.getDate() - 1);
                today.setDate(today.getDate() - 1); // target end of yesterday too
            } else if (filterPeriod === 'last_7') {
                startDate.setDate(today.getDate() - 6);
            } else if (filterPeriod === 'last_30') {
                startDate.setDate(today.getDate() - 29);
            } else if (filterPeriod === 'this_month') {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            }

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = today.toISOString().split('T')[0];

            // 3. Fetch Laporan
            const { data: laporanData, error: laporanErr } = await supabase
                .from('laporan')
                .select('id, user_id, tanggal_setor, nominal_jual, nominal_setoran, potongan')
                .gte('tanggal_setor', startStr)
                .lte('tanggal_setor', endStr);

            if (laporanErr) throw laporanErr;

            const laporan = laporanData || [];

            // 4. Calculate Metrics
            let sumSales = 0;
            let sumSetoran = 0;
            let sumPotongan = 0;
            const uniqueReporters = new Set();

            // Prepare grouping for Chart
            const dailyData = {};

            laporan.forEach(item => {
                const sales = Number(item.nominal_jual) || 0;
                const setoran = Number(item.nominal_setoran) || 0;
                const potongan = Number(item.potongan) || 0;

                sumSales += sales;
                sumSetoran += setoran;
                sumPotongan += potongan;
                uniqueReporters.add(item.user_id);

                // Group for chart by tanggal_setor
                const dateKey = item.tanggal_setor.split('T')[0];
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = { sales: 0, setoran: 0 };
                }
                dailyData[dateKey].sales += sales;
                dailyData[dateKey].setoran += setoran;
            });

            // Calculate pending money (Sales - Potongan - Setoran)
            const uangBelumDisetor = Math.max(0, sumSales - sumPotongan - sumSetoran);
            const belumLapor = (totalApotek || 0) - uniqueReporters.size;

            setMetrics({
                totalSales: sumSales,
                totalSetoran: sumSetoran,
                uangBelumDisetor,
                belumLapor: Math.max(0, belumLapor),
                totalApotek: totalApotek || 0
            });

            // 5. Build Chart Data
            const sortedDates = Object.keys(dailyData).sort();

            const labels = sortedDates.map(d => {
                const dateObj = new Date(d);
                return dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            });

            const salesData = sortedDates.map(d => dailyData[d].sales);
            const setoranData = sortedDates.map(d => dailyData[d].setoran);

            setChartData({
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Tren Penjualan Tunai',
                        borderColor: '#f97316', // orange-500
                        backgroundColor: '#f97316',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 4,
                        data: salesData,
                    },
                    {
                        type: 'bar',
                        label: 'Total Setoran',
                        backgroundColor: '#22c55e', // green-500
                        data: setoranData,
                        borderRadius: 4,
                        barPercentage: 0.6,
                    }
                ]
            });

        } catch (err) {
            console.error("Failed to fetch dashboard data", err);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Sales */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-primary-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Total Sales Tunai
                                {loading && <span className="material-symbols-outlined animate-spin text-sm text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-2xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : formatRupiah(metrics.totalSales)}
                            </h3>
                        </div>
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><span className="material-symbols-outlined">payments</span></div>
                    </div>
                </div>

                {/* Deposit */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Total Setoran
                                {loading && <span className="material-symbols-outlined animate-spin text-sm text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-2xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : formatRupiah(metrics.totalSetoran)}
                            </h3>
                        </div>
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg"><span className="material-symbols-outlined">account_balance</span></div>
                    </div>
                </div>

                {/* Delta */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-red-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Uang Belum Disetor
                                {loading && <span className="material-symbols-outlined animate-spin text-sm text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-2xl font-bold text-red-600 mt-1">
                                {loading ? '...' : formatRupiah(metrics.uangBelumDisetor)}
                            </h3>
                        </div>
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg"><span className="material-symbols-outlined">money_off</span></div>
                    </div>
                </div>

                {/* Pending Reporters */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                Apotek Belum Lapor
                                {loading && <span className="material-symbols-outlined animate-spin text-sm text-gray-300">sync</span>}
                            </p>
                            <h3 className="text-2xl font-bold text-gray-800 mt-1">
                                {loading ? '...' : `${metrics.belumLapor} / ${metrics.totalApotek}`}
                            </h3>
                        </div>
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><span className="material-symbols-outlined">storefront</span></div>
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
