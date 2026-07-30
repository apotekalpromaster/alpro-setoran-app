import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah, NON_FINANCIAL_TYPES, formatDriveImageUrl } from '../lib/validators';
import UserLayout from '../components/UserLayout';

function formatDate(isoDate) {
    if (!isoDate) return '-';
    return new Date(isoDate).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

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

export default function DetailRiwayatPage() {
    const [lightboxImg, setLightboxImg] = useState(null);
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [corrections, setCorrections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) { setNotFound(true); setLoading(false); return; }
        fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        setNotFound(false);

        if (id && id.startsWith('unreported_')) {
            setNotFound(true);
            setLoading(false);
            return;
        }

        try {
            const reportPromise = supabase
                .from('laporan')
                .select('*')
                .eq('id', id)
                .single();

            const corrPromise = supabase
                .from('koreksi_requests')
                .select('id, nominal_jual_baru, nominal_setoran_baru, potongan_baru, penjelasan_koreksi, status, created_at, processed_at, bukti_urls_baru')
                .eq('laporan_id', id)
                .order('created_at', { ascending: false });

            const [reportRes, corrRes] = await Promise.all([reportPromise, corrPromise]);

            if (reportRes.error || !reportRes.data) {
                setNotFound(true);
            } else {
                setData(reportRes.data);
                if (!corrRes.error && corrRes.data) {
                    setCorrections(corrRes.data);
                }
            }
        } catch (e) {
            console.error("DetailRiwayatPage fetchDetail error:", e);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <UserLayout title="Detail Laporan" activeRoute="/riwayat">
            <div className="flex items-center justify-center h-64 text-gray-400">
                <span className="material-symbols-outlined animate-spin text-4xl mr-3">sync</span>
                <span>Memuat data laporan...</span>
            </div>
        </UserLayout>
    );

    if (notFound) return (
        <UserLayout title="Detail Laporan" activeRoute="/riwayat">
            <div className="max-w-2xl mx-auto text-center py-20">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-50 mb-4">
                    <span className="material-symbols-outlined text-red-400 text-4xl">search_off</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Data Tidak Ditemukan</h2>
                <p className="text-gray-500 mt-2 text-sm">Laporan mungkin sudah dihapus atau Anda tidak memiliki akses.</p>
                <button onClick={() => navigate('/riwayat')} className="mt-6 btn-secondary">
                    <span className="material-symbols-outlined text-base">arrow_back</span> Kembali ke Riwayat
                </button>
            </div>
        </UserLayout>
    );

    const isNonFinancial = NON_FINANCIAL_TYPES.includes(data.jenis_pelaporan);
    const hasExtra = data.penjelasan || data.nomor_deposit_card || data.nomor_mesin_atm ||
        data.lokasi_mesin_atm || data.waktu_kejadian || data.kcp_terdekat;

    const buktiUrls = parseBuktiUrls(data.bukti_urls);

    // Non-Cash Calculations
    const bcaDb = Number(data.bca_debit || 0);
    const bcaKr = Number(data.bca_kredit || 0);
    const bcaQr = Number(data.bca_qris || 0);
    const briDb = Number(data.bri_debit || 0);
    const briKr = Number(data.bri_kredit || 0);
    const briQr = Number(data.bri_qris || 0);
    const trf = Number(data.bank_transfer || 0);
    const totalNonTunai = Number(data.total_non_tunai || (bcaDb + bcaKr + bcaQr + briDb + briKr + briQr + trf));

    const totalSalesTunai = Number(data.nominal_jual || 0);
    const potonganTunai = Number(data.potongan || 0);
    const nominalDisetor = Number(data.nominal_setoran || 0);
    const danaTersediaTunai = totalSalesTunai - potonganTunai;
    const selisihTunai = danaTersediaTunai - nominalDisetor;

    const grandTotalSales = totalSalesTunai + totalNonTunai;

    const selisihLabel = selisihTunai > 0
        ? { text: `Setoran Kurang ${formatRupiah(selisihTunai)}`, cls: 'text-red-600 font-bold bg-red-50 border-red-200' }
        : selisihTunai < 0
            ? { text: `Setoran Lebih ${formatRupiah(Math.abs(selisihTunai))}`, cls: 'text-blue-600 font-bold bg-blue-50 border-blue-200' }
            : { text: 'Pas / Tidak Ada Selisih (Rp 0)', cls: 'text-green-700 font-bold bg-green-50 border-green-200' };

    // Slot labels
    const isSingleProofType = ['Pengembalian Petty Cash', 'Deposit Card Terblokir (Salah Input PIN 3x)', 'Deposit Card Tertelan Mesin ATM'].includes(data.jenis_pelaporan);
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

    return (
        <UserLayout title="Detail Laporan" activeRoute="/riwayat">
            <div className="max-w-4xl mx-auto space-y-6 print:space-y-4">

                {/* BREADCRUMB & HEADER (Hide on Print) */}
                <div className="flex items-center justify-between print:hidden">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <button onClick={() => navigate('/riwayat')} className="flex items-center hover:text-primary-600 transition-colors font-medium gap-1 cursor-pointer">
                            <span className="material-symbols-outlined text-lg">arrow_back</span> Riwayat Laporan
                        </button>
                        <span>/</span>
                        <span className="text-gray-800 font-semibold">Detail Laporan</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => window.print()}
                            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-gray-200 cursor-pointer shadow-xs"
                        >
                            <span className="material-symbols-outlined text-sm">print</span> Cetak Detail
                        </button>
                        <button
                            onClick={() => navigate('/koreksi', { state: { prefilledReport: data } })}
                            className="px-3.5 py-2 bg-white text-primary-600 hover:bg-orange-50 font-bold rounded-xl border border-primary-200 transition-colors shadow-xs text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">edit_note</span> Ajukan Koreksi
                        </button>
                    </div>
                </div>

                <div className="border-b border-gray-200 pb-4">
                    <h1 className="text-2xl font-black text-gray-900">Detail Laporan Setoran</h1>
                    <p className="text-gray-500 text-sm mt-1">Rincian lengkap pelaporan sales harian, transaksi non-tunai, dan lampiran berkas bukti.</p>
                </div>

                {/* 1. INFORMASI UMUM */}
                <SectionCard icon="info" iconColor="text-blue-600" title="Informasi Umum Laporan Sales">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <InfoField label="Tanggal Penjualan (Sales)" value={formatDate(data.tanggal_jual)} />
                        <InfoField label="Tanggal Setoran (Uang Masuk)" value={formatDate(data.tanggal_setor)} />
                        <InfoField label="Jenis Pelaporan" value={data.jenis_pelaporan} />
                        <InfoField label="Metode Penyetoran Uang" value={
                            data.metode_setoran === 'Metode Setoran Lain' ? data.metodeLain || '-' : data.metode_setoran
                        } />
                        <InfoField 
                            label="Waktu Submit Laporan (WIB)" 
                            value={data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-'} 
                        />
                    </div>
                </SectionCard>

                {/* 2. DETAIL KEUANGAN TUNAI */}
                {!isNonFinancial && (
                    <SectionCard icon="payments" iconColor="text-green-600" title="Detail Keuangan Penjualan Tunai">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200/80">
                                <p className="text-xs font-medium text-gray-500 mb-1">Sales Tunai (Kasir)</p>
                                <p className="text-lg font-extrabold text-gray-900 font-mono">{formatRupiah(totalSalesTunai)}</p>
                            </div>
                            <div className="bg-red-50/40 p-4 rounded-xl border border-red-100">
                                <p className="text-xs font-medium text-red-800 mb-1">Potongan Sales (Petty Cash Toko)</p>
                                <p className="text-lg font-extrabold text-red-600 font-mono">
                                    {potonganTunai > 0 ? `(${formatRupiah(potonganTunai)})` : 'Rp 0'}
                                </p>
                            </div>
                            <div className="bg-green-50/40 p-4 rounded-xl border border-green-100">
                                <p className="text-xs font-medium text-green-900 mb-1">Setoran Tunai ke Bank</p>
                                <p className="text-lg font-extrabold text-green-700 font-mono">{formatRupiah(nominalDisetor)}</p>
                            </div>
                        </div>

                        {/* Status Selisih Banner */}
                        <div className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between ${selisihLabel.cls}`}>
                            <div>
                                <span className="text-[10px] uppercase font-bold text-gray-500 block">Status Selisih Tunai:</span>
                                <span className="text-sm font-extrabold">{selisihLabel.text}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-gray-400 block">Dana Tunai Bersih:</span>
                                <span className="text-xs font-bold font-mono text-gray-800">{formatRupiah(danaTersediaTunai)}</span>
                            </div>
                        </div>
                    </SectionCard>
                )}

                {/* 3. DETAIL PENJUALAN NON-TUNAI (EDC & TRANSFER) */}
                {!isNonFinancial && (
                    <SectionCard icon="credit_card" iconColor="text-blue-700" title="Rincian Penjualan Non-Tunai (EDC & Transfer)">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Group BCA */}
                            <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100 space-y-3">
                                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider border-b border-blue-100 pb-1.5 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-base">credit_card</span> EDC BCA
                                </h4>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">Debit</span>
                                        <span className="font-mono font-bold text-gray-800">{bcaDb > 0 ? formatRupiah(bcaDb) : '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">Kredit</span>
                                        <span className="font-mono font-bold text-gray-800">{bcaKr > 0 ? formatRupiah(bcaKr) : '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">QRIS</span>
                                        <span className="font-mono font-bold text-gray-800">{bcaQr > 0 ? formatRupiah(bcaQr) : '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Group BRI */}
                            <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100 space-y-3">
                                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider border-b border-blue-100 pb-1.5 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-base">credit_card</span> EDC BRI
                                </h4>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">Debit</span>
                                        <span className="font-mono font-bold text-gray-800">{briDb > 0 ? formatRupiah(briDb) : '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">Kredit</span>
                                        <span className="font-mono font-bold text-gray-800">{briKr > 0 ? formatRupiah(briKr) : '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block text-[10px]">QRIS</span>
                                        <span className="font-mono font-bold text-gray-800">{briQr > 0 ? formatRupiah(briQr) : '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between bg-blue-100/50 p-4 rounded-xl border border-blue-200 gap-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-700">account_balance</span>
                                <div>
                                    <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">Transfer Bank</span>
                                    <span className="font-mono font-bold text-sm text-gray-900">{trf > 0 ? formatRupiah(trf) : 'Rp 0'}</span>
                                </div>
                            </div>
                            <div className="text-right border-t sm:border-t-0 sm:border-l border-blue-200 pt-2 sm:pt-0 sm:pl-4 w-full sm:w-auto">
                                <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">TOTAL NON-TUNAI</span>
                                <span className="font-mono font-black text-base text-blue-800">{formatRupiah(totalNonTunai)}</span>
                            </div>
                        </div>
                    </SectionCard>
                )}

                {/* 4. KONSOLIDASI HARIAN (GRAND TOTAL SALES) */}
                {!isNonFinancial && (
                    <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100/80 border-2 border-orange-300 rounded-2xl p-6 shadow-md space-y-4">
                        <div className="flex items-center justify-between border-b border-orange-200 pb-3">
                            <h4 className="text-xs font-extrabold text-orange-950 uppercase tracking-wider flex items-center gap-2">
                                <span className="material-symbols-outlined text-xl text-orange-600">analytics</span> TOTAL SALES HARIAN (Tunai + Non-Tunai)
                            </h4>
                            <span className="text-[10px] font-bold bg-orange-200 text-orange-900 px-3 py-1 rounded-full uppercase tracking-wider">Konsolidasi Omset</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700">
                            <div className="bg-white/90 p-3.5 rounded-xl border border-orange-200 shadow-xs">
                                <span className="text-gray-500 block text-[11px]">Total Sales Tunai Kasir:</span>
                                <span className="font-bold text-base text-gray-900 font-mono">{formatRupiah(totalSalesTunai)}</span>
                            </div>
                            <div className="bg-white/90 p-3.5 rounded-xl border border-orange-200 shadow-xs">
                                <span className="text-gray-500 block text-[11px]">Total Sales Non-Tunai (EDC & Transfer):</span>
                                <span className="font-bold text-base text-blue-700 font-mono">{formatRupiah(totalNonTunai)}</span>
                            </div>
                        </div>

                        <div className="pt-2 border-t-2 border-orange-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                            <span className="text-sm font-black text-orange-950 uppercase tracking-wide">GRAND TOTAL SALES</span>
                            <span className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight font-mono">{formatRupiah(grandTotalSales)}</span>
                        </div>
                    </div>
                )}

                {/* 5. INFORMASI TAMBAHAN */}
                {hasExtra && (
                    <SectionCard icon="description" iconColor="text-orange-500" title="Informasi Tambahan">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {data.penjelasan && <InfoField label="Penjelasan / Catatan" value={data.penjelasan} fullWidth italic />}
                            {data.nomor_deposit_card && <InfoField label="Nomor Deposit Card" value={data.nomor_deposit_card} mono />}
                            {data.nomor_mesin_atm && <InfoField label="Nomor Mesin ATM / Referensi" value={data.nomor_mesin_atm} />}
                            {data.lokasi_mesin_atm && <InfoField label="Lokasi Mesin ATM" value={data.lokasi_mesin_atm} />}
                            {data.waktu_kejadian && data.waktu_kejadian !== '-' && <InfoField label="Waktu Kejadian" value={data.waktu_kejadian} />}
                            {data.kcp_terdekat && <InfoField label="KCP Terdekat" value={data.kcp_terdekat} />}
                        </div>
                    </SectionCard>
                )}

                {/* 6. BUKTI LAMPIRAN FOTO */}
                <SectionCard icon="image" iconColor="text-gray-600" title="Bukti Lampiran Foto (Struk & Resi)">
                    {buktiUrls.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center py-8 text-center bg-gray-50 rounded-xl border border-gray-200">
                            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-3xl text-gray-300">cloud_off</span>
                            </div>
                            <p className="text-sm font-bold text-gray-600">Belum Ada Bukti Terlampir</p>
                            <p className="text-xs text-gray-400 mt-1">Tidak ada file foto bukti yang tersimpan pada laporan ini.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {buktiUrls.map((url, index) => {
                                const isPdf = typeof url === 'string' && url.toLowerCase().includes('.pdf');
                                const slotTag = slotLabels[index] || `Bukti ${index + 1}: Foto Pendukung`;

                                return (
                                    <div
                                        key={index}
                                        className="group relative rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                                    >
                                        <div className="bg-gray-100 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                                            <span className="text-[11px] font-extrabold text-gray-700 truncate" title={slotTag}>
                                                {slotTag}
                                            </span>
                                        </div>

                                        <div
                                            className="relative h-48 bg-gray-900/5 flex items-center justify-center overflow-hidden cursor-pointer"
                                            onClick={() => !isPdf && setLightboxImg(url)}
                                        >
                                            {isPdf ? (
                                                <div className="text-center p-4">
                                                    <span className="material-symbols-outlined text-5xl text-red-500 mb-1">picture_as_pdf</span>
                                                    <p className="text-xs font-bold text-gray-700">Dokumen PDF #{index + 1}</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <img
                                                        src={formatDriveImageUrl(url)}
                                                        alt={`Bukti #${index + 1}`}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                                        }}
                                                    />
                                                    <div className="hidden absolute inset-0 bg-gray-100 flex-col items-center justify-center text-gray-400">
                                                        <span className="material-symbols-outlined text-4xl mb-1 text-primary-500">description</span>
                                                        <p className="text-xs font-bold text-gray-700">Lampiran #{index + 1}</p>
                                                    </div>
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
                                                        <span className="material-symbols-outlined text-xl">zoom_in</span>
                                                        <span className="text-xs font-bold">Pratinjau Foto</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="p-2.5 bg-white border-t border-gray-100 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Berkas Terlampir</span>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 bg-primary-50 px-2.5 py-1 rounded-lg border border-primary-100 transition-colors"
                                                title="Buka foto di tab baru"
                                            >
                                                <span>Tab Baru</span>
                                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </SectionCard>

                {/* Lightbox Modal */}
                {lightboxImg && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in print:hidden" onClick={() => setLightboxImg(null)}>
                        <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary-600">image</span> Pratinjau Bukti Setoran
                                </h4>
                                <div className="flex items-center gap-2">
                                    <a href={lightboxImg} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
                                        <span className="material-symbols-outlined text-sm">open_in_new</span> Buka di Tab Baru
                                    </a>
                                    <button onClick={() => setLightboxImg(null)} className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-gray-900/5 rounded-xl p-2">
                                <img src={formatDriveImageUrl(lightboxImg)} alt="Detail Pratinjau" className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md" onError={(e) => { e.target.src = lightboxImg; }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* 7. RIWAYAT KOREKSI */}
                {corrections.length > 0 && (
                    <SectionCard icon="history" iconColor="text-purple-600" title="Riwayat Koreksi Laporan">
                        <div className="space-y-4">
                            {corrections.map((c, idx) => {
                                let statusCls = '';
                                let statusText = '';
                                if (c.status === 'Approved') {
                                    statusCls = 'text-green-700 bg-green-50 border-green-200';
                                    statusText = 'Disetujui oleh Finance';
                                } else if (c.status === 'Rejected') {
                                    statusCls = 'text-red-700 bg-red-50 border-red-200';
                                    statusText = 'Ditolak oleh Finance';
                                } else {
                                    statusCls = 'text-yellow-700 bg-yellow-50 border-yellow-200';
                                    statusText = 'Menunggu Persetujuan';
                                }
                                
                                const reqDate = new Date(c.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
                                const procDate = c.processed_at ? new Date(c.processed_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB' : null;

                                return (
                                    <div key={c.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                                            <span className="font-bold text-gray-800 text-xs">Pengajuan Koreksi #{corrections.length - idx}</span>
                                            <span className={"px-2.5 py-0.5 rounded-full text-[10px] font-bold border " + statusCls}>{statusText}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                            <div className="space-y-1">
                                                <p className="text-gray-400 font-semibold uppercase tracking-wider text-[9px] mb-1">Nilai Koreksi Diajukan:</p>
                                                <p className="text-gray-700 font-medium">Sales: <span className="font-bold font-mono">{formatRupiah(c.nominal_jual_baru)}</span></p>
                                                <p className="text-gray-700 font-medium">Setoran: <span className="font-bold font-mono">{formatRupiah(c.nominal_setoran_baru)}</span></p>
                                                <p className="text-gray-700 font-medium">Potongan: <span className="font-bold font-mono">{formatRupiah(c.potongan_baru)}</span></p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-gray-400 font-semibold uppercase tracking-wider text-[9px] mb-1">Detail Waktu &amp; Alasan:</p>
                                                <p className="text-gray-600">Diajukan: {reqDate}</p>
                                                {procDate && <p className="text-gray-600">Diproses: {procDate}</p>}
                                                <p className="text-gray-700 font-semibold mt-1">Alasan: <span className="italic font-normal">"{c.penjelasan_koreksi}"</span></p>
                                            </div>
                                        </div>
                                        {c.bukti_urls_baru && c.bukti_urls_baru.length > 0 && (
                                            <div className="pt-2 border-t border-gray-200/60 flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lampiran Bukti Koreksi:</span>
                                                {c.bukti_urls_baru.map((url, uIdx) => (
                                                    <a
                                                        key={uIdx}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold"
                                                    >
                                                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                        Bukti #{uIdx + 1}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>
                )}

            </div>
        </UserLayout>
    );
}

/* ===== Sub-components ===== */

function SectionCard({ icon, iconColor, title, children }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:border-gray-300 print:shadow-none">
            <div className="px-6 py-3.5 border-b border-gray-100 bg-gray-50/60 print:bg-gray-100">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <span className={`material-symbols-outlined text-lg ${iconColor} print:hidden`}>{icon}</span>
                    {title}
                </h3>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function InfoField({ label, value, fullWidth, italic, mono }) {
    return (
        <div className={fullWidth ? 'col-span-1 md:col-span-2' : ''}>
            <p className="text-[11px] font-medium text-gray-400 mb-0.5">{label}</p>
            <p className={`text-sm font-bold break-words ${italic ? 'italic text-gray-600' : 'text-gray-900'} ${mono ? 'font-mono bg-gray-100 px-2 py-0.5 rounded inline-block' : ''}`}>
                {value || '-'}
            </p>
        </div>
    );
}
