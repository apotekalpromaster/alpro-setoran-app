import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const ITEMS_PER_PAGE = 30;

/** Visual badge config keyed by jenis_pelaporan */
const BADGE_CONFIG = {
    'Setoran Harian': { label: 'Harian', cls: 'badge-normal' },
    'Setoran 3x Seminggu': { label: '3x Seminggu', cls: 'badge-normal' },
    'Setoran Sales Dengan Potongan Penjualan': { label: 'Potongan', cls: 'badge-warning' },
    'Setoran Uang Pecahan Kecil': { label: 'Pecahan Kecil', cls: 'badge-normal' },
    'Setoran Uang Lebih': { label: 'Uang Lebih', cls: 'badge-info' },
    'Pengembalian Petty Cash': { label: 'Petty Cash', cls: 'badge-purple' },
    'Deposit Card Terblokir (Salah Input PIN 3x)': { label: '⚠ Terblokir', cls: 'badge-danger' },
    'Deposit Card Tertelan Mesin ATM': { label: '⚠ Tertelan ATM', cls: 'badge-danger' },
};

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
    const [activeFilters, setActiveFilters] = useState({ search: '', startDate: '', endDate: '', methode: '' });

    useEffect(() => {
        if (!profile?.id) return;
        fetchReports();
    }, [profile?.id]);

    const fetchReports = async () => {
        setLoading(true);
        setError('');
        try {
            /**
             * Optimized query:
             * - RLS automatically filters to profile.id === auth.uid()
             * - ORDER BY uses index on tanggal_setor DESC
             * - LIMIT 50 caps result set
             */
            const { data, error: err } = await supabase
                .from('laporan')
                .select(`
          id,
          tanggal_jual,
          tanggal_setor,
          jenis_pelaporan,
          metode_setoran,
          nominal_jual,
          nominal_setoran,
          timestamp
        `)
                .order('tanggal_jual', { ascending: false })
                .limit(50);

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
        return reports.filter((item) => {
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

            return matchSearch && matchMethode && matchDate;
        });
    }, [reports, activeFilters]);

    const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);
    const paginatedReports = filteredReports.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const applyFilters = () => {
        setActiveFilters({ search, startDate, endDate, methode: methodeFilter });
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setSearch(''); setStartDate(''); setEndDate(''); setMethodeFilter('');
        setActiveFilters({ search: '', startDate: '', endDate: '', methode: '' });
        setCurrentPage(1);
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
                            <input type="date" value={startDate} min="2025-12-15" onChange={(e) => setStartDate(e.target.value)} className="form-input w-full py-2 px-3" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sampai Tanggal Sales</label>
                            <input type="date" value={endDate} min="2025-12-15" onChange={(e) => setEndDate(e.target.value)} className="form-input w-full py-2 px-3" />
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
                    <div className="mt-4 flex justify-end">
                        <button onClick={applyFilters} className="btn-primary py-2 px-6 text-sm">
                            <span className="material-symbols-outlined text-base">search</span> Terapkan Filter
                        </button>
                    </div>
                </div>

                {/* LIST SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    {/* Column headers (desktop) */}
                    <div className="hidden md:flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-4">
                        <div className="w-[25%]">Tanggal Sales</div>
                        <div className="w-[35%]">Jenis Laporan</div>
                        <div className="w-[20%]">Metode</div>
                        <div className="w-[20%] text-right pr-10">Nominal Setor</div>
                    </div>

                    {/* Content */}
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
                        <div className="flex flex-col gap-2">
                            {paginatedReports.map((item, idx) => {
                                const badge = getBadge(item.jenis_pelaporan);
                                const isAnomali = badge.cls === 'badge-danger';
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => navigate(`/riwayat/${item.id}`)}
                                        className={`fade-in-item w-full text-left flex flex-col md:flex-row md:items-center p-4 rounded-xl border transition-all duration-200 group gap-2 md:gap-0
                      ${isAnomali
                                                ? 'border-red-200 bg-red-50 hover:border-red-300 hover:shadow-md'
                                                : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-md'
                                            }`}
                                        style={{ animationDelay: `${idx * 0.04}s` }}
                                    >
                                        {/* Date */}
                                        <div className="md:w-[25%] flex items-center gap-3">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${isAnomali ? 'bg-red-100 text-red-500' : 'bg-orange-50 text-primary-500'}`}>
                                                <span className="material-symbols-outlined text-xl">{isAnomali ? 'warning' : 'calendar_today'}</span>
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm">{formatDisplayDate(item.tanggal_jual)}</p>
                                                <p className="text-xs text-gray-400">Penjualan</p>
                                            </div>
                                        </div>

                                        {/* Jenis + Badge */}
                                        <div className="md:w-[35%] flex items-center gap-2 pl-0 md:pl-2">
                                            <div>
                                                <p className={`font-semibold text-sm group-hover:text-primary-600 transition-colors ${isAnomali ? 'text-red-700' : 'text-gray-700'}`}>
                                                    {item.jenis_pelaporan}
                                                </p>
                                                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${badge.cls}`}>
                                                    {badge.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Metode */}
                                        <div className="md:w-[20%] hidden md:flex items-center">
                                            <p className="text-xs text-gray-500 truncate">{item.metode_setoran}</p>
                                        </div>

                                        {/* Nominal + Arrow */}
                                        <div className="md:w-[20%] flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-gray-100 pt-2 md:pt-0 mt-1 md:mt-0">
                                            <div className="text-left md:text-right">
                                                <p className="font-bold text-gray-900 text-sm">{formatRupiah(item.nominal_setoran || 0)}</p>
                                                <p className="text-xs text-gray-400">Setor</p>
                                            </div>
                                            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors border border-gray-200">
                                                <span className="material-symbols-outlined text-lg">chevron_right</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
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
