import { formatRupiah, formatDriveImageUrl } from '../lib/validators';
﻿import React, { useState, useEffect, useMemo } from 'react';
import UserLayout from '../components/UserLayout';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function TroubleshootingTokoPage() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [issues, setIssues] = useState([]);
    
    // Modal Response State
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [actionOutlet, setActionOutlet] = useState('');
    const [picOutlet, setPicOutlet] = useState('');
    const [buktiUrl, setBuktiUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (profile) fetchData();
    }, [profile]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setFetchError(null);

            const storeCode = profile.kode_toko || profile.username;

            const { data, error } = await supabase
                .from('finance_troubleshooting_issues')
                .select('*')
                .or(`user_id.eq.${user.id},kode_toko.eq.${storeCode}`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setIssues(data || []);
        } catch (err) {
            console.error('Gagal mengambil data troubleshooting audit bank:', err);
            setFetchError(err.message || 'Gagal memuat data dari server.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (issue) => {
        setSelectedIssue(issue);
        setActionOutlet(issue.action_outlet || '');
        setPicOutlet(issue.pic_outlet || '');
        setBuktiUrl(issue.bukti_url || '');
    };

    const handleCloseModal = () => {
        setSelectedIssue(null);
        setActionOutlet('');
        setPicOutlet('');
        setBuktiUrl('');
    };

    const handleSubmitResponse = async (e) => {
        e.preventDefault();
        if (!selectedIssue) return;
        if (!actionOutlet.trim() || !picOutlet.trim()) {
            alert('Penjelasan action dan nama PIC Outlet wajib diisi.');
            return;
        }

        try {
            setSubmitting(true);
            const nowIso = new Date().toISOString();

            // 1. Update issue record to PENDING_FINANCE_APPROVAL
            const { error: updateErr } = await supabase
                .from('finance_troubleshooting_issues')
                .update({
                    action_outlet: actionOutlet.trim(),
                    pic_outlet: picOutlet.trim(),
                    bukti_url: buktiUrl.trim() || null,
                    status: 'PENDING_FINANCE_APPROVAL',
                    responded_at: nowIso,
                    updated_at: nowIso
                })
                .eq('id', selectedIssue.id);

            if (updateErr) throw updateErr;

            // 2. Insert into history
            await supabase.from('finance_troubleshooting_history').insert({
                issue_id: selectedIssue.id,
                actor_id: user.id,
                action_type: 'SUBMITTED_BY_STORE',
                action_outlet: actionOutlet.trim(),
                pic_outlet: picOutlet.trim(),
                bukti_url: buktiUrl.trim() || null,
                notes: 'Toko mengirimkan tanggapan / bukti audit.'
            });

            alert('Tanggapan berhasil dikirim ke Tim Finance.');
            handleCloseModal();
            fetchData();
        } catch (err) {
            console.error('Gagal mengirim tanggapan:', err);
            alert(err.message || 'Gagal menyimpan tanggapan.');
        } finally {
            setSubmitting(false);
        }
    };

    const computeSLAInfo = (slaDeadlineStr, status) => {
        if (status === 'APPROVED' || status === 'CLOSED') {
            return { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' };
        }

        const now = new Date();
        const deadline = new Date(slaDeadlineStr);
        const diffMs = deadline.getTime() - now.getTime();

        if (diffMs > 0) {
            const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
            const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return { label: `SLA: Sisa ${hoursLeft}j ${minsLeft}m`, cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
        } else {
            const hoursOverdue = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
            return { label: `Overdue SLA (+${hoursOverdue}j)`, cls: 'bg-red-100 text-red-800 border border-red-300 font-extrabold animate-pulse' };
        }
    };

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'PENDING_STORE_RESPONSE':
                return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-md">Menunggu Tanggapan Toko</span>;
            case 'PENDING_FINANCE_APPROVAL':
                return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">Menunggu Persetujuan Finance</span>;
            case 'APPROVED':
            case 'CLOSED':
                return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-md">Disetujui / Selesai</span>;
            case 'REJECTED':
                return <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-md">Ditolak Finance (Revisi)</span>;
            default:
                return <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2.5 py-1 rounded-md">{status}</span>;
        }
    };

    const formatRupiah = (val) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);
    };

    const formatDate = (dStr) => {
        if (!dStr) return '-';
        const [y, m, d] = dStr.split('T')[0].split('-');
        return `${d}/${m}/${y}`;
    };

    return (
        <UserLayout activePath="/user/troubleshooting">
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-600 text-3xl">troubleshoot</span>
                        Troubleshooting Audit Bank
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Daftar keluhan & selisih audit bank yang memerlukan tanggapan dari cabang (SLA 2 Hari Kerjasama).
                    </p>
                </div>

                {/* Main Content Table */}
                {loading ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center">
                        <span className="material-symbols-outlined text-amber-500 text-4xl animate-spin">sync</span>
                        <p className="text-sm font-semibold text-gray-500 mt-3">Mengambil daftar isu audit bank...</p>
                    </div>
                ) : fetchError ? (
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-center">
                        <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
                        <h3 className="text-base font-bold text-red-800 mt-2">Gagal Memuat Data</h3>
                        <p className="text-xs text-red-600 mt-1">{fetchError}</p>
                    </div>
                ) : issues.length === 0 ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center">
                        <span className="material-symbols-outlined text-emerald-500 text-5xl">check_circle</span>
                        <h3 className="text-lg font-bold text-gray-800 mt-3">Tidak Ada Isu Audit Bank</h3>
                        <p className="text-sm text-gray-500 mt-1">Toko Anda tidak memiliki keluhan atau selisih audit bank yang pending saat ini.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="px-5 py-3.5">Kategori Issue</th>
                                        <th className="px-5 py-3.5">Periode / Tgl Sales</th>
                                        <th className="px-5 py-3.5">Catatan Finance</th>
                                        <th className="px-5 py-3.5 text-right">Nominal Selisih</th>
                                        <th className="px-5 py-3.5">Batas SLA</th>
                                        <th className="px-5 py-3.5">Status</th>
                                        <th className="px-5 py-3.5 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {issues.map((item) => {
                                        const slaInfo = computeSLAInfo(item.sla_deadline, item.status);
                                        return (
                                            <tr key={item.id} className="hover:bg-amber-50/20 transition-colors">
                                                <td className="px-5 py-4">
                                                    <span className="font-bold text-gray-900 block">{item.kategori_issue}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">{item.kode_toko}</span>
                                                </td>
                                                <td className="px-5 py-4 text-xs text-gray-700">
                                                    <div><span className="font-semibold">Periode:</span> {item.periode_minggu || '-'}</div>
                                                    <div><span className="font-semibold">Sales:</span> {formatDate(item.tanggal_sales)}</div>
                                                </td>
                                                <td className="px-5 py-4 text-xs text-gray-600 max-w-xs">
                                                    <p className="line-clamp-2">{item.keterangan_finance || '-'}</p>
                                                    {item.reject_notes && (
                                                        <div className="mt-1 p-1.5 bg-red-50 text-red-700 rounded text-[11px]">
                                                            <strong>Alasan Rejection:</strong> {item.reject_notes}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-right font-bold text-red-600">
                                                    {formatRupiah(item.nominal_selisih)}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${slaInfo.cls}`}>
                                                        {slaInfo.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">{renderStatusBadge(item.status)}</td>
                                                <td className="px-5 py-4 text-center">
                                                    <button
                                                        onClick={() => handleOpenModal(item)}
                                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                                                    >
                                                        {item.status === 'REJECTED' ? 'Revisi Tanggapan' : item.status === 'PENDING_STORE_RESPONSE' ? 'Isi Tanggapan' : 'Lihat Detail'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Response Modal */}
                {selectedIssue && (
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600">edit_note</span>
                                    Tanggapan Audit Bank
                                </h3>
                                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">&times;</button>
                            </div>

                            <div className="bg-amber-50 p-3 rounded-xl text-xs text-amber-900 space-y-1">
                                <div><span className="font-bold">Kategori:</span> {selectedIssue.kategori_issue}</div>
                                <div><span className="font-bold">Nominal Selisih:</span> {formatRupiah(selectedIssue.nominal_selisih)}</div>
                                <div><span className="font-bold">Penjelasan Finance:</span> {selectedIssue.keterangan_finance || '-'}</div>
                                {selectedIssue.reject_notes && (
                                    <div className="text-red-700 pt-1 border-t border-amber-200">
                                        <span className="font-bold">Catatan Reject Finance:</span> {selectedIssue.reject_notes}
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleSubmitResponse} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Action / Penjelasan Toko <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        required
                                        placeholder="Jelaskan tindakan perbaikan atau kronologi selisih..."
                                        value={actionOutlet}
                                        onChange={(e) => setActionOutlet(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Nama PIC Outlet <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Nama staf yang bertanggung jawab"
                                        value={picOutlet}
                                        onChange={(e) => setPicOutlet(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Link Drive / Bukti Foto (URL)
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://drive.google.com/... atau tautan gambar"
                                        value={buktiUrl}
                                        onChange={(e) => setBuktiUrl(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 mb-2"
                                    />
                                    {buktiUrl && (
                                        <div className="p-2 bg-gray-50 rounded-xl border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Pratinjau Bukti Foto:</p>
                                            {buktiUrl.toLowerCase().includes('.pdf') ? (
                                                <div className="p-2 text-center text-xs text-red-600 font-bold bg-white rounded border">Dokumen PDF Terlampir</div>
                                            ) : (
                                                <div className="h-36 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border">
                                                    <img src={formatDriveImageUrl(buktiUrl)} alt="Preview Bukti" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 cursor-pointer"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                        {submitting ? 'Mengirim...' : 'Kirim Tanggapan ke Finance'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </UserLayout>
    );
}
