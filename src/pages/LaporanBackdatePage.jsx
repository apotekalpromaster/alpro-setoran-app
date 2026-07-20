import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../services/supabaseClient';

export default function LaporanBackdatePage() {
    const [loading, setLoading] = useState(true);
    const [rawLaporan, setRawLaporan] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [filterPeriod, setFilterPeriod] = useState('15'); // '15', '30', 'month', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedAM, setSelectedAM] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Load initial data from Supabase
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // 1. Fetch profiles for AM mapping
            const { data: profData, error: profErr } = await supabase
                .from('profiles')
                .select('id, username, area_manager')
                .eq('role', 'User');
            if (profErr) throw profErr;
            setProfiles(profData || []);

            // 2. Fetch reports paginated
            let allReports = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('laporan')
                    .select('id, user_id, tanggal_jual, tanggal_setor, created_at, jenis_pelaporan, nominal_setoran, profiles(username, area_manager)')
                    .range(from, from + step - 1)
                    .order('tanggal_jual', { ascending: false });

                if (error) throw error;
                allReports = [...allReports, ...(data || [])];
                if (!data || data.length < step) hasMore = false;
                else from += step;
            }

            setRawLaporan(allReports);
        } catch (err) {
            console.error('Gagal mengambil data laporan:', err);
        } finally {
            setLoading(false);
        }
    };

    // Calculate date bounds based on filterPeriod
    const dateBounds = useMemo(() => {
        const today = new Date();
        let start = new Date();
        let end = new Date();

        if (filterPeriod === '15') {
            start.setDate(today.getDate() - 15);
        } else if (filterPeriod === '30') {
            start.setDate(today.getDate() - 30);
        } else if (filterPeriod === 'month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (filterPeriod === 'custom') {
            if (customStartDate) start = new Date(customStartDate);
            if (customEndDate) end = new Date(customEndDate);
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }, [filterPeriod, customStartDate, customEndDate]);

    // Process backdate incidents (> 4 days gap)
    const backdateIncidents = useMemo(() => {
        if (!rawLaporan.length) return [];

        const list = [];
        rawLaporan.forEach((r) => {
            if (!r.tanggal_jual) return;

            const salesDate = new Date(r.tanggal_jual);
            // Ignore outside filter range
            if (salesDate < dateBounds.start || salesDate > dateBounds.end) return;

            // Determine input date (prefer created_at date, fallback to tanggal_setor)
            let inputDateStr = r.tanggal_setor;
            if (r.created_at) {
                inputDateStr = r.created_at.split('T')[0];
            }
            if (!inputDateStr) return;

            const inputDate = new Date(inputDateStr);
            const diffMs = inputDate.getTime() - salesDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            // Backdate threshold: gap > 4 days
            if (diffDays > 4) {
                const profileObj = r.profiles || {};
                const amName = profileObj.area_manager || 'Tanpa Area Manager';
                const namaToko = profileObj.username || 'Unknown Toko';

                list.push({
                    id: r.id,
                    user_id: r.user_id,
                    namaToko,
                    amName,
                    tanggalJual: r.tanggal_jual,
                    tanggalInput: inputDateStr,
                    diffDays,
                    jenisPelaporan: r.jenis_pelaporan || 'Setoran Harian',
                    nominalSetoran: r.nominal_setoran || 0,
                });
            }
        });

        return list;
    }, [rawLaporan, dateBounds]);

    // Filter list based on selected AM and Search Query
    const filteredIncidents = useMemo(() => {
        return backdateIncidents.filter((item) => {
            const matchesAM = selectedAM === 'ALL' || item.amName === selectedAM;
            const matchesSearch =
                !searchQuery ||
                item.namaToko.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.amName.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesAM && matchesSearch;
        });
    }, [backdateIncidents, selectedAM, searchQuery]);

    // Unique AM list for dropdown
    const availableAMs = useMemo(() => {
        const amSet = new Set(profiles.map((p) => p.area_manager).filter(Boolean));
        return Array.from(amSet).sort();
    }, [profiles]);

    // Grouping by Area Manager
    const groupedData = useMemo(() => {
        const groups = {};
        filteredIncidents.forEach((item) => {
            if (!groups[item.amName]) {
                groups[item.amName] = [];
            }
            groups[item.amName].push(item);
        });
        return groups;
    }, [filteredIncidents]);

    // Summary Statistics
    const stats = useMemo(() => {
        const totalIncidents = filteredIncidents.length;
        const uniqueOutlets = new Set(filteredIncidents.map((i) => i.user_id)).size;
        const avgDelay = totalIncidents > 0 
            ? (filteredIncidents.reduce((sum, i) => sum + i.diffDays, 0) / totalIncidents).toFixed(1) 
            : 0;

        // Find AM with most incidents
        let topAM = '-';
        let maxCount = 0;
        Object.entries(groupedData).forEach(([am, items]) => {
            if (items.length > maxCount) {
                maxCount = items.length;
                topAM = am;
            }
        });

        return { totalIncidents, uniqueOutlets, avgDelay, topAM, maxCount };
    }, [filteredIncidents, groupedData]);

    // Format helpers
    const formatDate = (dStr) => {
        if (!dStr) return '-';
        const [y, m, d] = dStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const formatRupiah = (val) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);
    };

    // CSV Export Handler
    const handleExportCSV = () => {
        if (!filteredIncidents.length) {
            alert('Tidak ada data insiden backdate untuk di-export.');
            return;
        }

        const headers = ['Area Manager', 'Nama Toko', 'Tanggal Sales', 'Tanggal Input/Setor', 'Keterlambatan (Hari)', 'Jenis Laporan', 'Nominal Setoran'];
        const rows = filteredIncidents.map((item) => [
            `"${item.amName}"`,
            `"${item.namaToko}"`,
            `"${item.tanggalJual}"`,
            `"${item.tanggalInput}"`,
            item.diffDays,
            `"${item.jenisPelaporan}"`,
            item.nominalSetoran
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Audit_Input_Backdate_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <AdminLayout activePath="/admin/backdate">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-600 text-3xl">history_toggle_off</span>
                            Audit Input Backdate Setoran
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Mendeteksi dan merekap laporan yang diinput terlambat (jarak Tanggal Input vs Tanggal Sales &gt; 4 Hari)
                        </p>
                    </div>
                    <button
                        onClick={handleExportCSV}
                        disabled={loading || !filteredIncidents.length}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer self-start sm:self-auto"
                    >
                        <span className="material-symbols-outlined text-lg">download</span>
                        Export Report (CSV)
                    </button>
                </div>

                {/* Filter Controls Bar */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Period Filter Buttons */}
                        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-xl">
                            <button
                                onClick={() => setFilterPeriod('15')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    filterPeriod === '15' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                15 Hari Terakhir
                            </button>
                            <button
                                onClick={() => setFilterPeriod('30')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    filterPeriod === '30' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                30 Hari Terakhir
                            </button>
                            <button
                                onClick={() => setFilterPeriod('month')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    filterPeriod === 'month' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                Bulan Ini
                            </button>
                            <button
                                onClick={() => setFilterPeriod('custom')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    filterPeriod === 'custom' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                Custom
                            </button>
                        </div>

                        {/* Search & AM Filter */}
                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-initial">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                                <input
                                    type="text"
                                    placeholder="Cari toko / AM..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 w-full sm:w-48"
                                />
                            </div>

                            <select
                                value={selectedAM}
                                onChange={(e) => setSelectedAM(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 cursor-pointer"
                            >
                                <option value="ALL">Semua Area Manager</option>
                                {availableAMs.map((am) => (
                                    <option key={am} value={am}>
                                        {am}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Custom Date Inputs */}
                    {filterPeriod === 'custom' && (
                        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 animate-slide-in">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-600">Mulai:</label>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-600">Sampai:</label>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                            <span className="material-symbols-outlined text-2xl">warning</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Insiden</p>
                            <h3 className="text-xl font-extrabold text-gray-900 mt-0.5">{stats.totalIncidents} <span className="text-xs font-normal text-gray-400">laporan</span></h3>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
                        <div className="p-3 bg-red-50 rounded-xl text-red-600">
                            <span className="material-symbols-outlined text-2xl">store</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Outlet Melakukan Backdate</p>
                            <h3 className="text-xl font-extrabold text-gray-900 mt-0.5">{stats.uniqueOutlets} <span className="text-xs font-normal text-gray-400">toko</span></h3>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <span className="material-symbols-outlined text-2xl">schedule</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rata-Rata Keterlambatan</p>
                            <h3 className="text-xl font-extrabold text-gray-900 mt-0.5">+{stats.avgDelay} <span className="text-xs font-normal text-gray-400">hari</span></h3>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center gap-4">
                        <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                            <span className="material-symbols-outlined text-2xl">supervisor_account</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">AM Insiden Tertinggi</p>
                            <h3 className="text-sm font-extrabold text-gray-900 mt-0.5 truncate max-w-[150px]">{stats.topAM}</h3>
                            <p className="text-[10px] font-semibold text-purple-600">{stats.maxCount} insiden</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                {loading ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 shadow-xs text-center">
                        <span className="material-symbols-outlined text-amber-500 text-4xl animate-spin">sync</span>
                        <p className="text-sm font-semibold text-gray-500 mt-3">Mengambil data audit backdate...</p>
                    </div>
                ) : filteredIncidents.length === 0 ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 shadow-xs text-center">
                        <span className="material-symbols-outlined text-emerald-500 text-5xl">check_circle</span>
                        <h3 className="text-lg font-bold text-gray-800 mt-3">Tidak Ada Insiden Input Backdate</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Semua toko melapor secara tepat waktu (&lt;= 4 hari dari tanggal sales) pada periode ini.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(groupedData).map(([amName, items]) => (
                            <div key={amName} className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
                                {/* AM Group Header */}
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-600">supervisor_account</span>
                                        <h3 className="font-bold text-gray-900 text-base">
                                            Area Manager: <span className="text-amber-600 font-extrabold">{amName}</span>
                                            <span className="ml-3 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                                                {items.length} Insiden Backdate
                                            </span>
                                        </h3>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-4 w-12 text-center">#</th>
                                                <th className="px-6 py-4">Nama Toko</th>
                                                <th className="px-6 py-4">Tanggal Sales</th>
                                                <th className="px-6 py-4">Tanggal Input / Setor</th>
                                                <th className="px-6 py-4">Keterlambatan Input</th>
                                                <th className="px-6 py-4">Jenis Laporan</th>
                                                <th className="px-6 py-4 text-right">Nominal Setoran</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {items.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-amber-50/30 transition-colors">
                                                    <td className="px-6 py-4 text-gray-400 text-center font-medium">{idx + 1}</td>
                                                    <td className="px-6 py-4 font-bold text-gray-900">{item.namaToko}</td>
                                                    <td className="px-6 py-4 text-gray-700 font-medium">{formatDate(item.tanggalJual)}</td>
                                                    <td className="px-6 py-4 text-gray-700 font-medium">{formatDate(item.tanggalInput)}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-md border border-red-200">
                                                            <span className="material-symbols-outlined text-xs mr-1">schedule</span>
                                                            +{item.diffDays} Hari
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-semibold text-gray-600">{item.jenisPelaporan}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-gray-900">{formatRupiah(item.nominalSetoran)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

