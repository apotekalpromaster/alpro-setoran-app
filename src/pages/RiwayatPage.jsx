import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const ITEMS_PER_PAGE = 30;

const BADGE_CONFIG = {
    'Setoran Harian': { label: 'Harian', cls: 'badge-normal' },
    'Setoran 3x Seminggu': { label: '3x Seminggu', cls: 'badge-normal' },
    'Setoran Sales Dengan Potongan Penjualan': { label: 'Potongan', cls: 'badge-warning' },
    'Setoran Uang Pecahan Kecil': { label: 'Pecahan Kecil', cls: 'badge-normal' },
    'Setoran Uang Lebih': { label: 'Uang Lebih', cls: 'badge-info' },
    'Pengembalian Petty Cash': { label: 'Petty Cash', cls: 'badge-purple' },
    'Deposit Card Terblokir (Salah Input PIN 3x)': { label: 'Card Terblokir', cls: 'badge-danger' },
    'Deposit Card Tertelan Mesin ATM': { label: 'Card Tertelan', cls: 'badge-danger' },
};

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

    // Filter state
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [methodeFilter, setMethodeFilter] = useState('');
    const [selectedJenis, setSelectedJenis] = useState([]);
    const [activeFilters, setActiveFilters] = useState({ search: '', startDate: '', endDate: '', methode: '', jenis: [] });

    useEffect(() => {
        if (!profile?.id) return;
        fetchReports();
    }, [profile?.id]);

    const fetchReports = async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch all reports for this user (up to 5000 rows) without arbitrary cap limit
            const { data, error: err } = await supabase
                .from('laporan')
                .select('*')
                .eq('user_id', profile.id)
                .order('tanggal_jual', { ascending: false })
                .limit(5000);

            if (err) throw err;
            setReports(data || []);
        } catch (e) {
            setError('Gagal memuat riwayat: ' + e.message);
        } finally {
            setLoading(false);
        }
    };
    // Client-side filtering (applied on Apply click)
    const filteredReports = useMemo(() => {
        return reports.map(r => ({
            ...r,
            selisih: (r.nominal_jual || 0) - (r.potongan || 0) - (r.nominal_setoran || 0)
        })).filter((item) => {
            const term = activeFilters.search.toLowerCase();
            const matchSearch =
                !term ||
                (item.jenis_pelaporan || '').toLowerCase().includes(term) ||
                formatRupiah(item.nominal_setoran || 0).toLowerCase().includes(term);

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
    }, [reports, activeFilters]);

    // Grand Totals for the entire filtered set
    const tableTotals = useMemo(() => {
        let totalSales = 0;
        let totalPotongan = 0;
        let totalSetor = 0;
        let totalSelisih = 0;
        filteredReports.forEach((r) => {
            totalSales += Number(r.nominal_jual || 0);
            totalPotongan += Number(r.potongan || 0);
            totalSetor += Number(r.nominal_setoran || 0);
            totalSelisih += Number(r.selisih || 0);
        });
        return { totalSales, totalPotongan, totalSetor, totalSelisih };
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

    const selisihChip = (val) => {
        if (val > 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">-{formatRupiah(val)}</span>;
        if (val < 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">+{formatRupiah(Math.abs(val))}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Sesuai</span>;
    };
    return (
        <UserLayout title="Riwayat Laporan" activeRoute="/riwayat">
            <div className="max-w-screen-xl mx-auto space-y-6">

                {/* FILTER SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary-500">filter_list</span> Filter Riwayat
                        </h3>
                        <button onClick={resetFilters} className="text-xs font-medium text-red-500 hover:text-red-700 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">restart_alt</span> Reset Filter
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Cari Laporan</label>
                            <input
                                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Jenis laporan atau nominal"
                                className="form-input w-full py-2 px-3"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Dari Tanggal Sales</label>
                            <input type="date" value={startDate} min="2026-04-01" onChange={(e) => setStartDate(e.target.value)} className="form-input w-full py-2 px-3" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sampai</label>
                            <input type="date" value={endDate} min="2026-04-01" onChange={(e) => setEndDate(e.target.value)} className="form-input w-full py-2 px-3" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Metode Setoran</label>
                            <select value={methodeFilter} onChange={(e) => setMethodeFilter(e.target.value)} className="form-input w-full py-2 px-3 bg-gray-50">
                                <option value="">Semua Metode</option>
                                <option value="Teller Bank">Teller Bank</option>
                                <option value="ATM BCA Menggunakan Deposit Card">ATM Deposit Card</option>
                                <option value="Metode Setoran Lain">Lain-lain</option>
                            </select>
                        </div>
                    </div>

                    {/* Multi-select chips for Jenis Pelaporan */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 mb-2">Filter Jenis Pelaporan (Bisa pilih &gt; 1):</label>
                        <div className="flex flex-wrap gap-2">
                            {JELAS_TYPES.map((t) => {
                                const isSelected = selectedJenis.includes(t.id);
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => toggleJenisFilter(t.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                            isSelected
                                                ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button onClick={applyFilters} className="btn-primary py-2 px-6 text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">search</span> Terapkan Filter
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
                        <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                            <span className="material-symbols-outlined">error</span>
                            <p className="text-sm">{error}</p>
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
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="px-5 py-4">Tgl Sales</th>
                                        <th className="px-5 py-4">Jenis Laporan</th>
                                        <th className="px-5 py-4">Metode</th>
                                        <th className="px-5 py-4 text-right">Nominal Sales</th>
                                        <th className="px-5 py-4 text-right">Potongan</th>
                                        <th className="px-5 py-4 text-right">Nominal Setor</th>
                                        <th className="px-5 py-4 text-center">Selisih</th>
                                        <th className="px-5 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-700">
                                    {paginatedReports.map((item, idx) => {
                                        const badge = getBadge(item.jenis_pelaporan);
                                        const isAnomali = badge.cls === 'badge-danger';
                                        return (
                                            <tr
                                                key={item.id}
                                                className={`hover:bg-gray-50/50 transition-colors group ${
                                                    isAnomali ? 'bg-red-50/30' : ''
                                                }`}
                                            >
                                                <td className="px-5 py-4 font-bold text-gray-900">
                                                    {formatDisplayDate(item.tanggal_jual)}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div>
                                                        <p className="font-semibold text-gray-800 text-[13px]">{item.jenis_pelaporan}</p>
                                                        <span className={`inline-block text-[9px] font-bold px-2 py-0.25 rounded-full mt-0.5 ${badge.cls}`}>
                                                            {badge.label}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-xs text-gray-500">
                                                    {item.metode_setoran}
                                                </td>
                                                <td className="px-5 py-4 text-right text-gray-900 font-mono">
                                                    {formatRupiah(item.nominal_jual || 0)}
                                                </td>
                                                <td className="px-5 py-4 text-right text-gray-500 font-mono">
                                                    {formatRupiah(item.potongan || 0)}
                                                </td>
                                                <td className="px-5 py-4 text-right font-bold text-gray-900 font-mono">
                                                    {formatRupiah(item.nominal_setoran || 0)}
                                                </td>
                                                <td className="px-5 py-4 text-center font-mono">
                                                    {selisihChip(item.selisih)}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <button
                                                        onClick={() => navigate(`/riwayat/${item.id}`)}
                                                        className="h-8 w-8 inline-flex items-center justify-center rounded-full text-primary-600 hover:bg-orange-50 transition-colors border border-gray-200 bg-white"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 text-gray-900">
                                    <tr>
                                        <td colSpan="3" className="px-5 py-4 text-left font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                                            Grand Total
                                        </td>
                                        <td className="px-5 py-4 text-right font-extrabold text-gray-900 font-mono">
                                            {formatRupiah(tableTotals.totalSales)}
                                        </td>
                                        <td className="px-5 py-4 text-right font-extrabold text-gray-600 font-mono">
                                            {formatRupiah(tableTotals.totalPotongan)}
                                        </td>
                                        <td className="px-5 py-4 text-right font-extrabold text-gray-900 font-mono">
                                            {formatRupiah(tableTotals.totalSetor)}
                                        </td>
                                        <td className="px-5 py-4 text-center font-extrabold font-mono">
                                            {selisihChip(tableTotals.totalSelisih)}
                                        </td>
                                        <td className="px-5 py-4"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-6 flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200"
                            >
                                <span className="material-symbols-outlined text-sm">arrow_back</span> Sebelumnya
                            </button>
                            <span className="text-sm text-gray-700 font-bold bg-white border border-gray-200 px-3 py-1 rounded-md">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200"
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
