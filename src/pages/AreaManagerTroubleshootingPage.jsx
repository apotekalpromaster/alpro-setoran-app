import React, { useState, useEffect, useMemo } from 'react';
import UserLayout from '../components/UserLayout';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../lib/validators';

export default function AreaManagerTroubleshootingPage() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [issues, setIssues] = useState([]);

    // Filters
    const [selectedStore, setSelectedStore] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Detail Modal
    const [detailIssue, setDetailIssue] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    useEffect(() => {
        if (profile) fetchData();
    }, [profile]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setFetchError(null);

            const amUsername = profile.username || '';

            // 1. Fetch store profiles under this Area Manager
            const { data: storesData, error: storeErr } = await supabase
                .from('profiles')
                .select('id, username, kode_toko')
                .ilike('area_manager', amUsername);

            if (storeErr) throw storeErr;

            const storeIds = (storesData || []).map(s => s.id);
            const storeUsernames = (storesData || []).map(s => s.username).filter(Boolean);
            const storeCodes = (storesData || []).map(s => s.kode_toko).filter(Boolean);

            if (storeIds.length === 0 && storeUsernames.length === 0) {
                setIssues([]);
                return;
            }

            // Build OR query string for Supabase .or()
            const orParts = [];
            if (storeIds.length > 0) orParts.push(`user_id.in.(${storeIds.map(id => `"${id}"`).join(',')})`);
            if (storeUsernames.length > 0) orParts.push(`kode_toko.in.(${storeUsernames.map(u => `"${u}"`).join(',')})`);
            if (storeCodes.length > 0) orParts.push(`kode_toko.in.(${storeCodes.map(c => `"${c}"`).join(',')})`);

            const { data, error } = await supabase
                .from('finance_troubleshooting_issues')
                .select('*')
                .or(orParts.join(','))
                .order('created_at', { ascending: false });

            if (error) throw error;
            setIssues(data || []);
        } catch (err) {
            console.error('Gagal mengambil data troubleshooting area manager:', err);
            setFetchError(err.message || 'Gagal memuat data dari server.');
        } finally {
            setLoading(false);
        }
    };

    // Extract unique stores for dropdown filter
    const uniqueStores = useMemo(() => {
        const set = new Set();
        issues.forEach(i => {
            if (i.kode_toko) set.add(i.kode_toko);
        });
        return Array.from(set).sort();
    }, [issues]);

    // Stats calculations
    const stats = useMemo(() => {
        const total = issues.length;
        const needInfo = issues.filter(i => i.status === 'Need Info' || !i.action_outlet).length;
        const inProgress = issues.filter(i => i.status === 'In Progress').length;
        const resolved = issues.filter(i => i.status === 'Resolved').length;
        return { total, needInfo, inProgress, resolved };
    }, [issues]);

    // Filtered data
    const filteredIssues = useMemo(() => {
        return issues.filter(item => {
            const matchStore = !selectedStore || item.kode_toko === selectedStore;
            const matchStatus = !selectedStatus || item.status === selectedStatus;
            const matchSearch = !searchTerm || 
                (item.kode_toko && item.kode_toko.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (item.nama_bank && item.nama_bank.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (item.kendala && item.kendala.toLowerCase().includes(searchTerm.toLowerCase()));

            return matchStore && matchStatus && matchSearch;
        });
    }, [issues, selectedStore, selectedStatus, searchTerm]);

    const handleCopyReminder = (issue) => {
        const storeName = issue.kode_toko || 'Cabang';
        const dateStr = issue.tanggal_penjualan || '-';
        const bankStr = issue.nama_bank || 'Bank';
        const text = `Halo rekan ${storeName},\n\nMohon bantuannya untuk melakukan pengecekan dan pengisian respon/bukti foto pada menu Troubleshooting Bank terkait transaksi tanggal *${dateStr}* (${bankStr}).\n\nTerima kasih!`;

        navigator.clipboard.writeText(text);
        setCopiedId(issue.id);
        setTimeout(() => setCopiedId(null), 3000);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Resolved':
                return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">Selesai</span>;
            case 'In Progress':
                return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">Diproses Finance</span>;
            case 'Need Info':
                return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Butuh Info Toko</span>;
            default:
                return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">{status || 'Pending'}</span>;
        }
    };

    return (
        <UserLayout title="Troubleshooting Bank Area" activeRoute="/areamanager/troubleshooting">
            <div className="space-y-6">
                {/* Header Welcome */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Troubleshooting Perbankan Area</h2>
                        <p className="text-xs text-gray-500 mt-1">Pantau dan ingatkan toko binaan Anda yang membutuhkan penyelesaian kendala perbankan / audit selisih.</p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-sm">sync</span> Segarkan Data
                    </button>
                </div>

                {fetchError && (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span>
                        <p className="text-sm font-semibold">{fetchError}</p>
                    </div>
                )}

                {/* KPI Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">troubleshoot</span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Total Isu Wilayah</p>
                            <p className="text-xl font-extrabold text-gray-900">{stats.total}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">pending_actions</span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Butuh Tindakan Toko</p>
                            <p className="text-xl font-extrabold text-amber-600">{stats.needInfo}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">published_with_changes</span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Diproses Finance</p>
                            <p className="text-xl font-extrabold text-blue-600">{stats.inProgress}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">check_circle</span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Isu Selesai</p>
                            <p className="text-xl font-extrabold text-green-600">{stats.resolved}</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Cabang</label>
                        <select
                            value={selectedStore}
                            onChange={(e) => setSelectedStore(e.target.value)}
                            className="form-input w-full py-1.5 px-3 bg-gray-50 text-xs font-bold text-gray-800"
                        >
                            <option value="">Semua Cabang Binaan</option>
                            {uniqueStores.map(st => (
                                <option key={st} value={st}>{st}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Status</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="form-input w-full py-1.5 px-3 bg-gray-50 text-xs font-bold text-gray-800"
                        >
                            <option value="">Semua Status</option>
                            <option value="Need Info">Need Info (Butuh Respon Toko)</option>
                            <option value="In Progress">In Progress (Diproses Finance)</option>
                            <option value="Resolved">Resolved (Selesai)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cari Kata Kunci</label>
                        <input
                            type="text"
                            placeholder="Cari bank, kendala, atau cabang..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="form-input w-full py-1.5 px-3 text-xs"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <div className="flex flex-col items-center gap-2 text-primary-600">
                                <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
                                <span className="font-medium text-xs">Memuat data troubleshooting wilayah...</span>
                            </div>
                        </div>
                    ) : filteredIssues.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">
                            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">task_alt</span>
                            <p className="font-semibold text-sm">Tidak ada isu troubleshooting ditemukan.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 uppercase tracking-wider text-[10px]">
                                    <tr>
                                        <th className="py-3.5 px-4">Cabang</th>
                                        <th className="py-3.5 px-4">Tgl Sales & Bank</th>
                                        <th className="py-3.5 px-4">Kendala / Isu</th>
                                        <th className="py-3.5 px-4">Respon Toko</th>
                                        <th className="py-3.5 px-4">Status</th>
                                        <th className="py-3.5 px-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-700">
                                    {filteredIssues.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="py-3 px-4 font-bold text-gray-900">
                                                {item.kode_toko || '-'}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-gray-800">{item.tanggal_penjualan || '-'}</div>
                                                <div className="text-[11px] text-gray-500">{item.nama_bank || '-'}</div>
                                            </td>
                                            <td className="py-3 px-4 max-w-xs truncate" title={item.kendala}>
                                                {item.kendala || '-'}
                                            </td>
                                            <td className="py-3 px-4 max-w-xs truncate">
                                                {item.action_outlet ? (
                                                    <span className="text-gray-800 font-medium">{item.action_outlet}</span>
                                                ) : (
                                                    <span className="text-amber-600 italic text-[11px]">Belum direspon toko</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                {getStatusBadge(item.status)}
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => setDetailIssue(item)}
                                                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold text-[11px] transition-colors cursor-pointer"
                                                    >
                                                        Detail
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyReminder(item)}
                                                        className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                                                            copiedId === item.id
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-primary-600 hover:bg-primary-700 text-white'
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-xs">chat</span>
                                                        {copiedId === item.id ? 'Tersalin & WA' : 'Ingatkan WA'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {detailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <h3 className="font-bold text-gray-900 text-base">Detail Troubleshooting Bank</h3>
                            <button onClick={() => setDetailIssue(null)} className="text-gray-400 hover:text-gray-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase">Cabang</p>
                                    <p className="font-bold text-gray-800">{detailIssue.kode_toko || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase">Tgl Penjualan</p>
                                    <p className="font-bold text-gray-800">{detailIssue.tanggal_penjualan || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase">Nama Bank</p>
                                    <p className="font-bold text-gray-800">{detailIssue.nama_bank || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase">Nominal Dispute</p>
                                    <p className="font-bold text-primary-600">{formatRupiah(detailIssue.nominal_dispute || 0)}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-gray-400 font-semibold text-[10px] uppercase mb-1">Kendala / Deskripsi Isu</p>
                                <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 text-amber-900 leading-relaxed">
                                    {detailIssue.kendala || '-'}
                                </div>
                            </div>

                            <div>
                                <p className="text-gray-400 font-semibold text-[10px] uppercase mb-1">Respon Cabang</p>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-gray-800 leading-relaxed">
                                    {detailIssue.action_outlet || <span className="italic text-gray-400">Belum ada respon dari cabang.</span>}
                                </div>
                            </div>

                            {detailIssue.catatan_admin && (
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase mb-1">Catatan Tim Finance</p>
                                    <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-blue-900 italic leading-relaxed">
                                        "{detailIssue.catatan_admin}"
                                    </div>
                                </div>
                            )}

                            {detailIssue.bukti_url && (
                                <div>
                                    <p className="text-gray-400 font-semibold text-[10px] uppercase mb-1">Lampiran Bukti Foto</p>
                                    <a
                                        href={detailIssue.bukti_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-blue-600 hover:underline font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"
                                    >
                                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                                        Buka Bukti Foto
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setDetailIssue(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </UserLayout>
    );
}
