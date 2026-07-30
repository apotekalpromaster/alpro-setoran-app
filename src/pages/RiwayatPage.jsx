import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const ITEMS_PER_PAGE = 30;

const BADGE_CONFIG = {
    'Setoran Harian': { label: 'Harian', cls: 'badge-normal' },
    'Setoran 3x Seminggu': { label: '3x Seminggu', cls: 'badge-normal' },
    'Setoran Sales Dengan Potongan Penjualan': { label: 'Potongan', cls: 'badge-warning' },
    'Pengembalian Petty Cash': { label: 'Petty Cash', cls: 'badge-purple' },
    'Deposit Card Terblokir (Salah Input PIN 3x)': { label: 'Card Terblokir', cls: 'badge-danger' },
    'Deposit Card Tertelan Mesin ATM': { label: 'Card Tertelan', cls: 'badge-danger' },
    'Belum Dilaporkan': { label: 'Belum Lapor', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
};

const JELAS_TYPES = [
    { id: 'Setoran Harian', label: 'Setoran Harian' },
    { id: 'Setoran 3x Seminggu', label: 'Setoran 3x Seminggu' },
    { id: 'Setoran Sales Dengan Potongan Penjualan', label: 'Setoran Sales Dgn Potongan (Top Up Petty Cash)' },
    { id: 'Pengembalian Petty Cash', label: 'Pengembalian Petty Cash' },
    { id: 'Deposit Card Terblokir (Salah Input PIN 3x)', label: 'Deposit Card Terblokir' },
    { id: 'Deposit Card Tertelan Mesin ATM', label: 'Deposit Card Tertelan' }
];

function getBadge(jenis) {
    return BADGE_CONFIG[jenis] || { label: jenis, cls: 'badge-normal' };
}

function formatDisplayDate(isoDate) {
    if (!isoDate) return '-';
    return new Date(isoDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RiwayatPage() {
    const { profile } = useAuth();
    const navigate = useNavigate();

    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isOpenJenis, setIsOpenJenis] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpenJenis(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filter state
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [methodeFilter, setMethodeFilter] = useState('');
    const [selectedJenis, setSelectedJenis] = useState([]);
    const [activeFilters, setActiveFilters] = useState({ search: '', startDate: '', endDate: '', methode: '', jenis: [] });

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        if (profile?.id) {
            fetchReports();
        } else {
            setLoading(false);
        }
        return () => {
            isMounted.current = false;
        };
    }, [profile?.id]);

    const fetchReports = async () => {
        if (!profile?.id) {
            if (isMounted.current) setLoading(false);
            return;
        }
        if (isMounted.current) {
            setLoading(true);
            setError('');
        }
        try {
            const query = supabase
                .from('laporan')
                .select('*')
                .eq('user_id', profile.id)
                .order('tanggal_jual', { ascending: false })
                .limit(5000);

            const { data, error: fetchErr } = await safeSupabaseQuery(query, 6000);

            if (!isMounted.current) return;
            if (fetchErr) throw fetchErr;

            setReports(data || []);
        } catch (e) {
            if (isMounted.current) {
                setError('Gagal memuat riwayat: ' + e.message);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    };

    // 1. Cari tanggal duplikat untuk tipe pelaporan utama
    const duplicateDates = useMemo(() => {
        const counts = {};
        reports.forEach(r => {
            const isPrimary = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            if (isPrimary) {
                counts[r.tanggal_jual] = (counts[r.tanggal_jual] || 0) + 1;
            }
        });
        return Object.keys(counts).filter(d => counts[d] > 1);
    }, [reports]);

    // Client-side filtering & Injeksi Tanggal Unreported
    const filteredReports = useMemo(() => {
        const actualFiltered = reports.map(r => {
            const bcaDb = Number(r.bca_debit || 0);
            const bcaKr = Number(r.bca_kredit || 0);
            const bcaQr = Number(r.bca_qris || 0);
            const briDb = Number(r.bri_debit || 0);
            const briKr = Number(r.bri_kredit || 0);
            const briQr = Number(r.bri_qris || 0);
            const trf = Number(r.bank_transfer || 0);
            const totalNonTunai = Number(r.total_non_tunai || (bcaDb + bcaKr + bcaQr + briDb + briKr + briQr + trf));
            const grandTotalSales = Number(r.nominal_jual || 0) + totalNonTunai;

            return {
                ...r,
                bca_debit: bcaDb,
                bca_kredit: bcaKr,
                bca_qris: bcaQr,
                bri_debit: briDb,
                bri_kredit: briKr,
                bri_qris: briQr,
                bank_transfer: trf,
                total_non_tunai: totalNonTunai,
                grand_total_sales: grandTotalSales
            };
        }).filter((item) => {
            const term = activeFilters.search.toLowerCase();
            const matchSearch =
                !term ||
                (item.jenis_pelaporan || '').toLowerCase().includes(term) ||
                formatRupiah(item.nominal_setoran || 0).toLowerCase().includes(term) ||
                formatRupiah(item.grand_total_sales || 0).toLowerCase().includes(term);

            const matchMethode =
                !activeFilters.methode ||
                (item.metode_setoran || '') === activeFilters.methode;

            let matchDate = true;
            if (activeFilters.startDate) {
                matchDate = matchDate && item.tanggal_jual >= activeFilters.startDate;
            }
            if (activeFilters.endDate) {
                matchDate = matchDate && item.tanggal_jual <= activeFilters.endDate;
            }

            const matchJenis =
                !activeFilters.jenis ||
                activeFilters.jenis.length === 0 ||
                activeFilters.jenis.includes(item.jenis_pelaporan);

            return matchSearch && matchMethode && matchDate && matchJenis;
        });

        const showSales = activeFilters.jenis.length === 0 || activeFilters.jenis.some(j => ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(j));

        let unreportedList = [];
        if (showSales) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('sv-SE');

            const filterStart = activeFilters.startDate || '2026-04-01';
            const filterEnd = activeFilters.endDate || yesterdayStr;

            const activeDate = profile?.tanggal_aktif || '2026-04-01';
            const startStr = activeDate > filterStart ? activeDate : filterStart;
            const endStr = yesterdayStr < filterEnd ? yesterdayStr : filterEnd;

            if (startStr <= endStr) {
                const start = new Date(startStr);
                const end = new Date(endStr);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    let cur = new Date(start);
                    let maxLoops = 365;

                    while (cur <= end && maxLoops > 0) {
                        maxLoops--;
                        const yyyy = cur.getFullYear();
                        const mm = String(cur.getMonth() + 1).padStart(2, '0');
                        const dd = String(cur.getDate()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd}`;

                        const hasPrimaryReport = reports.some(r =>
                            r.tanggal_jual === dateStr &&
                            ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                        );

                        if (!hasPrimaryReport) {
                            const cleanSearch = activeFilters.search.toLowerCase();
                            const matchSearch = !cleanSearch || 'belum dilaporkan'.includes(cleanSearch);
                            const matchMethode = !activeFilters.methode;

                            if (matchSearch && matchMethode) {
                                unreportedList.push({
                                    id: 'unreported_' + dateStr,
                                    tanggal_jual: dateStr,
                                    isUnreported: true,
                                    jenis_pelaporan: 'Belum Dilaporkan',
                                    metode_setoran: '-',
                                    nominal_jual: 0,
                                    potongan: 0,
                                    nominal_setoran: 0,
                                    bca_debit: 0, bca_kredit: 0, bca_qris: 0,
                                    bri_debit: 0, bri_kredit: 0, bri_qris: 0,
                                    bank_transfer: 0, total_non_tunai: 0, grand_total_sales: 0
                                });
                            }
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            }
        }

        return [...actualFiltered, ...unreportedList].sort((a, b) => b.tanggal_jual.localeCompare(a.tanggal_jual));
    }, [reports, activeFilters, profile]);

    const unreportedDates = useMemo(() => {
        return filteredReports.filter(r => r.isUnreported).map(r => r.tanggal_jual);
    }, [filteredReports]);

    // Grand Totals for the entire filtered set
    const tableTotals = useMemo(() => {
        let totalSalesTunai = 0;
        let totalPotongan = 0;
        let totalSetorTunai = 0;
        let totalBcaDebit = 0;
        let totalBcaKredit = 0;
        let totalBcaQris = 0;
        let totalBriDebit = 0;
        let totalBriKredit = 0;
        let totalBriQris = 0;
        let totalBankTransfer = 0;
        let totalNonTunai = 0;
        let totalGrandSales = 0;

        filteredReports.forEach((r) => {
            if (!r.isUnreported) {
                const tunai = Number(r.nominal_jual || 0);
                const pot = Number(r.potongan || 0);
                const setor = Number(r.nominal_setoran || 0);
                const bcaDb = Number(r.bca_debit || 0);
                const bcaKr = Number(r.bca_kredit || 0);
                const bcaQr = Number(r.bca_qris || 0);
                const briDb = Number(r.bri_debit || 0);
                const briKr = Number(r.bri_kredit || 0);
                const briQr = Number(r.bri_qris || 0);
                const trf = Number(r.bank_transfer || 0);
                const nonTunai = Number(r.total_non_tunai || (bcaDb + bcaKr + bcaQr + briDb + briKr + briQr + trf));
                const grandSales = tunai + nonTunai;

                totalSalesTunai += tunai;
                totalPotongan += pot;
                totalSetorTunai += setor;
                totalBcaDebit += bcaDb;
                totalBcaKredit += bcaKr;
                totalBcaQris += bcaQr;
                totalBriDebit += briDb;
                totalBriKredit += briKr;
                totalBriQris += briQr;
                totalBankTransfer += trf;
                totalNonTunai += nonTunai;
                totalGrandSales += grandSales;
            }
        });

        return {
            totalSalesTunai,
            totalPotongan,
            totalSetorTunai,
            totalBcaDebit,
            totalBcaKredit,
            totalBcaQris,
            totalBriDebit,
            totalBriKredit,
            totalBriQris,
            totalBankTransfer,
            totalNonTunai,
            totalGrandSales
        };
    }, [filteredReports]);

    const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);
    const paginatedReports = filteredReports.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const applyFilters = () => {
        setActiveFilters({ search, startDate, endDate, methode: methodeFilter, jenis: selectedJenis });
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setSearch(''); setStartDate(''); setEndDate(''); setMethodeFilter('');
        setSelectedJenis([]);
        setActiveFilters({ search: '', startDate: '', endDate: '', methode: '', jenis: [] });
        setCurrentPage(1);
    };

    const toggleJenisFilter = (id) => {
        setSelectedJenis(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    return (
        <UserLayout title="Riwayat Laporan" activeRoute="/riwayat">
            <div className="max-w-screen-2xl mx-auto space-y-6">

                {/* FILTER SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary-500">filter_list</span> Filter Riwayat Laporan
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Cari Laporan</label>
                            <input
                                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari jenis atau nominal..."
                                className="form-input w-full py-2 px-3 text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Dari Tanggal</label>
                            <input type="date" value={startDate} min="2026-04-01" onChange={(e) => setStartDate(e.target.value)} className="form-input w-full py-2 px-3 text-xs" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sampai Tanggal</label>
                            <input type="date" value={endDate} min="2026-04-01" onChange={(e) => setEndDate(e.target.value)} className="form-input w-full py-2 px-3 text-xs" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Metode Setoran</label>
                            <select value={methodeFilter} onChange={(e) => setMethodeFilter(e.target.value)} className="form-input w-full py-2 px-3 bg-gray-50 text-xs">
                                <option value="">Semua Metode</option>
                                <option value="Teller Bank">Teller Bank</option>
                                <option value="ATM BCA Menggunakan Deposit Card">ATM Deposit Card</option>
                                <option value="Metode Setoran Lain">Lain-lain</option>
                            </select>
                        </div>
                        <div className="relative" ref={dropdownRef}>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Jenis Laporan</label>
                            <button
                                type="button"
                                onClick={() => setIsOpenJenis(!isOpenJenis)}
                                className="form-input w-full py-2 px-3 bg-gray-50 flex items-center justify-between text-left text-xs"
                            >
                                <span className="truncate">
                                    {selectedJenis.length === 0
                                        ? 'Semua Jenis'
                                        : `${selectedJenis.length} Terpilih`}
                                </span>
                                <span className="material-symbols-outlined text-gray-400 text-sm">
                                    {isOpenJenis ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                                </span>
                            </button>

                            {isOpenJenis && (
                                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto p-2 space-y-1">
                                    {JELAS_TYPES.map((t) => {
                                        const isChecked = selectedJenis.includes(t.id);
                                        return (
                                            <label
                                                key={t.id}
                                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-md cursor-pointer text-xs font-medium text-gray-700 w-full"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleJenisFilter(t.id)}
                                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                                                />
                                                <span className="truncate">{t.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button type="button" onClick={resetFilters} className="btn-secondary py-2 px-5 text-xs flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">restart_alt</span> Reset Filter
                        </button>
                        <button type="button" onClick={applyFilters} className="btn-primary py-2 px-6 text-xs flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">search</span> Terapkan Filter
                        </button>
                    </div>
                </div>

                {/* TABLE SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="animate-pulse flex items-center bg-gray-50 rounded-xl p-4 gap-4">
                                    <div className="rounded-full bg-gray-200 h-10 w-10 flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-between text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined">wifi_off</span>
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                            <button onClick={fetchReports} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">refresh</span> Muat Ulang
                            </button>
                        </div>
                    ) : paginatedReports.length === 0 ? (
                        <div className="bg-gray-50 p-10 rounded-xl text-center border border-gray-200">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
                                <span className="material-symbols-outlined text-gray-300 text-3xl">history_edu</span>
                            </div>
                            <h5 className="text-gray-900 font-bold mb-1">Tidak Ada Data</h5>
                            <p className="text-sm text-gray-400">Tidak ada laporan sesuai filter yang dipilih.</p>
                        </div>
                    ) : (
                        <>
                            {(duplicateDates.length > 0 || unreportedDates.length > 0) && (
                                <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex flex-col gap-3 animate-fade-in shadow-xs">
                                    {duplicateDates.length > 0 && (
                                        <div className="flex items-start gap-3">
                                            <span className="material-symbols-outlined text-red-500 flex-shrink-0 mt-0.5">warning</span>
                                            <div>
                                                <p className="text-xs font-bold text-red-800 uppercase">Peringatan Duplikasi Tanggal Sales</p>
                                                <p className="text-xs text-red-700 mt-1">
                                                    Terdapat pelaporan tanggal sales duplikat untuk tanggal <strong>{duplicateDates.map(d => formatDisplayDate(d)).join(', ')}</strong>. Harap periksa apakah ada kesalahan penginputan tanggal pada laporan Anda.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    {unreportedDates.length > 0 && (
                                        <div className="flex items-start gap-3 border-t border-red-100/50 pt-2 mt-1 first:border-0 first:pt-0 first:mt-0">
                                            <span className="material-symbols-outlined text-orange-500 flex-shrink-0 mt-0.5">notification_important</span>
                                            <div>
                                                <p className="text-xs font-bold text-orange-800 uppercase">Tanggal Penjualan Belum Dilaporkan</p>
                                                <p className="text-xs text-red-700 mt-1">
                                                    Tanggal penjualan (sales) yang belum dilaporkan: <strong>{unreportedDates.map(d => formatDisplayDate(d)).join(', ')}</strong>. Harap segera melakukan pelaporan setoran untuk tanggal tersebut.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TABEL DATA SCROLLABLE DENGAN STICKY HEADER & FOOTER */}
                            <div className="overflow-x-auto max-h-[650px] border border-gray-200 rounded-xl shadow-inner bg-white">
                                <table className="w-full text-xs text-left text-gray-600 min-w-[1780px] border-collapse">
                                    <thead className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wider sticky top-0 z-20 bg-gray-100 shadow-xs border-b border-gray-200">
                                        <tr>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 whitespace-nowrap">Tgl Sales</th>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20">Jenis Laporan</th>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20">Metode Setor</th>
                                            <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20">Sales Tunai (Rp)</th>
                                            <th className="px-3 py-3 text-right bg-red-50/70 text-red-800 sticky top-0 z-20">Potongan (Petty Cash)</th>
                                            <th className="px-3 py-3 text-right bg-green-50/70 text-green-800 sticky top-0 z-20">Setoran Tunai Bank</th>
                                            
                                            {/* Non-Tunai Columns */}
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BCA Debit</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BCA Kredit</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BCA QRIS</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BRI Debit</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BRI Kredit</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">BRI QRIS</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/40 text-blue-900 sticky top-0 z-20">Transfer Bank</th>
                                            <th className="px-3 py-3 text-right bg-blue-100/60 text-blue-950 font-black sticky top-0 z-20">Total Non-Tunai</th>
                                            
                                            {/* Grand Total Column */}
                                            <th className="px-3 py-3 text-right bg-orange-100/80 text-orange-950 font-black sticky top-0 z-20">TOTAL SALES HARIAN</th>
                                            <th className="px-3 py-3 text-center bg-gray-100 sticky top-0 z-20">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                                        {paginatedReports.map((item) => {
                                            const badge = getBadge(item.jenis_pelaporan);
                                            const isAnomali = badge.cls === 'badge-danger';

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className={'hover:bg-gray-50/80 transition-colors ' + (item.isUnreported ? 'bg-amber-50/20 italic text-gray-500' : (isAnomali ? 'bg-red-50/30' : ''))}
                                                >
                                                    <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">
                                                        {formatDisplayDate(item.tanggal_jual)}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div>
                                                            <p className="font-semibold text-gray-800 text-[11px] truncate max-w-[140px]" title={item.jenis_pelaporan}>{item.jenis_pelaporan}</p>
                                                            <span className={'inline-block text-[9px] font-bold px-2 py-0.25 rounded-full mt-0.5 ' + badge.cls}>
                                                                {badge.label}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-500 truncate max-w-[120px]" title={item.metode_setoran}>
                                                        {item.metode_setoran}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-900 font-medium">
                                                        {item.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(item.nominal_jual || 0)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-red-600 font-medium bg-red-50/20">
                                                        {item.isUnreported || !item.potongan ? <span className="text-gray-300">-</span> : `(${formatRupiah(item.potongan)})`}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-green-700 font-bold bg-green-50/20">
                                                        {item.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(item.nominal_setoran || 0)}
                                                    </td>
                                                    
                                                    {/* Non-Tunai Cells */}
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bca_debit > 0 ? formatRupiah(item.bca_debit) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bca_kredit > 0 ? formatRupiah(item.bca_kredit) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bca_qris > 0 ? formatRupiah(item.bca_qris) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bri_debit > 0 ? formatRupiah(item.bri_debit) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bri_kredit > 0 ? formatRupiah(item.bri_kredit) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bri_qris > 0 ? formatRupiah(item.bri_qris) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-gray-600">
                                                        {item.bank_transfer > 0 ? formatRupiah(item.bank_transfer) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-bold text-blue-900 bg-blue-50/30">
                                                        {item.total_non_tunai > 0 ? formatRupiah(item.total_non_tunai) : <span className="text-gray-300">-</span>}
                                                    </td>

                                                    {/* Grand Total Cell */}
                                                    <td className="px-3 py-3 text-right font-mono font-black text-orange-600 bg-orange-50/40 text-xs">
                                                        {item.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(item.grand_total_sales)}
                                                    </td>

                                                    <td className="px-3 py-3 text-center">
                                                        {item.isUnreported ? (
                                                            <button
                                                                onClick={() => navigate('/setoran')}
                                                                className="px-2.5 py-1 text-[10px] font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-colors cursor-pointer"
                                                            >
                                                                Lapor
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => navigate('/riwayat/' + item.id)}
                                                                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-primary-600 hover:bg-orange-50 transition-colors border border-gray-200 bg-white cursor-pointer"
                                                                title="Lihat Detail"
                                                            >
                                                                <span className="material-symbols-outlined text-base">chevron_right</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* STICKY GRAND TOTAL FOOTER */}
                                    <tfoot className="bg-orange-100/90 font-extrabold border-t-2 border-orange-300 text-orange-950 text-xs sticky bottom-0 z-20 shadow-md">
                                        <tr>
                                            <td colSpan="3" className="px-3 py-3 text-left font-black uppercase tracking-wider text-[11px]">
                                                GRAND TOTAL
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-black">
                                                {formatRupiah(tableTotals.totalSalesTunai)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-black text-red-700">
                                                {tableTotals.totalPotongan > 0 ? `(${formatRupiah(tableTotals.totalPotongan)})` : 'Rp 0'}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-black text-green-800">
                                                {formatRupiah(tableTotals.totalSetorTunai)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBcaDebit)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBcaKredit)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBcaQris)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBriDebit)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBriKredit)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBriQris)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono">
                                                {formatRupiah(tableTotals.totalBankTransfer)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-black text-blue-950">
                                                {formatRupiah(tableTotals.totalNonTunai)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-black text-orange-600 bg-orange-200/80 text-sm">
                                                {formatRupiah(tableTotals.totalGrandSales)}
                                            </td>
                                            <td className="px-3 py-3"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Pagination */}
                    {!loading && totalPages > 1 && (
                        <div className="mt-6 flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-sm">arrow_back</span> Sebelumnya
                            </button>
                            <span className="text-xs text-gray-700 font-bold bg-white border border-gray-200 px-3 py-1 rounded-md">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 cursor-pointer"
                            >
                                Selanjutnya <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </UserLayout>
    );
}
