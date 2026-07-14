import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import AutocompleteInput from '../components/AutocompleteInput';

const DISCREPANCY_THRESHOLD = 50000;
const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

export default function ManajemenLaporanPage() {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('sv-SE');

    // Filters
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [searchTerm, setSearchTerm] = useState('');
    const [showHighSelisih, setShowHighSelisih] = useState(false);
    const [kcpFilter, setKcpFilter] = useState('');
    const [jenisFilter, setJenisFilter] = useState('');

    // Data
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Memuat data laporan...');
    const [error, setError] = useState('');
    const [fetchTriggered, setFetchTriggered] = useState(false);
    const [hitLimit, setHitLimit] = useState(false);

    const fetchData = async () => {
        if (!startDate || !endDate) return;
        setLoading(true);
        setLoadingMsg('Memuat data laporan...');
        setError('');
        setFetchTriggered(true);
        setHitLimit(false);

        try {
            let allData = [];
            let from = 0;
            let done = false;

            while (!done) {
                const to = from + PAGE_SIZE - 1;
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
                        potongan,
                        nomor_deposit_card,
                        kcp_terdekat,
                        user_id,
                        profiles!laporan_user_id_fkey ( username, email )
                    `)
                    .gte('tanggal_setor', startDate)
                    .lte('tanggal_setor', endDate)
                    .order('tanggal_setor', { ascending: false })
                    .range(from, to);

                if (err) throw err;

                const batch = data || [];
                allData = allData.concat(batch);

                setLoadingMsg(`Mengambil data... (${allData.length} baris ditemukan)`);

                if (allData.length >= MAX_ROWS) {
                    setHitLimit(true);
                    done = true;
                } else if (batch.length < PAGE_SIZE) {
                    done = true;
                } else {
                    from += PAGE_SIZE;
                }
            }

            setRows(
                allData.map((row) => ({
                    ...row,
                    selisih: (row.nominal_jual || 0) - (row.potongan || 0) - (row.nominal_setoran || 0),
                    username: row.profiles?.username || '-',
                    email: row.profiles?.email || '',
                }))
            );
        } catch (e) {
            setError(e.message || 'Gagal memuat data.');
        } finally {
            setLoading(false);
        }
    };

    // Client-side filter
    const filtered = useMemo(() => {
        return rows.filter((r) => {
            const matchName = !searchTerm || r.username.toLowerCase().includes(searchTerm.toLowerCase());
            const matchKcp = !kcpFilter || (r.kcp_terdekat || '').toLowerCase().includes(kcpFilter.toLowerCase());
            const matchSelisih = !showHighSelisih || Math.abs(r.selisih) > DISCREPANCY_THRESHOLD;
            const matchJenis = !jenisFilter || r.jenis_pelaporan === jenisFilter;
            return matchName && matchKcp && matchSelisih && matchJenis;
        });
    }, [rows, searchTerm, kcpFilter, showHighSelisih, jenisFilter]);

    // Grand Totals
    const totals = useMemo(() => {
        let totalSetor = 0;
        let totalSelisih = 0;
        filtered.forEach((r) => {
            totalSetor += Number(r.nominal_setoran || 0);
            totalSelisih += Number(r.selisih || 0);
        });
        return { totalSetor, totalSelisih };
    }, [filtered]);

    // CSV export
    const downloadCSV = () => {
        if (!filtered.length) return;
        const header = 'Nama Apotek,Tgl Jual,Tgl Setor,Jenis,Metode,Deposit Card,KCP,Nominal Jual,Potongan,Nominal Setor,Selisih\n';
        const body = filtered.map((r) =>
            [
                `"${r.username}"`,
                r.tanggal_jual,
                r.tanggal_setor,
                `"${r.jenis_pelaporan}"`,
                `"${r.metode_setoran}"`,
                `"${r.nomor_deposit_card || ''}"`,
                `"${r.kcp_terdekat || ''}"`,
                r.nominal_jual || 0,
                r.potongan || 0,
                r.nominal_setoran || 0,
                r.selisih,
            ].join(',')
        ).join('\n');
        
        let footer = '';
        if (hitLimit) {
            footer += `\n\n# WARNING: Data dalam berkas CSV ini terpotong (maksimal ${MAX_ROWS} baris).\n# Silakan gunakan filter rentang tanggal yang lebih sempit untuk mengunduh laporan lengkap.\n`;
        } else {
            footer += `\n\n# Info: Ekspor data lengkap (${filtered.length} baris).\n`;
        }
        
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        footer += `# Tanggal Ekspor: ${timestamp} WIB\n`;
        footer += `# Filter - Nama: ${searchTerm || 'Semua'}, Jenis: ${jenisFilter || 'Semua'}, KCP: ${kcpFilter || 'Semua'}, Selisih: ${showHighSelisih ? '> 50rb' : 'Semua'}\n`;

        const blob = new Blob([header + body + footer], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_${startDate}_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSearchInput = (val) => {
        setSearchTerm(val);
    };

    const selisihChip = (selisih) => {
        if (selisih > 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">-${formatRupiah(selisih)}</span>;
        if (selisih < 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">+${formatRupiah(Math.abs(selisih))}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Sesuai</span>;
    };

    const renderJenisBadge = (jenis) => {
        let cls = 'bg-gray-100 text-gray-700';
        if (jenis.includes('Harian') || jenis.includes('3x')) cls = 'bg-blue-50 text-blue-700 border border-blue-200';
        else if (jenis.includes('Potongan')) cls = 'bg-amber-50 text-amber-700 border border-amber-200';
        else if (jenis.includes('Pecahan')) cls = 'bg-purple-50 text-purple-700 border border-purple-200';
        else if (jenis.includes('Lebih')) cls = 'bg-indigo-50 text-indigo-700 border border-indigo-200';
        return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${cls}`}>{jenis}</span>;
    };

    return (
        <AdminLayout title="Manajemen Laporan">
            <div className="space-y-6">
                
                {/* QUICK NAVIGATION PANEL */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 text-3xl">payments</span>
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm">Modul Rekonsiliasi &amp; Koreksi</h4>
                            <p className="text-[11px] text-gray-500 leading-normal">Kelola verifikasi data POS dan persetujuan permohonan koreksi laporan cabang.</p>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => navigate('/finance/rekonsiliasi-pos')} 
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 text-xs font-bold rounded-lg transition-all"
                        >
                            <span className="material-symbols-outlined text-base">compare</span> Rekonsiliasi POS
                        </button>
                        <button 
                            onClick={() => navigate('/finance/koreksi-approval')} 
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 border border-orange-200 text-orange-700 bg-orange-50/50 hover:bg-orange-50 text-xs font-bold rounded-lg transition-all"
                        >
                            <span className="material-symbols-outlined text-base">edit_note</span> Persetujuan Koreksi
                        </button>
                    </div>
                </div>

                {/* FILTER GRID CARD */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                        {/* Search + Autocomplete */}
                        <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
                            <AutocompleteInput
                                label="Pencarian Apotek"
                                value={searchTerm}
                                onChange={handleSearchInput}
                                onSelect={(item) => item && setSearchTerm(item.username)}
                                table="profiles"
                                column="username"
                                extraFilters={(q) => q.eq('role', 'User')}
                                placeholder="Ketik nama apotek..."
                                icon="store"
                                minChars={2}
                            />
                        </div>

                        {/* Jenis Pelaporan */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Jenis Pelaporan</label>
                            <select
                                value={jenisFilter}
                                onChange={(e) => setJenisFilter(e.target.value)}
                                className="form-input w-full py-2 px-3 bg-gray-50 text-xs cursor-pointer"
                            >
                                <option value="">Semua Jenis</option>
                                <option value="Setoran Harian">Setoran Harian</option>
                                <option value="Setoran 3x Seminggu">Setoran 3x Seminggu</option>
                                <option value="Setoran Sales Dengan Potongan Penjualan">Setoran Potongan</option>
                                <option value="Setoran Uang Pecahan Kecil">Setoran Pecahan Kecil</option>
                                <option value="Setoran Uang Lebih">Setoran Uang Lebih</option>
                                <option value="Pengembalian Petty Cash">Pengembalian Petty Cash</option>
                                <option value="Deposit Card Terblokir (Salah Input PIN 3x)">Deposit Card Terblokir</option>
                                <option value="Deposit Card Tertelan Mesin ATM">Deposit Card Tertelan ATM</option>
                            </select>
                        </div>

                        {/* Date Dari */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal Setor</label>
                            <input 
                                type="date" 
                                value={startDate} 
                                min="2026-04-01" 
                                onChange={(e) => setStartDate(e.target.value)} 
                                className="form-input w-full py-1.5 px-3 text-xs" 
                            />
                        </div>

                        {/* Date Sampai */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai</label>
                            <input 
                                type="date" 
                                value={endDate} 
                                min="2026-04-01" 
                                onChange={(e) => setEndDate(e.target.value)} 
                                className="form-input w-full py-1.5 px-3 text-xs" 
                            />
                        </div>

                        {/* KCP filter */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Filter KCP</label>
                            <input 
                                type="text" 
                                value={kcpFilter} 
                                onChange={(e) => setKcpFilter(e.target.value.toUpperCase())} 
                                placeholder="KCP..." 
                                className="form-input w-full py-1.5 px-3 text-xs uppercase" 
                            />
                        </div>
                    </div>

                    {/* ACTION ROW (BELOW INPUTS) */}
                    <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-100 gap-4">
                        {/* Toggle Filter */}
                        <div className="w-full sm:w-auto">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <div
                                    onClick={() => setShowHighSelisih((p) => !p)}
                                    className={`relative w-9 h-5 rounded-full transition-colors ${showHighSelisih ? 'bg-orange-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-xs transition-transform ${showHighSelisih ? 'translate-x-4' : ''}`} />
                                </div>
                                <span className="text-xs font-bold text-gray-700">Tampilkan Selisih &gt; 50rb</span>
                            </label>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button 
                                onClick={fetchData} 
                                className="flex-1 sm:flex-initial btn-primary h-9 px-5 text-xs flex items-center justify-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-sm">filter_list</span> Terapkan Filter
                            </button>
                            <button 
                                onClick={downloadCSV} 
                                disabled={!filtered.length} 
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> Ekspor CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* TABLE */}
                {hitLimit && (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm animate-pulse">
                        <span className="material-symbols-outlined text-amber-500">warning</span>
                        <span><strong>Data terlalu besar (${MAX_ROWS.toLocaleString()} baris maks).</strong> Mohon persempit rentang tanggal filter untuk mendapatkan data yang lebih akurat.</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">{loadingMsg}</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                ) : fetchTriggered && (
                    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                        {/* Summary bar */}
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <span className="text-xs text-gray-600 font-semibold">
                                {filtered.length} baris ditemukan
                                {filtered.length !== rows.length && ` (dari ${rows.length} total)`}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                                {startDate} s/d {endDate}
                            </span>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 mb-3 border border-gray-100">
                                    <span className="material-symbols-outlined text-gray-400 text-3xl">search_off</span>
                                </div>
                                <p className="text-gray-500 font-bold text-sm">Data tidak ditemukan.</p>
                                <p className="text-xs text-gray-400 mt-1">Coba sesuaikan filter pencarian atau periode tanggal Anda.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                                    <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                        <tr>
                                            <th className="px-5 py-4">Nama Apotek</th>
                                            <th className="px-5 py-4">Tgl Setor</th>
                                            <th className="px-5 py-4">Jenis Pelaporan</th>
                                            <th className="px-5 py-4">Metode</th>
                                            <th className="px-5 py-4">Deposit Card</th>
                                            <th className="px-5 py-4">KCP</th>
                                            <th className="px-5 py-4 text-right">Nominal Setor</th>
                                            <th className="px-5 py-4 text-center">Selisih</th>
                                            <th className="px-5 py-4 text-center sticky right-0 bg-gray-50 shadow-sm border-l border-gray-200">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700">
                                        {filtered.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="px-5 py-4 font-bold text-gray-900">{row.username}</td>
                                                <td className="px-5 py-4 text-gray-600 text-xs">
                                                    {new Date(row.tanggal_setor).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="px-5 py-4">{renderJenisBadge(row.jenis_pelaporan)}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs">{row.metode_setoran}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs font-mono">{row.nomor_deposit_card || '-'}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs">{row.kcp_terdekat || '-'}</td>
                                                <td className="px-5 py-4 text-right font-bold text-gray-900">{formatRupiah(row.nominal_setoran || 0)}</td>
                                                <td className="px-5 py-4 text-center">{selisihChip(row.selisih)}</td>
                                                <td className="px-5 py-4 text-center sticky right-0 bg-white group-hover:bg-gray-50/80 border-l border-gray-200">
                                                    <button
                                                        title="Lihat Detail"
                                                        onClick={() => navigate(`/riwayat/${row.id}`)}
                                                        className="h-8 w-8 flex items-center justify-center rounded-full mx-auto text-primary-600 hover:bg-orange-50 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 text-gray-900 sticky bottom-0">
                                        <tr>
                                            <td colSpan="6" className="px-5 py-4 text-left font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                                                Grand Total
                                            </td>
                                            <td className="px-5 py-4 text-right font-extrabold text-gray-900 font-mono">
                                                {formatRupiah(totals.totalSetor)}
                                            </td>
                                            <td className="px-5 py-4 text-center font-extrabold font-mono">
                                                {selisihChip(totals.totalSelisih)}
                                            </td>
                                            <td className="px-5 py-4 sticky right-0 bg-gray-50 border-l border-gray-200"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {!fetchTriggered && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
                        <span className="material-symbols-outlined text-5xl mb-3">table_view</span>
                        <p className="text-sm font-medium">Pilih rentang tanggal dan klik Terapkan untuk memuat data.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}