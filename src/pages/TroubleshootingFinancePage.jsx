import { formatRupiah, formatDriveImageUrl } from '../lib/validators';
﻿import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { parseTroubleshootingExcel, exportTroubleshootingToCSV } from '../utils/parseTroubleshootingExcel';

const CATEGORY_LIST = [
    'TIDAK SETOR',
    'KURANG SETOR RECEH',
    'LEBIH SETOR',
    'HARI SETOR',
    'TRANSFER BANK',
    'KURANG GESEK',
    'LEBIH GESEK',
    'BELUM SETTLEMENT',
    'SALAH INPUT SALES',
    'TUNAI'
];

export default function TroubleshootingFinancePage() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [rawIssues, setRawIssues] = useState([]);
    const [profilesList, setProfilesList] = useState([]);
    const [profilesMap, setProfilesMap] = useState({});
    const [picOptions, setPicOptions] = useState([]);

    const [selectedPIC, setSelectedPIC] = useState('ALL');
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const [showManualModal, setShowManualModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [reviewIssue, setReviewIssue] = useState(null);
    const [rejectNotes, setRejectNotes] = useState('');
    const [submittingAction, setSubmittingAction] = useState(false);

    const [manualForm, setManualForm] = useState({
        kode_toko: '',
        kategori_issue: 'TIDAK SETOR',
        pic_finance: profile?.username || 'Viona',
        periode_minggu: '',
        tanggal_sales: '',
        nominal_selisih: '',
        keterangan_finance: ''
    });

    const [uploadFile, setUploadFile] = useState(null);
    const [parsedPreview, setParsedPreview] = useState([]);
    const [uploadingExcel, setUploadingExcel] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setFetchError(null);

            const { data: profData, error: profErr } = await supabase
                .from('profiles')
                .select('id, username, kode_toko, area_manager')
                .eq('role', 'User');
            if (profErr) throw profErr;

            const pMap = {};
            (profData || []).forEach((p) => {
                if (p.kode_toko) pMap[p.kode_toko.toString().trim().toLowerCase()] = p;
                if (p.username) pMap[p.username.toString().trim().toLowerCase()] = p;
            });

            setProfilesList(profData || []);
            setProfilesMap(pMap);

            const { data: issueData, error: issueErr } = await supabase
                .from('finance_troubleshooting_issues')
                .select('*')
                .order('created_at', { ascending: false });

            if (issueErr) throw issueErr;

            const issuesArr = issueData || [];
            setRawIssues(issuesArr);

            const pics = new Set();
            issuesArr.forEach((i) => {
                if (i.pic_finance) pics.add(i.pic_finance);
            });
            setPicOptions(Array.from(pics).sort());
        } catch (err) {
            console.error('Gagal mengambil data troubleshooting audit bank:', err);
            setFetchError(err.message || 'Gagal memuat data dari server.');
        } finally {
            setLoading(false);
        }
    };

    const filteredIssues = useMemo(() => {
        return rawIssues.filter((item) => {
            const matchesPIC = selectedPIC === 'ALL' || item.pic_finance === selectedPIC;
            const matchesCategory = selectedCategory === 'ALL' || item.kategori_issue === selectedCategory;
            const matchesStatus = selectedStatus === 'ALL' || item.status === selectedStatus;
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                !searchQuery ||
                (item.kode_toko || '').toLowerCase().includes(q) ||
                (item.keterangan_finance || '').toLowerCase().includes(q) ||
                (item.pic_finance || '').toLowerCase().includes(q);
            return matchesPIC && matchesCategory && matchesStatus && matchesSearch;
        });
    }, [rawIssues, selectedPIC, selectedCategory, selectedStatus, searchQuery]);

    const stats = useMemo(() => {
        const total = filteredIssues.length;
        const pendingStore = filteredIssues.filter((i) => i.status === 'PENDING_STORE_RESPONSE').length;
        const pendingApproval = filteredIssues.filter((i) => i.status === 'PENDING_FINANCE_APPROVAL').length;
        const approved = filteredIssues.filter((i) => i.status === 'APPROVED' || i.status === 'CLOSED').length;
        const rejected = filteredIssues.filter((i) => i.status === 'REJECTED').length;

        const now = new Date();
        const overdueSLA = filteredIssues.filter(
            (i) => i.status === 'PENDING_STORE_RESPONSE' && i.sla_deadline && new Date(i.sla_deadline) < now
        ).length;

        return { total, pendingStore, pendingApproval, approved, rejected, overdueSLA };
    }, [filteredIssues]);

    const handleCreateManualIssue = async (e) => {
        e.preventDefault();
        if (!manualForm.kode_toko.trim()) {
            alert('Kode toko wajib diisi/dipilih.');
            return;
        }

        try {
            setSubmittingAction(true);
            const cleanCodeKey = manualForm.kode_toko.trim().toLowerCase();
            const matchedProfile = profilesMap[cleanCodeKey] || {};
            const slaDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

            const newRecord = {
                batch_id: 'MANUAL-' + Date.now(),
                uploaded_by: user?.id || null,
                pic_finance: manualForm.pic_finance.trim() || 'Finance',
                kategori_issue: manualForm.kategori_issue,
                periode_minggu: manualForm.periode_minggu.trim() || null,
                user_id: matchedProfile.id || null,
                kode_toko: manualForm.kode_toko.trim(),
                tanggal_sales: manualForm.tanggal_sales || null,
                keterangan_finance: manualForm.keterangan_finance.trim() || null,
                nominal_selisih: parseInt(manualForm.nominal_selisih || 0, 10),
                sla_deadline: slaDeadline,
                status: 'PENDING_STORE_RESPONSE',
            };

            const { data, error } = await supabase.from('finance_troubleshooting_issues').insert(newRecord).select().single();
            if (error) throw error;

            await supabase.from('finance_troubleshooting_history').insert({
                issue_id: data.id,
                actor_id: user?.id || null,
                action_type: 'MANUAL_CREATED',
                notes: 'Isu ditambahkan secara manual oleh ' + manualForm.pic_finance
            });

            alert('Issue baru berhasil ditambahkan.');
            setShowManualModal(false);
            setManualForm({
                kode_toko: '',
                kategori_issue: 'TIDAK SETOR',
                pic_finance: profile?.username || 'Viona',
                periode_minggu: '',
                tanggal_sales: '',
                nominal_selisih: '',
                keterangan_finance: ''
            });
            fetchData();
        } catch (err) {
            console.error('Gagal membuat issue manual:', err);
            alert(err.message || 'Gagal menyimpan issue.');
        } finally {
            setSubmittingAction(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadFile(file);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const buffer = evt.target.result;
                const parsed = parseTroubleshootingExcel(buffer, profilesMap);
                setParsedPreview(parsed);
            } catch (err) {
                console.error('Gagal membaca file Excel:', err);
                alert('Gagal membaca file Excel. Pastikan format template sesuai.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleExecuteExcelUpload = async () => {
        if (!parsedPreview.length) {
            alert('Tidak ada data isu valid yang terbaca dari Excel.');
            return;
        }

        try {
            setUploadingExcel(true);
            const recordsToInsert = parsedPreview.map((item) => ({
                ...item,
                uploaded_by: user?.id || null,
                pic_finance: profile?.username || 'Finance',
            }));

            const { error } = await supabase.from('finance_troubleshooting_issues').insert(recordsToInsert);
            if (error) throw error;

            alert('Berhasil mengunggah ' + parsedPreview.length + ' baris isu audit bank.');
            setShowUploadModal(false);
            setUploadFile(null);
            setParsedPreview([]);
            fetchData();
        } catch (err) {
            console.error('Gagal mengunggah Excel:', err);
            alert(err.message || 'Gagal mengunggah data Excel.');
        } finally {
            setUploadingExcel(false);
        }
    };

    const handleReviewAction = async (actionType) => {
        if (!reviewIssue) return;

        try {
            setSubmittingAction(true);
            const nowIso = new Date().toISOString();

            if (actionType === 'APPROVE') {
                const { error: appErr } = await supabase
                    .from('finance_troubleshooting_issues')
                    .update({
                        status: 'APPROVED',
                        approved_by: user?.id || null,
                        approved_at: nowIso,
                        updated_at: nowIso
                    })
                    .eq('id', reviewIssue.id);
                if (appErr) throw appErr;

                await supabase.from('finance_troubleshooting_history').insert({
                    issue_id: reviewIssue.id,
                    actor_id: user?.id || null,
                    action_type: 'APPROVED_BY_FINANCE',
                    notes: 'Finance menyetujui tanggapan / klarifikasi toko.'
                });

                alert('Issue berhasil disetujui (Approved).');
            } else if (actionType === 'REJECT') {
                if (!rejectNotes.trim()) {
                    alert('Catatan alasan reject wajib diisi.');
                    setSubmittingAction(false);
                    return;
                }

                const { error: rejErr } = await supabase
                    .from('finance_troubleshooting_issues')
                    .update({
                        status: 'REJECTED',
                        reject_notes: rejectNotes.trim(),
                        updated_at: nowIso
                    })
                    .eq('id', reviewIssue.id);
                if (rejErr) throw rejErr;

                await supabase.from('finance_troubleshooting_history').insert({
                    issue_id: reviewIssue.id,
                    actor_id: user?.id || null,
                    action_type: 'REJECTED_BY_FINANCE',
                    notes: 'Finance menolak tanggapan toko dengan catatan: ' + rejectNotes.trim()
                });

                alert('Issue ditolak (Rejected) dan dikembalikan ke toko untuk direvisi.');
            }

            setReviewIssue(null);
            setRejectNotes('');
            fetchData();
        } catch (err) {
            console.error('Gagal memproses review issue:', err);
            alert(err.message || 'Gagal memproses aksi.');
        } finally {
            setSubmittingAction(false);
        }
    };

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'PENDING_STORE_RESPONSE':
                return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-md">Pending Store</span>;
            case 'PENDING_FINANCE_APPROVAL':
                return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">Pending Approval</span>;
            case 'APPROVED':
            case 'CLOSED':
                return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-md">Approved / Closed</span>;
            case 'REJECTED':
                return <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-md">Rejected</span>;
            default:
                return <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2.5 py-1 rounded-md">{status}</span>;
        }
    };

    const formatRupiah = (val) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);
    };

    const formatDate = (dStr) => {
        if (!dStr) return '-';
        const parts = dStr.split('T')[0].split('-');
        if (parts.length < 3) return dStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    return (
        <AdminLayout activePath="/admin/troubleshooting">
            <div className="space-y-6">
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-600 text-3xl">troubleshoot</span>
                            Audit & Troubleshooting Bank
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Kelola keluhan, selisih setoran bank, dan approval tanggapan toko terpusat dengan SLA 2 hari.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setShowManualModal(true)}
                            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Tambah Issue Manual
                        </button>
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            Upload Excel
                        </button>
                        <button
                            onClick={() => exportTroubleshootingToCSV(filteredIssues)}
                            disabled={!filteredIssues.length}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Export Report (CSV)
                        </button>
                    </div>
                </div>

                {/* Summary Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                        <p className="text-xs font-bold text-gray-500 uppercase">Total Issue</p>
                        <h3 className="text-xl font-extrabold text-gray-900 mt-1">{stats.total}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                        <p className="text-xs font-bold text-amber-600 uppercase">Pending Store</p>
                        <h3 className="text-xl font-extrabold text-amber-700 mt-1">{stats.pendingStore}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                        <p className="text-xs font-bold text-blue-600 uppercase">Pending Approval</p>
                        <h3 className="text-xl font-extrabold text-blue-700 mt-1">{stats.pendingApproval}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                        <p className="text-xs font-bold text-emerald-600 uppercase">Approved / Closed</p>
                        <h3 className="text-xl font-extrabold text-emerald-700 mt-1">{stats.approved}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                        <p className="text-xs font-bold text-red-600 uppercase">Overdue SLA</p>
                        <h3 className="text-xl font-extrabold text-red-700 mt-1">{stats.overdueSLA}</h3>
                    </div>
                </div>

                {/* Control Filters Bar */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-2 text-gray-400 text-sm">search</span>
                            <input
                                type="text"
                                placeholder="Cari kode toko / ket..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs w-48 focus:ring-2 focus:ring-amber-500"
                            />
                        </div>

                        {/* Filter PIC Finance */}
                        <select
                            value={selectedPIC}
                            onChange={(e) => setSelectedPIC(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white"
                        >
                            <option value="ALL">Semua PIC Finance</option>
                            {picOptions.map((pic) => (
                                <option key={pic} value={pic}>{pic}</option>
                            ))}
                        </select>

                        {/* Filter Category */}
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white"
                        >
                            <option value="ALL">Semua Kategori</option>
                            {CATEGORY_LIST.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>

                        {/* Filter Status */}
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white"
                        >
                            <option value="ALL">Semua Status</option>
                            <option value="PENDING_STORE_RESPONSE">Pending Store</option>
                            <option value="PENDING_FINANCE_APPROVAL">Pending Approval</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                    </div>

                    <div className="text-xs font-semibold text-gray-500">
                        Menampilkan <span className="font-bold text-gray-900">{filteredIssues.length}</span> baris
                    </div>
                </div>

                {/* Table Area */}
                {loading ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center">
                        <span className="material-symbols-outlined text-amber-500 text-4xl animate-spin">sync</span>
                        <p className="text-sm font-semibold text-gray-500 mt-3">Mengambil data troubleshooting...</p>
                    </div>
                ) : fetchError ? (
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-center">
                        <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
                        <h3 className="text-base font-bold text-red-800 mt-2">Gagal Memuat Data</h3>
                        <p className="text-xs text-red-600 mt-1">{fetchError}</p>
                    </div>
                ) : filteredIssues.length === 0 ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center">
                        <span className="material-symbols-outlined text-emerald-500 text-5xl">check_circle</span>
                        <h3 className="text-lg font-bold text-gray-800 mt-3">Tidak Ada Data Issue</h3>
                        <p className="text-sm text-gray-500 mt-1">Tidak ada data isu audit bank yang sesuai dengan filter saat ini.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="px-5 py-3.5">Kode Toko / PIC</th>
                                        <th className="px-5 py-3.5">Kategori</th>
                                        <th className="px-5 py-3.5">Periode / Tgl Sales</th>
                                        <th className="px-5 py-3.5">Penjelasan Finance</th>
                                        <th className="px-5 py-3.5 text-right">Nominal Selisih</th>
                                        <th className="px-5 py-3.5">Status</th>
                                        <th className="px-5 py-3.5 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredIssues.map((item) => (
                                        <tr key={item.id} className="hover:bg-amber-50/20 transition-colors">
                                            <td className="px-5 py-4">
                                                <span className="font-bold text-gray-900 block">{item.kode_toko}</span>
                                                <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">PIC: {item.pic_finance || 'Finance'}</span>
                                            </td>
                                            <td className="px-5 py-4 font-semibold text-xs text-gray-800">{item.kategori_issue}</td>
                                            <td className="px-5 py-4 text-xs text-gray-700">
                                                <div><span className="font-semibold">Periode:</span> {item.periode_minggu || '-'}</div>
                                                <div><span className="font-semibold">Sales:</span> {formatDate(item.tanggal_sales)}</div>
                                            </td>
                                            <td className="px-5 py-4 text-xs text-gray-600 max-w-xs">
                                                <p className="line-clamp-2">{item.keterangan_finance || '-'}</p>
                                            </td>
                                            <td className="px-5 py-4 text-right font-bold text-gray-900">
                                                {formatRupiah(item.nominal_selisih)}
                                            </td>
                                            <td className="px-5 py-4">{renderStatusBadge(item.status)}</td>
                                            <td className="px-5 py-4 text-center">
                                                <button
                                                    onClick={() => setReviewIssue(item)}
                                                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                                                >
                                                    {item.status === 'PENDING_FINANCE_APPROVAL' ? 'Review & Approve' : 'Detail'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Modal: Tambah Issue Manual */}
                {showManualModal && (
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600">add_task</span>
                                    Tambah Issue Audit Manual
                                </h3>
                                <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">&times;</button>
                            </div>

                            <form onSubmit={handleCreateManualIssue} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Kode Toko (7 Digit) <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Contoh: BTTSDL1"
                                        value={manualForm.kode_toko}
                                        onChange={(e) => setManualForm({ ...manualForm, kode_toko: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Kategori Issue</label>
                                        <select
                                            value={manualForm.kategori_issue}
                                            onChange={(e) => setManualForm({ ...manualForm, kategori_issue: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                                        >
                                            {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">PIC Finance</label>
                                        <input
                                            type="text"
                                            value={manualForm.pic_finance}
                                            onChange={(e) => setManualForm({ ...manualForm, pic_finance: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Periode Minggu</label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: 1-8 JAN"
                                            value={manualForm.periode_minggu}
                                            onChange={(e) => setManualForm({ ...manualForm, periode_minggu: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal Sales</label>
                                        <input
                                            type="date"
                                            value={manualForm.tanggal_sales}
                                            onChange={(e) => setManualForm({ ...manualForm, tanggal_sales: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Nominal Selisih (Rp)</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={manualForm.nominal_selisih}
                                        onChange={(e) => setManualForm({ ...manualForm, nominal_selisih: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Keterangan / Penjelasan Audit Finance</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Penjelasan selisih bank..."
                                        value={manualForm.keterangan_finance}
                                        onChange={(e) => setManualForm({ ...manualForm, keterangan_finance: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualModal(false)}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 cursor-pointer"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingAction}
                                        className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                        {submittingAction ? 'Simpan...' : 'Simpan Issue'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal: Upload Excel (Templat / Mass Update) */}
                {showUploadModal && (
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-600">upload_file</span>
                                    Upload Rekap Issue Excel
                                </h3>
                                <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">&times;</button>
                            </div>

                            <p className="text-xs text-gray-500">
                                Pilih berkas Excel templat Lusi (memuat sheet <code className="bg-gray-100 px-1 font-bold text-gray-800">TIDAK SETOR</code>, <code className="bg-gray-100 px-1 font-bold text-gray-800">KURANG GESEK</code>, dll).
                            </p>

                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileSelect}
                                className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                            />

                            {parsedPreview.length > 0 && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold">
                                    ✓ Terbaca <span className="font-bold text-blue-700">{parsedPreview.length}</span> baris isu valid dari Excel.
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadModal(false)}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleExecuteExcelUpload}
                                    disabled={!parsedPreview.length || uploadingExcel}
                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                    {uploadingExcel ? 'Mengunggah...' : `Unggah ${parsedPreview.length} Issue`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Review & Approval */}
                {reviewIssue && (
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600">fact_check</span>
                                    Review Issue & Tanggapan Toko
                                </h3>
                                <button onClick={() => setReviewIssue(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">&times;</button>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-1.5 border border-gray-200">
                                <div className="flex justify-between"><span className="font-bold text-gray-600">Kode Toko:</span> <span className="font-extrabold text-gray-900">{reviewIssue.kode_toko}</span></div>
                                <div className="flex justify-between"><span className="font-bold text-gray-600">Kategori Issue:</span> <span className="font-bold text-amber-700">{reviewIssue.kategori_issue}</span></div>
                                <div className="flex justify-between"><span className="font-bold text-gray-600">Nominal Selisih:</span> <span className="font-extrabold text-red-600">{formatRupiah(reviewIssue.nominal_selisih)}</span></div>
                                <div><span className="font-bold text-gray-600">Penjelasan Audit Finance:</span> <p className="mt-0.5 text-gray-800">{reviewIssue.keterangan_finance || '-'}</p></div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-xl text-xs space-y-2 border border-blue-200">
                                <h4 className="font-bold text-blue-900 text-sm">Tanggapan Dari Outlet:</h4>
                                <div><span className="font-bold text-blue-800">Action / Penjelasan:</span> <p className="mt-0.5 text-gray-800">{reviewIssue.action_outlet || '(Belum ada tanggapan)'}</p></div>
                                <div><span className="font-bold text-blue-800">PIC Outlet:</span> {reviewIssue.pic_outlet || '-'}</div>
                                {reviewIssue.bukti_url && (
                                    <div className="pt-2 border-t border-blue-100 space-y-2">
                                        <span className="font-bold text-blue-800 block text-xs">Pratinjau Bukti Upload Cabang:</span>
                                        {typeof reviewIssue.bukti_url === 'string' && reviewIssue.bukti_url.toLowerCase().includes('.pdf') ? (
                                            <div className="p-3 text-center bg-white rounded-lg border border-blue-200">
                                                <span className="material-symbols-outlined text-3xl text-red-500 mb-1">picture_as_pdf</span>
                                                <p className="text-xs font-bold text-gray-700">Dokumen PDF Terlampir</p>
                                            </div>
                                        ) : (
                                            <div className="relative h-44 bg-gray-100 rounded-xl overflow-hidden border border-blue-200 shadow-sm flex items-center justify-center">
                                                <img src={formatDriveImageUrl(reviewIssue.bukti_url)} alt="Bukti Respon" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <a href={reviewIssue.bukti_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-bold bg-white px-3 py-1.5 rounded-lg border border-blue-300 shadow-sm">
                                            <span className="material-symbols-outlined text-sm">open_in_new</span> Buka di Tab Baru
                                        </a>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Catatan Alasan Reject (Wajib diisi jika menolak)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Tuliskan alasan penolakan untuk direvisi toko..."
                                    value={rejectNotes}
                                    onChange={(e) => setRejectNotes(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                                <button
                                    onClick={() => handleReviewAction('REJECT')}
                                    disabled={submittingAction}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    Reject (Minta Revisi)
                                </button>
                                <button
                                    onClick={() => handleReviewAction('APPROVE')}
                                    disabled={submittingAction}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    Approve & Selesai
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
