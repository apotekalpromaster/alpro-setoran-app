import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

export default function AreaManagerKoreksiApprovalPage() {
    const { profile } = useAuth();
    
    // UI states
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState('');
    
    // Data states
    const [requests, setRequests] = useState([]);
    const [statusFilter, setStatusFilter] = useState('Pending'); // 'All' | 'Pending' | 'Approved' | 'Rejected'

    useEffect(() => {
        if (profile?.id) {
            fetchRequests();
        }
    }, [profile?.id, statusFilter]);

    const fetchRequests = async () => {
        setLoading(true);
        setError('');
        try {
            let query = supabase
                .from('koreksi_requests')
                .select(`
                    id,
                    nominal_jual_baru,
                    nominal_setoran_baru,
                    potongan_baru,
                    penjelasan_koreksi,
                    status,
                    created_at,
                    processed_at,
                    requested_by,
                    jenis_pelaporan_baru,
                    tanggal_jual_baru,
                    tanggal_setor_baru,
                    bukti_urls_baru,
                    profiles!koreksi_requests_requested_by_fkey!inner (
                        username,
                        area_manager
                    ),
                    laporan (
                        id,
                        tanggal_jual,
                        jenis_pelaporan,
                        nominal_jual,
                        nominal_setoran,
                        potongan
                    )
                `)
                .eq('profiles.area_manager', profile.username)
                .order('created_at', { ascending: false });

            if (statusFilter !== 'All') {
                query = query.eq('status', statusFilter);
            }

            const { data, error: err } = await query;
            if (err) throw err;
            setRequests(data || []);
        } catch (e) {
            setError('Gagal memuat data koreksi: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (req) => {
        const isDelete = req.jenis_pelaporan_baru === 'HAPUS_DATA';
        const confirmMsg = isDelete 
            ? 'Apakah Anda yakin menyetujui penghapusan laporan ini? Data laporan asli akan dihapus secara permanen dari database.'
            : 'Apakah Anda yakin menyetujui koreksi laporan ini? Data laporan asli akan diperbarui otomatis.';

        if (!window.confirm(confirmMsg)) {
            return;
        }

        setActionLoadingId(req.id);
        setError('');
        setSuccessMsg('');

        try {
            // Call RPC approve_koreksi_request(p_request_id, p_admin_id)
            const { data: success, error: rpcErr } = await supabase.rpc('approve_koreksi_request', {
                p_request_id: req.id,
                p_admin_id: profile.id
            });

            if (rpcErr) throw rpcErr;
            if (!success) throw new Error('Gagal memproses persetujuan. Pastikan data berstatus Pending.');

            setSuccessMsg(isDelete ? 'Laporan berhasil dihapus secara permanen dari database.' : 'Koreksi laporan berhasil disetujui dan data laporan asli telah diperbarui.');
            fetchRequests();
        } catch (err) {
            setError('Gagal memproses persetujuan: ' + err.message);
        } finally {
            setActionLoadingId('');
        }
    };

    const handleReject = async (reqId) => {
        if (!window.confirm('Apakah Anda yakin menolak pengajuan koreksi ini?')) {
            return;
        }

        setActionLoadingId(reqId);
        setError('');
        setSuccessMsg('');

        try {
            const { error: updateErr } = await supabase
                .from('koreksi_requests')
                .update({
                    status: 'Rejected',
                    approved_by: profile.id,
                    processed_at: new Date().toISOString()
                })
                .eq('id', reqId)
                .eq('status', 'Pending');

            if (updateErr) throw updateErr;

            setSuccessMsg('Pengajuan koreksi telah ditolak.');
            fetchRequests();
        } catch (err) {
            setError('Gagal menolak pengajuan: ' + err.message);
        } finally {
            setActionLoadingId('');
        }
    };

    return (
        <UserLayout title="Persetujuan Koreksi Laporan" activeRoute="/areamanager/koreksi-approval">
            <div className="max-w-screen-xl mx-auto space-y-6">
                
                {/* FILTER SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary-500">pending_actions</span> Pengajuan Koreksi
                        </h3>
                        <p className="text-xs text-gray-500">Tinjau dan setujui perubahan data laporan penjualan yang salah entri dari cabang.</p>
                    </div>
                    <div className="flex gap-2">
                        {['Pending', 'Approved', 'Rejected', 'All'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                                    statusFilter === status
                                        ? 'bg-primary-50 text-primary-600 border-primary-300'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {status === 'All' ? 'Semua Status' : status}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
                        <span className="material-symbols-outlined">error</span>
                        <span>{error}</span>
                    </div>
                )}

                {successMsg && (
                    <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
                        <span className="material-symbols-outlined">check_circle</span>
                        <span>{successMsg}</span>
                    </div>
                )}

                {/* TABLE LIST */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                            <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="py-3.5 px-6">Tanggal Pengajuan</th>
                                    <th className="py-3.5 px-6">Apotek / Cabang</th>
                                    <th className="py-3.5 px-6">Laporan Asli</th>
                                    <th className="py-3.5 px-6 text-right">Data Asli</th>
                                    <th className="py-3.5 px-6 text-right">Data Koreksi Baru</th>
                                    <th className="py-3.5 px-6">Alasan / Penjelasan</th>
                                    <th className="py-3.5 px-6 text-center">Tindakan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="py-10 text-center text-gray-400">
                                            <span className="animate-spin inline-block h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></span>
                                            Memuat data...
                                        </td>
                                    </tr>
                                ) : requests.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-10 text-center text-gray-400">
                                            Tidak ada permohonan koreksi berstatus <strong>{statusFilter}</strong>.
                                        </td>
                                    </tr>
                                ) : (
                                    requests.map((item) => {
                                        const lap = item.laporan;
                                        if (!lap) return null;

                                        const branch = item.profiles?.username || '-';
                                        
                                        // Calculate differences
                                        const deltaJual = item.nominal_jual_baru - lap.nominal_jual;
                                        const deltaSetor = item.nominal_setoran_baru - lap.nominal_setoran;
                                        const deltaPotong = item.potongan_baru - lap.potongan;

                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50/50">
                                                <td className="py-4 px-6 font-mono text-xs text-gray-400">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-4 px-6 font-bold">{branch}</td>
                                                <td className="py-4 px-6">
                                                    <span className="font-semibold block">{lap.jenis_pelaporan}</span>
                                                    <span className="text-xs text-gray-400">Sales Date: {new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </td>
                                                <td className="py-4 px-6 text-right text-xs font-mono text-gray-500">
                                                    <div>Jual: {formatRupiah(lap.nominal_jual)}</div>
                                                    <div>Setor: {formatRupiah(lap.nominal_setoran)}</div>
                                                    <div>Potong: {formatRupiah(lap.potongan)}</div>
                                                </td>
                                                <td className="py-4 px-6 text-right text-xs font-mono text-primary-700">
                                                    {item.jenis_pelaporan_baru === 'HAPUS_DATA' ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-sm">delete_forever</span> Permohonan Hapus
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                Jual: <strong>{formatRupiah(item.nominal_jual_baru)}</strong>
                                                                {deltaJual !== 0 && (
                                                                    <span className={`text-[10px] ml-1 ${deltaJual > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        ({deltaJual > 0 ? '+' : ''}{formatRupiah(deltaJual)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                Setor: <strong>{formatRupiah(item.nominal_setoran_baru)}</strong>
                                                                {deltaSetor !== 0 && (
                                                                    <span className={`text-[10px] ml-1 ${deltaSetor > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        ({deltaSetor > 0 ? '+' : ''}{formatRupiah(deltaSetor)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                Potong: <strong>{formatRupiah(item.potongan_baru)}</strong>
                                                                {deltaPotong !== 0 && (
                                                                    <span className={`text-[10px] ml-1 ${deltaPotong > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        ({deltaPotong > 0 ? '+' : ''}{formatRupiah(deltaPotong)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="py-4 px-6 max-w-xs break-words" title={item.penjelasan_koreksi}>
                                                    {item.penjelasan_koreksi}
                                                </td>
                                                <td className="py-4 px-6 text-center">
                                                    {item.status === 'Pending' ? (
                                                        <div className="flex justify-center gap-1.5">
                                                            <button
                                                                onClick={() => handleApprove(item)}
                                                                disabled={actionLoadingId !== ''}
                                                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-0.5"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">check</span> Setuju
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(item.id)}
                                                                disabled={actionLoadingId !== ''}
                                                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-0.5"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">close</span> Tolak
                                                            </button>
                                                        </div>
                                                    ) : item.status === 'Approved' ? (
                                                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200 shadow-sm">Disetujui</span>
                                                    ) : (
                                                        <div className="relative group inline-block">
                                                            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200 shadow-sm cursor-help inline-flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-xs">info</span> Ditolak
                                                            </span>
                                                            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-xl border border-gray-700 text-left animate-fade-in">
                                                                <p className="font-bold text-red-400 mb-1 flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-xs">cancel</span> Alasan Penolakan:
                                                                </p>
                                                                <p className="text-gray-200 italic leading-relaxed">"{item.catatan_admin || item.catatan || 'Tidak ada catatan spesifik.'}"</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </UserLayout>
    );
}