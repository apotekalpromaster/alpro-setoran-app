import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah, NON_FINANCIAL_TYPES } from '../lib/validators';
import UserLayout from '../components/UserLayout';

function formatDate(isoDate) {
    if (!isoDate) return '-';
    return new Date(isoDate).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

export default function DetailRiwayatPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) { setNotFound(true); setLoading(false); return; }
        fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            // RLS ensures user can only fetch their own rows; extra filter by id
            const { data: row, error } = await supabase
                .from('laporan')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !row) throw error || new Error('Not found');
            setData(row);
        } catch {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <UserLayout title="Detail Laporan" activeRoute="/riwayat">
            <div className="flex items-center justify-center h-64 text-gray-400">
                <span className="material-symbols-outlined animate-spin text-4xl mr-3">sync</span>
                <span>Memuat data...</span>
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

    // bukti_urls: JSONB array or null — always handle gracefully
    const buktiUrls = Array.isArray(data.bukti_urls) ? data.bukti_urls.filter(Boolean) : [];

    return (
        <UserLayout title="Detail Laporan" activeRoute="/riwayat">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* BREADCRUMB */}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <button onClick={() => navigate('/riwayat')} className="flex items-center hover:text-primary-600 transition-colors font-medium gap-1">
                        <span className="material-symbols-outlined text-lg">arrow_back</span> Riwayat
                    </button>
                    <span>/</span>
                    <span className="text-gray-800 font-semibold">Detail Laporan</span>
                </div>

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Detail Laporan Setoran</h1>
                    <p className="text-gray-500 text-sm mt-1">Informasi lengkap mengenai setoran yang telah Anda laporkan.</p>
                </div>

                {/* 1. INFORMASI UMUM */}
                <SectionCard icon="info" iconColor="text-blue-500" title="Informasi Umum">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InfoField label="Tanggal Penjualan (Sales)" value={formatDate(data.tanggal_jual)} />
                        <InfoField label="Tanggal Setoran (Uang Masuk)" value={formatDate(data.tanggal_setor)} />
                        <InfoField label="Jenis Pelaporan" value={data.jenis_pelaporan} />
                        <InfoField label="Metode Setoran" value={
                            data.metode_setoran === 'Metode Setoran Lain' ? data.metodeLain || '-' : data.metode_setoran
                        } />
                    </div>
                </SectionCard>

                {/* 2. DETAIL KEUANGAN (hidden for non-financial types) */}
                {!isNonFinancial && (
                    <SectionCard icon="payments" iconColor="text-green-500" title="Detail Keuangan">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <p className="text-xs font-medium text-gray-400 mb-1">Total Penjualan</p>
                                <p className="text-lg font-bold text-gray-900">{formatRupiah(data.nominal_jual || 0)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-400 mb-1">Potongan (Expense)</p>
                                <p className="text-lg font-bold text-red-500">{data.potongan > 0 ? `(${formatRupiah(data.potongan)})` : '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-400 mb-1">Nominal Disetor</p>
                                <p className="text-lg font-bold text-primary-600">{formatRupiah(data.nominal_setoran || 0)}</p>
                            </div>
                        </div>
                    </SectionCard>
                )}

                {/* 3. INFORMASI TAMBAHAN (conditional) */}
                {hasExtra && (
                    <SectionCard icon="description" iconColor="text-orange-500" title="Informasi Tambahan">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {data.penjelasan && <InfoField label="Penjelasan / Catatan" value={data.penjelasan} fullWidth italic />}
                            {data.nomor_deposit_card && <InfoField label="Nomor Deposit Card" value={data.nomor_deposit_card} mono />}
                            {data.nomor_mesin_atm && <InfoField label="Nomor Mesin ATM" value={data.nomor_mesin_atm} />}
                            {data.lokasi_mesin_atm && <InfoField label="Lokasi Mesin ATM" value={data.lokasi_mesin_atm} />}
                            {data.waktu_kejadian && data.waktu_kejadian !== '-' && <InfoField label="Waktu Kejadian" value={data.waktu_kejadian} />}
                            {data.kcp_terdekat && <InfoField label="KCP Terdekat" value={data.kcp_terdekat} />}
                        </div>
                    </SectionCard>
                )}

                {/* 4. BUKTI SETORAN — Graceful empty state */}
                <SectionCard icon="image" iconColor="text-gray-500" title="Bukti Setoran">
                    {buktiUrls.length === 0 ? (
                        /* ===== ELEGANT PLACEHOLDER (Phase 7 Drive upload not yet implemented) ===== */
                        <div className="col-span-full flex flex-col items-center py-8 text-center">
                            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-3xl text-gray-300">cloud_off</span>
                            </div>
                            <p className="text-sm font-medium text-gray-500">Belum Ada Bukti Terlampir</p>
                            <p className="text-xs text-gray-400 mt-1">Mesin upload ke Google Drive akan aktif di pembaruan berikutnya.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {buktiUrls.map((url, index) => (
                                <a
                                    key={index}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group block relative rounded-lg border border-gray-200 overflow-hidden hover:shadow-md hover:border-primary-300 transition-all"
                                >
                                    <div className="bg-gray-50 h-32 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 transition-colors">
                                        <div className="text-center">
                                            <span className="material-symbols-outlined text-4xl mb-1 group-hover:text-primary-500 transition-colors">description</span>
                                            <p className="text-xs font-medium">Lihat Lampiran #{index + 1}</p>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white border-t border-gray-100 flex items-center justify-between">
                                        <span className="text-xs font-bold text-gray-700">Bukti #{index + 1}</span>
                                        <span className="material-symbols-outlined text-gray-400 text-sm">open_in_new</span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </SectionCard>

            </div>
        </UserLayout>
    );
}

/* ===== Sub-components ===== */

function SectionCard({ icon, iconColor, title, children }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                    <span className={`material-symbols-outlined text-lg ${iconColor}`}>{icon}</span>
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
            <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
            <p className={`text-base font-bold break-words ${italic ? 'italic text-gray-600' : 'text-gray-900'} ${mono ? 'font-mono bg-gray-100 px-2 py-0.5 rounded text-sm inline-block' : ''}`}>
                {value || '-'}
            </p>
        </div>
    );
}
