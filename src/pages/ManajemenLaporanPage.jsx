import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import AutocompleteInput from '../components/AutocompleteInput';

const DISCREPANCY_THRESHOLD = 50000;

export default function ManajemenLaporanPage() {
    const navigate = useNavigate();
    const today = new Date().toISOString().split('T')[0];

    // Filters
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [searchTerm, setSearchTerm] = useState('');
    const [showHighSelisih, setShowHighSelisih] = useState(false);
    const [kcpFilter, setKcpFilter] = useState('');

    // Data
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fetchTriggered, setFetchTriggered] = useState(false);

    const fetchData = async () => {
        if (!startDate || !endDate) return;
        setLoading(true);
        setError('');
        setFetchTriggered(true);

        try {
            /**
             * Admin query — no RLS restriction for role=Admin/Finance
             * JOIN profiles via user_id to get username, email, kcp_terdekat
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
          potongan,
          nomor_deposit_card,
          kcp_terdekat,
          user_id,
          profiles!laporan_user_id_fkey ( username, email )
        `)
                .gte('tanggal_setor', startDate)
                .lte('tanggal_setor', endDate)
                .order('tanggal_setor', { ascending: false })
                .limit(500);

            if (err) throw err;

            setRows(
                (data || []).map((row) => ({
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
            return matchName && matchKcp && matchSelisih;
        });
    }, [rows, searchTerm, kcpFilter, showHighSelisih]);

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
        const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
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
        if (selisih > 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">−{formatRupiah(selisih)}</span>;
        if (selisih < 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">+{formatRupiah(Math.abs(selisih))}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Sesuai</span>;
    };

    return (
        <AdminLayout title="Manajemen Laporan">
            <div className="space-y-6">
                {/* TOOLBAR */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
                        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-end">
                            {/* Search + Autocomplete */}
                            <div className="flex-grow md:w-72">
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

                            {/* Date range */}
                            <div className="flex gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Dari</label>
                                    <input type="date" value={startDate} min="2026-04-01" onChange={(e) => setStartDate(e.target.value)} className="form-input w-36" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-sm">ke</span>
                                    <input type="date" value={endDate} min="2026-04-01" onChange={(e) => setEndDate(e.target.value)} className="form-input w-36" />
                                </div>
                            </div>

                            {/* KCP filter */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">KCP</label>
                                <input type="text" value={kcpFilter} onChange={(e) => setKcpFilter(e.target.value.toUpperCase())} placeholder="Filter KCP..." className="form-input w-36 uppercase" />
                            </div>

                            <button onClick={fetchData} className="btn-primary h-10 px-5 text-sm flex-shrink-0">
                                <span className="material-symbols-outlined text-sm">filter_list</span> Terapkan
                            </button>
                        </div>

                        {/* Right toolbar */}
                        <div className="flex items-center gap-4 justify-end">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div
                                    onClick={() => setShowHighSelisih((p) => !p)}
                                    className={`relative w-10 h-6 rounded-full transition-colors ${showHighSelisih ? 'bg-orange-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${showHighSelisih ? 'translate-x-4' : ''}`} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Selisih &gt; 50rb</span>
                            </label>
                            <button onClick={downloadCSV} disabled={!filtered.length} className="flex items-center gap-2 h-10 px-5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                                <span className="material-symbols-outlined text-sm">download</span> CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* TABLE */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">Memuat data laporan...</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                ) : fetchTriggered && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Summary bar */}
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <span className="text-sm text-gray-600 font-medium">
                                {filtered.length} baris ditemukan
                                {filtered.length !== rows.length && ` (dari ${rows.length} total)`}
                            </span>
                            <span className="text-xs text-gray-400">
                                {startDate} s/d {endDate}
                            </span>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="p-10 text-center">
                                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mb-3">
                                    <span className="material-symbols-outlined text-gray-400 text-3xl">search_off</span>
                                </div>
                                <p className="text-gray-500 font-medium">Data tidak ditemukan.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                                    <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                        <tr>
                                            <th className="px-5 py-4">Nama Apotek</th>
                                            <th className="px-5 py-4">Tgl Setor</th>
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
                                            <tr key={row.id} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-5 py-4 font-bold text-gray-900">{row.username}</td>
                                                <td className="px-5 py-4 text-gray-600">{row.tanggal_setor}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs">{row.metode_setoran}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs font-mono">{row.nomor_deposit_card || '-'}</td>
                                                <td className="px-5 py-4 text-gray-500 text-xs">{row.kcp_terdekat || '-'}</td>
                                                <td className="px-5 py-4 text-right font-bold text-gray-900">{formatRupiah(row.nominal_setoran || 0)}</td>
                                                <td className="px-5 py-4 text-center">{selisihChip(row.selisih)}</td>
                                                <td className="px-5 py-4 text-center sticky right-0 bg-white group-hover:bg-gray-50 border-l border-gray-200">
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
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {!fetchTriggered && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-3">table_view</span>
                        <p className="text-sm font-medium">Pilih rentang tanggal dan klik Terapkan untuk memuat data.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
