import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const DISCREPANCY_THRESHOLD = 50000;
const PAGE_SIZE = 500;

// Global cache variables to prevent loading spinner flickers when navigating back to this tab
let cachedOutlets = [];
let cachedReports = [];
let cachedTunggakanReports = [];
let cachedPosSalesMap = {};
let cachedStartDate = '';
let cachedEndDate = '';

const JELAS_TYPES = [
    { id: 'Setoran Harian', label: 'Setoran Harian' },
    { id: 'Setoran 3x Seminggu', label: 'Setoran 3x Seminggu' },
    { id: 'Setoran Sales Dengan Potongan Penjualan', label: 'Setoran Potongan' },
    { id: 'Setoran Uang Pecahan Kecil', label: 'Uang Pecahan' },
    { id: 'Setoran Uang Lebih', label: 'Uang Lebih' },
    { id: 'Pengembalian Petty Cash', label: 'Petty Cash' },
    { id: 'Deposit Card Terblokir (Salah Input PIN 3x)', label: 'Card Terblokir' },
    { id: 'Deposit Card Tertelan Mesin ATM', label: 'Card Tertelan' }
];

const BADGE_CONFIG = {
    'Setoran Harian': { label: 'Harian', cls: 'badge-success' },
    'Setoran 3x Seminggu': { label: '3x Seminggu', cls: 'badge-success' },
    'Setoran Sales Dengan Potongan Penjualan': { label: 'Setoran Potongan', cls: 'badge-success' },
    'Setoran Uang Pecahan Kecil': { label: 'Pecahan Kecil', cls: 'badge-warning' },
    'Setoran Uang Lebih': { label: 'Uang Lebih', cls: 'badge-warning' },
    'Pengembalian Petty Cash': { label: 'Petty Cash', cls: 'badge-warning' },
    'Deposit Card Terblokir (Salah Input PIN 3x)': { label: 'Card Terblokir', cls: 'badge-danger' },
    'Deposit Card Tertelan Mesin ATM': { label: 'Card Tertelan', cls: 'badge-danger' }
};

function getBadge(jenis) {
    return BADGE_CONFIG[jenis] || { label: jenis, cls: 'badge-normal' };
}

export default function AreaManagerDashboardPage() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('sv-SE');

    // Default dates (Default to last 7 days of sales)
    const defaultStart = () => {
        if (cachedStartDate) return cachedStartDate;
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toLocaleDateString('sv-SE');
    };
    const defaultEnd = () => cachedEndDate || today;

    // States initialized from cache if available
    const [outlets, setOutlets] = useState(cachedOutlets);
    const [reports, setReports] = useState(cachedReports);
    const [tunggakanReports, setTunggakanReports] = useState(cachedTunggakanReports);
    const [posSalesMap, setPosSalesMap] = useState(cachedPosSalesMap);
    const [loading, setLoading] = useState(cachedOutlets.length === 0);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [reportsStartDate, setReportsStartDate] = useState(defaultStart());
    const [reportsEndDate, setReportsEndDate] = useState(defaultEnd());
    const [showHighSelisih, setShowHighSelisih] = useState(false);
    const [selectedJenis, setSelectedJenis] = useState([]);

    // Fetch data whenever profile or selected date range changes
    useEffect(() => {
        if (profile?.username) {
            const hasCache = cachedOutlets.length > 0;
            fetchData(reportsStartDate, reportsEndDate, hasCache);
        }
    }, [profile, reportsStartDate, reportsEndDate]);

    const fetchData = async (start, end, silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            // 1. Fetch profiles of outlets in this AM's area
            const { data: outletData, error: oErr } = await supabase
                .from('profiles')
                .select('id, username, kode_toko, email, frekuensi_setoran, tanggal_aktif')
                .eq('area_manager', profile.username)
                .eq('role', 'User')
                .order('username');

            if (oErr) throw oErr;
            const outletList = outletData || [];
            setOutlets(outletList);
            cachedOutlets = outletList;

            if (outletList.length === 0) {
                setLoading(false);
                return;
            }

            const outletIds = outletList.map(o => o.id);
            const outletUsernames = outletList.map(o => o.username);

            // Fetch POS sales data for lookup
            if (outletUsernames.length > 0 && (Object.keys(cachedPosSalesMap).length === 0 || !silent)) {
                const { data: posData, error: posErr } = await supabase
                    .from('pos_sales_data')
                    .select('kode_cabang, tanggal_jual, sales_pos')
                    .in('kode_cabang', outletUsernames);

                if (!posErr && posData) {
                    const map = {};
                    posData.forEach(item => {
                        map[`${item.kode_cabang}_${item.tanggal_jual}`] = item.sales_pos;
                    });
                    setPosSalesMap(map);
                    cachedPosSalesMap = map;
                }
            }

            // 2. Fetch reports for these outlets within chosen date range (paginated loop to prevent 1000 rows cap limit)
            let allData = [];
            let from = 0;
            let done = false;

            while (!done) {
                const to = from + PAGE_SIZE - 1;
                const { data, error: rErr } = await supabase
                    .from('laporan')
                    .select('*')
                    .in('user_id', outletIds)
                    .gte('tanggal_jual', start)
                    .lte('tanggal_jual', end)
                    .order('tanggal_jual', { ascending: false })
                    .range(from, to);

                if (rErr) throw rErr;
                const batch = data || [];
                allData = allData.concat(batch);

                if (batch.length < PAGE_SIZE || allData.length >= 5000) {
                    done = true;
                } else {
                    from += PAGE_SIZE;
                }
            }

            const mappedReports = allData.map(row => ({
                ...row,
                selisih: (row.nominal_jual || 0) - (row.potongan || 0) - (row.nominal_setoran || 0),
                username: outletList.find(o => o.id === row.user_id)?.username || '-'
            }));
            
            setReports(mappedReports);
            cachedReports = mappedReports;
            cachedStartDate = start;
            cachedEndDate = end;

            // 3. Fetch tunggakan report metadata (all reports from minTanggalAktif up to yesterday)
            if (cachedTunggakanReports.length === 0 || !silent) {
                const minTanggalAktif = outletList.reduce((min, o) => {
                    const act = o.tanggal_aktif || '2026-04-01';
                    return act < min ? act : min;
                }, '2026-04-01');

                const yesterdayStr = new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('sv-SE');

                let tunggakanData = [];
                let tFrom = 0;
                let tDone = false;

                while (!tDone) {
                    const tTo = tFrom + PAGE_SIZE - 1;
                    const { data: tBatch, error: tErr } = await supabase
                        .from('laporan')
                        .select('user_id, tanggal_jual, jenis_pelaporan')
                        .in('user_id', outletIds)
                        .gte('tanggal_jual', minTanggalAktif)
                        .lte('tanggal_jual', yesterdayStr)
                        .range(tFrom, tTo);

                    if (tErr) throw tErr;
                    const batch = tBatch || [];
                    tunggakanData = tunggakanData.concat(batch);

                    if (batch.length < PAGE_SIZE) {
                        tDone = true;
                    } else {
                        tFrom += PAGE_SIZE;
                    }
                }

                setTunggakanReports(tunggakanData);
                cachedTunggakanReports = tunggakanData;
            }

        } catch (e) {
            setError(e.message || 'Gagal memuat data dashboard.');
        } finally {
            setLoading(false);
        }
    };

    // Calculate dates of missing reports (from tanggal_aktif up to yesterday)
    const getOutletTargetDates = (o) => {
        const startStr = o.tanggal_aktif || '2026-04-01';
        const start = new Date(startStr);
        start.setHours(0, 0, 0, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const dates = [];
        let currentLoop = new Date(start);
        while (currentLoop <= yesterday) {
            dates.push(currentLoop.toLocaleDateString('sv-SE'));
            currentLoop.setDate(currentLoop.getDate() + 1);
        }
        dates.reverse();
        return dates;
    };

    // Analyze each outlet's missing sales dates (filtered by search term as well)
    const outletTunggakanList = useMemo(() => {
        const list = outlets.map(o => {
            const outletReports = tunggakanReports.filter(r => r.user_id === o.id);
            const missing = [];
            const dates = getOutletTargetDates(o);
            dates.forEach(date => {
                const hasReport = outletReports.some(r => 
                    r.tanggal_jual === date && 
                    ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                );
                if (!hasReport) {
                    const formatted = new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    missing.push({ date, formatted });
                }
            });
            return {
                ...o,
                missingDates: missing
            };
        }).filter(o => o.missingDates.length > 0);

        // Client-side search for Tunggakan list
        const cleanSearch = searchTerm.trim().toLowerCase();
        if (!cleanSearch) return list;
        return list.filter(o => o.username.toLowerCase().includes(cleanSearch));
    }, [outlets, tunggakanReports, searchTerm]);

    // Overall stats calculations
    const stats = useMemo(() => {
        const totalOutlets = outlets.length;
        const submittedTodayCount = outlets.filter(o => 
            reports.some(r => r.user_id === o.id && r.tanggal_setor === today)
        ).length;
        
        // Non-filtered tunggakan list for absolute statistics
        const absoluteTunggakanList = outlets.map(o => {
            const outletReports = tunggakanReports.filter(r => r.user_id === o.id);
            const missing = [];
            const dates = getOutletTargetDates(o);
            dates.forEach(date => {
                const hasReport = outletReports.some(r => 
                    r.tanggal_jual === date && 
                    ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                );
                if (!hasReport) {
                    missing.push(date);
                }
            });
            return missing.length;
        });
        const totalTunggakan = absoluteTunggakanList.reduce((sum, count) => sum + count, 0);
        const totalDiscrepancies = reports.filter(r => Math.abs(r.selisih) > DISCREPANCY_THRESHOLD).length;

        return {
            totalOutlets,
            submittedTodayCount,
            totalTunggakan,
            totalDiscrepancies
        };
    }, [outlets, reports, today]);

    // Client-side filter for report table (search, multi-select jenis, & toggle)
    const filteredReports = useMemo(() => {
        const cleanSearch = searchTerm.trim().toLowerCase();
        return reports.filter(r => {
            const matchName = !cleanSearch || r.username.toLowerCase().includes(cleanSearch);
            const matchSelisih = !showHighSelisih || Math.abs(r.selisih) > DISCREPANCY_THRESHOLD;
            const matchJenis = selectedJenis.length === 0 || selectedJenis.includes(r.jenis_pelaporan);
            return matchName && matchSelisih && matchJenis;
        });
    }, [reports, searchTerm, showHighSelisih, selectedJenis]);

    // Grand Totals for report table
    const tableTotals = useMemo(() => {
        let totalSales = 0;
        let totalPotongan = 0;
        let totalSetor = 0;
        let totalPosSales = 0;
        let totalSalesForPos = 0;

        filteredReports.forEach((r) => {
            totalSales += Number(r.nominal_jual || 0);
            totalPotongan += Number(r.potongan || 0);
            totalSetor += Number(r.nominal_setoran || 0);

            const posValKey = `${r.username}_${r.tanggal_jual}`;
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            const posVal = isValidTypeForPOS ? posSalesMap[posValKey] : undefined;

            if (posVal !== undefined && posVal !== null) {
                totalPosSales += Number(posVal);
                totalSalesForPos += Number(r.nominal_jual || 0);
            }
        });

        // Compare grand total values directly to prevent double-counting of POS sales across multiple report types
        const totalSelisih1 = totalSalesForPos - totalPosSales;
        const totalSelisih2 = (totalPotongan + totalSetor) - totalPosSales;
        const hasAnyPosForTotals = totalPosSales > 0;
        const hasAnyPosForTotals2 = totalPosSales > 0;

        return { totalSales, totalPotongan, totalSetor, totalPosSales, totalSelisih1, totalSelisih2, hasAnyPosForTotals, hasAnyPosForTotals2 };
    }, [filteredReports, posSalesMap]);

    const handleCopyReminder = (outletName, missingDates, id) => {
        const dateStr = missingDates.map(d => d.formatted).join(', ');
        const message = `Halo tim Apotek Alpro ${outletName}, mohon bantuannya untuk mengunggah laporan setoran yang belum di-submit untuk tanggal penjualan (sales): ${dateStr}. Terima kasih! - ${profile?.username || 'Area Manager'}`;
        navigator.clipboard.writeText(message);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 3000);

        const encoded = encodeURIComponent(message);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            window.open('whatsapp://send?text=' + encoded, '_blank');
        } else {
            window.open('https://web.whatsapp.com/send?text=' + encoded, '_blank');
        }
    };

    const selisihChipNew = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-300">-</span>;
        if (val < 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">-{formatRupiah(Math.abs(val))}</span>;
        if (val > 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">+{formatRupiah(val)}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">Sesuai</span>;
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setShowHighSelisih(false);
        setSelectedJenis([]);
        const d = new Date();
        d.setDate(d.getDate() - 7);
        setReportsStartDate(d.toLocaleDateString('sv-SE'));
        setReportsEndDate(today);
    };

    const handleToggleJenis = (typeId) => {
        if (selectedJenis.includes(typeId)) {
            setSelectedJenis(selectedJenis.filter(x => x !== typeId));
        } else {
            setSelectedJenis([...selectedJenis, typeId]);
        }
    };

    return (
        <UserLayout title="Dashboard Area Manager" activeRoute="/areamanager/dashboard">
            <div className="space-y-6">
                
                {/* Header Welcome Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Selamat Datang, {profile?.username}!</h2>
                        <p className="text-xs text-gray-500 mt-1">Gunakan dashboard ini untuk memantau kepatuhan pelaporan setoran harian di wilayah binaan Anda.</p>
                    </div>
                    <button onClick={() => fetchData(reportsStartDate, reportsEndDate, false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-sm">sync</span> Segarkan Data
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">Memuat data monitoring...</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI STATS CARDS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard 
                                icon="store" 
                                color="bg-indigo-50 text-indigo-700" 
                                title="Binaan Outlet" 
                                value={stats.totalOutlets} 
                                desc="Total cabang di bawah koordinasi" 
                            />
                            <StatCard 
                                icon="check_circle" 
                                color="bg-green-50 text-green-700" 
                                title="Kepatuhan Hari Ini" 
                                value={`${stats.submittedTodayCount} / ${stats.totalOutlets}`} 
                                desc="Cabang yang telah submit hari ini" 
                            />
                            <StatCard 
                                icon="warning" 
                                color="bg-amber-50 text-amber-700" 
                                title="Total Hari Tunggakan" 
                                value={stats.totalTunggakan} 
                                desc="Jumlah hari lapor yang terlewat" 
                            />
                            <StatCard 
                                icon="error_outline" 
                                color="bg-red-50 text-red-700" 
                                title="Selisih > 50rb" 
                                value={stats.totalDiscrepancies} 
                                desc="Data laporan berselisih (periode terpilih)" 
                            />
                        </div>

                        {/* WARNING PANEL: TUNGGAKAN OUTLET */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">warning</span>
                                        Daftar Tunggakan Pelaporan Harian (Wilayah Anda)
                                    </h3>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Dihitung berdasarkan tanggal penjualan (sales) yang belum dilaporkan/disetor sejak tanggal aktif masing-masing outlet.</p>
                                </div>
                                <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                    {outletTunggakanList.length} Cabang Menunggak
                                </span>
                            </div>

                            {outletTunggakanList.length === 0 ? (
                                <div className="p-10 text-center space-y-2">
                                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 border border-green-100 text-green-500 mb-2">
                                        <span className="material-symbols-outlined text-2xl">check</span>
                                    </div>
                                    <p className="text-gray-700 font-bold text-sm">Semua Toko Disiplin Lapor!</p>
                                    <p className="text-xs text-gray-400">Tidak ada tunggakan laporan harian di wilayah binaan Anda untuk saat ini.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto custom-scrollbar">
                                    {outletTunggakanList.map((o) => (
                                        <div key={o.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                                            <div className="space-y-1.5 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-sm">{o.username}</span>
                                                    <span className="text-[10px] text-gray-400 font-mono">({o.kode_toko || '-'})</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    <span className="text-xs text-gray-500 mr-1.5 font-semibold">Tgl Penjualan Belum Lapor:</span>
                                                    {o.missingDates.map((d, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
                                                            {d.formatted}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleCopyReminder(o.username, o.missingDates, o.id)}
                                                className={`w-full sm:w-auto h-8 px-4 flex items-center justify-center gap-1.5 text-xs font-bold rounded-lg border transition-all shadow-xs whitespace-nowrap flex-shrink-0 ${
                                                    copiedId === o.id 
                                                        ? 'bg-green-50 border-green-200 text-green-700'
                                                        : 'bg-primary-600 border-primary-700 text-white hover:bg-primary-700'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">{copiedId === o.id ? 'check' : 'chat'}</span>
                                                {copiedId === o.id ? 'Teks Tersalin & Membuka WA' : 'Colek Via WA'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* REPORT MONITORING TABLE */}
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500">table_view</span>
                                    Pemantauan Laporan Masuk (Berdasarkan Tanggal Penjualan)
                                </h3>
                            </div>

                            {/* FILTER CONTAINER */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                                {/* Row 1: Search and Date Range */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cari Cabang</label>
                                        <input 
                                            type="text" 
                                            value={searchTerm} 
                                            onChange={(e) => setSearchTerm(e.target.value)} 
                                            placeholder="Nama apotek..." 
                                            className="form-input w-full py-1.5 px-3 text-xs" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tgl Jual</label>
                                        <input 
                                            type="date" 
                                            value={reportsStartDate} 
                                            onChange={(e) => setReportsStartDate(e.target.value)} 
                                            className="form-input w-full py-1.5 px-3 text-xs" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tgl Jual</label>
                                        <input 
                                            type="date" 
                                            value={reportsEndDate} 
                                            onChange={(e) => setReportsEndDate(e.target.value)} 
                                            className="form-input w-full py-1.5 px-3 text-xs" 
                                        />
                                    </div>
                                    <div className="flex items-center justify-between pb-1">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <div
                                                onClick={() => setShowHighSelisih((p) => !p)}
                                                className={`relative w-9 h-5 rounded-full transition-colors ${showHighSelisih ? 'bg-orange-500' : 'bg-gray-200'}`}
                                            >
                                                <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-xs transition-transform ${showHighSelisih ? 'translate-x-4' : ''}`} />
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">Selisih &gt; 50rb</span>
                                        </label>
                                        
                                        {(searchTerm || showHighSelisih || selectedJenis.length > 0 || reportsStartDate !== defaultStart() || reportsEndDate !== today) && (
                                            <button 
                                                onClick={handleResetFilters}
                                                className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 font-mono"
                                            >
                                                <span className="material-symbols-outlined text-sm">clear_all</span> Reset
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Multi-select Jenis Pelaporan Chips */}
                                <div className="pt-3 border-t border-gray-100 space-y-2">
                                    <label className="block text-xs font-semibold text-gray-500">Filter Jenis Pelaporan (Bisa pilih lebih dari 1)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {JELAS_TYPES.map((type) => {
                                            const isSelected = selectedJenis.includes(type.id);
                                            return (
                                                <button
                                                    key={type.id}
                                                    onClick={() => handleToggleJenis(type.id)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all border ${
                                                        isSelected
                                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs'
                                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {type.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* TABLE VIEW */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                {filteredReports.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 border border-gray-100 text-gray-400 mb-3">
                                            <span className="material-symbols-outlined text-2xl">search_off</span>
                                        </div>
                                        <p className="text-gray-500 font-bold text-sm">Data tidak ditemukan.</p>
                                        <p className="text-xs text-gray-400 mt-1">Coba bersihkan atau sesuaikan rentang tanggal pencarian Anda.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-auto max-h-[600px] border border-gray-100 rounded-lg shadow-inner bg-white">
                                        <table className="w-full text-sm text-left text-gray-500 table-fixed min-w-[1300px] border-collapse">
                                            <colgroup>
                                                <col style={{ width: '130px' }} />
                                                <col style={{ width: '90px' }} />
                                                <col style={{ width: '130px' }} />
                                                <col style={{ width: '130px' }} />
                                                <col style={{ width: '110px' }} />
                                                <col style={{ width: '110px' }} />
                                                <col style={{ width: '140px' }} />
                                                <col style={{ width: '110px' }} />
                                                <col style={{ width: '170px' }} />
                                                <col style={{ width: '170px' }} />
                                                <col style={{ width: '60px' }} />
                                            </colgroup>
                                            <thead className="text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 z-20 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nama Apotek</th>
                                                    <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Tgl Sales</th>
                                                    <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Jenis Laporan</th>
                                                    <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Metode</th>
                                                    <th className="px-3 py-3 text-right bg-blue-50 text-blue-700 font-bold sticky top-0 z-20 border-b border-gray-200">Data Sales (Xilnex)</th>
                                                    <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nominal Sales</th>
                                                    <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Potongan Penjualan (Petty Cash)</th>
                                                    <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nominal Setor</th>
                                                    <th className="px-3 py-3 text-center bg-red-50 text-red-700 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Data Sales (Xilnex) VS Nominal Sales</th>
                                                    <th className="px-3 py-3 text-center bg-orange-50 text-orange-700 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Data Sales (Xilnex) VS Potongan + Nominal Setor</th>
                                                    <th className="px-3 py-3 text-center bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                                                {filteredReports.map((row) => {
                                                    const badge = getBadge(row.jenis_pelaporan);
                                                    const isAnomali = badge.cls === 'badge-danger';

                                                    const posValKey = `${row.username}_${row.tanggal_jual}`;
                                                    const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(row.jenis_pelaporan);
                                                    const posValAll = posSalesMap[posValKey];
                                                    const posVal1 = isValidTypeForPOS ? posValAll : undefined;

                                                    const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
                                                    const hasPOSAll = posValAll !== undefined && posValAll !== null;

                                                    const s1 = hasPOS1 ? (row.nominal_jual || 0) - posVal1 : null;
                                                    const s2 = hasPOSAll ? ((row.potongan || 0) + (row.nominal_setoran || 0)) - posValAll : null;

                                                    return (
                                                        <tr key={row.id} className={'hover:bg-gray-50/50 transition-colors group ' + (isAnomali ? 'bg-red-50/30' : '')}>
                                                            <td className="px-3 py-3 font-bold text-gray-900 text-xs truncate" title={row.username}>{row.username}</td>
                                                            <td className="px-3 py-3 font-bold text-gray-900 text-xs truncate">
                                                                {new Date(row.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </td>
                                                            <td className="px-3 py-3 text-xs">
                                                                <div className="truncate">
                                                                    <p className="font-semibold text-gray-800 text-[12px] truncate" title={row.jenis_pelaporan}>{row.jenis_pelaporan}</p>
                                                                    <span className={'inline-block text-[9px] font-bold px-2 py-0.25 rounded-full mt-0.5 ' + badge.cls}>
                                                                        {badge.label}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 text-xs text-gray-500 truncate" title={row.metode_setoran}>{row.metode_setoran}</td>
                                                            <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs bg-blue-50/30 font-semibold">
                                                                {posVal1 !== undefined ? formatRupiah(posVal1) : <span className="text-gray-300">-</span>}
                                                            </td>
                                                            <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs">{formatRupiah(row.nominal_jual || 0)}</td>
                                                            <td className="px-3 py-3 text-right text-gray-500 font-mono text-xs">{formatRupiah(row.potongan || 0)}</td>
                                                            <td className="px-3 py-3 text-right font-bold text-gray-900 font-mono text-xs">{formatRupiah(row.nominal_setoran || 0)}</td>
                                                            <td className="px-3 py-3 text-center font-mono text-xs bg-red-50/10">
                                                                {selisihChipNew(s1)}
                                                            </td>
                                                            <td className="px-3 py-3 text-center font-mono text-xs bg-orange-50/10">
                                                                {selisihChipNew(s2)}
                                                            </td>
                                                            <td className="px-3 py-3 text-center">
                                                                <button
                                                                    title="Lihat Detail"
                                                                    onClick={() => navigate("/riwayat/" + row.id)}
                                                                    className="h-7 w-7 inline-flex items-center justify-center rounded-full text-primary-600 hover:bg-orange-50 transition-colors border border-gray-200 bg-white"
                                                                >
                                                                    <span className="material-symbols-outlined text-base">visibility</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900 text-xs sticky bottom-0 z-20">
                                                <tr>
                                                    <td colSpan="4" className="px-3 py-3 text-left font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                                                        Grand Total
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-blue-800 font-mono bg-blue-100">
                                                        {formatRupiah(tableTotals.totalPosSales)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono bg-gray-100">
                                                        {formatRupiah(tableTotals.totalSales)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-gray-600 font-mono bg-gray-100">
                                                        {formatRupiah(tableTotals.totalPotongan)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono bg-gray-100">
                                                        {formatRupiah(tableTotals.totalSetor)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-extrabold font-mono bg-red-100">
                                                        {tableTotals.hasAnyPosForTotals ? selisihChipNew(tableTotals.totalSelisih1) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-extrabold font-mono bg-orange-100">
                                                        {tableTotals.hasAnyPosForTotals2 ? selisihChipNew(tableTotals.totalSelisih2) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 bg-gray-100"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </UserLayout>
    );
}

// Helper Sub-components
function StatCard({ icon, color, title, value, desc }) {
    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
            </div>
            <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
                <h4 className="text-xl font-bold text-gray-800 mt-1">{value}</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
            </div>
        </div>
    );
}

