import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormWizard } from '../context/FormWizardContext';
import { parseRupiah, formatRupiah, validateSetoranData, NON_FINANCIAL_TYPES, compressImage } from '../lib/validators';
import UserLayout from '../components/UserLayout';
import { supabase } from '../services/supabaseClient';
import { uploadToDrive } from '../services/driveService';

const STEP_INFO = ['1. Informasi Sales & Metode', '2. Input Nominal & Bukti', '3. Periksa & Kirim'];

// Tautan Foto Contoh Dokumen (Dapat diisi link URL foto fisik)
const SAMPLE_DOCUMENT_IMAGES = {
    slot1: {
        title: "Contoh Kutipan Harian Kasir",
        url: "", // Tempel link URL foto contoh Kutipan Harian Kasir di sini
        description: "Pastikan foto menampilkan seluruh angka penjualan kasir dan tanggal dengan jelas."
    },
    slot2: {
        title: "Contoh Struk Settlement Mesin EDC",
        url: "", // Tempel link URL foto contoh Settlement EDC di sini
        description: "Pastikan angka Grand Total Debit, Kredit, dan QRIS pada kertas settlement terlihat utuh."
    },
    slot3: {
        title: "Contoh Struk / Resi Setoran Bank",
        url: "", // Tempel link URL foto contoh Resi Setoran Bank/ATM di sini
        description: "Pastikan tanggal setoran, nomor rekening, dan stempel/bukti transfer bank terbaca jelas."
    }
};

export default function DetailSetoranPage() {
    const { profile } = useAuth();
    const { formData, updateField } = useFormWizard();
    const navigate = useNavigate();

    const [globalError, setGlobalError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [stagedLightboxImg, setStagedLightboxImg] = useState(null);
    const [sampleModalImg, setSampleModalImg] = useState(null);
    const [showCancelModal, setShowCancelModal] = useState(false);

    const jenis = formData.jenisPelaporan;
    const metode = formData.metodeSetoran;
    const isNonFinancial = NON_FINANCIAL_TYPES.includes(jenis);
    const isPotongan = jenis?.includes('Dengan Potongan Penjualan');
    const isDepositCard = jenis?.includes('Deposit Card');

    // Build list of sales dates whose nominal needs to be entered
    const allSalesDates = [formData.tanggalPenjualan, ...(formData.tanggalPenjualanTambahan || [])].filter(Boolean);

    // Initialize nominalPenjualan array to match dates length
    useEffect(() => {
        if (!isNonFinancial && allSalesDates.length > 0) {
            const current = Array.isArray(formData.nominalPenjualan) ? formData.nominalPenjualan : [];
            if (current.length < allSalesDates.length) {
                const padded = [...current, ...Array(allSalesDates.length - current.length).fill('')];
                updateField({ nominalPenjualan: padded });
            }
        }
    }, []);

    // Auto-fill deposit card and KCP from profile
    useEffect(() => {
        if (metode === 'ATM BCA Menggunakan Deposit Card' && profile?.deposit_card && !formData.nomorDepositCard) {
            updateField({ nomorDepositCard: profile.deposit_card });
        }
        if (metode === 'Teller Bank' && profile?.kcp_terdekat && !formData.kcpTerdekat) {
            updateField({ kcpTerdekat: profile.kcp_terdekat });
        }
    }, []);

    // --- Live Tunai Calculator ---
    const totalPenjualan = Array.isArray(formData.nominalPenjualan)
        ? formData.nominalPenjualan.reduce((s, v) => s + parseRupiah(v), 0)
        : parseRupiah(formData.nominalPenjualan);
    const potongan = parseRupiah(formData.potonganPenjualan);
    const setoran = parseRupiah(formData.nominalSetoran);
    const danaTersedia = totalPenjualan - potongan;
    const selisih = danaTersedia - setoran;

    const selisihLabel = selisih > 0
        ? { text: `Setoran Kurang ${formatRupiah(selisih)}`, color: 'text-red-600 font-bold' }
        : selisih < 0
            ? { text: `Setoran Lebih ${formatRupiah(Math.abs(selisih))}`, color: 'text-blue-600 font-bold' }
            : { text: 'Pas / Tidak Ada Selisih (Rp 0)', color: 'text-green-600 font-bold' };

    // --- Live Non-Tunai Calculator ---
    const totalNonTunai =
        parseRupiah(formData.bcaDebit) +
        parseRupiah(formData.bcaKredit) +
        parseRupiah(formData.bcaQris) +
        parseRupiah(formData.briDebit) +
        parseRupiah(formData.briKredit) +
        parseRupiah(formData.briQris) +
        parseRupiah(formData.bankTransfer);

    // --- Live Online Sales Calculator ---
    const totalOnline =
        parseRupiah(formData.onlineHalodoc) +
        parseRupiah(formData.onlineTiktok) +
        parseRupiah(formData.onlineTokopedia);

    const grandTotalSales = totalPenjualan + totalNonTunai + totalOnline;

    // --- File upload staging (5 structured slots) ---
    const [stagedFiles, setStagedFiles] = useState(() => {
        if (Array.isArray(formData.buktiFiles) && formData.buktiFiles.length === 5) {
            return formData.buktiFiles;
        }
        const base = Array.isArray(formData.buktiFiles) ? formData.buktiFiles : [];
        return [...base, ...Array(5 - base.length).fill(null)].slice(0, 5);
    });

    const handleFileSlotChange = async (slotIdx, rawFile) => {
        if (!rawFile) return;
        const compressed = await compressImage(rawFile);
        const isImage = compressed.type.startsWith('image/');

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result;
            const initialSlot = {
                slotIdx,
                file: compressed,
                name: compressed.name,
                type: compressed.type,
                base64: base64Data,
                preview: isImage ? base64Data : null,
                isImage: isImage,
                uploading: true,
                driveUrl: null,
                uploadError: null
            };

            setStagedFiles(prev => {
                const updated = [...prev];
                updated[slotIdx] = initialSlot;
                updateField({ buktiFiles: updated });
                return updated;
            });

            // Trigger eager background upload to Google Drive immediately
            try {
                const driveUrl = await uploadToDrive(compressed);
                setStagedFiles(prev => {
                    const updated = [...prev];
                    if (updated[slotIdx]) {
                        updated[slotIdx] = {
                            ...updated[slotIdx],
                            uploading: false,
                            driveUrl: driveUrl
                        };
                        updateField({ buktiFiles: updated });
                    }
                    return updated;
                });
            } catch (err) {
                console.warn('Background Drive upload failed, will fallback to Step 3:', err);
                setStagedFiles(prev => {
                    const updated = [...prev];
                    if (updated[slotIdx]) {
                        updated[slotIdx] = {
                            ...updated[slotIdx],
                            uploading: false,
                            uploadError: err.message
                        };
                        updateField({ buktiFiles: updated });
                    }
                    return updated;
                });
            }
        };
        reader.readAsDataURL(compressed);
    };

    const handleRemoveSlotFile = (slotIdx) => {
        const updated = [...stagedFiles];
        updated[slotIdx] = null;
        setStagedFiles(updated);
        updateField({ buktiFiles: updated });
    };

    const handleNominalPenjualanChange = (idx, val) => {
        const formatted = formatRupiah(parseRupiah(val));
        const updated = [...(Array.isArray(formData.nominalPenjualan) ? formData.nominalPenjualan : [])];
        updated[idx] = formatted;
        updateField({ nominalPenjualan: updated });
    };

    // --- Validate & go to summary ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setGlobalError('');
        setIsSubmitting(true);

        try {
            const isSingleProofType = ['Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(jenis);

            if (isSingleProofType) {
                if (!stagedFiles[0]) {
                    throw new Error('Anda wajib mengunggah Bukti 1 (Dokumentasi Utama) sebelum melanjutkan.');
                }
            } else {
                const missingSlots = [];
                if (!stagedFiles[0]) missingSlots.push('Bukti 1 (Kutipan Harian Kasir)');
                if (!stagedFiles[1]) missingSlots.push('Bukti 2 (Struk Settlement EDC)');
                if (!stagedFiles[2]) missingSlots.push('Bukti 3 (Struk / Resi Setoran Bank)');

                if (missingSlots.length > 0) {
                    throw new Error(`Anda belum melengkapi seluruh bukti wajib! Harap unggah: ${missingSlots.join(', ')}.`);
                }
            }

            // Step 2 Pre-Upload Mandatory Guard: Ensure ALL selected files have valid driveUrl BEFORE navigating
            let updatedSlots = [...stagedFiles];
            for (let i = 0; i < updatedSlots.length; i++) {
                const item = updatedSlots[i];
                if (!item) continue;

                // Wait if background upload is still in progress
                let waitMs = 0;
                while (item.uploading && waitMs < 25000) {
                    await new Promise(r => setTimeout(r, 500));
                    waitMs += 500;
                }

                // If still missing driveUrl, upload right now in Step 2!
                if (!item.driveUrl && item.file) {
                    try {
                        const compressed = await compressImage(item.file);
                        const driveUrl = await uploadToDrive(compressed);
                        if (driveUrl) {
                            updatedSlots[i] = {
                                name: item.name,
                                type: item.type,
                                uploading: false,
                                driveUrl: driveUrl
                            };
                        }
                    } catch (e) {
                        console.warn('Step 2 photo upload warning:', e.message);
                    }
                }
            }

            const validDriveUrls = updatedSlots.map(s => s?.driveUrl).filter(Boolean);
            const lightweightSlots = updatedSlots.map(s => s ? { name: s.name, type: s.type, driveUrl: s.driveUrl } : null);

            setStagedFiles(updatedSlots);
            updateField({
                buktiFiles: lightweightSlots,
                buktiUrls: validDriveUrls
            });

            // Combine form data for validation
            const combined = {
                ...formData,
                username: profile?.username || '',
                buktiFiles: updatedSlots
            };
            validateSetoranData(combined);
            navigate('/setoran/ringkasan');
        } catch (err) {
            setGlobalError(err.message);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const labelPenjualan =
        jenis === 'Setoran Uang Pecahan Kecil' ? 'Nominal Pecahan Kecil' :
            jenis === 'Pengembalian Petty Cash' ? 'Nominal Petty Cash Awal' : 'Penjualan Tunai (Uang Cash Kasir)';

    return (
        <UserLayout title="Lapor Sales Toko" activeRoute="/setoran">
            <div className="max-w-2xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        {STEP_INFO.map((label, i) => (
                            <div key={i} className={`flex items-center gap-2 text-xs font-bold ${i === 1 ? 'text-primary-600' : 'text-gray-400'}`}>
                                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 1 ? 'bg-primary-500 text-white' : i === 1 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                    {i < 1 ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
                                </span>
                                <span className="hidden sm:block">{label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-500" style={{ width: '66%' }} />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 space-y-8 animate-slide-in">
                    {/* Global error banner */}
                    {globalError && (
                        <div className="flex items-start gap-3 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
                            <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">error</span>
                            <div>
                                <p className="font-bold text-sm">Validasi Gagal</p>
                                <p className="text-sm">{globalError}</p>
                            </div>
                        </div>
                    )}

                    <div className="border-b border-gray-100 pb-4">
                        <h2 className="text-xl font-bold text-gray-900">Langkah 2: Input Nominal & Unggah Bukti</h2>
                        <p className="text-sm text-gray-500 mt-1">Masukkan angka penjualan tunai, transaksi non-tunai, dan foto bukti pendukung.</p>
                    </div>

                    {/* ===== NON-FINANCIAL (Deposit Card) ===== */}
                    {isDepositCard && (
                        <div className="space-y-6">
                            <InputField
                                label="Nomor Deposit Card"
                                value={formData.nomorDepositCard}
                                onChange={(v) => updateField({ nomorDepositCard: v.toUpperCase() })}
                                placeholder="Nomor Kartu"
                                readOnly={!!profile?.deposit_card}
                            />
                            {jenis?.includes('Tertelan') && (
                                <>
                                    <InputField label="Nomor Mesin ATM" value={formData.nomorMesinAtm} onChange={(v) => updateField({ nomorMesinAtm: v.toUpperCase() })} placeholder="Nomor mesin ATM" />
                                    <InputField label="Lokasi Mesin ATM" value={formData.lokasiMesinAtm} onChange={(v) => updateField({ lokasiMesinAtm: v.toUpperCase() })} placeholder="Contoh: SPBU KM 57" />
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">Waktu Kejadian</label>
                                        <input type="time" value={formData.waktuKejadian} onChange={(e) => updateField({ waktuKejadian: e.target.value })} className="form-input" />
                                    </div>
                                </>
                            )}
                            <TextareaField label="Penjelasan" value={formData.penjelasan} onChange={(v) => updateField({ penjelasan: v.toUpperCase() })} placeholder="Kronologi kejadian..." />
                            <UploadSection stagedFiles={stagedFiles} onSlotChange={handleFileSlotChange} onSlotRemove={handleRemoveSlotFile} jenis={jenis} onPreviewClick={setStagedLightboxImg} onOpenSampleModal={setSampleModalImg} />
                        </div>
                    )}

                    {/* ===== FINANCIAL REPORTING (TUNAI + NON-TUNAI) ===== */}
                    {!isNonFinancial && (
                        <div className="space-y-8">
                            {/* BAGIAN 1: PENJUALAN TUNAI & SETORAN */}
                            <section className="bg-gray-50/60 p-5 rounded-xl border border-gray-200 space-y-5">
                                <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold">1</span>
                                    <h3 className="font-bold text-gray-800 text-base">Penjualan Tunai & Uang Setoran</h3>
                                </div>

                                {allSalesDates.map((date, idx) => {
                                    const d = new Date(date);
                                    const dateLabel = !isNaN(d) ? d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                                    return (
                                        <CurrencyField
                                            key={idx}
                                            label={`${labelPenjualan} (${dateLabel})`}
                                            value={Array.isArray(formData.nominalPenjualan) ? formData.nominalPenjualan[idx] || '' : ''}
                                            onChange={(v) => handleNominalPenjualanChange(idx, v)}
                                        />
                                    );
                                })}

                                {isPotongan && (
                                    <div>
                                        <CurrencyField
                                            label="Potongan Uang Sales (Untuk Top Up Petty Cash Toko)"
                                            value={formData.potonganPenjualan}
                                            onChange={(v) => updateField({ potonganPenjualan: v })}
                                        />
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200/80 p-2.5 rounded-lg mt-1.5 flex items-start gap-1.5">
                                            <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5 text-amber-600">info</span>
                                            <span>Isi jika ada uang sales tunai kasir yang dipakai untuk isi ulang (top up) petty cash toko.</span>
                                        </p>
                                    </div>
                                )}

                                <CurrencyField
                                    label="Jumlah Uang Tunai Yang Disetor ke Bank"
                                    value={formData.nominalSetoran}
                                    onChange={(v) => updateField({ nominalSetoran: v })}
                                />

                                {/* Status Selisih Calculator */}
                                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide">Status Selisih Uang Tunai</label>
                                        <p className={`text-base sm:text-lg font-bold mt-0.5 ${selisihLabel.color}`}>{selisihLabel.text}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-gray-400 block uppercase">Dana Uang Cash</span>
                                        <span className="text-xs font-bold text-gray-700">{formatRupiah(danaTersedia)}</span>
                                    </div>
                                </div>

                                {/* Conditional: Deposit Card / KCP / Nomor Referensi */}
                                {metode === 'ATM BCA Menggunakan Deposit Card' && (
                                    <InputField label="Nomor Deposit Card" value={formData.nomorDepositCard} onChange={(v) => updateField({ nomorDepositCard: v.toUpperCase() })} placeholder="Nomor Kartu" readOnly={!!profile?.deposit_card} />
                                )}
                                {metode === 'Teller Bank' && (
                                    <InputField label="KCP Terdekat" value={formData.kcpTerdekat} onChange={(v) => updateField({ kcpTerdekat: v.toUpperCase() })} placeholder="KCP" readOnly={!!profile?.kcp_terdekat} />
                                )}
                                {metode === 'Metode Setoran Lain' && (
                                    <InputField label="Nomor Referensi Bank" value={formData.nomorMesinAtm} onChange={(v) => updateField({ nomorMesinAtm: v.toUpperCase() })} placeholder="Masukkan nomor referensi" />
                                )}
                            </section>

                            {/* BAGIAN 2: PENJUALAN NON-TUNAI (EDC & TRANSFER) */}
                            <section className="bg-blue-50/40 p-5 rounded-xl border border-blue-100 space-y-5">
                                <div className="border-b border-blue-200/60 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                                        <h3 className="font-bold text-gray-800 text-base">Penjualan Non-Tunai (EDC &amp; Transfer)</h3>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1 ml-8">
                                        Masukkan total angka dari kertas settlement EDC BCA, EDC BRI, dan Transfer Bank. Jika tidak ada transaksi, biarkan Rp 0.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* BCA Group */}
                                    <div className="space-y-3 bg-white p-4 rounded-xl border border-blue-150 shadow-sm">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider border-b border-blue-50 pb-2">
                                            <span className="material-symbols-outlined text-base">credit_card</span> EDC BCA
                                        </div>
                                        <CurrencyField label="BCA Debit" value={formData.bcaDebit} onChange={(v) => updateField({ bcaDebit: v })} />
                                        <CurrencyField label="BCA Kredit" value={formData.bcaKredit} onChange={(v) => updateField({ bcaKredit: v })} />
                                        <CurrencyField label="BCA QRIS" value={formData.bcaQris} onChange={(v) => updateField({ bcaQris: v })} />
                                    </div>

                                    {/* BRI Group */}
                                    <div className="space-y-3 bg-white p-4 rounded-xl border border-blue-150 shadow-sm">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-wider border-b border-blue-50 pb-2">
                                            <span className="material-symbols-outlined text-base">credit_card</span> EDC BRI
                                        </div>
                                        <CurrencyField label="BRI Debit" value={formData.briDebit} onChange={(v) => updateField({ briDebit: v })} />
                                        <CurrencyField label="BRI Kredit" value={formData.briKredit} onChange={(v) => updateField({ briKredit: v })} />
                                        <CurrencyField label="BRI QRIS" value={formData.briQris} onChange={(v) => updateField({ briQris: v })} />
                                    </div>
                                </div>

                                {/* Bank Transfer Group */}
                                <div className="bg-white p-4 rounded-xl border border-blue-150 shadow-sm">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-50 pb-2 mb-3">
                                        <span className="material-symbols-outlined text-base">account_balance</span> Transfer Bank
                                    </div>
                                    <CurrencyField label="Bank Transfer" value={formData.bankTransfer} onChange={(v) => updateField({ bankTransfer: v })} />
                                </div>
                            </section>

                            {/* BAGIAN 3: RINCIAN PENJUALAN ONLINE */}
                            <section className="bg-purple-50/30 p-5 rounded-xl border border-purple-150 space-y-4">
                                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white text-xs font-bold">3</span>
                                        <h3 className="font-bold text-gray-800 text-base">Rincian Penjualan Online (Marketplace &amp; E-Commerce)</h3>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 mt-1 ml-8">
                                    Masukkan total angka penjualan dari Halodoc, TikTok Shop, dan Tokopedia. Jika tidak ada transaksi, biarkan Rp 0.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-purple-150 shadow-sm">
                                    <div className="flex flex-col justify-between">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 min-h-[2.25rem] flex items-center leading-tight">Penjualan Online Halodoc</label>
                                        <CurrencyField label="" value={formData.onlineHalodoc} onChange={(v) => updateField({ onlineHalodoc: v })} />
                                    </div>
                                    <div className="flex flex-col justify-between">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 min-h-[2.25rem] flex items-center leading-tight">Penjualan Online TikTok</label>
                                        <CurrencyField label="" value={formData.onlineTiktok} onChange={(v) => updateField({ onlineTiktok: v })} />
                                    </div>
                                    <div className="flex flex-col justify-between">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1 min-h-[2.25rem] flex items-center leading-tight">Penjualan Online Tokopedia</label>
                                        <CurrencyField label="" value={formData.onlineTokopedia} onChange={(v) => updateField({ onlineTokopedia: v })} />
                                    </div>
                                </div>
                            </section>

                            {/* BAGIAN 4: UPLOAD BUKTI FOTO */}
                            <section className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold">4</span>
                                    <h3 className="font-bold text-gray-800 text-base">Upload Bukti Foto (Maksimal 5 Foto)</h3>
                                </div>
                                <UploadSection
                                    stagedFiles={stagedFiles}
                                    onSlotChange={handleFileSlotChange}
                                    onSlotRemove={handleRemoveSlotFile}
                                    jenis={jenis}
                                    onPreviewClick={setStagedLightboxImg}
                                    onOpenSampleModal={setSampleModalImg}
                                />
                            </section>

                            {/* KARTU TOTAL SALES HARIAN (GRAND TOTAL) */}
                            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100/70 border-2 border-orange-300/80 rounded-2xl p-6 shadow-md space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-orange-200/80 pb-3 gap-2">
                                    <h4 className="text-xs font-extrabold text-orange-900 uppercase tracking-wider flex items-center gap-2">
                                        <span className="material-symbols-outlined text-xl text-orange-600">analytics</span> TOTAL SALES HARIAN (Tunai + Non-Tunai + Sales Online)
                                    </h4>
                                    <span className="self-start sm:self-auto text-[10px] font-bold bg-orange-200/80 text-orange-900 px-2.5 py-1 rounded-full uppercase tracking-wider">Konsolidasi Omset</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-700">
                                    <div className="bg-white/80 p-3 rounded-xl border border-orange-200/60 shadow-xs flex flex-col justify-between h-full space-y-2">
                                        <span className="text-gray-500 block text-[11px] min-h-[2.25rem] flex items-center leading-snug">Total Sales Tunai Kasir:</span>
                                        <span className="font-bold text-base text-gray-900 font-mono">{formatRupiah(totalPenjualan)}</span>
                                    </div>
                                    <div className="bg-white/80 p-3 rounded-xl border border-orange-200/60 shadow-xs flex flex-col justify-between h-full space-y-2">
                                        <span className="text-gray-500 block text-[11px] min-h-[2.25rem] flex items-center leading-snug">Total Sales Non-Tunai (EDC &amp; Transfer):</span>
                                        <span className="font-bold text-base text-blue-700 font-mono">{formatRupiah(totalNonTunai)}</span>
                                    </div>
                                    <div className="bg-white/80 p-3 rounded-xl border border-orange-200/60 shadow-xs flex flex-col justify-between h-full space-y-2">
                                        <span className="text-gray-500 block text-[11px] min-h-[2.25rem] flex items-center leading-snug">Total Sales Online (Marketplace):</span>
                                        <span className="font-bold text-base text-purple-700 font-mono">{formatRupiah(totalOnline)}</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t-2 border-orange-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                    <span className="text-sm font-black text-orange-950 uppercase tracking-wide">GRAND TOTAL SALES</span>
                                    <span className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight font-mono">{formatRupiah(grandTotalSales)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Nav buttons */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => {
                                const hasData = stagedFiles.some(Boolean) || !!formData.totalPenjualan || !!formData.nominalSetoran;
                                if (hasData) {
                                    setShowCancelModal(true);
                                } else {
                                    navigate('/setoran');
                                }
                            }}
                            className="w-full sm:w-auto btn-secondary"
                        >
                            <span className="material-symbols-outlined text-base">arrow_back</span> Kembali
                        </button>
                        <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto btn-primary">
                            Lanjut ke Ringkasan <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </button>
                    </div>
                </form>
            </div>

            {/* Modal Konfirmasi Batal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
                        <div className="h-14 w-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                            <span className="material-symbols-outlined text-3xl">warning</span>
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-bold text-gray-900">Batalkan Input Setoran?</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Data nominal dan berkas bukti yang sudah diisi akan hilang jika Anda kembali. Yakin ingin membatalkan?
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCancelModal(false)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Lanjutkan Pengisian
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/setoran')}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
                            >
                                Ya, Batalkan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox Modal Staged Preview */}
            {stagedLightboxImg && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setStagedLightboxImg(null)}>
                    <div className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary-600">image</span> Pratinjau Foto Berkas
                            </h4>
                            <button onClick={() => setStagedLightboxImg(null)} className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-gray-900/5 rounded-xl p-2">
                            <img src={stagedLightboxImg} alt="Detail Staged" className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-md" />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Pratinjau Contoh Struk */}
            {sampleModalImg && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setSampleModalImg(null)}>
                    <div className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600">visibility</span> {sampleModalImg.title}
                            </h4>
                            <button onClick={() => setSampleModalImg(null)} className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        {sampleModalImg.url ? (
                            <div className="max-h-[60vh] overflow-auto flex items-center justify-center bg-gray-900/5 rounded-xl p-2">
                                <img src={sampleModalImg.url} alt={sampleModalImg.title} className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-md" />
                            </div>
                        ) : (
                            <div className="p-8 text-center bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                                <span className="material-symbols-outlined text-4xl text-blue-400">add_photo_alternate</span>
                                <h5 className="font-bold text-gray-800 text-sm">{sampleModalImg.title}</h5>
                                <p className="text-xs text-gray-500 leading-relaxed">{sampleModalImg.description}</p>
                                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-2">
                                    *(Foto contoh acuan dokumen fisik akan segera diunggah oleh admin).*
                                </p>
                            </div>
                        )}
                        <div className="pt-2 text-right">
                            <button type="button" onClick={() => setSampleModalImg(null)} className="btn-secondary text-xs py-2 px-4">
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </UserLayout>
    );
}

/* Sub-components */

function InputField({ label, value, onChange, placeholder, readOnly }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => !readOnly && onChange(e.target.value.toUpperCase())}
                placeholder={placeholder}
                readOnly={readOnly}
                className={`form-input uppercase ${readOnly ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}`}
                autoComplete="off"
            />
        </div>
    );
}

function CurrencyField({ label, value, onChange }) {
    const handleChange = (e) => {
        const raw = parseRupiah(e.target.value);
        onChange(raw > 0 ? formatRupiah(raw) : '');
    };
    return (
        <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
            <input
                type="text"
                inputMode="numeric"
                value={value || ''}
                onChange={handleChange}
                placeholder="Rp 0"
                className="form-input"
                autoComplete="off"
            />
        </div>
    );
}

function TextareaField({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
            <textarea
                rows={3}
                value={value || ''}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                placeholder={placeholder}
                className="form-input uppercase resize-none"
            />
        </div>
    );
}

function UploadSection({ stagedFiles, onSlotChange, onSlotRemove, jenis, onPreviewClick, onOpenSampleModal }) {
    const isSingleProofType = ['Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(jenis);

    const slots = isSingleProofType
        ? [
            { idx: 0, label: "Bukti 1: Dokumentasi Utama", required: true },
            { idx: 1, label: "Bukti 2: Lampiran Pendukung", required: false },
            { idx: 2, label: "Bukti 3: Lampiran Pendukung", required: false },
            { idx: 3, label: "Bukti 4: Opsional", required: false },
            { idx: 4, label: "Bukti 5: Opsional", required: false }
          ]
        : [
            { idx: 0, label: "Bukti 1: Kutipan Harian Kasir", required: true, sampleKey: "slot1" },
            { idx: 1, label: "Bukti 2: Struk Settlement EDC", required: true, sampleKey: "slot2" },
            { idx: 2, label: "Bukti 3: Struk / Resi Setoran Bank", required: true, sampleKey: "slot3" },
            { idx: 3, label: "Bukti 4: Foto Pendukung (Opsional)", required: false },
            { idx: 4, label: "Bukti 5: Foto Pendukung (Opsional)", required: false }
          ];

    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">Unggah foto struk/resi yang jelas dan dapat dibaca sesuai slot di bawah ini.</p>
            
            <div className="grid grid-cols-1 gap-3.5">
                {slots.map((slot) => {
                    const sf = stagedFiles[slot.idx];
                    const fileInputRef = useRef(null);
                    const cameraInputRef = useRef(null);

                    return (
                        <div key={slot.idx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-primary-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
                                        Slot #{slot.idx + 1}
                                    </span>
                                    {slot.required ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 uppercase tracking-wide">Wajib</span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-50 text-gray-500 border border-gray-200 uppercase tracking-wide">Opsional</span>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <h4 className="text-sm font-bold text-gray-800 leading-snug">
                                        {slot.label}
                                    </h4>
                                    {slot.sampleKey && SAMPLE_DOCUMENT_IMAGES[slot.sampleKey] && (
                                        <button
                                            type="button"
                                            onClick={() => onOpenSampleModal && onOpenSampleModal(SAMPLE_DOCUMENT_IMAGES[slot.sampleKey])}
                                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-blue-200 shadow-sm transition-all w-fit"
                                        >
                                            <span className="material-symbols-outlined text-sm text-blue-600">visibility</span> Lihat Contoh Struk
                                        </button>
                                    )}
                                </div>
                                
                                {sf ? (
                                    <div className="flex items-center gap-3 text-xs text-gray-800 pt-2">
                                        {sf.isImage && sf.preview ? (
                                            <div
                                                className="relative group h-16 w-16 rounded-xl border border-gray-200 overflow-hidden shadow-sm flex-shrink-0 cursor-pointer"
                                                onClick={() => onPreviewClick && onPreviewClick(sf.preview)}
                                                title="Klik untuk pratinjau penuh"
                                            >
                                                <img src={sf.preview} alt="preview" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                    <span className="material-symbols-outlined text-base">zoom_in</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-16 w-16 flex flex-col items-center justify-center bg-red-50 text-red-600 rounded-xl border border-red-200 shadow-sm flex-shrink-0">
                                                <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                                                <span className="text-[9px] font-bold">PDF</span>
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <span className="block font-bold text-gray-900 truncate max-w-[220px]" title={sf.name}>{sf.name}</span>
                                            {sf.uploading ? (
                                                <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1 mt-0.5 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 w-fit animate-pulse">
                                                    <span className="material-symbols-outlined text-[11px] animate-spin">sync</span> Mengunggah ke Drive...
                                                </span>
                                            ) : sf.driveUrl ? (
                                                <span className="text-[10px] text-green-700 font-bold flex items-center gap-1 mt-0.5 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 w-fit">
                                                    <span className="material-symbols-outlined text-[11px]">cloud_done</span> Terunggah ke Drive
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1 mt-0.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 w-fit">
                                                    <span className="material-symbols-outlined text-[11px]">check_circle</span> Siap Diunggah
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic flex items-center gap-1 pt-1">
                                        <span className="material-symbols-outlined text-sm text-gray-300">cloud_off</span> Belum ada file diunggah
                                    </p>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) onSlotChange(slot.idx, file);
                                    }}
                                />
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    ref={cameraInputRef}
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) onSlotChange(slot.idx, file);
                                    }}
                                />

                                {sf ? (
                                    <button
                                        type="button"
                                        onClick={() => onSlotRemove(slot.idx)}
                                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 text-red-600 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span> Hapus
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-sm">upload_file</span> Pilih File
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => cameraInputRef.current?.click()}
                                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-sm">photo_camera</span> Foto
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
