import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormWizard } from '../context/FormWizardContext';
import { parseRupiah, formatRupiah, validateSetoranData, NON_FINANCIAL_TYPES } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const STEP_INFO = ['Detail Laporan', 'Detail Setoran', 'Ringkasan & Kirim'];

export default function DetailSetoranPage() {
    const { profile } = useAuth();
    const { formData, updateField } = useFormWizard();
    const navigate = useNavigate();

    const [globalError, setGlobalError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const jenis = formData.jenisPelaporan;
    const metode = formData.metodeSetoran;
    const isNonFinancial = NON_FINANCIAL_TYPES.includes(jenis);
    const isUangLebih = jenis === 'Setoran Uang Lebih';
    const isPotongan = jenis === 'Setoran Sales Dengan Potongan Penjualan';
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

    // --- Live calculator ---
    const totalPenjualan = Array.isArray(formData.nominalPenjualan)
        ? formData.nominalPenjualan.reduce((s, v) => s + parseRupiah(v), 0)
        : parseRupiah(formData.nominalPenjualan);
    const potongan = parseRupiah(formData.potonganPenjualan);
    const setoran = parseRupiah(formData.nominalSetoran);
    const danaTersedia = totalPenjualan - potongan;
    const selisih = danaTersedia - setoran;

    const selisihLabel = selisih > 0
        ? { text: `${formatRupiah(selisih)} (Kurang)`, color: 'text-gray-800' }
        : selisih < 0
            ? { text: `${formatRupiah(Math.abs(selisih))} (Lebih)`, color: 'text-blue-600' }
            : { text: 'Lunas (Rp 0)', color: 'text-green-600' };

    // --- File upload staging ---
    const [stagedFiles, setStagedFiles] = useState(formData.buktiFiles || []);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setGlobalError('Hanya file gambar yang diperbolehkan.');
            return;
        }
        if (stagedFiles.length >= 3) {
            setGlobalError('Maksimal 3 bukti foto.');
            return;
        }
        setGlobalError('');
        const preview = URL.createObjectURL(file);
        const newFiles = [...stagedFiles, { file, name: file.name, preview }];
        setStagedFiles(newFiles);
        updateField({ buktiFiles: newFiles });
        e.target.value = '';
    };

    const handleRemoveFile = (idx) => {
        const updated = stagedFiles.filter((_, i) => i !== idx);
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
    const handleSubmit = (e) => {
        e.preventDefault();
        setGlobalError('');
        setIsSubmitting(true);

        try {
            // Combine form data for validation
            const combined = {
                ...formData,
                username: profile?.username || '',
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

    const today = new Date().toISOString().split('T')[0];

    const labelPenjualan =
        jenis === 'Setoran Uang Pecahan Kecil' ? 'Nominal Pecahan Kecil' :
            jenis === 'Pengembalian Petty Cash' ? 'Nominal Petty Cash Awal' : 'Nominal Penjualan Tunai';

    return (
        <UserLayout title="Detail Setoran" activeRoute="/setoran">
            <div className="max-w-xl mx-auto">
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

                <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 space-y-6">
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

                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Detail Setoran</h2>
                        <p className="text-sm text-gray-500 mt-1">Lengkapi detail nominal dan bukti di bawah ini.</p>
                    </div>

                    {/* ===== NON-FINANCIAL (Deposit Card) ===== */}
                    {isDepositCard && (
                        <>
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
                            <UploadSection stagedFiles={stagedFiles} onAdd={handleFileChange} onRemove={handleRemoveFile} label="Bukti Dokumentasi" />
                        </>
                    )}

                    {/* ===== UANG LEBIH ===== */}
                    {isUangLebih && !isDepositCard && (
                        <>
                            <CurrencyField label="Nominal Setoran" value={formData.nominalSetoran} onChange={(v) => updateField({ nominalSetoran: v })} />
                            <TextareaField label="Penjelasan" value={formData.penjelasan} onChange={(v) => updateField({ penjelasan: v.toUpperCase() })} placeholder="Jelaskan sumber uang lebih" />
                            <UploadSection stagedFiles={stagedFiles} onAdd={handleFileChange} onRemove={handleRemoveFile} label="Bukti Setoran" />
                        </>
                    )}

                    {/* ===== NORMAL FINANCIAL ===== */}
                    {!isNonFinancial && !isUangLebih && (
                        <>
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
                                <CurrencyField label="Potongan Penjualan" value={formData.potonganPenjualan} onChange={(v) => updateField({ potonganPenjualan: v })} />
                            )}

                            <CurrencyField label="Nominal Yang Disetorkan" value={formData.nominalSetoran} onChange={(v) => updateField({ nominalSetoran: v })} />

                            {/* Live Selisih Calculator */}
                            {!isNonFinancial && (
                                <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Selisih / Belum Disetor</label>
                                    <p className={`text-lg font-bold ${selisihLabel.color}`}>{selisihLabel.text}</p>
                                </div>
                            )}

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

                            <UploadSection stagedFiles={stagedFiles} onAdd={handleFileChange} onRemove={handleRemoveFile} label="Bukti Setoran" />
                        </>
                    )}

                    {/* Nav buttons */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-100">
                        <button type="button" onClick={() => navigate('/setoran')} className="w-full sm:w-auto btn-secondary">
                            <span className="material-symbols-outlined text-base">arrow_back</span> Kembali
                        </button>
                        <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto btn-primary">
                            Lanjut ke Ringkasan <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </button>
                    </div>
                </form>
            </div>
        </UserLayout>
    );
}

/* ==================================================================
   Sub-components
================================================================== */

function InputField({ label, value, onChange, placeholder, readOnly }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => !readOnly && onChange(e.target.value)}
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
            <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
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
            <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
            <textarea
                rows={3}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="form-input uppercase resize-none"
            />
        </div>
    );
}

function UploadSection({ label, stagedFiles, onAdd, onRemove }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">{label}</label>

            {stagedFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                    {stagedFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-green-50 border border-green-100 p-3 rounded-lg">
                            <img src={f.preview} alt="preview" className="h-12 w-12 object-cover rounded border border-gray-200 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{f.name}</p>
                                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">check_circle</span> Siap diupload
                                </p>
                            </div>
                            <button type="button" onClick={() => onRemove(idx)} className="text-red-500 hover:text-red-700">
                                <span className="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {stagedFiles.length < 3 && (
                <label className="cursor-pointer">
                    <div className="upload-box p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center hover:border-primary-400 hover:bg-orange-50 transition-colors group">
                        <div className="flex justify-center text-gray-400 group-hover:text-primary-500 mb-2">
                            <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                        </div>
                        <p className="text-sm font-medium text-gray-600 group-hover:text-primary-600">
                            <span className="text-primary-500">Pilih File</span> atau ambil foto
                        </p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG — maks. 3 foto</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onAdd} />
                </label>
            )}
        </div>
    );
}
