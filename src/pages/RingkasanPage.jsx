import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormWizard } from '../context/FormWizardContext';
import { parseRupiah, formatRupiah, NON_FINANCIAL_TYPES, compressImage } from '../lib/validators';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';
import { uploadToDrive } from '../services/driveService';
import UserLayout from '../components/UserLayout';

const STEP_INFO = ['1. Informasi Sales & Metode', '2. Input Nominal & Bukti', '3. Periksa & Kirim'];

function formatDate(d) {
    return d ? new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
}


function base64ToFile(base64Data, fileName, mimeType) {
    if (!base64Data) return null;
    try {
        const arr = base64Data.split(',');
        const mime = mimeType || (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
        const bstr = atob(arr[1] || arr[0]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], fileName || 'bukti.jpg', { type: mime });
    } catch (e) {
        console.error('base64ToFile error:', e);
        return null;
    }
}

export default function RingkasanPage() {
    const { profile } = useAuth();
    const { formData, resetForm } = useFormWizard();
    const navigate = useNavigate();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const [error, setError] = useState('');
    const [driveWarning, setDriveWarning] = useState('');
    const [lightboxImg, setLightboxImg] = useState(null);

    const isNonFinancial = NON_FINANCIAL_TYPES.includes(formData.jenisPelaporan);

    const nominals = Array.isArray(formData.nominalPenjualan)
        ? formData.nominalPenjualan
        : formData.nominalPenjualan ? [formData.nominalPenjualan] : [];

    const allDates = [formData.tanggalPenjualan, ...(formData.tanggalPenjualanTambahan || [])].filter(Boolean);
    const potongan = parseRupiah(formData.potonganPenjualan);
    const totalPenjualan = nominals.reduce((s, v) => s + parseRupiah(v), 0);
    const danaTersedia = totalPenjualan - potongan;
    const nominalSetoran = parseRupiah(formData.nominalSetoran);
    const selisih = danaTersedia - nominalSetoran;

    const totalNonTunai =
        parseRupiah(formData.bcaDebit) +
        parseRupiah(formData.bcaKredit) +
        parseRupiah(formData.bcaQris) +
        parseRupiah(formData.briDebit) +
        parseRupiah(formData.briKredit) +
        parseRupiah(formData.briQris) +
        parseRupiah(formData.bankTransfer);

    const totalOnline =
        parseRupiah(formData.onlineHalodoc) +
        parseRupiah(formData.onlineTiktok) +
        parseRupiah(formData.onlineTokopedia);

    const grandTotalSales = totalPenjualan + totalNonTunai + totalOnline;

    // Mapping label tag slot bukti yang spesifik & mudah dipahami
    const isSingleProofType = ['Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(formData.jenisPelaporan);
    const slotLabels = isSingleProofType
        ? [
            "Bukti 1: Dokumentasi Utama",
            "Bukti 2: Lampiran Pendukung",
            "Bukti 3: Lampiran Pendukung",
            "Bukti 4: Foto Pendukung",
            "Bukti 5: Foto Pendukung"
          ]
        : [
            "Bukti 1: Kutipan Harian Kasir",
            "Bukti 2: Struk Settlement EDC",
            "Bukti 3: Struk / Resi Setoran Bank",
            "Bukti 4: Foto Pendukung",
            "Bukti 5: Foto Pendukung"
          ];

    const handleKirim = async () => {
        if (!window.confirm('Kirim laporan sales sekarang?')) return;
        setIsSubmitting(true);
        setError('');

        try {
            // 1. Upload staged files to Google Drive with Base64 conversion & resilience
            let buktiUrls = [...(formData.buktiUrls || [])];
            if (formData.buktiFiles?.length > 0) {
                const filesToUpload = formData.buktiFiles
                    .map(item => {
                        if (!item) return null;
                        if (item.file instanceof File) return item.file;
                        if (item.base64) return base64ToFile(item.base64, item.name, item.type);
                        return null;
                    })
                    .filter(Boolean);

                if (filesToUpload.length > 0) {
                    setUploadStatus(`Mengunggah ${filesToUpload.length} lampiran foto ke Drive...`);
                    try {
                        const uploadPromises = filesToUpload.map(fileObj => uploadToDrive(fileObj));
                        const uploadedUrls = await Promise.all(uploadPromises);
                        uploadedUrls.forEach(url => {
                            if (url) buktiUrls.push(url);
                        });
                    } catch (driveErr) {
                        throw new Error(`Gagal saat mengunggah lampiran foto: ${driveErr.message}. Silakan periksa koneksi dan coba lagi.`);
                    }
                }
            }

            // MANDATORY VALIDATION GUARD: Stop submission if photos are required but empty
            const isNonFin = NON_FINANCIAL_TYPES.includes(formData.jenisPelaporan);
            const isSingleProof = ['Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(formData.jenisPelaporan);
            const minExpected = isSingleProof ? 1 : 3;

            if (!isNonFin && buktiUrls.length === 0) {
                throw new Error(`Lampiran foto bukti setoran wajib diunggah (minimal ${minExpected} foto). Silakan kembali ke Langkah 2 untuk memilih foto bukti.`);
            }

            setUploadStatus('Menyimpan data laporan...');

            // 2. Insert each date row into Supabase `laporan` with auto-retry resilience
            const rows = allDates.map((date, i) => ({
                user_id: profile?.id,
                tanggal_jual: date,
                tanggal_setor: formData.tanggalSetoran || null,
                jenis_pelaporan: formData.jenisPelaporan,
                metode_setoran: formData.metodeSetoran,
                nominal_jual: i === 0 ? (parseRupiah(nominals[i]) || 0) : (parseRupiah(nominals[i]) || 0),
                nominal_setoran: i === 0 ? nominalSetoran : 0,
                potongan: i === 0 ? potongan : 0,
                penjelasan: formData.penjelasan || null,
                nomor_deposit_card: formData.nomorDepositCard || null,
                nomor_mesin_atm: formData.nomorMesinAtm || null,
                lokasi_mesin_atm: formData.lokasiMesinAtm || null,
                waktu_kejadian: formData.waktuKejadian || null,
                bukti_urls: buktiUrls,
                kcp_terdekat: formData.kcpTerdekat || null,
                // Kolom Non-Tunai baru
                bca_debit: i === 0 ? (parseRupiah(formData.bcaDebit) || 0) : 0,
                bca_kredit: i === 0 ? (parseRupiah(formData.bcaKredit) || 0) : 0,
                bca_qris: i === 0 ? (parseRupiah(formData.bcaQris) || 0) : 0,
                bri_debit: i === 0 ? (parseRupiah(formData.briDebit) || 0) : 0,
                bri_kredit: i === 0 ? (parseRupiah(formData.briKredit) || 0) : 0,
                bri_qris: i === 0 ? (parseRupiah(formData.briQris) || 0) : 0,
                bank_transfer: i === 0 ? (parseRupiah(formData.bankTransfer) || 0) : 0,
                total_non_tunai: i === 0 ? (totalNonTunai || 0) : 0,
                // Kolom Penjualan Online
                online_halodoc: i === 0 ? (parseRupiah(formData.onlineHalodoc) || 0) : 0,
                online_tiktok: i === 0 ? (parseRupiah(formData.onlineTiktok) || 0) : 0,
                online_tokopedia: i === 0 ? (parseRupiah(formData.onlineTokopedia) || 0) : 0,
                total_online: i === 0 ? (totalOnline || 0) : 0,
            }));

            let insertSuccess = false;
            let lastErr = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const { error: insertError } = await safeSupabaseQuery(
                        supabase.from('laporan').insert(rows),
                        10000
                    );
                    if (insertError) throw insertError;
                    insertSuccess = true;
                    break;
                } catch (retryErr) {
                    lastErr = retryErr;
                    console.warn(`Simpan laporan percobaan ke-${attempt} gagal:`, retryErr.message);
                    if (attempt < 3) {
                        setUploadStatus(`Menyimpan data laporan (Percobaan ${attempt + 1}/3)...`);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            if (!insertSuccess) {
                throw lastErr || new Error('Gagal menyimpan laporan ke database.');
            }

            // 3. Trigger critical alert email if needed (Asynchronous / Background)
            const isCriticalIssue =
                formData.jenisPelaporan === 'Deposit Card Tertelan Mesin ATM' ||
                formData.jenisPelaporan === 'Deposit Card Terblokir (Salah Input PIN 3x)';

            if (isCriticalIssue) {
                supabase.functions.invoke('send-critical-alert', {
                    body: {
                        cabang: profile?.username || 'Tidak Diketahui',
                        pelaporEmail: profile?.email || '',
                        tanggal: new Date().toISOString(),
                        masalah: formData.jenisPelaporan + (formData.penjelasan ? `\nCatatan: ${formData.penjelasan}` : '')
                    },
                }).catch(err => console.error("Gagal mengirim critical alert", err));
            }

            // 4. Clear wizard state and go to confirmation
            resetForm();
            navigate('/setoran/konfirmasi', {
                state: {
                    success: true,
                    jenisPelaporan: formData.jenisPelaporan,
                    tanggalPenjualan: formData.tanggalPenjualan,
                    tanggalPenjualanTambahan: formData.tanggalPenjualanTambahan,
                    tanggalSetoran: formData.tanggalSetoran,
                    metodeSetoran: formData.metodeSetoran,
                    metodeLain: formData.metodeLain,
                    totalPenjualan: totalPenjualan,
                    potongan: potongan,
                    nominalSetoran: nominalSetoran,
                    totalNonTunai: totalNonTunai,
                    totalOnline: totalOnline,
                    grandTotalSales: grandTotalSales,
                    selisih: selisih,
                    buktiCount: formData.buktiFiles?.filter(Boolean).length || 0,
                    username: profile?.username,
                    kodeToko: profile?.kode_toko || profile?.username,
                },
            });
        } catch (err) {
            console.error('Submit error:', err);
            let userMsg = err.message || 'Terjadi kesalahan saat mengirim laporan.';
            if (userMsg.includes('Lock broken') || userMsg.includes('AbortError')) {
                userMsg = 'Sistem sedang memperbarui koneksi keamanan. Silakan klik "Kirim Lapor Sales" sekali lagi.';
            }
            setError(userMsg);
        } finally {
            setIsSubmitting(false);
            setUploadStatus('');
        }
    };

    return (
        <UserLayout title="Lapor Sales Toko" activeRoute="/setoran">
            <div className="max-w-4xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        {STEP_INFO.map((label, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs font-bold text-primary-600">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">
                                    {i < 2 ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
                                </span>
                                <span className="hidden sm:block">{label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: '99%' }} />
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Langkah 3: Periksa & Kirim Lapor Sales</h1>
                    <p className="mt-2 text-gray-500 text-sm">Periksa kembali seluruh angka penjualan dan foto bukti sebelum dikirimkan.</p>
                </div>

                {driveWarning && (
                    <div className="mb-4 flex items-start gap-3 bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg animate-slide-in">
                        <span className="material-symbols-outlined flex-shrink-0 mt-0.5">warning</span>
                        <p className="text-sm">{driveWarning}</p>
                        <button onClick={() => setDriveWarning('')} className="ml-auto opacity-60 hover:opacity-100">
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
                        <span className="material-symbols-outlined flex-shrink-0">error</span>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <div className="space-y-6 animate-slide-in">
                    {/* Informasi Laporan Sales */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary-500">info</span> Informasi Laporan Sales
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoCard icon="person" label="Nama Pelapor" value={profile?.username || '-'} />
                            <InfoCard icon="description" label="Jenis Laporan" value={formData.jenisPelaporan || '-'} highlight />
                            <InfoCard icon="calendar_today" label="Tanggal Setoran" value={formatDate(formData.tanggalSetoran)} />
                            <InfoCard icon="credit_card" label="Metode Setoran" value={
                                formData.metodeSetoran === 'Metode Setoran Lain' ? (formData.metodeLain || '-') : (formData.metodeSetoran || '-')
                            } />
                        </div>
                    </section>

                    {/* Rincian Omset Sales Harian */}
                    {!isNonFinancial && (
                        <section>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-green-600">payments</span> Rincian Omset Sales Harian
                            </h3>
                            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden px-6 py-4 space-y-4">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider text-left border-b-2 border-gray-100 w-3/4">Deskripsi Rincian</th>
                                            <th className="py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider text-right border-b-2 border-gray-100 w-1/4">Nominal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {/* Sales Tunai */}
                                        {nominals.map((nom, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2.5 text-sm text-gray-700">Penjualan Tunai Tgl {formatDate(allDates[idx])}</td>
                                                <td className="py-2.5 text-sm text-right font-medium text-gray-900">{formatRupiah(parseRupiah(nom))}</td>
                                            </tr>
                                        ))}
                                        {potongan > 0 && (
                                            <tr>
                                                <td className="py-2.5 text-sm text-red-500">Potongan Uang Sales (Top Up Petty Cash)</td>
                                                <td className="py-2.5 text-sm text-right font-medium text-red-500">({formatRupiah(potongan)})</td>
                                            </tr>
                                        )}
                                        <tr className="bg-gray-50/70 font-semibold">
                                            <td className="py-2 text-sm text-gray-800">Jumlah Setoran Tunai ke Bank</td>
                                            <td className="py-2 text-sm text-right text-primary-600 font-bold">{formatRupiah(nominalSetoran)}</td>
                                        </tr>

                                        {/* Non-Tunai Breakdown */}
                                        {totalNonTunai > 0 && (
                                            <>
                                                <tr className="border-t-2 border-gray-100">
                                                    <td colSpan={2} className="pt-3 pb-1 text-xs font-bold text-blue-800 uppercase tracking-wider">
                                                        Penjualan Non-Tunai (EDC & Transfer)
                                                    </td>
                                                </tr>
                                                {parseRupiah(formData.bcaDebit) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BCA Debit</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.bcaDebit))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.bcaKredit) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BCA Kredit</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.bcaKredit))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.bcaQris) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BCA QRIS</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.bcaQris))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.briDebit) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BRI Debit</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.briDebit))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.briKredit) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BRI Kredit</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.briKredit))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.briQris) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• BRI QRIS</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.briQris))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.bankTransfer) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• Transfer Bank</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.bankTransfer))}</td>
                                                    </tr>
                                                )}
                                            </>
                                        )}

                                        {/* Online Sales Breakdown */}
                                        {totalOnline > 0 && (
                                            <>
                                                <tr className="border-t-2 border-gray-100">
                                                    <td colSpan={2} className="pt-3 pb-1 text-xs font-bold text-purple-800 uppercase tracking-wider">
                                                        Penjualan Online (Marketplace &amp; E-Commerce)
                                                    </td>
                                                </tr>
                                                {parseRupiah(formData.onlineHalodoc) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• Halodoc</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.onlineHalodoc))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.onlineTiktok) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• TikTok Shop</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.onlineTiktok))}</td>
                                                    </tr>
                                                )}
                                                {parseRupiah(formData.onlineTokopedia) > 0 && (
                                                    <tr>
                                                        <td className="py-2 text-sm text-gray-600 pl-3">• Tokopedia</td>
                                                        <td className="py-2 text-sm text-right font-medium text-gray-800">{formatRupiah(parseRupiah(formData.onlineTokopedia))}</td>
                                                    </tr>
                                                )}
                                            </>
                                        )}

                                        {/* Grand Total */}
                                        <tr className="border-t-2 border-orange-200 bg-orange-50/50">
                                            <td className="py-3 text-sm font-extrabold text-orange-950">TOTAL SALES HARIAN (Tunai + Non-Tunai + Sales Online)</td>
                                            <td className="py-3 text-lg text-right font-black text-orange-600">{formatRupiah(grandTotalSales)}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                {selisih > 0 && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-red-600 text-lg">warning</span>
                                            <span className="text-red-800 font-bold text-xs uppercase tracking-wide">Status Selisih Tunai</span>
                                        </div>
                                        <span className="text-red-900 font-bold text-sm">Setoran Kurang {formatRupiah(selisih)}</span>
                                    </div>
                                )}
                                {selisih < 0 && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-blue-600 text-lg">info</span>
                                            <span className="text-blue-800 font-bold text-xs uppercase tracking-wide">Status Selisih Tunai</span>
                                        </div>
                                        <span className="text-blue-900 font-bold text-sm">Setoran Lebih {formatRupiah(Math.abs(selisih))}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Detail Tambahan */}
                    {(formData.nomorDepositCard || formData.nomorMesinAtm || formData.lokasiMesinAtm || formData.waktuKejadian || formData.penjelasan) && (
                        <section>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-orange-500">list_alt</span> Detail Tambahan
                            </h3>
                            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
                                {formData.nomorDepositCard && <DetailRow label="Nomor Deposit Card" value={formData.nomorDepositCard} mono />}
                                {formData.nomorMesinAtm && <DetailRow label="Nomor Mesin ATM" value={formData.nomorMesinAtm} />}
                                {formData.lokasiMesinAtm && <DetailRow label="Lokasi Mesin" value={formData.lokasiMesinAtm} />}
                                {formData.waktuKejadian && <DetailRow label="Waktu Kejadian" value={formData.waktuKejadian} />}
                                {formData.penjelasan && (
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Keterangan</p>
                                        <div className="bg-gray-50 p-3 rounded-md text-gray-700 text-sm italic border border-gray-100">"{formData.penjelasan}"</div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Bukti Lampiran Foto */}
                    {formData.buktiFiles?.filter(Boolean).length > 0 && (
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-500">attach_file</span> Bukti Lampiran Foto (Struk & Resi)
                                </h3>
                                <span className="text-[11px] font-semibold text-gray-400">Klik foto untuk perbesar</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {formData.buktiFiles.map((f, slotIdx) => {
                                    if (!f) return null;
                                    const tagLabel = slotLabels[slotIdx] || `Bukti ${slotIdx + 1}`;
                                    return (
                                        <div
                                            key={slotIdx}
                                            onClick={() => f.preview && setLightboxImg({ url: f.preview, name: f.name, label: tagLabel })}
                                            className="relative group aspect-[4/3] rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-900 cursor-pointer hover:shadow-md transition-all transform hover:-translate-y-0.5"
                                        >
                                            {f.preview ? (
                                                <img src={f.preview} alt={f.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-3 bg-gray-50">
                                                    <span className="material-symbols-outlined text-4xl text-red-500">picture_as_pdf</span>
                                                    <span className="text-[11px] font-bold mt-1 text-gray-700 truncate max-w-full" title={f.name}>{f.name}</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 flex flex-col justify-between opacity-95 group-hover:opacity-100 transition-opacity">
                                                <div className="flex justify-end">
                                                    <span className="bg-black/60 backdrop-blur-xs text-white text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/20 font-medium">
                                                        <span className="material-symbols-outlined text-[13px]">zoom_in</span> Pratinjau
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="inline-block bg-primary-600/90 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide mb-1 border border-white/10">
                                                        {tagLabel}
                                                    </span>
                                                    <p className="text-gray-200 text-[11px] truncate font-medium drop-shadow-sm" title={f.name}>{f.name}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>

                {/* Action buttons */}
                <div className="mt-10 flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-200">
                    <button type="button" onClick={() => navigate('/setoran/detail')} className="w-full sm:w-auto btn-secondary">
                        <span className="material-symbols-outlined text-lg">edit</span> Edit Kembali
                    </button>
                    <button
                        type="button"
                        onClick={handleKirim}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-lg text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary-500/30"
                    >
                        {isSubmitting ? (
                            <><span className="material-symbols-outlined animate-spin text-lg">sync</span> {uploadStatus || 'Mengirim...'}</>
                        ) : (
                            <><span className="material-symbols-outlined text-lg">send</span> Kirim Lapor Sales</>
                        )}
                    </button>
                </div>
            </div>

            {/* Modal Lightbox Pratinjau Foto Penuh */}
            {lightboxImg && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setLightboxImg(null)}>
                    <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div>
                                <span className="text-[11px] font-bold text-primary-600 uppercase tracking-wider block">{lightboxImg.label}</span>
                                <h4 className="font-bold text-gray-900 text-sm truncate max-w-md" title={lightboxImg.name}>{lightboxImg.name}</h4>
                            </div>
                            <button onClick={() => setLightboxImg(null)} className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors">
                                <span className="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                        <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-gray-950 rounded-xl p-2 shadow-inner">
                            <img src={lightboxImg.url} alt={lightboxImg.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" />
                        </div>
                        <div className="pt-1 flex justify-between items-center text-xs text-gray-500">
                            <span>Periksa kejelasan angka penjualan pada foto struk di atas.</span>
                            <button type="button" onClick={() => setLightboxImg(null)} className="btn-secondary py-1.5 px-4 text-xs">
                                Tutup Pratinjau
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </UserLayout>
    );
}

/* Sub-components */
function InfoCard({ icon, label, value, highlight }) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-lg text-primary-500">{icon}</span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-base font-bold break-words leading-tight ${highlight ? 'text-primary-600' : 'text-gray-900'}`}>{value}</div>
        </div>
    );
}

function DetailRow({ label, value, mono }) {
    return (
        <div className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0">
            <span className="text-sm text-gray-500">{label}</span>
            <span className={`text-sm font-medium ${mono ? 'font-mono bg-gray-100 px-2 py-0.5 rounded' : ''} text-gray-800`}>{value}</span>
        </div>
    );
}
