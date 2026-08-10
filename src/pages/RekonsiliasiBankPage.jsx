import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import { parseDepositCardExcel, parseBriMidExcel, parseBcaMidExcel, parseBcaMutationExcelForSupabase } from '../services/reconciliationParser';

// Helper to eliminate duplicate key_codes within a single batch to prevent PostgreSQL "ON CONFLICT DO UPDATE cannot affect row a second time"
const deduplicateRows = (rows) => {
    const map = new Map();
    (rows || []).forEach(row => {
        if (row && row.key_code) {
            map.set(`${row.mapping_type}_${row.key_code}`, row);
        }
    });
    return Array.from(map.values());
};


const deduplicateMutations = (rows) => {
    const map = new Map();
    (rows || []).forEach(r => {
        if (r && r.tanggal_mutasi && r.keterangan) {
            const k = `${r.tanggal_mutasi}_${r.keterangan}_${r.jumlah}_${r.db_cr}`;
            map.set(k, r);
        }
    });
    return Array.from(map.values());
};

export default function RekonsiliasiBankPage() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('tabel');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [progressStatus, setProgressStatus] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toLocaleDateString('sv-SE');
    });
    const [endDate, setEndDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const [selectedBranch, setSelectedBranch] = useState('');
    const [selectedBank, setSelectedBank] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    const [storeProfiles, setStoreProfiles] = useState([]);

    // File Upload States - Tab 2 (Unggah Data Harian)
    const [fileBri, setFileBri] = useState(null);
    const [fileBca, setFileBca] = useState(null);

    // File Master Mapping States - Tab 3 (Kelola Master Mapping)
    const [depositCardFile, setDepositCardFile] = useState(null);
    const [briMidFile, setBriMidFile] = useState(null);
    const [bcaMidFile, setBcaMidFile] = useState(null);
    const [pkuCabangFile, setPkuCabangFile] = useState(null);

    useEffect(() => {
        loadStoreProfiles();
    }, []);

    const loadStoreProfiles = async () => {
        try {
            const { data, error } = await safeSupabaseQuery(
                supabase.from('profiles').select('username, kode_toko'),
                6000
            );
            if (!error && data) setStoreProfiles(data);
        } catch (e) {
            console.error('Error fetching profiles:', e);
        }
    };

    // Handler Unggah Data Harian (Mutasi BCA -> recon_bank_mutations_bca)
    const handleUploadDailyFiles = async () => {
        if (!fileBri && !fileBca) {
            setError('Pilih minimal 1 file harian untuk diproses (misal: Mutasi BCA).');
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');
        setProgressStatus('Membaca file Excel yang diunggah...');
        setProgressPercent(15);

        try {
            let totalSaved = 0;
            const messages = [];

            // 1. Process Mutasi BCA (Ref 6) -> recon_bank_mutations_bca
            if (fileBca) {
                setProgressStatus(`Membaca file ${fileBca.name}...`);
                setProgressPercent(25);

                // Fetch Master MIDs to build mid -> outcode map
                setProgressStatus('Memuat master data MID toko dari database...');
                setProgressPercent(40);
                const { data: masterData, error: masterErr } = await safeSupabaseQuery(
                    supabase.from('recon_master_mids').select('key_code, outcode_target').range(0, 4999),
                    60000
                );

                const masterMidMap = {};
                if (!masterErr && masterData) {
                    masterData.forEach(m => {
                        if (m.key_code && m.outcode_target) {
                            masterMidMap[m.key_code.trim()] = m.outcode_target.trim().toUpperCase();
                        }
                    });
                }

                setProgressStatus('Mengekstrak data transaksi & mencocokkan outcode...');
                setProgressPercent(60);
                const buf = await fileBca.arrayBuffer();
                const parsedRecords = parseBcaMutationExcelForSupabase(buf, masterMidMap, fileBca.name);

                if (!parsedRecords || parsedRecords.length === 0) {
                    throw new Error('File Excel Mutasi BCA tidak memiliki data transaksi KARTU KREDIT / KR OTOMATIS MID valid.');
                }

                const rowsToUpsert = deduplicateMutations(parsedRecords);

                const chunkSize = 500;
                for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                    const chunk = rowsToUpsert.slice(i, i + chunkSize);
                    const batchNum = Math.floor(i / chunkSize) + 1;
                    const totalBatches = Math.ceil(rowsToUpsert.length / chunkSize);
                    
                    setProgressStatus(`Menyimpan ${rowsToUpsert.length} data mutasi BCA ke Supabase (Batch ${batchNum}/${totalBatches})...`);
                    setProgressPercent(80 + Math.floor((batchNum / totalBatches) * 15));

                    const { error: upsertErr } = await safeSupabaseQuery(
                        supabase.from('recon_bank_mutations_bca').upsert(chunk, { onConflict: 'tanggal_mutasi,keterangan,jumlah,db_cr' }),
                        60000
                    );
                    if (upsertErr) {
                        throw new Error(`Gagal menyimpan Mutasi BCA ke Supabase: ${upsertErr.message}`);
                    }
                }

                totalSaved += rowsToUpsert.length;
                messages.push(`${rowsToUpsert.length} data Mutasi BCA (KARTU KREDIT & KR OTOMATIS MID)`);
                setFileBca(null);
            }

            setProgressPercent(100);
            setProgressStatus('✓ Selesai!');

            if (messages.length > 0) {
                setSuccessMsg(`✓ Berhasil mengunggah & menyimpan ${messages.join(', ')} ke tabel Supabase (recon_bank_mutations_bca)!`);
            } else {
                setSuccessMsg('Penyiapan pemrosesan mutasi lainnya sedang dikembangkan.');
            }
        } catch (e) {
            console.error('Error uploading daily files:', e);
            setError(e.message || 'Gagal memproses file Excel.');
        } finally {
            setTimeout(() => {
                setLoading(false);
                setProgressPercent(0);
                setProgressStatus('');
            }, 600);
        }
    };

    // Handler Kelola Master Mapping: Logika Penyimpanan Deposit Card, MID BRI, MID BCA ke Supabase (recon_master_mids)
    const handleUploadMasterFiles = async () => {
        if (!depositCardFile && !briMidFile && !bcaMidFile && !pkuCabangFile) {
            setError('Pilih minimal 1 file master untuk diunggah (misal: REFERENSI 3 Master MID BRI).');
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            let totalSaved = 0;
            const messages = [];

            // 1. Process REFERENSI 2: Deposit Card BCA -> recon_master_mids
            if (depositCardFile) {
                const buf = await depositCardFile.arrayBuffer();
                const parsedCards = parseDepositCardExcel(buf);

                if (!parsedCards || parsedCards.length === 0) {
                    throw new Error('File Excel Deposit Card BCA tidak memiliki data valid (Kolom A Deposit Card & Kolom C Outcode).');
                }

                const rawRows = parsedCards.map(item => ({
                    mapping_type: 'deposit_card',
                    key_code: item.bca_deposit_card.toString().trim(),
                    outcode_target: item.outcode.toString().trim().toUpperCase()
                }));
                const rowsToUpsert = deduplicateRows(rawRows);

                const chunkSize = 500;
                for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                    const chunk = rowsToUpsert.slice(i, i + chunkSize);
                    const { error: upsertErr } = await safeSupabaseQuery(
                        supabase.from('recon_master_mids').upsert(chunk, { onConflict: 'mapping_type,key_code' }),
                        60000
                    );
                    if (upsertErr) {
                        throw new Error(`Gagal menyimpan Deposit Card ke Supabase: ${upsertErr.message}`);
                    }
                }

                totalSaved += rowsToUpsert.length;
                messages.push(`${rowsToUpsert.length} data Deposit Card BCA`);
                setDepositCardFile(null);
            }

            // 2. Process REFERENSI 3: Master MID BRI -> recon_master_mids
            if (briMidFile) {
                const buf = await briMidFile.arrayBuffer();
                const parsedMids = parseBriMidExcel(buf);

                if (!parsedMids || parsedMids.length === 0) {
                    throw new Error('File Excel Master MID BRI tidak memiliki data valid (Kolom MID & Outcode).');
                }

                const rawRows = parsedMids.map(item => ({
                    mapping_type: 'bri_mid',
                    key_code: item.mid_bri.toString().trim(),
                    outcode_target: item.outcode.toString().trim().toUpperCase()
                }));
                const rowsToUpsert = deduplicateRows(rawRows);

                const chunkSize = 500;
                for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                    const chunk = rowsToUpsert.slice(i, i + chunkSize);
                    const { error: upsertErr } = await safeSupabaseQuery(
                        supabase.from('recon_master_mids').upsert(chunk, { onConflict: 'mapping_type,key_code' }),
                        60000
                    );
                    if (upsertErr) {
                        throw new Error(`Gagal menyimpan Master MID BRI ke Supabase: ${upsertErr.message}`);
                    }
                }

                totalSaved += rowsToUpsert.length;
                messages.push(`${rowsToUpsert.length} data Master MID BRI`);
                setBriMidFile(null);
            }

            // 3. Process REFERENSI 4: Master MID BCA -> recon_master_mids
            if (bcaMidFile) {
                const buf = await bcaMidFile.arrayBuffer();
                const parsedMids = parseBcaMidExcel(buf);

                if (!parsedMids || parsedMids.length === 0) {
                    throw new Error('File Excel Master MID BCA tidak memiliki data valid (Kolom MID & Outcode).');
                }

                const rawRows = parsedMids.map(item => ({
                    mapping_type: 'bca_mid',
                    key_code: item.mid_bca.toString().trim(),
                    outcode_target: item.outcode.toString().trim().toUpperCase()
                }));
                const rowsToUpsert = deduplicateRows(rawRows);

                const chunkSize = 500;
                for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                    const chunk = rowsToUpsert.slice(i, i + chunkSize);
                    const { error: upsertErr } = await safeSupabaseQuery(
                        supabase.from('recon_master_mids').upsert(chunk, { onConflict: 'mapping_type,key_code' }),
                        60000
                    );
                    if (upsertErr) {
                        throw new Error(`Gagal menyimpan Master MID BCA ke Supabase: ${upsertErr.message}`);
                    }
                }

                totalSaved += rowsToUpsert.length;
                messages.push(`${rowsToUpsert.length} data Master MID BCA`);
                setBcaMidFile(null);
            }

            if (messages.length > 0) {
                setSuccessMsg(`✓ Berhasil mengunggah & menyimpan ${messages.join(', ')} ke tabel Supabase (recon_master_mids)!`);
            } else {
                setSuccessMsg('Penyiapan logika master mapping lainnya sedang dikembangkan.');
            }
        } catch (e) {
            console.error('Error uploading master files:', e);
            setError(e.message || 'Gagal memproses file master.');
        } finally {
            setLoading(false);
        }
    };

    // Phase 1 Reset: Empty Grid & Stats (Siap dibangun dari 0)
    const filteredGrid = [];
    const stats = {
        totalCashless: 0,
        totalBankGross: 0,
        totalBcaGross: 0,
        totalBriGross: 0,
        totalBankMdr: 0,
        totalBcaMdr: 0,
        totalBriMdr: 0,
        totalNetVariance: 0,
        tokoSelisihCount: 0
    };

    return (
        <AdminLayout title="Rekonsiliasi Transaksi (Xilnex vs Mutasi Bank)">
            <div className="space-y-6">
                <div className="flex border-b border-gray-200 bg-white px-4 rounded-xl shadow-sm">
                    <button
                        onClick={() => setActiveTab('tabel')}
                        className={`py-4 px-6 font-semibold border-b-2 transition-colors ${
                            activeTab === 'tabel'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📊 Matriks Rekonsiliasi Presisi
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`py-4 px-6 font-semibold border-b-2 transition-colors ${
                            activeTab === 'upload'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📤 Unggah Data Harian
                    </button>
                    <button
                        onClick={() => setActiveTab('masters')}
                        className={`py-4 px-6 font-semibold border-b-2 transition-colors ${
                            activeTab === 'masters'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        ⚙️ Kelola Master Mapping (MID &amp; Cabang)
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r shadow-sm">
                        <p className="font-semibold">Error</p>
                        <p>{error}</p>
                    </div>
                )}
                {successMsg && (
                    <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 rounded-r shadow-sm">
                        <p className="font-semibold">Sukses</p>
                        <p>{successMsg}</p>
                    </div>
                )}

                {activeTab === 'tabel' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Cashless Xilnex</span>
                                <div className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(stats.totalCashless)}</div>
                                <div className="text-xs text-gray-500 mt-1">Ref 1 (Kolom F: Card Amount)</div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Bank Gross (MDR Gross)</span>
                                <div className="text-2xl font-bold text-emerald-600 mt-1">{formatRupiah(stats.totalBankGross)}</div>
                                <div className="text-xs text-emerald-700 mt-1 flex justify-between">
                                    <span>BCA: {formatRupiah(stats.totalBcaGross)}</span>
                                    <span>BRI: {formatRupiah(stats.totalBriGross)}</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Potongan MDR Bank</span>
                                <div className="text-2xl font-bold text-amber-600 mt-1">{formatRupiah(stats.totalBankMdr)}</div>
                                <div className="text-xs text-amber-700 mt-1 flex justify-between">
                                    <span>BCA: {formatRupiah(stats.totalBcaMdr)}</span>
                                    <span>BRI: {formatRupiah(stats.totalBriMdr)}</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Selisih Net (Gross vs Gross)</span>
                                <div className="text-2xl font-bold mt-1 text-emerald-600">
                                    {formatRupiah(stats.totalNetVariance)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    100% Cocok Presisi
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Periode Tanggal</label>
                                <div className="flex gap-2">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                                    />
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Toko (Outcode)</label>
                                <select
                                    value={selectedBranch}
                                    onChange={e => setSelectedBranch(e.target.value)}
                                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                                >
                                    <option value="">-- Semua Toko --</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Bank</label>
                                <select
                                    value={selectedBank}
                                    onChange={e => setSelectedBank(e.target.value)}
                                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                                >
                                    <option value="All">-- Semua Bank (BCA + BRI) --</option>
                                    <option value="BCA">BCA Saja</option>
                                    <option value="BRI">BRI Saja</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Status Matching</label>
                                <select
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                                >
                                    <option value="All">-- Semua Status --</option>
                                    <option value="Cocok">Cocok (Rp 0)</option>
                                    <option value="Selisih">Ada Selisih</option>
                                    <option value="BelumMutasi">Belum Ada Mutasi</option>
                                    <option value="Unmapped">MID Belum Terhubung</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                                            <th className="p-3">Outcode</th>
                                            <th className="p-3">Cabang PKU</th>
                                            <th className="p-3 text-center bg-blue-50 text-blue-900 border-l border-blue-200">BCA Debit</th>
                                            <th className="p-3 text-center bg-blue-50 text-blue-900">BCA QRIS</th>
                                            <th className="p-3 text-center bg-blue-50 text-blue-900">BCA Credit</th>
                                            <th className="p-3 text-center bg-emerald-50 text-emerald-900 border-l border-emerald-200">BRI OffUs</th>
                                            <th className="p-3 text-center bg-emerald-50 text-emerald-900">BRI OnUs</th>
                                            <th className="p-3 text-center bg-emerald-50 text-emerald-900">BRI QRIS</th>
                                            <th className="p-3 text-right border-l border-gray-200">Cashless Xilnex</th>
                                            <th className="p-3 text-right">Total Bank Gross</th>
                                            <th className="p-3 text-right font-bold">Selisih Net</th>
                                            <th className="p-3 text-center">Status</th>
                                            <th className="p-3 text-center">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700">
                                        {filteredGrid.length === 0 ? (
                                            <tr>
                                                <td colSpan={13} className="p-8 text-center text-gray-400">
                                                    Belum ada data rekonsiliasi. Silakan unggah file Excel di tab <b>"Unggah Data Harian"</b>.
                                                </td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}

                {activeTab === 'upload' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-3">
                            <h3 className="text-lg font-bold text-gray-800">📤 Unggah Data Rekonsiliasi Harian</h3>
                            <p className="text-xs text-gray-500 max-w-xl mx-auto">
                                Unggah file Excel Mutasi BCA (Ref 6) dan Mutasi BRI (Ref 5). Data Sales Xilnex akan diambil otomatis dari data POS yang sudah diunggah di sistem.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">1. Mutasi BCA (Ref 6)</div>
                                <p className="text-[11px] text-gray-400">Excel Mutasi BCA PKU (KR OTOMATIS, KARTU KREDIT)</p>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setFileBca(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {fileBca && <p className="text-xs font-semibold text-blue-600">✓ {fileBca.name}</p>}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">2. Mutasi BRI (Ref 5)</div>
                                <p className="text-[11px] text-gray-400">Excel Mutasi BRI PKU (OffUs, OnUs, QRIS)</p>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setFileBri(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {fileBri && <p className="text-xs font-semibold text-emerald-600">✓ {fileBri.name}</p>}
                            </div>
                        </div>

                        <div className="flex justify-center pt-4">
                            <button
                                onClick={handleUploadDailyFiles}
                                disabled={loading}
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm disabled:opacity-50 cursor-pointer"
                            >
                                {loading ? '⏳ Memproses Data Excel...' : '⚡ Jalankan Rekonsiliasi Presisi'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'masters' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-3">
                            <h3 className="text-lg font-bold text-gray-800">⚙️ Unggah &amp; Perbarui Master Mapping MID</h3>
                            <p className="text-xs text-gray-500 max-w-xl mx-auto">
                                Unggah file master pendukung (Ref 2, Ref 3, Ref 4, Ref 7) untuk memperbarui relasi MID Bank ke Kode Toko (Outcode).
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-gray-700">REFERENSI 2: Deposit Card BCA</div>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setDepositCardFile(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {depositCardFile && <p className="text-xs text-emerald-600">✓ {depositCardFile.name}</p>}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-gray-700">REFERENSI 3: Master MID BRI</div>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setBriMidFile(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {briMidFile && <p className="text-xs text-emerald-600">✓ {briMidFile.name}</p>}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-gray-700">REFERENSI 4: Master MID BCA</div>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setBcaMidFile(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {bcaMidFile && <p className="text-xs text-emerald-600">✓ {bcaMidFile.name}</p>}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-gray-700">REFERENSI 7: Master Cabang PKU</div>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setPkuCabangFile(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {pkuCabangFile && <p className="text-xs text-emerald-600">✓ {pkuCabangFile.name}</p>}
                            </div>
                        </div>

                        <div className="flex justify-center pt-4">
                            <button
                                onClick={handleUploadMasterFiles}
                                disabled={loading}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm disabled:opacity-50 cursor-pointer"
                            >
                                {loading ? '⏳ Menyimpan Master Mapping...' : '💾 Simpan &amp; Sinkronkan Master Mapping'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {/* Real-Time Progress Overlay Modal */}
            {loading && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-emerald-100 flex flex-col items-center text-center animate-scale-up space-y-4">
                        <div className="relative flex items-center justify-center">
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-inner">
                                <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Pemrosesan Data Rekonsiliasi</h3>
                            <p className="text-xs text-emerald-700 font-semibold mt-2 leading-relaxed bg-emerald-50/90 px-3.5 py-2 rounded-xl border border-emerald-100/80 inline-block shadow-xs">
                                {progressStatus || 'Mohon tunggu, sedang memproses file...'}
                            </p>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/60 mt-1">
                            <div 
                                className="bg-emerald-600 h-2 rounded-full transition-all duration-300 ease-out shadow-sm"
                                style={{ width: `${Math.min(100, Math.max(10, progressPercent))}%` }}
                            />
                        </div>
                        
                        <div className="flex items-center justify-between w-full text-[11px] text-slate-400 font-medium px-1 pt-1">
                            <span className="font-bold text-emerald-600">{progressPercent}% Selesai</span>
                            <span>Aplikasi Setoran Alpro</span>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
