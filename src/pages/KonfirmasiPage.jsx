import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, NON_FINANCIAL_TYPES } from '../lib/validators';

function formatDate(d) {
    return d ? new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
}

export default function KonfirmasiPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const state = location.state;

    const isSuccess = state?.success;
    const isNonFinancial = NON_FINANCIAL_TYPES.includes(state?.jenisPelaporan);

    const allDates = [state?.tanggalPenjualan, ...(state?.tanggalPenjualanTambahan || [])].filter(Boolean);
    const dateRangeText = allDates.length > 1
        ? `${formatDate(allDates[0])} (+${allDates.length - 1} Hari)`
        : formatDate(allDates[0]);

    const metodeText = state?.metodeSetoran === 'Metode Setoran Lain'
        ? (state?.metodeLain || 'Metode Lain')
        : (state?.metodeSetoran || '-');

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-slide-in">
                {isSuccess ? (
                    <div className="p-6 sm:p-8 space-y-6">
                        {/* Header Sukses */}
                        <div className="text-center space-y-2">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 border border-green-200 shadow-sm">
                                <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
                            </div>
                            <span className="inline-block bg-green-50 text-green-700 border border-green-200 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                                TERCATAT DI SISTEM
                            </span>
                            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Laporan Sales Berhasil Terkirim!</h1>
                            <p className="text-gray-500 text-xs sm:text-sm">Laporan sales harian toko Anda telah berhasil disimpan dan tercatat di sistem.</p>
                        </div>

                        {/* KARTU RESI TANDA TERIMA DIGITAL */}
                        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary-400 text-lg">receipt_long</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">Resi Tanda Terima Digital</span>
                                </div>
                                <span className="text-[10px] text-gray-300 font-mono">
                                    TGL-{new Date().toISOString().split('T')[0].replace(/-/g, '')}
                                </span>
                            </div>

                            <div className="p-5 space-y-4 text-xs">
                                {/* Informassi Utama Toko */}
                                <div className="space-y-2 border-b border-gray-150 pb-3">
                                    <DetailRow label="Toko / Pelapor" value={state?.username || profile?.username || '-'} bold />
                                    <DetailRow label="Jenis Laporan" value={state?.jenisPelaporan || '-'} highlight />
                                    {allDates.length > 0 && <DetailRow label="Tanggal Sales Penjualan" value={dateRangeText} />}
                                    <DetailRow label="Tanggal Disetorkan ke Bank" value={formatDate(state?.tanggalSetoran)} />
                                    <DetailRow label="Cara Penyetoran Uang" value={metodeText} />
                                </div>

                                {/* Rincian Omset Sales */}
                                {!isNonFinancial && (
                                    <div className="space-y-2 border-b border-gray-150 pb-3">
                                        <DetailRow label="Total Sales Tunai Kasir" value={formatRupiah(state?.totalPenjualan || 0)} />
                                        {(state?.potongan || 0) > 0 && (
                                            <DetailRow label="Potongan Uang Sales (Top Up Petty Cash)" value={`(${formatRupiah(state.potongan)})`} danger />
                                        )}
                                        <DetailRow label="Jumlah Uang Tunai Disetor" value={formatRupiah(state?.nominalSetoran || 0)} highlight />
                                        {(state?.totalNonTunai || 0) > 0 && (
                                            <DetailRow label="Total Sales Non-Tunai (EDC & Transfer)" value={formatRupiah(state.totalNonTunai)} info />
                                        )}
                                        {(state?.totalOnline || 0) > 0 && (
                                            <DetailRow label="Total Sales Online (Marketplace)" value={formatRupiah(state.totalOnline)} info />
                                        )}
                                        
                                        {/* Grand Total */}
                                        <div className="pt-2 border-t border-gray-200 bg-orange-50/70 p-3 rounded-lg flex items-center justify-between mt-2">
                                            <span className="font-extrabold text-orange-950 uppercase tracking-wide">TOTAL SALES HARIAN</span>
                                            <span className="text-lg sm:text-xl font-black text-orange-600">{formatRupiah(state?.grandTotalSales || state?.nominalSetoran || 0)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Status Selisih & Lampiran */}
                                <div className="space-y-2 pt-1">
                                    {!isNonFinancial && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-500 font-medium">Status Selisih Tunai:</span>
                                            {(state?.selisih || 0) > 0 ? (
                                                <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                                    Setoran Kurang {formatRupiah(state.selisih)}
                                                </span>
                                            ) : (state?.selisih || 0) < 0 ? (
                                                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                                    Setoran Lebih {formatRupiah(Math.abs(state.selisih))}
                                                </span>
                                            ) : (
                                                <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                                                    Pas / Tidak Ada Selisih (Rp 0)
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 font-medium">Lampiran Berkas Struk:</span>
                                        <span className="font-bold text-gray-800 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm text-green-600">check_circle</span>
                                            {state?.buktiCount || 0} Foto Berhasil Diunggah
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tombol Aksi */}
                        <div className="space-y-2.5 pt-2">
                            <button
                                onClick={() => navigate('/setoran')}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 transition-all transform hover:-translate-y-0.5 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-lg">add_circle</span> Lapor Sales Baru
                            </button>

                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    onClick={handlePrint}
                                    className="py-2.5 px-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-base text-gray-600">print</span> Cetak Tanda Terima
                                </button>
                                <button
                                    onClick={() => navigate('/beranda')}
                                    className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-base">home</span> Ke Beranda Toko
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center space-y-6">
                        {/* Error state */}
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 border border-red-200">
                            <span className="material-symbols-outlined text-4xl text-red-600">error</span>
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-2xl font-extrabold text-gray-900">Gagal Mengirim Laporan</h1>
                            <p className="text-gray-500 text-xs sm:text-sm">{state?.message || 'Terjadi kesalahan saat menyimpan laporan. Silakan coba lagi.'}</p>
                        </div>
                        <button onClick={() => navigate('/setoran')} className="w-full btn-primary py-3">
                            Coba Lapor Kembali
                        </button>
                    </div>
                )}

                <div className="bg-gray-50 border-t border-gray-100 py-3 text-center text-[11px] text-gray-400 font-medium">
                    &copy; 2025 OSS Department, Apotek Alpro
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, bold, highlight, danger, info }) {
    return (
        <div className="flex justify-between items-center py-0.5">
            <span className="text-gray-500 font-medium">{label}</span>
            <span className={`text-right ${
                highlight ? 'text-primary-600 font-bold' :
                danger ? 'text-red-600 font-medium' :
                info ? 'text-blue-700 font-semibold' :
                bold ? 'font-bold text-gray-900' : 'font-medium text-gray-800'
            }`}>
                {value}
            </span>
        </div>
    );
}
