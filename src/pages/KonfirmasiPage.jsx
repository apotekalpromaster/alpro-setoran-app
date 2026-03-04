import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../lib/validators';

export default function KonfirmasiPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const state = location.state;

    const isSuccess = state?.success;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center animate-slide-in">
                {isSuccess ? (
                    <>
                        {/* Success Icon */}
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                            <span className="material-symbols-outlined text-5xl text-green-500">check_circle</span>
                        </div>
                        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Laporan Terkirim!</h1>
                        <p className="text-gray-500 text-sm mb-8">Laporan setoran Anda telah berhasil disimpan ke sistem.</p>

                        {/* Summary */}
                        <div className="text-left space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-5 mb-8">
                            <DetailRow label="Toko / User" value={state?.username || profile?.username || '-'} />
                            <DetailRow label="Jenis Laporan" value={state?.jenisPelaporan || '-'} />
                            <DetailRow label="Tanggal Setoran" value={state?.tanggalSetoran
                                ? new Date(state.tanggalSetoran).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                                : '-'
                            } />
                            {state?.nominalSetoran > 0 && (
                                <DetailRow label="Nominal Disetor" value={formatRupiah(state.nominalSetoran)} />
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => navigate('/setoran')}
                                className="w-full btn-primary"
                            >
                                <span className="material-symbols-outlined text-base">add_circle</span> Buat Laporan Baru
                            </button>
                            <button
                                onClick={() => navigate('/beranda')}
                                className="w-full btn-secondary"
                            >
                                <span className="material-symbols-outlined text-base">home</span> Kembali ke Beranda
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Error state */}
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                            <span className="material-symbols-outlined text-5xl text-red-500">error</span>
                        </div>
                        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Gagal Mengirim</h1>
                        <p className="text-gray-500 text-sm mb-8">{state?.message || 'Terjadi kesalahan. Silakan coba lagi.'}</p>
                        <button onClick={() => navigate('/setoran')} className="w-full btn-primary">
                            Coba Lagi
                        </button>
                    </>
                )}

                <div className="mt-8 text-xs text-gray-400">&copy; 2025 OSS Department, Apotek Alpro</div>
            </div>
        </div>
    );
}

function DetailRow({ label, value }) {
    return (
        <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
            <span className="text-xs text-gray-500 font-medium">{label}</span>
            <span className="text-sm font-bold text-gray-800 text-right">{value}</span>
        </div>
    );
}
