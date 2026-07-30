import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah, parseRupiah, formatDriveImageUrl } from '../lib/validators';
import { uploadToDrive } from '../services/driveService';
import UserLayout from '../components/UserLayout';

function parseBuktiUrls(dataUrls) {
    if (!dataUrls) return [];
    if (Array.isArray(dataUrls)) return dataUrls.filter(Boolean);
    if (typeof dataUrls === 'string') {
        try {
            const parsed = JSON.parse(dataUrls);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch (e) {
            if (dataUrls.trim().startsWith('http')) return [dataUrls.trim()];
        }
    }
    return [];
}

export default function KoreksiLaporanPage() {
    const { profile } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const prefilledReport = location.state?.prefilledReport;
    
    // UI states
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // Selection states
    const [selectedDate, setSelectedDate] = useState(() => {
        if (prefilledReport?.tanggal_jual) {
            return prefilledReport.tanggal_jual;
        }
        return new Date().toLocaleDateString('sv-SE');
    });
    const [reportsForDate, setReportsForDate] = useState([]);
    const [selectedReportId, setSelectedReportId] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    
    // Mode State: 'edit' | 'delete'
    const [requestType, setRequestType] = useState('edit');

    // Poka Yoke Checkbox Section Toggles (User chooses what to edit)
    const [toggleTunai, setToggleTunai] = useState(false);
    const [toggleNonTunai, setToggleNonTunai] = useState(false);
    const [toggleMeta, setToggleMeta] = useState(false);
    const [toggleBukti, setToggleBukti] = useState(false);

    // Editable form states
    const [newJual, setNewJual] = useState('');
    const [newSetoran, setNewSetoran] = useState('');
    const [newPotongan, setNewPotongan] = useState('');

    const [newBcaDebit, setNewBcaDebit] = useState('');
    const [newBcaKredit, setNewBcaKredit] = useState('');
    const [newBcaQris, setNewBcaQris] = useState('');
    const [newBriDebit, setNewBriDebit] = useState('');
    const [newBriKredit, setNewBriKredit] = useState('');
    const [newBriQris, setNewBriQris] = useState('');
    const [newBankTransfer, setNewBankTransfer] = useState('');

    const [newTanggalJual, setNewTanggalJual] = useState('');
    const [newTanggalSetor, setNewTanggalSetor] = useState('');
    const [newJenisPelaporan, setNewJenisPelaporan] = useState('');

    const [stagedFiles, setStagedFiles] = useState([null, null, null, null, null]);
    const [uploadStatus, setUploadStatus] = useState('');
    const [explanation, setExplanation] = useState('');
    
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
                // Populate default form values with selected report's data
                setNewJual(formatRupiah(report.nominal_jual || 0));
                setNewSetoran(formatRupiah(report.nominal_setoran || 0));
                setNewPotongan(formatRupiah(report.potongan || 0));

                setNewBcaDebit(formatRupiah(report.bca_debit || 0));
                setNewBcaKredit(formatRupiah(report.bca_kredit || 0));
                setNewBcaQris(formatRupiah(report.bca_qris || 0));
                setNewBriDebit(formatRupiah(report.bri_debit || 0));
                setNewBriKredit(formatRupiah(report.bri_kredit || 0));
                setNewBriQris(formatRupiah(report.bri_qris || 0));
                setNewBankTransfer(formatRupiah(report.bank_transfer || 0));

                setNewTanggalJual(report.tanggal_jual || '');
                setNewTanggalSetor(report.tanggal_setor || '');
                setNewJenisPelaporan(report.jenis_pelaporan || '');
                
                // Reset toggles to false (Poka Yoke: user must consciously toggle what they want to change)
                setToggleTunai(false);
                setToggleNonTunai(false);
                setToggleMeta(false);
                setToggleBukti(false);
                setStagedFiles([null, null, null, null, null]);
            }
        } else {
            setSelectedReport(null);
            resetFormValues();
        }
    }, [selectedReportId, reportsForDate]);

    const resetFormValues = () => {
        setNewJual(''); setNewSetoran(''); setNewPotongan('');
        setNewBcaDebit(''); setNewBcaKredit(''); setNewBcaQris('');
        setNewBriDebit(''); setNewBriKredit(''); setNewBriQris(''); setNewBankTransfer('');
        setNewTanggalJual(''); setNewTanggalSetor(''); setNewJenisPelaporan('');
        setToggleTunai(false); setToggleNonTunai(false); setToggleMeta(false); setToggleBukti(false);
        setStagedFiles([null, null, null, null, null]);
    };

    const fetchReportsForDate = async () => {
        setError('');
        setReportsForDate([]);
        setSelectedReportId('');
        try {
            const { data, error: err } = await supabase
                .from('laporan')
                .select('*')
                .eq('user_id', profile.id)
                .eq('tanggal_jual', selectedDate);

            if (err) throw err;
            setReportsForDate(data || []);
            
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
                    catatan_admin,
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
        setError('');
        setSuccessMsg('');

        if (!selectedReport) {
            setError('Silakan pilih laporan terkirim yang ingin dikoreksi.');
            return;
        }

        if (!explanation.trim()) {
            setError(requestType === 'delete' ? 'Penjelasan alasan penghapusan laporan wajib diisi.' : 'Penjelasan alasan koreksi wajib diisi.');
            return;
        }

        if (requestType === 'edit') {
            if (!toggleTunai && !toggleNonTunai && !toggleMeta && !toggleBukti) {
                setError('Harap centang minimal 1 bagian data yang ingin dikoreksi (Penjualan Tunai, Non-Tunai, Tanggal/Jenis, atau Foto Bukti).');
                return;
            }
        }

        setLoading(true);

        try {
            // Determine proposed values based on Poka Yoke toggles
            let finalJual = selectedReport.nominal_jual || 0;
            let finalSetoran = selectedReport.nominal_setoran || 0;
            let finalPotongan = selectedReport.potongan || 0;

            let finalBcaDb = selectedReport.bca_debit || 0;
            let finalBcaKr = selectedReport.bca_kredit || 0;
            let finalBcaQr = selectedReport.bca_qris || 0;
            let finalBriDb = selectedReport.bri_debit || 0;
            let finalBriKr = selectedReport.bri_kredit || 0;
            let finalBriQr = selectedReport.bri_qris || 0;
            let finalTrf = selectedReport.bank_transfer || 0;

            let finalTglJual = selectedReport.tanggal_jual;
            let finalTglSetor = selectedReport.tanggal_setor;
            let finalJenis = selectedReport.jenis_pelaporan;

            let finalBuktiUrls = parseBuktiUrls(selectedReport.bukti_urls);

            if (requestType === 'edit') {
                if (toggleTunai) {
                    finalJual = parseRupiah(newJual);
                    finalSetoran = parseRupiah(newSetoran);
                    finalPotongan = parseRupiah(newPotongan);
                }

                if (toggleNonTunai) {
                    finalBcaDb = parseRupiah(newBcaDebit);
                    finalBcaKr = parseRupiah(newBcaKredit);
                    finalBcaQr = parseRupiah(newBcaQris);
                    finalBriDb = parseRupiah(newBriDebit);
                    finalBriKr = parseRupiah(newBriKredit);
                    finalBriQr = parseRupiah(newBriQris);
                    finalTrf = parseRupiah(newBankTransfer);
                }

                if (toggleMeta) {
                    finalTglJual = newTanggalJual || selectedReport.tanggal_jual;
                    finalTglSetor = newTanggalSetor || selectedReport.tanggal_setor;
                    finalJenis = newJenisPelaporan || selectedReport.jenis_pelaporan;
                }

                if (toggleBukti && stagedFiles.some(Boolean)) {
                    const existingUrls = parseBuktiUrls(selectedReport.bukti_urls);
                    const mergedUrls = [...existingUrls];
                    const filesToUpload = stagedFiles.filter(Boolean);

                    let uploadCount = 1;
                    for (let i = 0; i < stagedFiles.length; i++) {
                        const item = stagedFiles[i];
                        if (item && item.file) {
                            setUploadStatus(`Mengunggah bukti baru (${uploadCount}/${filesToUpload.length})...`);
                            const url = await uploadToDrive(item.file);
                            if (!url) throw new Error(`Gagal mengunggah file ${item.file.name}`);
                            mergedUrls[i] = url;
                            uploadCount++;
                        }
                    }
                    finalBuktiUrls = mergedUrls.filter(Boolean);
                }
            }

            const { error: insertError } = await supabase
                .from('koreksi_requests')
                .insert({
                    laporan_id: selectedReport.id,
                    requested_by: profile.id,
                    nominal_jual_baru: requestType === 'delete' ? 0 : finalJual,
                    nominal_setoran_baru: requestType === 'delete' ? 0 : finalSetoran,
                    potongan_baru: requestType === 'delete' ? 0 : finalPotongan,
                    bca_debit_baru: requestType === 'delete' ? 0 : finalBcaDb,
                    bca_kredit_baru: requestType === 'delete' ? 0 : finalBcaKr,
                    bca_qris_baru: requestType === 'delete' ? 0 : finalBcaQr,
                    bri_debit_baru: requestType === 'delete' ? 0 : finalBriDb,
                    bri_kredit_baru: requestType === 'delete' ? 0 : finalBriKr,
                    bri_qris_baru: requestType === 'delete' ? 0 : finalBriQr,
                    bank_transfer_baru: requestType === 'delete' ? 0 : finalTrf,
                    tanggal_jual_baru: requestType === 'edit' ? finalTglJual : null,
                    tanggal_setor_baru: requestType === 'edit' ? finalTglSetor : null,
                    jenis_pelaporan_baru: requestType === 'edit' ? finalJenis : 'HAPUS_DATA',
                    bukti_urls_baru: requestType === 'edit' ? finalBuktiUrls : null,
                    penjelasan_koreksi: explanation.trim(),
                    status: 'Pending'
                });

            if (insertError) throw insertError;

            setSuccessMsg(
                requestType === 'delete'
                    ? 'Permohonan hapus laporan berhasil dikirim dan menunggu persetujuan Area Manager / Finance.'
                    : 'Permohonan koreksi laporan berhasil dikirim dan menunggu persetujuan Area Manager / Finance.'
            );
            setExplanation('');
            setSelectedReportId('');
            setSelectedReport(null);
            setRequestType('edit');
            fetchHistory();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

                {/* HEADER TITLE */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h1 className="text-2xl font-black text-gray-900">Pengajuan Koreksi Laporan Sales</h1>
                    <p className="text-gray-500 text-sm mt-1">Ajukan perbaikan angka penjualan, data non-tunai, resi bukti, atau permohonan hapus laporan yang salah kirim.</p>
                </div>
                
                {/* FORM & SELECTION */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                            <span className="material-symbols-outlined text-primary-500 text-xl">edit_document</span>
                            <h3 className="text-base font-bold text-gray-800">Form Koreksi Laporan</h3>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold">
                                <span className="material-symbols-outlined text-lg flex-shrink-0">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {successMsg && (
                            <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl flex items-center gap-2 text-xs font-bold">
                                <span className="material-symbols-outlined text-lg flex-shrink-0">check_circle</span>
                                <span>{successMsg}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* STEP 1: SELECT REPORT */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Tanggal Sales Asli</label>
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="form-input w-full py-2 px-3 text-xs bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Pilih Laporan Terkirim</label>
                                    <select
                                        value={selectedReportId}
                                        onChange={(e) => setSelectedReportId(e.target.value)}
                                        className="form-input w-full py-2 px-3 bg-white text-xs font-medium"
                                        disabled={reportsForDate.length === 0}
                                    >
                                        <option value="">
                                            {reportsForDate.length === 0 ? '-- Tidak Ada Laporan Terkirim --' : '-- Pilih Laporan Terkirim --'}
                                        </option>
                                        {reportsForDate.map(r => (
                                            <option key={r.id} value={r.id}>
                                                {r.jenis_pelaporan} - {formatRupiah(r.nominal_jual)} (Setor: {formatRupiah(r.nominal_setoran)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {selectedReport && (
                                <div className="space-y-6 pt-4 border-t border-gray-100 animate-fade-in">
                                    {/* MODE SELECTOR: EDIT VS DELETE */}
                                    <div>
                                        <label className="block text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">Pilih Jenis Pengajuan</label>
                                        <div className="grid grid-cols-2 gap-3 max-w-md">
                                            <button
                                                type="button"
                                                onClick={() => setRequestType('edit')}
                                                className={`py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border transition-all cursor-pointer ${requestType === 'edit' ? 'bg-primary-500 text-white border-primary-600 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <span className="material-symbols-outlined text-base">edit_square</span>
                                                Koreksi Sebagian Data
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRequestType('delete')}
                                                className={`py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border transition-all cursor-pointer ${requestType === 'delete' ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <span className="material-symbols-outlined text-base">delete_forever</span>
                                                Hapus Total Laporan
                                            </button>
                                        </div>
                                    </div>

                                    {requestType === 'delete' ? (
                                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-800 space-y-2 animate-fade-in">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-red-600">warning</span>
                                                <h4 className="text-xs font-extrabold uppercase tracking-wide">Permohonan Penghapusan Laporan</h4>
                                            </div>
                                            <p className="text-xs leading-relaxed">
                                                Anda mengajukan permohonan untuk <strong>MENGHAPUS secara permanen</strong> laporan <strong>{selectedReport.jenis_pelaporan}</strong> tanggal sales <strong>{new Date(selectedReport.tanggal_jual).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> dari sistem.
                                            </p>
                                            <p className="text-xs font-semibold text-red-700">
                                                *Tindakan ini memerlukan peninjauan dan persetujuan dari Area Manager / Finance.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* POKA YOKE BANNER GUIDANCE */}
                                            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                                                <span className="material-symbols-outlined text-amber-600 flex-shrink-0 mt-0.5">verified</span>
                                                <div>
                                                    <p className="font-bold">Prinsip Poka Yoke (Hanya Centang Yang Ingin Diubah):</p>
                                                    <p className="mt-0.5 text-amber-800 leading-relaxed">
                                                        Centang opsi bagian di bawah ini <strong>hanya untuk data yang ingin Anda perbaiki</strong>. Bagian yang tidak Anda centang akan secara otomatis dipertahankan memakai data lama saat ini.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* SECTION 1: PENJUALAN TUNAI & SETORAN */}
                                            <div className={`p-4 rounded-xl border transition-all ${toggleTunai ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-100' : 'bg-gray-50/70 border-gray-200 opacity-80'}`}>
                                                <label className="flex items-center gap-2.5 cursor-pointer pb-3 border-b border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={toggleTunai}
                                                        onChange={(e) => setToggleTunai(e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-green-600 text-base">payments</span>
                                                        1. Koreksi Penjualan Tunai & Setoran Bank
                                                    </span>
                                                    {!toggleTunai && (
                                                        <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                                                            Tetap Menggunakan Data Lama
                                                        </span>
                                                    )}
                                                </label>

                                                {toggleTunai ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 animate-fade-in">
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Sales Tunai Kasir Baru</label>
                                                            <input
                                                                type="text"
                                                                value={newJual}
                                                                onChange={(e) => setNewJual(formatRupiah(parseRupiah(e.target.value)))}
                                                                className="form-input w-full py-2 px-3 text-xs font-bold font-mono"
                                                                placeholder="Rp 0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Potongan Sales (Petty Cash) Baru</label>
                                                            <input
                                                                type="text"
                                                                value={newPotongan}
                                                                onChange={(e) => setNewPotongan(formatRupiah(parseRupiah(e.target.value)))}
                                                                className="form-input w-full py-2 px-3 text-xs font-bold font-mono text-red-600"
                                                                placeholder="Rp 0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Setoran Tunai Bank Baru</label>
                                                            <input
                                                                type="text"
                                                                value={newSetoran}
                                                                onChange={(e) => setNewSetoran(formatRupiah(parseRupiah(e.target.value)))}
                                                                className="form-input w-full py-2 px-3 text-xs font-bold font-mono text-green-700"
                                                                placeholder="Rp 0"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-3 gap-2 text-xs pt-3 text-gray-500 font-mono">
                                                        <div>Jual: <span className="font-bold text-gray-700">{formatRupiah(selectedReport.nominal_jual)}</span></div>
                                                        <div>Potong: <span className="font-bold text-red-600">{formatRupiah(selectedReport.potongan)}</span></div>
                                                        <div>Setor: <span className="font-bold text-green-700">{formatRupiah(selectedReport.nominal_setoran)}</span></div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SECTION 2: TRANSAKSI NON-TUNAI (EDC & TRANSFER) */}
                                            <div className={`p-4 rounded-xl border transition-all ${toggleNonTunai ? 'bg-white border-blue-300 shadow-sm ring-1 ring-blue-100' : 'bg-gray-50/70 border-gray-200 opacity-80'}`}>
                                                <label className="flex items-center gap-2.5 cursor-pointer pb-3 border-b border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={toggleNonTunai}
                                                        onChange={(e) => setToggleNonTunai(e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-blue-600 text-base">credit_card</span>
                                                        2. Koreksi Transaksi Non-Tunai (EDC & Transfer)
                                                    </span>
                                                    {!toggleNonTunai && (
                                                        <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                                                            Tetap Menggunakan Data Lama
                                                        </span>
                                                    )}
                                                </label>

                                                {toggleNonTunai ? (
                                                    <div className="space-y-4 pt-4 animate-fade-in">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {/* BCA */}
                                                            <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100 space-y-2">
                                                                <span className="text-[10px] font-bold text-blue-900 uppercase">EDC BCA Baru</span>
                                                                <input type="text" value={newBcaDebit} onChange={(e) => setNewBcaDebit(formatRupiah(parseRupiah(e.target.value)))} placeholder="BCA Debit" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                                <input type="text" value={newBcaKredit} onChange={(e) => setNewBcaKredit(formatRupiah(parseRupiah(e.target.value)))} placeholder="BCA Kredit" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                                <input type="text" value={newBcaQris} onChange={(e) => setNewBcaQris(formatRupiah(parseRupiah(e.target.value)))} placeholder="BCA QRIS" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                            </div>
                                                            {/* BRI */}
                                                            <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100 space-y-2">
                                                                <span className="text-[10px] font-bold text-blue-900 uppercase">EDC BRI Baru</span>
                                                                <input type="text" value={newBriDebit} onChange={(e) => setNewBriDebit(formatRupiah(parseRupiah(e.target.value)))} placeholder="BRI Debit" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                                <input type="text" value={newBriKredit} onChange={(e) => setNewBriKredit(formatRupiah(parseRupiah(e.target.value)))} placeholder="BRI Kredit" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                                <input type="text" value={newBriQris} onChange={(e) => setNewBriQris(formatRupiah(parseRupiah(e.target.value)))} placeholder="BRI QRIS" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-blue-900 uppercase mb-1">Transfer Bank Baru</label>
                                                            <input type="text" value={newBankTransfer} onChange={(e) => setNewBankTransfer(formatRupiah(parseRupiah(e.target.value)))} placeholder="Transfer Bank" className="form-input w-full py-1.5 px-2.5 text-xs font-mono" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="pt-3 text-xs text-gray-500 font-mono flex items-center justify-between">
                                                        <span>Total Non-Tunai Saat Ini:</span>
                                                        <span className="font-bold text-blue-800">{formatRupiah(selectedReport.total_non_tunai || 0)}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SECTION 3: TANGGAL & JENIS PELAPORAN */}
                                            <div className={`p-4 rounded-xl border transition-all ${toggleMeta ? 'bg-white border-purple-300 shadow-sm ring-1 ring-purple-100' : 'bg-gray-50/70 border-gray-200 opacity-80'}`}>
                                                <label className="flex items-center gap-2.5 cursor-pointer pb-3 border-b border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={toggleMeta}
                                                        onChange={(e) => setToggleMeta(e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-purple-600 text-base">calendar_month</span>
                                                        3. Koreksi Tanggal & Jenis Pelaporan
                                                    </span>
                                                    {!toggleMeta && (
                                                        <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                                                            Tetap Menggunakan Data Lama
                                                        </span>
                                                    )}
                                                </label>

                                                {toggleMeta ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 animate-fade-in">
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Sales Baru</label>
                                                            <input type="date" value={newTanggalJual} onChange={(e) => setNewTanggalJual(e.target.value)} className="form-input w-full py-2 px-3 text-xs" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Setor Baru</label>
                                                            <input type="date" value={newTanggalSetor} onChange={(e) => setNewTanggalSetor(e.target.value)} className="form-input w-full py-2 px-3 text-xs" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Jenis Pelaporan Baru</label>
                                                            <select value={newJenisPelaporan} onChange={(e) => setNewJenisPelaporan(e.target.value)} className="form-input w-full py-2 px-3 text-xs font-bold text-gray-800 bg-gray-50">
                                                                <option value="Setoran Harian">Setoran Harian</option>
                                                                <option value="Setoran 3x Seminggu">Setoran 3x Seminggu</option>
                                                                <option value="Setoran Sales Dengan Potongan Penjualan">Setoran Sales Dengan Potongan Penjualan</option>
                                                                <option value="Setoran Uang Pecahan Kecil">Setoran Uang Pecahan Kecil</option>
                                                                <option value="Pengembalian Petty Cash">Pengembalian Petty Cash</option>
                                                                <option value="Deposit Card Terblokir (Salah Input PIN 3x)">Deposit Card Terblokir</option>
                                                                <option value="Deposit Card Tertelan Mesin ATM">Deposit Card Tertelan</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="pt-3 text-xs text-gray-500 flex items-center justify-between">
                                                        <span>Tanggal Sales: <strong className="text-gray-800">{selectedReport.tanggal_jual}</strong></span>
                                                        <span>Jenis: <strong className="text-gray-800">{selectedReport.jenis_pelaporan}</strong></span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SECTION 4: GANTI FOTO BUKTI */}
                                            <div className={`p-4 rounded-xl border transition-all ${toggleBukti ? 'bg-white border-orange-300 shadow-sm ring-1 ring-orange-100' : 'bg-gray-50/70 border-gray-200 opacity-80'}`}>
                                                <label className="flex items-center gap-2.5 cursor-pointer pb-3 border-b border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={toggleBukti}
                                                        onChange={(e) => setToggleBukti(e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                                    />
                                                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-orange-600 text-base">photo_camera</span>
                                                        4. Ubah / Ganti Foto Bukti Setoran
                                                    </span>
                                                    {!toggleBukti && (
                                                        <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                                                            Tetap Menggunakan Foto Lama
                                                        </span>
                                                    )}
                                                </label>

                                                {toggleBukti ? (
                                                    <div className="space-y-3 pt-4 animate-fade-in">
                                                        <p className="text-xs text-gray-500">Unggah berkas foto bukti baru pada slot yang ingin diganti:</p>
                                                        {[
                                                            { idx: 0, label: "Bukti 1: Kutipan Harian Kasir" },
                                                            { idx: 1, label: "Bukti 2: Struk Settlement EDC" },
                                                            { idx: 2, label: "Bukti 3: Struk / Resi Setoran Bank" },
                                                            { idx: 3, label: "Bukti 4: Foto Pendukung" },
                                                            { idx: 4, label: "Bukti 5: Foto Pendukung" }
                                                        ].map((slot) => {
                                                            const sf = stagedFiles[slot.idx];
                                                            return (
                                                                <div key={slot.idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs gap-3">
                                                                    <span className="font-bold text-gray-800 truncate">{slot.label}</span>
                                                                    <div className="flex items-center gap-2 shrink-0">
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
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200 truncate max-w-[120px]">
                                                                                    {sf.name}
                                                                                </span>
                                                                                <button type="button" onClick={() => handleRemoveSlotFile(slot.idx)} className="text-red-600 hover:text-red-800 font-bold">
                                                                                    Batal
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <label htmlFor={"koreksi-slot-file-input-" + slot.idx} className="px-3 py-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-bold cursor-pointer shadow-xs">
                                                                                Pilih File Baru
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="pt-3 text-xs text-gray-500 italic">
                                                        Foto bukti lampiran asli tetap digunakan tanpa perubahan.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* PENJELASAN ALASAN */}
                                    <div className="pt-2">
                                        <label className="block text-xs font-extrabold text-gray-700 mb-1">
                                            {requestType === 'delete' ? 'Penjelasan Alasan Penghapusan Laporan (Wajib)' : 'Penjelasan Alasan Koreksi (Wajib)'}
                                        </label>
                                        <textarea
                                            value={explanation}
                                            onChange={(e) => setExplanation(e.target.value)}
                                            rows="3"
                                            className="form-input w-full py-2 px-3 text-xs leading-relaxed"
                                            placeholder={requestType === 'delete' ? 'Tuliskan secara lengkap alasan mengapa laporan ini perlu dihapus dari sistem...' : 'Tuliskan secara lengkap detail kesalahan input data asli (contoh: salah ketik EDC BCA Debit Rp 100.000 menjadi Rp 1.000.000, struk EDC tertukar, dsb)...'}
                                        />
                                    </div>

                                    {uploadStatus && (
                                        <div className="p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl flex items-center gap-2 text-xs font-bold">
                                            <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-blue-700 border-t-transparent rounded-full"></span>
                                            <span>{uploadStatus}</span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="btn-primary w-full py-3 flex items-center justify-center gap-2 cursor-pointer shadow-md text-xs font-extrabold"
                                    >
                                        {loading ? (
                                            <>
                                                <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                                Mengirim Permohonan...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-base">send</span>
                                                {requestType === 'delete' ? 'Kirim Permohonan Hapus Laporan' : 'Kirim Pengajuan Koreksi'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* BRIEF INFO / PANDUAN */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                            <span className="material-symbols-outlined text-amber-500">lightbulb</span>
                            <h3 className="text-base font-bold text-gray-800">Panduan Koreksi Laporan</h3>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Formulir ini digunakan ketika apotek telah salah mengirimkan laporan penjualan harian, transaksi non-tunai, atau foto bukti setoran.
                        </p>
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs space-y-2">
                            <p className="font-extrabold flex items-center gap-1">
                                <span className="material-symbols-outlined text-amber-600 text-base">info</span> Aturan Penting:
                            </p>
                            <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-amber-900">
                                <li>Data lama di database <strong>TIDAK langsung berubah</strong> secara otomatis.</li>
                                <li>Permohonan Anda harus diverifikasi dan disetujui terlebih dahulu oleh Area Manager / Finance.</li>
                                <li>Isi penjelasan alasan koreksi secara jujur dan detail demi akuntabilitas keuangan apotek.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* HISTORY SECTION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center gap-2 pb-4 border-b border-gray-100 mb-4">
                        <span className="material-symbols-outlined text-primary-500 text-xl">history</span>
                        <h3 className="text-base font-bold text-gray-800">Riwayat Pengajuan Koreksi</h3>
                    </div>

                    {historyLoading ? (
                        <div className="py-8 text-center text-gray-400 text-xs">
                            <span className="animate-spin inline-block h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></span>
                            Memuat riwayat pengajuan koreksi...
                        </div>
                    ) : koreksiHistory.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-gray-200">
                            Belum ada riwayat pengajuan koreksi untuk apotek Anda.
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-inner bg-white">
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-100 text-[11px] font-extrabold text-gray-700 uppercase tracking-wider">
                                    <tr>
                                        <th className="py-3 px-4">Tgl Pengajuan</th>
                                        <th className="py-3 px-4">Laporan Asli</th>
                                        <th className="py-3 px-4 text-right">Data Sales Asli</th>
                                        <th className="py-3 px-4 text-right">Data Koreksi Baru</th>
                                        <th className="py-3 px-4">Penjelasan Alasan</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-600 bg-white">
                                    {koreksiHistory.map((item) => {
                                        const lap = item.laporan;
                                        if (!lap) return null;

                                        let statusBadge = '';
                                        if (item.status === 'Approved') {
                                            statusBadge = <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-700 border border-green-200 shadow-xs">Disetujui</span>;
                                        } else if (item.status === 'Rejected') {
                                            const rejectionReason = item.catatan_admin || 'Tidak ada catatan spesifik.';
                                            statusBadge = (
                                                <div className="relative group inline-block">
                                                    <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-700 border border-red-200 shadow-xs cursor-help inline-flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">info</span> Ditolak
                                                    </span>
                                                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-xl border border-gray-700 text-left animate-fade-in">
                                                        <p className="font-bold text-red-400 mb-1 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs">cancel</span> Alasan Penolakan:
                                                        </p>
                                                        <p className="text-gray-200 italic leading-relaxed">"{rejectionReason}"</p>
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            statusBadge = <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 shadow-xs">Menunggu</span>;
                                        }

                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="py-3.5 px-4 font-mono text-[11px]">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className="font-bold text-gray-800 block text-xs">{lap.jenis_pelaporan}</span>
                                                    <span className="text-[11px] text-gray-400">Sales: {new Date(lap.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-[11px] font-mono">
                                                    <div>Jual: {formatRupiah(lap.nominal_jual)}</div>
                                                    <div>Setor: {formatRupiah(lap.nominal_setoran)}</div>
                                                    <div>Potong: {formatRupiah(lap.potongan)}</div>
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-[11px] font-mono font-semibold text-primary-700">
                                                    {item.jenis_pelaporan_baru === 'HAPUS_DATA' ? (
                                                        <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-100 text-red-800 border border-red-200 inline-flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs">delete</span> HAPUS LAPORAN
                                                        </span>
                                                    ) : (
                                                        <div>
                                                            <div>Jual: {formatRupiah(item.nominal_jual_baru)}</div>
                                                            <div>Setor: {formatRupiah(item.nominal_setoran_baru)}</div>
                                                            <div>Potong: {formatRupiah(item.potongan_baru)}</div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-xs italic text-gray-600 max-w-xs truncate" title={item.penjelasan_koreksi}>
                                                    "{item.penjelasan_koreksi}"
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    {statusBadge}
                                                </td>
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
