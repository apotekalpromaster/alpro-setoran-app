import { useState, useEffect } from 'react';
import {
    LineElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import { generateAnalyticsSummary } from '../services/groqService';
import AdminLayout from '../components/AdminLayout';
import AutocompleteInput from '../components/AutocompleteInput';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement,
    LineElement, ArcElement, Title, Tooltip, Legend, Filler
);

const PERIOD_OPTIONS = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: 'last_7', label: '7 Hari Terakhir' },
    { value: 'last_30', label: '30 Hari Terakhir' },
    { value: 'custom', label: 'Pilih Tanggal...' },
];

const JENIS_COLORS = ['#F97316', '#10B981', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899'];

function getDateRange(period) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    let start = new Date(today); start.setHours(0, 0, 0, 0);
    if (period === 'yesterday') { start.setDate(today.getDate() - 1); today.setDate(today.getDate() - 1); }
    else if (period === 'last_7') { start.setDate(today.getDate() - 6); }
    else if (period === 'last_30') { start.setDate(today.getDate() - 29); }
    return {
        start: start.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
    };
}

function formatCompact(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'jt';
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'rb';
    return String(num);
}

export default function LaporanAnalitikPage() {
    const today = new Date().toISOString().split('T')[0];
    const [period, setPeriod] = useState('last_30');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [pharmacyFilter, setPharmacyFilter] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [analytics, setAnalytics] = useState(null);
    const [tableData, setTableData] = useState([]);

    // AI States
    const [aiSummary, setAiSummary] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    const effectiveDates = period !== 'custom' ? getDateRange(period) : { start: startDate, end: endDate };

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async (overrideDates) => {
        const { start, end } = overrideDates || effectiveDates;
        if (!start || !end) { setError('Pilih tanggal terlebih dahulu.'); return; }
        setLoading(true); setError(''); setAnalytics(null); setTableData([]);
        setAiSummary(''); // Reset AI on new filter
        try {
            // Supabase query — join profiles for username
            let query = supabase
                .from('laporan')
                .select(`
          tanggal_setor, jenis_pelaporan,
          nominal_jual, nominal_setoran, potongan,
          profiles!laporan_user_id_fkey ( username )
        `)
                .gte('tanggal_setor', start)
                .lte('tanggal_setor', end);

            if (pharmacyFilter) query = query.ilike('profiles.username', `%${pharmacyFilter}%`);

            const { data, error: err } = await query;
            if (err) throw err;

            processAnalytics(data || []);
        } catch (e) {
            setError(e.message || 'Gagal memuat data analitik.');
        } finally {
            setLoading(false);
        }
    };

    const processAnalytics = (rows) => {
        if (!rows.length) { setAnalytics(null); setTableData([]); return; }

        // Scorecard
        let totalPenjualan = 0, totalPotongan = 0, totalSetoran = 0;
        let kasusAnomali = 0;
        const NON_FINANCIAL = ['Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'];

        rows.forEach((r) => {
            totalPenjualan += r.nominal_jual || 0;
            totalPotongan += r.potongan || 0;
            totalSetoran += r.nominal_setoran || 0;
            if (NON_FINANCIAL.includes(r.jenis_pelaporan)) kasusAnomali++;
        });
        const totalSelisih = (totalPenjualan - totalPotongan) - totalSetoran;

        // Weekly trend chart (by day-of-week)
        const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
        const salesByDay = Array(7).fill(0);
        const depositByDay = Array(7).fill(0);
        const countByDay = Array(7).fill(0);
        rows.forEach((r) => {
            const d = new Date(r.tanggal_setor);
            const dow = (d.getDay() + 6) % 7; // Mon=0
            salesByDay[dow] += r.nominal_jual || 0;
            depositByDay[dow] += r.nominal_setoran || 0;
            countByDay[dow] += 1;
        });

        // Jenis distribution chart
        const jenisTotals = {};
        rows.forEach((r) => {
            jenisTotals[r.jenis_pelaporan] = (jenisTotals[r.jenis_pelaporan] || 0) + (r.nominal_setoran || 0);
        });

        // Summary table: group by username
        const byUser = {};
        rows.forEach((r) => {
            const name = r.profiles?.username || 'Unknown';
            if (!byUser[name]) byUser[name] = { totalJual: 0, potongan: 0, setor: 0 };
            byUser[name].totalJual += r.nominal_jual || 0;
            byUser[name].potongan += r.potongan || 0;
            byUser[name].setor += r.nominal_setoran || 0;
        });
        const table = Object.entries(byUser).map(([name, v]) => ({
            namaApotek: name,
            totalJual: v.totalJual,
            potongan: v.potongan,
            nominalSetor: v.setor,
            selisih: (v.totalJual - v.potongan) - v.setor,
        })).sort((a, b) => b.totalJual - a.totalJual);

        setTableData(table);
        setAnalytics({
            scorecard: { totalPenjualan, totalPotongan, totalSetoran, totalSelisih, kasusAnomali },
            weeklyChart: {
                labels: dayNames,
                avgDeposit: depositByDay.map((v, i) => countByDay[i] ? Math.round(v / countByDay[i]) : 0),
                avgSales: salesByDay.map((v, i) => countByDay[i] ? Math.round(v / countByDay[i]) : 0),
            },
            distChart: {
                labels: Object.keys(jenisTotals).map((k) => k.split(' ').slice(0, 2).join(' ')),
                values: Object.values(jenisTotals),
            },
        });
    };

    const handleApply = () => {
        const dates = period !== 'custom' ? getDateRange(period) : { start: startDate, end: endDate };
        loadAnalytics(dates);
    };

    const handleAiAnalysis = async () => {
        if (!tableData.length) return;
        setAiLoading(true);
        setAiSummary('');
        try {
            // Pass the currently filtered table data to AI
            const result = await generateAnalyticsSummary(tableData);
            setAiSummary(result);
        } catch (err) {
            setAiSummary('Terjadi kesalahan saat memanggil asisten AI.');
        } finally {
            setAiLoading(false);
        }
    };

    const downloadCSV = () => {
        if (!tableData.length) return;
        const header = 'Nama Apotek,Total Penjualan,Potongan,Nominal Setoran,Selisih\n';
        const body = tableData.map((r) =>
            `"${r.namaApotek}",${r.totalJual},${r.potongan},${r.nominalSetor},${r.selisih}`
        ).join('\n');
        const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `Analitik_${effectiveDates.start}.csv`; a.click();
    };

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { ticks: { callback: (v) => formatCompact(v) }, beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
        },
    };

    return (
        <AdminLayout title="Laporan & Analitik">
            <div className="space-y-6">
                {/* FILTER BAR */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex flex-col xl:flex-row items-end justify-between gap-4">
                        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-end">
                            {/* Pharmacy search */}
                            <div className="w-full md:w-56">
                                <AutocompleteInput
                                    label="Filter Apotek"
                                    value={pharmacyFilter}
                                    onChange={setPharmacyFilter}
                                    onSelect={(item) => item && setPharmacyFilter(item.username)}
                                    table="profiles"
                                    column="username"
                                    extraFilters={(q) => q.eq('role', 'User')}
                                    placeholder="Semua Apotek"
                                    icon="store"
                                    minChars={2}
                                />
                            </div>
                            {/* Period */}
                            <div className="w-full md:w-48">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Periode</label>
                                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="form-input bg-gray-50">
                                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {/* Custom date range */}
                            {period === 'custom' && (
                                <div className="flex gap-2">
                                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Dari</label><input type="date" value={startDate} min="2025-12-15" onChange={(e) => setStartDate(e.target.value)} className="form-input w-36" /></div>
                                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Sampai</label><input type="date" value={endDate} min="2025-12-15" onChange={(e) => setEndDate(e.target.value)} className="form-input w-36" /></div>
                                </div>
                            )}
                            <button onClick={handleApply} className="btn-primary h-10 px-5 text-sm flex-shrink-0">
                                <span className="material-symbols-outlined text-sm">filter_list</span> Terapkan
                            </button>
                        </div>
                        <div className="flex gap-3 justify-end items-center flex-wrap">
                            <button
                                onClick={handleAiAnalysis}
                                disabled={aiLoading || !tableData.length}
                                className="flex items-center gap-2 h-10 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {aiLoading ? (
                                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                                ) : (
                                    <span className="material-symbols-outlined text-sm">smart_toy</span>
                                )}
                                Analisis AI
                            </button>
                            <button onClick={downloadCSV} disabled={!tableData.length} className="flex items-center gap-2 h-10 px-5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                                <span className="material-symbols-outlined text-sm">download</span> CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* AI ANALYSIS CONTAINER */}
                {(aiLoading || aiSummary) && (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 shadow-sm animate-slide-in relative overflow-hidden">
                        {/* Decorative background element */}
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-purple-200 rounded-full opacity-50 blur-3xl"></div>

                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-purple-600 text-2xl">smart_toy</span>
                            <h3 className="font-bold text-gray-800 text-lg">Hasil Analisis Asisten AI</h3>
                        </div>

                        {aiLoading ? (
                            <div className="flex items-center gap-3 text-purple-600">
                                <span className="material-symbols-outlined animate-spin">sync</span>
                                <span className="font-medium">AI sedang menganalisis data, mohon tunggu...</span>
                            </div>
                        ) : (
                            <div className="prose prose-sm prose-purple max-w-none text-gray-700 whitespace-pre-wrap">
                                {aiSummary}
                            </div>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">Mengolah Data Analitik...</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                ) : analytics && (
                    <div className="space-y-6 animate-slide-in">
                        {/* SCORECARDS */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <Scorecard label="Total Penjualan" value={formatRupiah(analytics.scorecard.totalPenjualan)} barColor="bg-blue-500" barBg="bg-blue-100" />
                            <Scorecard label="Total Potongan" value={formatRupiah(analytics.scorecard.totalPotongan)} barColor="bg-orange-500" barBg="bg-orange-100" />
                            <Scorecard label="Total Setoran" value={formatRupiah(analytics.scorecard.totalSetoran)} barColor="bg-green-500" barBg="bg-green-100" valueClass="text-green-600" />
                            <Scorecard label="Total Selisih" value={formatRupiah(analytics.scorecard.totalSelisih)} barColor={analytics.scorecard.totalSelisih > 0 ? 'bg-red-500' : analytics.scorecard.totalSelisih < 0 ? 'bg-blue-500' : 'bg-gray-400'} barBg="bg-gray-100" valueClass={analytics.scorecard.totalSelisih > 0 ? 'text-red-600' : analytics.scorecard.totalSelisih < 0 ? 'text-blue-600' : ''} />
                            <Scorecard label="Kasus Anomali" value={analytics.scorecard.kasusAnomali} valueClass={analytics.scorecard.kasusAnomali > 0 ? 'text-red-600' : 'text-green-600'} barColor="bg-red-500" barBg="bg-red-100" icon={analytics.scorecard.kasusAnomali > 0 ? 'warning' : 'check_circle'} />
                        </div>

                        {/* CHARTS */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Line: daily trend */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-1">Tren Setoran Harian</h3>
                                <p className="text-xs text-gray-400 mb-4">Rata-rata per hari (Sen–Min)</p>
                                <div className="relative h-56">
                                    <Line
                                        data={{
                                            labels: analytics.weeklyChart.labels,
                                            datasets: [{
                                                label: 'Rata-rata Setoran',
                                                data: analytics.weeklyChart.avgDeposit,
                                                borderColor: '#F97316',
                                                backgroundColor: 'rgba(249,115,22,0.12)',
                                                borderWidth: 2, fill: true, tension: 0.4,
                                                pointBackgroundColor: '#F97316',
                                            }],
                                        }}
                                        options={{ ...chartOptions, plugins: { legend: { display: false } } }}
                                    />
                                </div>
                            </div>

                            {/* Bar: Setoran vs Sales */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-1">Setoran vs Sales Tunai</h3>
                                <p className="text-xs text-gray-400 mb-4">Perbandingan rata-rata harian</p>
                                <div className="relative h-56">
                                    <Bar
                                        data={{
                                            labels: analytics.weeklyChart.labels,
                                            datasets: [
                                                { label: 'Setoran', data: analytics.weeklyChart.avgDeposit, backgroundColor: '#F97316', borderRadius: 4 },
                                                { label: 'Sales', data: analytics.weeklyChart.avgSales, backgroundColor: '#cbd5e1', borderRadius: 4 },
                                            ],
                                        }}
                                        options={{
                                            ...chartOptions,
                                            plugins: {
                                                legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
                                            },
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Doughnut: Jenis dist */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-1">Distribusi Jenis Laporan</h3>
                                <p className="text-xs text-gray-400 mb-4">Berdasarkan total nominal</p>
                                <div className="relative h-56 flex justify-center">
                                    <Doughnut
                                        data={{
                                            labels: analytics.distChart.labels,
                                            datasets: [{
                                                data: analytics.distChart.values,
                                                backgroundColor: JENIS_COLORS,
                                                borderWidth: 0,
                                            }],
                                        }}
                                        options={{
                                            responsive: true, maintainAspectRatio: false,
                                            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SUMMARY TABLE */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h3 className="font-bold text-gray-800">Tabel Ringkasan per Apotek</h3>
                            </div>
                            {tableData.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mb-3">
                                        <span className="material-symbols-outlined text-gray-400 text-3xl">search_off</span>
                                    </div>
                                    <p className="text-gray-500 font-medium">Tidak ada data untuk periode ini.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
                                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-4">Nama Apotek</th>
                                                <th className="px-6 py-4 text-right">Total Penjualan</th>
                                                <th className="px-6 py-4 text-right">Potongan</th>
                                                <th className="px-6 py-4 text-right">Nominal Setoran</th>
                                                <th className="px-6 py-4 text-center">Selisih</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-gray-700">
                                            {tableData.map((row) => (
                                                <tr key={row.namaApotek} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-gray-900">{row.namaApotek}</td>
                                                    <td className="px-6 py-4 text-right">{formatRupiah(row.totalJual)}</td>
                                                    <td className="px-6 py-4 text-right text-gray-500">({formatRupiah(row.potongan)})</td>
                                                    <td className="px-6 py-4 text-right font-medium text-orange-600">{formatRupiah(row.nominalSetor)}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        {row.selisih > 0
                                                            ? <span className="text-red-600 font-bold">{formatRupiah(row.selisih)}</span>
                                                            : row.selisih < 0
                                                                ? <span className="text-blue-600 font-bold">+{formatRupiah(Math.abs(row.selisih))}</span>
                                                                : <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">Sesuai</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!analytics && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-3">bar_chart</span>
                        <p className="text-sm font-medium">Klik Terapkan untuk memuat analitik.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

function Scorecard({ label, value, barColor, barBg, valueClass = '', icon }) {
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <div className="flex items-center gap-2">
                {icon && <span className={`material-symbols-outlined text-lg ${valueClass}`}>{icon}</span>}
                <h3 className={`text-xl font-bold text-gray-800 ${valueClass}`}>{value}</h3>
            </div>
            <div className={`mt-3 h-1 w-full ${barBg || 'bg-gray-100'} rounded-full`}>
                <div className={`h-1 ${barColor || 'bg-gray-400'} rounded-full`} style={{ width: '100%' }} />
            </div>
        </div>
    );
}
