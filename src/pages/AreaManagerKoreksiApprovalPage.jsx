import { useState, useEffect, useRef } from 'react';
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
    const [rejectModalItem, setRejectModalItem] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);
    const [statusFilter, setStatusFilter] = useState('Pending'); // 'All' | 'Pending' | 'Approved' | 'Rejected'
    const fetchCounter = useRef(0); // Guard against race conditions when rapidly switching tabs

    useEffect(() => {
        if (profile?.id) {
            fetchRequests();
        } else {
            setLoading(false);
        }
    }, [profile?.id, statusFilter]);

    const fetchRequests = async () => {
        if (!profile?.id) {
            setLoading(false);
            return;
        }
        const currentFetchId = ++fetchCounter.current;
        setLoading(true);
        setError('');
        try {
            // 1. Fetch profiles of outlets in this AM's area
            const { data: outletData } = await supabase
                .from('profiles')
                .select('id')
                .eq('area_manager', profile.username);

            const outletIds = (outletData || []).map(o => o.id);

            if (outletIds.length === 0) {
                setRequests([]);
                setLoading(false);
                return;
            }

            // 2. Fetch all koreksi_requests belonging to these outlets
            let query = supabase
                .from('koreksi_requests')
                .select(`
                    id,
                    nominal_jual_baru,
                    nominal_setoran_baru,
                    potongan_baru,
                    bca_debit_baru,
                    bca_kredit_baru,
                    bca_qris_baru,
                    bri_debit_baru,
                    bri_kredit_baru,
                    bri_qris_baru,
                    bank_transfer_baru,
                    online_halodoc_baru,
                    online_tiktok_baru,
                    online_tokopedia_baru,
                    total_online_baru,
                    penjelasan_koreksi,
                    status,
                    created_at,
                    processed_at,
                    requested_by,
                    jenis_pelaporan_baru,
                    tanggal_jual_baru,
                    tanggal_setor_baru,
                    catatan_admin,
                    bukti_urls_baru,
                    profiles!koreksi_requests_requested_by_fkey (
                        id,
                        username,
                        role,
                        area_manager
                    ),
                    laporan!inner (
                        id,
                        user_id,
                        tanggal_jual,
                        jenis_pelaporan,
                        nominal_jual,
                        nominal_setoran,
                        potongan,
                        bca_debit,
                        bca_kredit,
                        bca_qris,
                        bri_debit,
                        bri_kredit,
                        bri_qris,
                        bank_transfer,
                        total_non_tunai,
                        online_halodoc,
                        online_tiktok,
                        online_tokopedia,
                        total_online,
                        profiles:user_id (
                            username,
                            kode_toko
                        )
                    )
                `)
                .in('laporan.user_id', outletIds)
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
            ? 'Apakah Anda yakin menyetujui pengarsipan/penghapusan laporan ini? Laporan akan diarsipkan dan dikeluarkan dari perhitungan sales.'
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

            setSuccessMsg(isDelete ? 'Laporan berhasil diarsipkan dan dikeluarkan dari perhitungan sales.' : 'Koreksi laporan berhasil disetujui dan data laporan asli telah diperbarui.');
            fetchRequests();
        } catch (err) {
            setError('Gagal memproses persetujuan: ' + err.message);
        } finally {
            setActionLoadingId('');
        }
    };

    const handleOpenRejectModal = (item) => {
        setRejectModalItem(item);
        setRejectReason('');
    };

    const handleConfirmReject = async () => {
        if (!rejectModalItem || !rejectReason.trim()) return;
        setRejectSubmitting(true);
        setError('');
        setSuccessMsg('');

        try {
            const { data: success, error: rpcErr } = await supabase.rpc('reject_koreksi_request', {
                p_request_id: rejectModalItem.id,
                p_admin_id: profile.id,
                p_catatan: rejectReason.trim()
            });

            if (rpcErr) throw rpcErr;
            if (!success) throw new Error('Gagal menolak pengajuan. Pastikan status berstatus Pending.');

            setSuccessMsg('Pengajuan koreksi telah ditolak dan alasan penolakan disampaikan ke beranda toko.');
            setRejectModalItem(null);
            setRejectReason('');
            fetchRequests();
        } catch (err) {
            setError('Gagal menolak pengajuan: ' + err.message);
        } finally {
            setRejectSubmitting(false);
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
                                    <th className="py-3.5 px-6">Apotek & PIC Pemohon</th>
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

                                        const branchName = lap.profiles?.username || item.profiles?.username || '-';
                                        const isAMDirect = item.requested_by === profile?.id || item.profiles?.role === 'AreaManager';
                                        
                                        // Calculate differences
                                        const deltaJual = item.nominal_jual_baru - lap.nominal_jual;
                                        const deltaSetor = item.nominal_setoran_baru - lap.nominal_setoran;
                                        const deltaPotong = item.potongan_baru - lap.potongan;

                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50/50">
                                                <td className="py-4 px-6 font-mono text-xs text-gray-400">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-4 px-6">
                                                    <div className="font-bold text-gray-900">{branchName}</div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[11px] font-semibold text-gray-500">PIC: {item.profiles?.username || '-'}</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                                                            isAMDirect
                                                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                                : 'bg-gray-100 text-gray-700 border border-gray-200'
                                                        }`}>
                                                            {isAMDirect ? 'Koreksi Langsung AM' : 'Staf Toko'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <span className="font-semibold block">{lap.jenis_pelaporan}</span>
                                                    <span className="text-xs text-gray-400">Sales Date: {new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </td>
                                                {(() => {
                                                    const totalNonTunaiAsli = Number(lap.total_non_tunai || ((Number(lap.bca_debit || 0) + Number(lap.bca_kredit || 0) + Number(lap.bca_qris || 0) + Number(lap.bri_debit || 0) + Number(lap.bri_kredit || 0) + Number(lap.bri_qris || 0) + Number(lap.bank_transfer || 0))));
                                                    const totalNonTunaiBaru = (Number(item.bca_debit_baru || 0) + Number(item.bca_kredit_baru || 0) + Number(item.bca_qris_baru || 0) + Number(item.bri_debit_baru || 0) + Number(item.bri_kredit_baru || 0) + Number(item.bri_qris_baru || 0) + Number(item.bank_transfer_baru || 0));
                                                    const deltaNonTunai = totalNonTunaiBaru - totalNonTunaiAsli;

                                                    const nonTunaiDetailsBaru = [];
                                                    if (Number(item.bca_debit_baru || 0) > 0) nonTunaiDetailsBaru.push(`BCA Debit: ${formatRupiah(item.bca_debit_baru)}`);
                                                    if (Number(item.bca_kredit_baru || 0) > 0) nonTunaiDetailsBaru.push(`BCA Kredit: ${formatRupiah(item.bca_kredit_baru)}`);
                                                    if (Number(item.bca_qris_baru || 0) > 0) nonTunaiDetailsBaru.push(`BCA QRIS: ${formatRupiah(item.bca_qris_baru)}`);
                                                    if (Number(item.bri_debit_baru || 0) > 0) nonTunaiDetailsBaru.push(`BRI Debit: ${formatRupiah(item.bri_debit_baru)}`);
                                                    if (Number(item.bri_kredit_baru || 0) > 0) nonTunaiDetailsBaru.push(`BRI Kredit: ${formatRupiah(item.bri_kredit_baru)}`);
                                                    if (Number(item.bri_qris_baru || 0) > 0) nonTunaiDetailsBaru.push(`BRI QRIS: ${formatRupiah(item.bri_qris_baru)}`);
                                                    if (Number(item.bank_transfer_baru || 0) > 0) nonTunaiDetailsBaru.push(`Transfer: ${formatRupiah(item.bank_transfer_baru)}`);

                                                    const totalOnlineAsli = Number(lap.total_online || ((Number(lap.online_halodoc || 0) + Number(lap.online_tiktok || 0) + Number(lap.online_tokopedia || 0))));
                                                    const totalOnlineBaru = item.total_online_baru !== null && item.total_online_baru !== undefined ? Number(item.total_online_baru) : (Number(item.online_halodoc_baru || 0) + Number(item.online_tiktok_baru || 0) + Number(item.online_tokopedia_baru || 0));
                                                    const deltaOnline = totalOnlineBaru - totalOnlineAsli;

                                                    const onlineDetailsBaru = [];
                                                    if (item.online_halodoc_baru !== null && item.online_halodoc_baru !== undefined && Number(item.online_halodoc_baru) > 0) onlineDetailsBaru.push(`Halodoc: ${formatRupiah(item.online_halodoc_baru)}`);
                                                    if (item.online_tiktok_baru !== null && item.online_tiktok_baru !== undefined && Number(item.online_tiktok_baru) > 0) onlineDetailsBaru.push(`TikTok: ${formatRupiah(item.online_tiktok_baru)}`);
                                                    if (item.online_tokopedia_baru !== null && item.online_tokopedia_baru !== undefined && Number(item.online_tokopedia_baru) > 0) onlineDetailsBaru.push(`Tokopedia: ${formatRupiah(item.online_tokopedia_baru)}`);

                                                    return (
                                                        <>
                                                            <td className="py-4 px-6 text-right text-xs font-mono text-gray-500">
                                                                <div>Jual: {formatRupiah(lap.nominal_jual)}</div>
                                                                <div>Setor: {formatRupiah(lap.nominal_setoran)}</div>
                                                                <div>Potong: {formatRupiah(lap.potongan)}</div>
                                                                {totalNonTunaiAsli > 0 && (
                                                                    <div className="text-gray-500 font-semibold mt-0.5">Non-Tunai: {formatRupiah(totalNonTunaiAsli)}</div>
                                                                )}
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
                                                                        {(totalNonTunaiBaru > 0 || totalNonTunaiAsli > 0) && (
                                                                            <div className="mt-1.5 pt-1.5 border-t border-gray-200/60 font-bold text-blue-900">
                                                                                Non-Tunai: <strong>{formatRupiah(totalNonTunaiBaru)}</strong>
                                                                                {deltaNonTunai !== 0 && (
                                                                                    <span className={`text-[10px] ml-1 ${deltaNonTunai > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                        ({deltaNonTunai > 0 ? '+' : ''}{formatRupiah(deltaNonTunai)})
                                                                                    </span>
                                                                                )}
                                                                                {nonTunaiDetailsBaru.map((det, dIdx) => (
                                                                                    <div key={dIdx} className="text-[10px] text-blue-600 font-normal">{det}</div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        {(totalOnlineBaru > 0 || totalOnlineAsli > 0) && (
                                                                            <div className="mt-1.5 pt-1.5 border-t border-gray-200/60 font-bold text-purple-900">
                                                                                Online: <strong>{formatRupiah(totalOnlineBaru)}</strong>
                                                                                {deltaOnline !== 0 && (
                                                                                    <span className={`text-[10px] ml-1 ${deltaOnline > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                        ({deltaOnline > 0 ? '+' : ''}{formatRupiah(deltaOnline)})
                                                                                    </span>
                                                                                )}
                                                                                {onlineDetailsBaru.map((det, dIdx) => (
                                                                                    <div key={dIdx} className="text-[10px] text-purple-600 font-normal">{det}</div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </td>
                                                        </>
                                                    );
                                                })()}
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
                                                                onClick={() => handleOpenRejectModal(item)}
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
        
            {/* REJECTION REASON MODAL */}
            {rejectModalItem && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scale-up border border-gray-100">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <h3 className="text-base font-bold text-red-700 flex items-center gap-2">
                                <span className="material-symbols-outlined text-xl">cancel</span> Tolak Pengajuan Koreksi
                            </h3>
                            <button onClick={() => setRejectModalItem(null)} className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="p-3 bg-red-50/60 rounded-xl border border-red-100 text-xs text-red-900">
                                <p className="font-bold">Apotek: {rejectModalItem.profiles?.username || '-'}</p>
                                <p className="text-[11px] text-red-700 mt-0.5">Alasan penolakan ini wajib diisi dan akan muncul di Beranda Toko agar cabang dapat membuat pengajuan koreksi baru.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Alasan Penolakan <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    rows="3"
                                    required
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Contoh: Lampiran foto resi bank buram, mohon upload foto baru yang lebih jelas."
                                    className="w-full p-3 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-gray-50/50"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setRejectModalItem(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReject}
                                disabled={!rejectReason.trim() || rejectSubmitting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                            >
                                {rejectSubmitting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                        <span>Memproses...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">send</span>
                                        <span>Konfirmasi Penolakan</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </UserLayout>
    );
}