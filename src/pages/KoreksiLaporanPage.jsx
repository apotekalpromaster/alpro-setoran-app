import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah, parseRupiah } from '../lib/validators';
import { uploadToDrive } from '../services/driveService';
import UserLayout from '../components/UserLayout';

export default function KoreksiLaporanPage() {
    const { profile } = useAuth();
    const location = useLocation();
    const prefilledReport = location.state?.prefilledReport;
    
    // UI states
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // Form states
    const [selectedDate, setSelectedDate] = useState(() => {
        if (prefilledReport?.tanggal_jual) {
            return prefilledReport.tanggal_jual;
        }
        return new Date().toLocaleDateString('sv-SE');
    });
    const [reportsForDate, setReportsForDate] = useState([]);
    const [selectedReportId, setSelectedReportId] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    
    // Proposed values
    const [newJual, setNewJual] = useState('');
    const [newSetoran, setNewSetoran] = useState('');
    const [newPotongan, setNewPotongan] = useState('');
    const [newTanggalJual, setNewTanggalJual] = useState('');
    const [newTanggalSetor, setNewTanggalSetor] = useState('');
    const [newJenisPelaporan, setNewJenisPelaporan] = useState('');
    const [stagedFiles, setStagedFiles] = useState([null, null, null, null, null]);
    const [uploadStatus, setUploadStatus] = useState('');
    const [explanation, setExplanation] = useState('');
    const [requestType, setRequestType] = useState('edit'); // 'edit' | 'delete'
    
    // History state
    const [koreksiHistory, setKoreksiHistory] = useState([]);

    useEffect(() => {
        if (profile?.id) {
            fetchHistory();
        }
    }, [profile?.id]);

    useEffect(() => {
        if (selectedDate && profile?.id) {
            fetchReportsForDate();
        }
    }, [selectedDate, profile?.id]);

    useEffect(() => {
        if (selectedReportId) {
            const report = reportsForDate.find(r => r.id === selectedReportId);
            setSelectedReport(report || null);
            if (report) {
                setNewJual(report.nominal_jual.toString());
                setNewSetoran(report.nominal_setoran.toString());
                setNewPotongan(report.potongan.toString());
                setNewTanggalJual(report.tanggal_jual || '');
                setNewTanggalSetor(report.tanggal_setor || '');
                setNewJenisPelaporan(report.jenis_pelaporan || '');
                setStagedFiles([]);
            }
        } else {
            setSelectedReport(null);
            setNewJual('');
            setNewSetoran('');
            setNewPotongan('');
            setNewTanggalJual('');
            setNewTanggalSetor('');
            setNewJenisPelaporan('');
            setStagedFiles([]);
        }
    }, [selectedReportId, reportsForDate]);

    const fetchReportsForDate = async () => {
        setError('');
        setReportsForDate([]);
        setSelectedReportId('');
        try {
            const { data, error: err } = await supabase
                .from('laporan')
                .select('id, tanggal_jual, jenis_pelaporan, nominal_jual, nominal_setoran, potongan')
                .eq('user_id', profile.id)
                .eq('tanggal_jual', selectedDate);

            if (err) throw err;
            setReportsForDate(data || []);
            
            // Prefill selected report if it matches the prefilled id and is in the list
            if (prefilledReport && data && data.some(r => r.id === prefilledReport.id)) {
                setSelectedReportId(prefilledReport.id);
            }
        } catch (e) {
            setError('Gagal memuat laporan cabang: ' + e.message);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const { data, error: err } = await supabase
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
                    jenis_pelaporan_baru,
                    tanggal_jual_baru,
                    tanggal_setor_baru,
                    bukti_urls_baru,
                    laporan (
                        tanggal_jual,
                        jenis_pelaporan,
                        nominal_jual,
                        nominal_setoran,
                        potongan
                    )
                `)
                .eq('requested_by', profile.id)
                .order('created_at', { ascending: false });

            if (err) throw err;
            setKoreksiHistory(data || []);
        } catch (e) {
            console.error('Gagal memuat riwayat pengajuan:', e.message);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleFileSlotChange = (slotIdx, file) => {
        if (!file) return;
        const updated = [...stagedFiles];
        const isImage = file.type.startsWith('image/');
        const preview = isImage ? URL.createObjectURL(file) : null;
        updated[slotIdx] = { file, name: file.name, preview, isImage };
        setStagedFiles(updated);
    };

    const handleRemoveSlotFile = (slotIdx) => {
        const updated = [...stagedFiles];
        updated[slotIdx] = null;
        setStagedFiles(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedReport) {
            setError('Silakan pilih laporan yang ingin dikoreksi.');
            return;
        }
        if (!explanation.trim()) {
            setError(requestType === 'delete' ? 'Penjelasan alasan penghapusan wajib diisi.' : 'Penjelasan alasan koreksi wajib diisi.');
            return;
        }

        let jualVal = 0;
        let setoranVal = 0;
        let potonganVal = 0;
        let newBuktiUrls = null;

        if (requestType === 'edit') {
            jualVal = parseInt(newJual.toString().replace(/[^0-9-]/g, ''), 10);
            setoranVal = parseInt(newSetoran.toString().replace(/[^0-9-]/g, ''), 10);
            potonganVal = parseInt(newPotongan.toString().replace(/[^0-9-]/g, ''), 10);

            if (isNaN(jualVal) || isNaN(setoranVal) || isNaN(potonganVal)) {
                setError('Nominal harus berupa angka valid.');
                return;
            }
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            // 1. Upload staged files if any (only for edit)
            if (requestType === 'edit' && stagedFiles.filter(Boolean).length > 0) {
                newBuktiUrls = [];
                const filesToUpload = stagedFiles.filter(Boolean);
                let uploadCount = 1;
                for (let i = 0; i < stagedFiles.length; i++) {
                    const item = stagedFiles[i];
                    if (item && item.file) {
                        setUploadStatus(`Mengunggah bukti baru (${uploadCount}/${filesToUpload.length})...`);
                        const url = await uploadToDrive(item.file);
                        if (!url) throw new Error(`Gagal mengunggah file ${item.file.name}`);
                        newBuktiUrls.push(url);
                        uploadCount++;
                    }
                }
            }

            const { error: insertError } = await supabase
                .from('koreksi_requests')
                .insert({
                    laporan_id: selectedReport.id,
                    requested_by: profile.id,
                    nominal_jual_baru: jualVal,
                    nominal_setoran_baru: setoranVal,
                    potongan_baru: potonganVal,
                    tanggal_jual_baru: requestType === 'edit' ? (newTanggalJual || null) : null,
                    tanggal_setor_baru: requestType === 'edit' ? (newTanggalSetor || null) : null,
                    jenis_pelaporan_baru: requestType === 'edit' ? (newJenisPelaporan || null) : 'HAPUS_DATA',
                    bukti_urls_baru: newBuktiUrls,
                    penjelasan_koreksi: explanation.trim(),
                    status: 'Pending'
                });

            if (insertError) throw insertError;

            setSuccessMsg(requestType === 'delete' ? 'Permohonan hapus laporan berhasil dikirim dan menunggu persetujuan Area Manager.' : 'Permohonan koreksi berhasil dikirim dan menunggu persetujuan Area Manager.');
            setExplanation('');
            setSelectedReportId('');
            setSelectedReport(null);
            setRequestType('edit');
            fetchHistory();
        } catch (err) {
            setError('Gagal mengirim pengajuan: ' + err.message);
        } finally {
            setLoading(false);
            setUploadStatus('');
        }
    };

    return (
        <UserLayout title="Pengajuan Koreksi Laporan" activeRoute="/koreksi">
            <div className="max-w-screen-xl mx-auto space-y-6">
                
                {/* FORM & SELECTION */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                            <span className="material-symbols-outlined text-primary-500">edit_document</span>
                            <h3 className="text-base font-bold text-gray-800">Form Koreksi Laporan</h3>
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

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Pilih Tanggal Sales Asli</label>
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="form-input w-full py-2 px-3"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Pilih Laporan Terkirim</label>
                                    <select
                                        value={selectedReportId}
                                        onChange={(e) => setSelectedReportId(e.target.value)}
                                        className="form-input w-full py-2 px-3 bg-gray-50"
                                        disabled={reportsForDate.length === 0}
                                    >
                                        <option value="">
                                            {reportsForDate.length === 0 ? '-- Tidak Ada Laporan --' : '-- Pilih Laporan --'}
                                        </option>
                                        {reportsForDate.map(r => (
                                            <option key={r.id} value={r.id}>
                                                {r.jenis_pelaporan} ({formatRupiah(r.nominal_jual)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {selectedReport && (
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    {/* Tipe Pengajuan Selector */}
                                    <div className="flex bg-gray-100 p-1 rounded-lg max-w-sm">
                                        <button
                                            type="button"
                                            onClick={() => setRequestType('edit')}
                                            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${requestType === 'edit' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">edit_square</span>
                                            Koreksi Data Laporan
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRequestType('delete')}
                                            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${requestType === 'delete' ? 'bg-red-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                            Hapus Pelaporan
                                        </button>
                                    </div>

                                    {requestType === 'delete' ? (
                                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 flex items-start gap-3 my-4">
                                            <span className="material-symbols-outlined flex-shrink-0 mt-0.5">warning</span>
                                            <div>
                                                <p className="text-xs font-bold uppercase">Pemberitahuan Penghapusan Data</p>
                                                <p className="text-xs mt-1">
                                                    Anda mengajukan permohonan untuk <strong>MENGHAPUS secara permanen</strong> laporan {selectedReport.jenis_pelaporan} tanggal sales <strong>{new Date(selectedReport.tanggal_jual).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> dari sistem.
                                                </p>
                                                <p className="text-xs font-semibold mt-1">
                                                    Tindakan ini memerlukan persetujuan dari Area Manager Anda sebelum laporan dihapus.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                {/* CURRENT VALUES */}
                                                <div className="space-y-2">
                                                    <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">Data Saat Ini</span>
                                                    <div className="space-y-1 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-500">Nominal Jual:</span>
                                                            <span className="font-semibold">{formatRupiah(selectedReport.nominal_jual)}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-500">Nominal Setoran:</span>
                                                            <span className="font-semibold">{formatRupiah(selectedReport.nominal_setoran)}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-500">Potongan:</span>
                                                            <span className="font-semibold">{formatRupiah(selectedReport.potongan)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* PROPOSED VALUES */}
                                                <div className="space-y-3">
                                                    <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">Koreksi Nilai Baru</span>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-0.5">Nominal Jual Baru</label>
                                                        <input
                                                            type="text"
                                                            value={newJual}
                                                            onChange={(e) => setNewJual(e.target.value)}
                                                            className="form-input w-full py-1.5 px-3 text-sm font-semibold font-mono"
                                                            placeholder="Rp 0"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-0.5">Nominal Setoran Baru</label>
                                                        <input
                                                            type="text"
                                                            value={newSetoran}
                                                            onChange={(e) => setNewSetoran(e.target.value)}
                                                            className="form-input w-full py-1.5 px-3 text-sm font-semibold font-mono"
                                                            placeholder="Rp 0"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-0.5">Potongan Baru</label>
                                                        <input
                                                            type="text"
                                                            value={newPotongan}
                                                            onChange={(e) => setNewPotongan(e.target.value)}
                                                            className="form-input w-full py-1.5 px-3 text-sm font-semibold font-mono"
                                                            placeholder="Rp 0"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* KOREKSI METADATA LAPORAN */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tanggal Sales Baru</label>
                                                    <input
                                                        type="date"
                                                        value={newTanggalJual}
                                                        onChange={(e) => setNewTanggalJual(e.target.value)}
                                                        className="form-input w-full py-2 px-3 text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tanggal Setoran Baru</label>
                                                    <input
                                                        type="date"
                                                        value={newTanggalSetor}
                                                        onChange={(e) => setNewTanggalSetor(e.target.value)}
                                                        className="form-input w-full py-2 px-3 text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Jenis Pelaporan Baru</label>
                                                    <select
                                                        value={newJenisPelaporan}
                                                        onChange={(e) => setNewJenisPelaporan(e.target.value)}
                                                        className="form-input w-full py-2 px-3 text-sm bg-gray-50 text-gray-700 font-semibold"
                                                    >
                                                        <option value="Setoran Harian">Setoran Harian</option>
                                                        <option value="Setoran 3x Seminggu">Setoran 3x Seminggu</option>
                                                        <option value="Setoran Sales Dengan Potongan Penjualan">Setoran Sales Dengan Potongan Penjualan</option>
                                                        <option value="Setoran Uang Pecahan Kecil">Setoran Uang Pecahan Kecil</option>
                                                        <option value="Setoran Uang Lebih">Setoran Uang Lebih</option>
                                                        <option value="Pengembalian Petty Cash">Pengembalian Petty Cash</option>
                                                        <option value="Deposit Card Terblokir (Salah Input PIN 3x)">Deposit Card Terblokir (Salah Input PIN 3x)</option>
                                                        <option value="Deposit Card Tertelan Mesin ATM">Deposit Card Tertelan Mesin ATM</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* UPLOAD LAMPIRAN BARU */}
                                            <div className="pt-4 border-t border-gray-150 space-y-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <label className="text-sm font-bold text-gray-800">Ubah/Ganti Bukti Setoran Baru (Opsional)</label>
                                                    <p className="text-xs text-gray-500">Unggah bukti transfer/setoran baru pada slot yang ingin diubah/diganti (Maksimal 5 file, format gambar/PDF).</p>
                                                </div>
                                                
                                                {[
                                                    { idx: 0, label: ['Setoran Uang Lebih', 'Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(selectedReport?.jenis_pelaporan) ? "Ganti Bukti 1 (Dokumentasi Utama)" : "Ganti Bukti 1 (Kutipan Harian Toko)", required: true },
                                                    { idx: 1, label: ['Setoran Uang Lebih', 'Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(selectedReport?.jenis_pelaporan) ? "Ganti Bukti 2 (Lampiran Pendukung)" : "Ganti Bukti 2 (Struk EDC BCA / Bukti Setor Mesin CDM)", required: true },
                                                    { idx: 2, label: "Ganti Bukti 3 (Dokumen Tambahan)", required: false },
                                                    { idx: 3, label: "Ganti Bukti 4 (Dokumen Tambahan)", required: false },
                                                    { idx: 4, label: "Ganti Bukti 5 (Dokumen Tambahan)", required: false }
                                                ].map((slot) => {
                                                    const sf = stagedFiles[slot.idx];
                                                    return (
                                                        <div key={slot.idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 rounded-xl gap-3 transition-colors">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm font-bold text-gray-800 leading-snug">
                                                                    {slot.label}
                                                                </h4>
                                                                
                                                                {sf ? (
                                                                    <div className="flex items-center gap-2 text-xs text-gray-800 pt-1.5">
                                                                        {sf.isImage && sf.preview ? (
                                                                            <img src={sf.preview} alt="preview" className="h-9 w-9 object-cover rounded border border-gray-200 shadow-sm" />
                                                                        ) : (
                                                                            <div className="h-9 w-9 flex items-center justify-center bg-gray-50 text-gray-400 rounded border border-gray-200 shadow-sm">
                                                                                <span className="material-symbols-outlined text-lg">description</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="min-w-0">
                                                                            <span className="block font-medium truncate max-w-[150px]" title={sf.name}>{sf.name}</span>
                                                                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-0.5 mt-0.5">
                                                                                <span className="material-symbols-outlined text-[10px]">check_circle</span> Siap Diupload
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs text-gray-400 italic flex items-center gap-1 pt-1">
                                                                        <span className="material-symbols-outlined text-sm text-gray-300">cloud_off</span> Tidak ada perubahan
                                                                    </p>
                                                                )}
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <input
                                                                    type="file"
                                                                    accept="image/*,application/pdf"
                                                                    id={"koreksi-slot-file-input-" + slot.idx}
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files[0];
                                                                        if (file) handleFileSlotChange(slot.idx, file);
                                                                    }}
                                                                />
                                                                {sf ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveSlotFile(slot.idx)}
                                                                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 text-red-600 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">delete</span> Hapus
                                                                    </button>
                                                                ) : (
                                                                    <label
                                                                        htmlFor={"koreksi-slot-file-input-" + slot.idx}
                                                                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">upload_file</span> Pilih File
                                                                    </label>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{requestType === 'delete' ? 'Penjelasan Alasan Penghapusan Laporan (Wajib)' : 'Penjelasan Alasan Koreksi (Wajib)'}</label>
                                        <textarea
                                            value={explanation}
                                            onChange={(e) => setExplanation(e.target.value)}
                                            rows="3"
                                            className="form-input w-full py-2 px-3 text-sm"
                                            placeholder={requestType === 'delete' ? 'Tuliskan secara lengkap alasan mengapa laporan ini perlu dihapus dari sistem...' : 'Tuliskan secara lengkap detail kesalahan input data asli (contoh: salah ketik lebih nol satu, salah memasukkan potongan kasir)....'}
                                        />
                                    </div>

                                    {uploadStatus && (
                                        <div className="p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg flex items-center gap-2 text-xs">
                                            <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-blue-700 border-t-transparent rounded-full"></span>
                                            <span>{uploadStatus}</span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                                Mengirim Permohonan...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">send</span>
                                                {requestType === 'delete' ? 'Kirim Pengajuan Hapus Laporan' : 'Kirim Pengajuan Koreksi'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* BRIEF INFO */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                            <span className="material-symbols-outlined text-yellow-500">info</span>
                            <h3 className="text-base font-bold text-gray-800">Panduan Koreksi</h3>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Formulir ini digunakan ketika apotek telah salah mengirimkan laporan penjualan harian atau jumlah setoran bank.
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed font-semibold">
                            ⚠️ Penting:
                        </p>
                        <ul className="list-disc pl-4 text-xs text-gray-500 space-y-2">
                            <li>Data lama di database TIDAK akan langsung berubah setelah Anda menekan tombol Kirim.</li>
                            <li>Permohonan Anda harus divalidasi dan disetujui terlebih dahulu oleh tim Finance di kantor pusat.</li>
                            <li>Pastikan penjelasan alasan koreksi diisi secara jujur dan detail demi transparansi keuangan.</li>
                        </ul>
                    </div>
                </div>

                {/* HISTORY SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center gap-2 pb-4 border-b border-gray-100 mb-4">
                        <span className="material-symbols-outlined text-primary-500">history</span>
                        <h3 className="text-base font-bold text-gray-800">Riwayat Pengajuan Koreksi</h3>
                    </div>

                    {historyLoading ? (
                        <div className="py-6 text-center text-gray-400">
                            <span className="animate-spin inline-block h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></span>
                            Memuat riwayat...
                        </div>
                    ) : koreksiHistory.length === 0 ? (
                        <div className="py-6 text-center text-gray-400 text-sm">
                            Belum ada riwayat pengajuan koreksi untuk apotek Anda.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="py-3 px-4">Tanggal Pengajuan</th>
                                        <th className="py-3 px-4">Laporan Asli</th>
                                        <th className="py-3 px-4 text-right">Data Asli</th>
                                        <th className="py-3 px-4 text-right">Data Baru (Koreksi)</th>
                                        <th className="py-3 px-4">Penjelasan Alasan</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-600">
                                    {koreksiHistory.map((item) => {
                                        const lap = item.laporan;
                                        if (!lap) return null;

                                        let statusBadge = '';
                                        if (item.status === 'Approved') {
                                            statusBadge = <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200">Disetujui</span>;
                                        } else if (item.status === 'Rejected') {
                                            statusBadge = <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">Ditolak</span>;
                                        } else {
                                            statusBadge = <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">Menunggu</span>;
                                        }

                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50/50">
                                                <td className="py-3.5 px-4 font-mono text-xs">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className="font-semibold block">{lap.jenis_pelaporan}</span>
                                                    <span className="text-xs text-gray-400">Sales: {new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-xs font-mono">
                                                    <div>Jual: {formatRupiah(lap.nominal_jual)}</div>
                                                    <div>Setor: {formatRupiah(lap.nominal_setoran)}</div>
                                                    <div>Potong: {formatRupiah(lap.potongan)}</div>
                                                    <div className="text-[10px] text-gray-400 mt-1 flex flex-col items-end">
                                                        <span>Sales: {new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                                                        <span>Setor: {lap.tanggal_setor ? new Date(lap.tanggal_setor).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-xs font-mono font-semibold text-primary-700">
                                                    {item.jenis_pelaporan_baru === 'HAPUS_DATA' ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-100 text-red-800 border border-red-200 inline-flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-xs">delete</span> HAPUS LAPORAN
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>Jual: {formatRupiah(item.nominal_jual_baru)}</div>
                                                            <div>Setor: {formatRupiah(item.nominal_setoran_baru)}</div>
                                                            <div>Potong: {formatRupiah(item.potongan_baru)}</div>
                                                            <div className="text-[10px] mt-1 text-primary-600 flex flex-col items-end">
                                                                <span>Sales: {item.tanggal_jual_baru ? new Date(item.tanggal_jual_baru).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                                                                <span>Setor: {item.tanggal_setor_baru ? new Date(item.tanggal_setor_baru).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : (lap.tanggal_setor ? new Date(lap.tanggal_setor).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-')}</span>
                                                            </div>
                                                            {item.jenis_pelaporan_baru && item.jenis_pelaporan_baru !== lap.jenis_pelaporan && (
                                                                <div className="text-[9px] bg-amber-50 border border-amber-200 text-amber-800 px-1 py-0.5 rounded mt-1 font-sans text-center max-w-[120px] truncate ml-auto" title={item.jenis_pelaporan_baru}>
                                                                    Jenis: {item.jenis_pelaporan_baru}
                                                                </div>
                                                            )}
                                                            {item.bukti_urls_baru && item.bukti_urls_baru.length > 0 && (
                                                                <div className="text-[9px] bg-green-50 border border-green-200 text-green-800 px-1 py-0.5 rounded mt-1 font-sans text-center max-w-[120px] ml-auto">
                                                                    Lampiran Baru ({item.bukti_urls_baru.length})
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 max-w-xs truncate" title={item.penjelasan_koreksi}>
                                                    {item.penjelasan_koreksi}
                                                </td>
                                                <td className="py-3.5 px-4 text-center">{statusBadge}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </UserLayout>
    );
}