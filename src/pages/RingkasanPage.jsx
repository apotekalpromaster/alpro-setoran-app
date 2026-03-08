import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormWizard } from '../context/FormWizardContext';
import { parseRupiah, formatRupiah, NON_FINANCIAL_TYPES } from '../lib/validators';
import { supabase } from '../services/supabaseClient';
import { uploadToDrive } from '../services/driveService';
import UserLayout from '../components/UserLayout';

const STEP_INFO = ['Detail Laporan', 'Detail Setoran', 'Ringkasan & Kirim'];

function formatDate(d) {
    return d ? new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
}

export default function RingkasanPage() {
    const { profile } = useAuth();
    const { formData, resetForm } = useFormWizard();
    const navigate = useNavigate();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const [error, setError] = useState('');
    const [driveWarning, setDriveWarning] = useState('');


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

    const handleKirim = async () => {
        if (!window.confirm('Kirim laporan sekarang?')) return;
        setIsSubmitting(true);
        setError('');

        try {
            // 1. Upload staged files to Google Drive (via Edge Function)
            //    Strict requirement: If Drive upload fails, fail the entire submission.
            let buktiUrls = [...(formData.buktiUrls || [])];
            if (formData.buktiFiles?.length > 0) {
                for (let i = 0; i < formData.buktiFiles.length; i++) {
                    const { file } = formData.buktiFiles[i];
                    try {
                        setUploadStatus(`Mengunggah lampiran (${i + 1}/${formData.buktiFiles.length})...`);
                        const url = await uploadToDrive(file);
                        if (!url) throw new Error("Gagal mendapatkan URL Google Drive.");
                        buktiUrls.push(url);
                    } catch (driveErr) {
                        // Throw to outer catch block to stop submission and display error
                        throw new Error(`Gagal saat mengunggah "${file.name}": ${driveErr.message}. Silahkan coba beberapa saat lagi.`);
                    }
                }
                setUploadStatus('Menyimpan data laporan...');
            }

            // 2. Insert each date row into Supabase `laporan`
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
            }));

            const { error: insertError } = await supabase.from('laporan').insert(rows);
            if (insertError) throw insertError;

            // 3. Trigger critical alert email if needed (Asynchronous / Background)
            const isCriticalIssue =
                formData.jenisPelaporan === 'Deposit Card Tertelan Mesin ATM' ||
                formData.jenisPelaporan === 'Deposit Card Terblokir (Salah Input PIN 3x)';

            if (isCriticalIssue) {
                // Jangan pakai 'await' agar berjalan non-blocking di background,
                // tangkap error silently agar user form tidak terblokir
                supabase.functions.invoke('send-critical-alert', {
                    body: {
                        cabang: profile?.username || 'Tidak Diketahui',
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
                    tanggalSetoran: formData.tanggalSetoran,
                    nominalSetoran: nominalSetoran,
                    username: profile?.username,
                },
            });
        } catch (err) {
            console.error('Submit error:', err);
            setError(err.message || 'Terjadi kesalahan saat mengirim laporan.');
        } finally {
            setIsSubmitting(false);
            setUploadStatus('');
        }
    };

    return (
        <UserLayout title="Ringkasan Laporan" activeRoute="/setoran">
            <div className="max-w-4xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        {STEP_INFO.map((label, i) => (
                            <div key={i} className={`flex items-center gap-2 text-xs font-bold text-primary-600`}>
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
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Ringkasan Laporan</h1>
                    <p className="mt-2 text-gray-500 text-sm">Mohon periksa kembali detail setoran Anda.</p>
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
                    {/* Informasi Laporan */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary-500">info</span> Informasi Laporan
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

                    {/* Rincian Transaksi */}
                    {!isNonFinancial && nominals.length > 0 && (
                        <section>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-green-600">payments</span> Rincian Transaksi
                            </h3>
                            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden px-6 py-4">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-left border-b-2 border-gray-100 w-3/4">Deskripsi</th>
                                            <th className="py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right border-b-2 border-gray-100 w-1/4">Nominal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {nominals.map((nom, idx) => (
                                            <tr key={idx}>
                                                <td className="py-3 text-sm text-gray-700 border-b border-gray-50">Penjualan Tgl {formatDate(allDates[idx])}</td>
                                                <td className="py-3 text-sm text-right font-medium text-gray-900 border-b border-gray-50">{formatRupiah(parseRupiah(nom))}</td>
                                            </tr>
                                        ))}
                                        {potongan > 0 && (
                                            <tr>
                                                <td className="py-3 text-sm text-red-500">Potongan Penjualan</td>
                                                <td className="py-3 text-sm text-right font-medium text-red-500">({formatRupiah(potongan)})</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td className="py-3 text-sm font-bold text-gray-900 pt-4 border-t border-gray-200">Total Dana Tersedia</td>
                                            <td className="py-3 text-sm text-right font-bold text-gray-900 pt-4 border-t border-gray-200">{formatRupiah(danaTersedia)}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 text-sm font-bold text-primary-600 border-none">Total Disetorkan</td>
                                            <td className="py-3 text-lg text-right font-bold text-primary-600 border-none">{formatRupiah(nominalSetoran)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                {selisih > 0 && (
                                    <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-yellow-600 text-lg">warning</span>
                                            <span className="text-yellow-800 font-bold text-xs uppercase tracking-wide">Kurang Setor</span>
                                        </div>
                                        <span className="text-yellow-900 font-bold text-sm">{formatRupiah(selisih)}</span>
                                    </div>
                                )}
                                {selisih < 0 && (
                                    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-blue-600 text-lg">info</span>
                                            <span className="text-blue-800 font-bold text-xs uppercase tracking-wide">Lebih Setor</span>
                                        </div>
                                        <span className="text-blue-900 font-bold text-sm">{formatRupiah(Math.abs(selisih))}</span>
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

                    {/* Bukti Foto */}
                    {formData.buktiFiles?.length > 0 && (
                        <section>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-500">attach_file</span> Bukti Lampiran
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                {formData.buktiFiles.map((f, i) => (
                                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                                        <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                                            <p className="text-white text-[10px] truncate">Bukti #{i + 1}</p>
                                        </div>
                                    </div>
                                ))}
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
                            <><span className="material-symbols-outlined text-lg">send</span> Kirim Laporan</>
                        )}
                    </button>
                </div>
            </div>
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
