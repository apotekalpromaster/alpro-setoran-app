import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import {
    parseXilnexSalesExcel,
    parseDepositCardExcel,
    parseBriMidExcel,
    parseBcaMidExcel,
    parseBriMutationExcel,
    parseBcaMutationExcel,
    parsePkuCabangExcel
} from '../services/reconciliationParser';
import {
    getStoredMasterMappings,
    saveMasterMappings,
    syncMasterMappingsToSupabase,
    fetchMasterMappingsFromSupabase,
    computeReconciliation
} from '../services/reconciliationService';

const SUB_GROUP_LABELS = {
    BCA_DEBIT: { label: 'BCA Debit (KR OTO MID)', bank: 'BCA', desc: 'BCA-Debit Bank Sama + Lain' },
    BCA_QRIS: { label: 'BCA QRIS (KR OTO TGL)', bank: 'BCA', desc: 'BCA-QRIS' },
    BCA_CREDIT: { label: 'BCA Credit Card (Kredit MID)', bank: 'BCA', desc: 'BCA-Master, Visa, JCB, UnionPay, BCA Card' },
    BRI_OFFUS: { label: 'BRI OffUs', bank: 'BRI', desc: 'BRI-Master, Visa, JCB, UnionPay, BCA Card, Debit Bank Lain' },
    BRI_ONUS: { label: 'BRI OnUs', bank: 'BRI', desc: 'BRI-Debit Bank Sama' },
    BRI_QRIS: { label: 'BRI QRIS (OffUs + OnUs)', bank: 'BRI', desc: 'BRI-QRIS' }
};

export default function RekonsiliasiBankPage() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('tabel');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toLocaleDateString('sv-SE');
    });
    const [endDate, setEndDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const [selectedBranch, setSelectedBranch] = useState('');
    const [selectedBank, setSelectedBank] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    const [rawXilnexSales, setRawXilnexSales] = useState([]);
    const [rawBankMutations, setRawBankMutations] = useState([]);
    const [storeProfiles, setStoreProfiles] = useState([]);
    const [masterMappings, setMasterMappings] = useState(() => getStoredMasterMappings());

    const [selectedRow, setSelectedRow] = useState(null);
    const [modalTab, setModalTab] = useState('matrix');

    const [depositCardFile, setDepositCardFile] = useState(null);
    const [briMidFile, setBriMidFile] = useState(null);
    const [bcaMidFile, setBcaMidFile] = useState(null);
    const [pkuCabangFile, setPkuCabangFile] = useState(null);

    const [fileXilnex, setFileXilnex] = useState(null);
    const [fileBri, setFileBri] = useState(null);
    const [fileBca, setFileBca] = useState(null);

    useEffect(() => {
        loadStoreProfiles();
        fetchMasterMappingsFromSupabase().then(mappings => {
            if (mappings) setMasterMappings(mappings);
        });
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

    const handleUploadDailyFiles = async () => {
        if (!fileXilnex && !fileBri && !fileBca) {
            setError('Pilih minimal 1 file harian untuk diproses.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            let newXilnex = [...rawXilnexSales];
            let newMutations = [...rawBankMutations];

            if (fileXilnex) {
                const buf = await fileXilnex.arrayBuffer();
                const parsed = parseXilnexSalesExcel(buf);
                newXilnex = parsed;
            }

            const briMap = masterMappings.bri_mids || {};
            const bcaMap = masterMappings.bca_mids || {};

            let newlyParsedMutations = [];
            if (fileBri) {
                const buf = await fileBri.arrayBuffer();
                const parsedBri = parseBriMutationExcel(buf, briMap, masterMappings);
                newlyParsedMutations = newlyParsedMutations.concat(parsedBri);
            }
            if (fileBca) {
                const buf = await fileBca.arrayBuffer();
                const parsedBca = parseBcaMutationExcel(buf, bcaMap, masterMappings);
                newlyParsedMutations = newlyParsedMutations.concat(parsedBca);
            }

            if (newlyParsedMutations.length > 0) {
                newMutations = newlyParsedMutations;
            }

            setRawXilnexSales(newXilnex);
            setRawBankMutations(newMutations);

            setSuccessMsg(`Berhasil memproses data Excel! Xilnex: ${newXilnex.length} baris, Mutasi Bank: ${newMutations.length} baris.`);
            setActiveTab('tabel');
        } catch (e) {
            console.error('Error uploading daily files:', e);
            setError(e.message || 'Gagal memproses file Excel.');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadMasterFiles = async () => {
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const partial = { deposit_cards: {}, bri_mids: {}, bca_mids: {}, pku_cabang: {} };

            if (depositCardFile) {
                const buf = await depositCardFile.arrayBuffer();
                const parsed = parseDepositCardExcel(buf);
                parsed.forEach(p => { partial.deposit_cards[p.bca_deposit_card] = p.outcode; });
            }
            if (briMidFile) {
                const buf = await briMidFile.arrayBuffer();
                const parsed = parseBriMidExcel(buf);
                parsed.forEach(p => { partial.bri_mids[p.mid_bri] = p.outcode; });
            }
            if (bcaMidFile) {
                const buf = await bcaMidFile.arrayBuffer();
                const parsed = parseBcaMidExcel(buf);
                parsed.forEach(p => { partial.bca_mids[p.mid_bca] = p.outcode; });
            }
            if (pkuCabangFile) {
                const buf = await pkuCabangFile.arrayBuffer();
                const parsed = parsePkuCabangExcel(buf);
                parsed.forEach(p => { partial.pku_cabang[p.outcode] = p.cabang_pku; });
            }

            const updated = saveMasterMappings(partial);
            setMasterMappings(updated);

            await syncMasterMappingsToSupabase(partial);

            setSuccessMsg('Master mapping MID & Cabang berhasil diperbarui dan disimpan!');
            setDepositCardFile(null);
            setBriMidFile(null);
            setBcaMidFile(null);
            setPkuCabangFile(null);
        } catch (e) {
            console.error('Error uploading master files:', e);
            setError(e.message || 'Gagal memproses file master.');
        } finally {
            setLoading(false);
        }
    };

    const reconResults = useMemo(() => {
        if (rawXilnexSales.length === 0 && rawBankMutations.length === 0) return [];

        let filteredSales = rawXilnexSales;
        let filteredMutations = rawBankMutations;

        if (startDate && endDate) {
            filteredSales = filteredSales.filter(s => s.tanggal_jual >= startDate && s.tanggal_jual <= endDate);
            
            // Mutasi bank diizinkan masuk sampai H+7 dari endDate agar settlement H+1..H+7 milik sales periode ini dapat ter-match presisi
            const extEnd = new Date(endDate);
            extEnd.setDate(extEnd.getDate() + 7);
            const extEndStr = extEnd.toISOString().split('T')[0];

            filteredMutations = filteredMutations.filter(m => m.tanggal_mutasi >= startDate && m.tanggal_mutasi <= extEndStr);
        }

        return computeReconciliation({
            xilnexSales: filteredSales,
            bankMutations: filteredMutations,
            storeProfiles
        });
    }, [rawXilnexSales, rawBankMutations, storeProfiles, startDate, endDate]);

    const filteredGrid = useMemo(() => {
        return reconResults.filter(row => {
            if (selectedBranch && row.outcode !== selectedBranch) return false;
            if (statusFilter !== 'All' && row.status !== statusFilter) return false;
            if (selectedBank === 'BCA') {
                const bcaGross = (row.subGroups?.BCA_DEBIT?.bankGross || 0) + (row.subGroups?.BCA_QRIS?.bankGross || 0) + (row.subGroups?.BCA_CREDIT?.bankGross || 0);
                if (bcaGross === 0 && row.cashlessXilnex === 0) return false;
            }
            if (selectedBank === 'BRI') {
                const briGross = (row.subGroups?.BRI_OFFUS?.bankGross || 0) + (row.subGroups?.BRI_ONUS?.bankGross || 0) + (row.subGroups?.BRI_QRIS?.bankGross || 0);
                if (briGross === 0 && row.cashlessXilnex === 0) return false;
            }
            return true;
        });
    }, [reconResults, selectedBranch, statusFilter, selectedBank]);

    const stats = useMemo(() => {
        let totalCashless = 0;
        let totalBcaGross = 0;
        let totalBriGross = 0;
        let totalBcaMdr = 0;
        let totalBriMdr = 0;
        let tokoSelisihCount = 0;

        reconResults.forEach(r => {
            totalCashless += r.cashlessXilnex || 0;

            const bcaG = (r.subGroups?.BCA_DEBIT?.bankGross || 0) + (r.subGroups?.BCA_QRIS?.bankGross || 0) + (r.subGroups?.BCA_CREDIT?.bankGross || 0);
            const briG = (r.subGroups?.BRI_OFFUS?.bankGross || 0) + (r.subGroups?.BRI_ONUS?.bankGross || 0) + (r.subGroups?.BRI_QRIS?.bankGross || 0);
            const bcaM = (r.subGroups?.BCA_DEBIT?.bankMdr || 0) + (r.subGroups?.BCA_QRIS?.bankMdr || 0) + (r.subGroups?.BCA_CREDIT?.bankMdr || 0);
            const briM = (r.subGroups?.BRI_OFFUS?.bankMdr || 0) + (r.subGroups?.BRI_ONUS?.bankMdr || 0) + (r.subGroups?.BRI_QRIS?.bankMdr || 0);

            totalBcaGross += bcaG;
            totalBriGross += briG;
            totalBcaMdr += bcaM;
            totalBriMdr += briM;

            if (r.selisihNet !== 0) tokoSelisihCount++;
        });

        const totalBankGross = totalBcaGross + totalBriGross;
        const totalBankMdr = totalBcaMdr + totalBriMdr;
        const totalNetVariance = totalCashless - totalBankGross;

        return {
            totalCashless,
            totalBankGross,
            totalBcaGross,
            totalBriGross,
            totalBankMdr,
            totalBcaMdr,
            totalBriMdr,
            totalNetVariance,
            tokoSelisihCount
        };
    }, [reconResults]);

    const uniqueOutcodes = useMemo(() => {
        const set = new Set();
        reconResults.forEach(r => { if (r.outcode) set.add(r.outcode); });
        return Array.from(set).sort();
    }, [reconResults]);

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
                        ⚙️ Kelola Master Mapping (MID & Cabang)
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
                                <div className={`text-2xl font-bold mt-1 ${stats.totalNetVariance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatRupiah(stats.totalNetVariance)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {stats.tokoSelisihCount > 0 ? `${stats.tokoSelisihCount} toko ada selisih` : '100% Cocok Presisi'}
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
                                    {uniqueOutcodes.map(code => (
                                        <option key={code} value={code}>{code}</option>
                                    ))}
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
                                        ) : (
                                            filteredGrid.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                    <td className="p-3 font-semibold text-gray-900">{row.outcode}</td>
                                                    <td className="p-3 text-gray-600">{row.cabang_pku || '-'}</td>

                                                    <td className="p-3 text-center bg-blue-50/30 border-l border-blue-100">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BCA_DEBIT} />
                                                    </td>
                                                    <td className="p-3 text-center bg-blue-50/30">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BCA_QRIS} />
                                                    </td>
                                                    <td className="p-3 text-center bg-blue-50/30">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BCA_CREDIT} />
                                                    </td>

                                                    <td className="p-3 text-center bg-emerald-50/30 border-l border-emerald-100">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BRI_OFFUS} />
                                                    </td>
                                                    <td className="p-3 text-center bg-emerald-50/30">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BRI_ONUS} />
                                                    </td>
                                                    <td className="p-3 text-center bg-emerald-50/30">
                                                        <SubGroupStatusBadge sg={row.subGroups?.BRI_QRIS} />
                                                    </td>

                                                    <td className="p-3 text-right font-medium text-gray-900 border-l border-gray-200">
                                                        {formatRupiah(row.cashlessXilnex)}
                                                    </td>
                                                    <td className="p-3 text-right font-medium text-emerald-700">
                                                        {formatRupiah(row.totalBankGross)}
                                                    </td>
                                                    <td className={`p-3 text-right font-bold ${row.selisihNet === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {formatRupiah(row.selisihNet)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full border ${row.badgeColor}`}>
                                                            {row.statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedRow(row);
                                                                setModalTab('matrix');
                                                            }}
                                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition-colors text-xs"
                                                        >
                                                            🔍 Detail
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
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
                                Unggah file Excel Penjualan Xilnex (Ref 1), Mutasi BRI (Ref 5), dan Mutasi BCA (Ref 6).
                                Sistem akan mencocokkan nominal penjualan tunai & non-tunai secara presisi per Sub-Grup.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">1. File Sales Xilnex (Ref 1)</div>
                                <p className="text-[11px] text-gray-400">Excel Cash & Card Automation (Kolom F & G)</p>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={e => setFileXilnex(e.target.files[0])}
                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg"
                                />
                                {fileXilnex && <p className="text-xs font-semibold text-emerald-600">✓ {fileXilnex.name}</p>}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">2. Mutasi BCA (Ref 6)</div>
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
                                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">3. Mutasi BRI (Ref 5)</div>
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
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm disabled:opacity-50"
                            >
                                {loading ? '⏳ Memproses Data Excel...' : '⚡ Jalankan Rekonsiliasi Presisi'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'masters' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-3">
                            <h3 className="text-lg font-bold text-gray-800">⚙️ Unggah & Perbarui Master Mapping MID</h3>
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
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm disabled:opacity-50"
                            >
                                {loading ? '⏳ Menyimpan Master Mapping...' : '💾 Simpan & Sinkronkan Master Mapping'}
                            </button>
                        </div>
                    </div>
                )}

            </div>

            {selectedRow && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full overflow-hidden border border-gray-100 my-8">
                        <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">{selectedRow.outcode} - {selectedRow.storeName}</h3>
                                <p className="text-xs text-gray-300 mt-1">Cabang PKU: <b>{selectedRow.cabang_pku || 'Belum di-set'}</b></p>
                            </div>
                            <button
                                onClick={() => setSelectedRow(null)}
                                className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex border-b border-gray-200 bg-gray-50 px-6">
                            <button
                                onClick={() => setModalTab('matrix')}
                                className={`py-3 px-4 text-xs font-bold border-b-2 ${
                                    modalTab === 'matrix' ? 'border-emerald-600 text-emerald-600 bg-white' : 'border-transparent text-gray-500'
                                }`}
                            >
                                📊 Matriks 6 Sub-Grup
                            </button>
                            <button
                                onClick={() => setModalTab('matched')}
                                className={`py-3 px-4 text-xs font-bold border-b-2 ${
                                    modalTab === 'matched' ? 'border-emerald-600 text-emerald-600 bg-white' : 'border-transparent text-gray-500'
                                }`}
                            >
                                🔗 Transaksi Linked ({selectedRow.matchedPairs?.length || 0})
                            </button>
                            <button
                                onClick={() => setModalTab('orphanSales')}
                                className={`py-3 px-4 text-xs font-bold border-b-2 ${
                                    modalTab === 'orphanSales' ? 'border-amber-600 text-amber-600 bg-white' : 'border-transparent text-gray-500'
                                }`}
                            >
                                ⚠️ Sales Belum Mutasi ({selectedRow.orphanSales?.length || 0})
                            </button>
                            <button
                                onClick={() => setModalTab('orphanMutations')}
                                className={`py-3 px-4 text-xs font-bold border-b-2 ${
                                    modalTab === 'orphanMutations' ? 'border-red-600 text-red-600 bg-white' : 'border-transparent text-gray-500'
                                }`}
                            >
                                ❓ Mutasi Tanpa Sales ({selectedRow.orphanMutations?.length || 0})
                            </button>
                        </div>

                        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-6">

                            {modalTab === 'matrix' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-800">Perbandingan Xilnex vs Mutasi Bank per 6 Sub-Grup Presisi</h4>
                                    <table className="w-full text-left text-xs border-collapse border border-gray-200">
                                        <thead>
                                            <tr className="bg-gray-100 text-gray-700 font-semibold border-b">
                                                <th className="p-3 border-r">Sub-Grup Rekonsiliasi</th>
                                                <th className="p-3 border-r">Target Xilnex (Ref 1)</th>
                                                <th className="p-3 text-right border-r">Xilnex Cashless</th>
                                                <th className="p-3 text-right border-r">Bank Gross</th>
                                                <th className="p-3 text-right border-r">Bank MDR</th>
                                                <th className="p-3 text-right border-r">Bank Net</th>
                                                <th className="p-3 text-right border-r font-bold">Selisih</th>
                                                <th className="p-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {Object.entries(SUB_GROUP_LABELS).map(([sgKey, info]) => {
                                                const sgData = selectedRow.subGroups?.[sgKey] || { salesTotal: 0, bankGross: 0, bankMdr: 0, bankNet: 0, selisih: 0 };
                                                return (
                                                    <tr key={sgKey} className="hover:bg-gray-50">
                                                        <td className="p-3 font-semibold text-gray-900 border-r">{info.label}</td>
                                                        <td className="p-3 text-gray-500 border-r text-[11px]">{info.desc}</td>
                                                        <td className="p-3 text-right border-r font-medium">{formatRupiah(sgData.salesTotal)}</td>
                                                        <td className="p-3 text-right border-r font-medium text-emerald-700">{formatRupiah(sgData.bankGross)}</td>
                                                        <td className="p-3 text-right border-r text-amber-700">{formatRupiah(sgData.bankMdr)}</td>
                                                        <td className="p-3 text-right border-r">{formatRupiah(sgData.bankNet)}</td>
                                                        <td className={`p-3 text-right border-r font-bold ${sgData.selisih === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {formatRupiah(sgData.selisih)}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {sgData.selisih === 0 ? (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">✓ Cocok</span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded">⚠️ Selisih</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-gray-900 text-white font-bold">
                                                <td colSpan={2} className="p-3 border-r">TOTAL SEMUA SUB-GRUP</td>
                                                <td className="p-3 text-right border-r">{formatRupiah(selectedRow.cashlessXilnex)}</td>
                                                <td className="p-3 text-right border-r">{formatRupiah(selectedRow.totalBankGross)}</td>
                                                <td className="p-3 text-right border-r">{formatRupiah(selectedRow.totalBankMdr)}</td>
                                                <td className="p-3 text-right border-r">{formatRupiah(selectedRow.totalBankNet)}</td>
                                                <td className={`p-3 text-right border-r ${selectedRow.selisihNet === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {formatRupiah(selectedRow.selisihNet)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {selectedRow.selisihNet === 0 ? '✓ OK' : '🔴 SELISIH'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {modalTab === 'matched' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-800">Daftar Transaksi Linked (Smart Greedy Match)</h4>
                                    {selectedRow.matchedPairs?.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Tidak ada transaksi yang berhasil di-link.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedRow.matchedPairs.map((pair, idx) => (
                                                <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-gray-900">[{pair.bankName}] Mutasi {pair.mutationDate}</span>
                                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">{pair.tag}</span>
                                                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                                                pair.matchStatus === 'Exact' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                            }`}>
                                                                {pair.matchStatus === 'Exact' ? '✓ Exact Match (1:1)' : '🔗 Accumulated Match (N:1)'}
                                                            </span>
                                                        </div>
                                                        <div className="font-bold text-emerald-700">Gross: {formatRupiah(pair.mutationGross)}</div>
                                                    </div>

                                                    <div className="pl-4 border-l-2 border-emerald-500 space-y-1 text-xs">
                                                        <div className="text-[11px] font-semibold text-gray-500">Sales Xilnex Linked:</div>
                                                        {pair.linkedSales.map((s, sIdx) => (
                                                            <div key={sIdx} className="flex justify-between text-gray-700">
                                                                <span>• {s.tanggal_jual} | Card: {s.card_type} | Merchant: {s.merchant_bank}</span>
                                                                <span className="font-semibold">{formatRupiah(s.amount)}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {pair.rawBank?.raw_keterangan && (
                                                        <div className="text-[10px] text-gray-400 bg-white p-2 rounded border border-gray-100 font-mono">
                                                            Raw Keterangan Bank: {pair.rawBank.raw_keterangan}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {modalTab === 'orphanSales' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-800">Sales Xilnex Belum Ada Mutasi Bank (Orphan Sales)</h4>
                                    {selectedRow.orphanSales?.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Semua sales Xilnex telah berhasil di-match dengan mutasi bank!</p>
                                    ) : (
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-amber-50 text-amber-900 font-semibold border-b">
                                                    <th className="p-3">Tanggal Jual</th>
                                                    <th className="p-3">Card Type</th>
                                                    <th className="p-3">Merchant Bank</th>
                                                    <th className="p-3">Sub-Grup</th>
                                                    <th className="p-3 text-right">Card Amount (Col F)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedRow.orphanSales.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-amber-50/50">
                                                        <td className="p-3 font-medium text-gray-900">{item.tanggal_jual}</td>
                                                        <td className="p-3 text-gray-600">{item.card_type}</td>
                                                        <td className="p-3 text-gray-600">{item.merchant_bank}</td>
                                                        <td className="p-3 text-gray-600">{item.sub_group}</td>
                                                        <td className="p-3 text-right font-bold text-amber-700">{formatRupiah(item.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {modalTab === 'orphanMutations' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-800">Mutasi Bank Tanpa Sales Xilnex (Orphan Mutations)</h4>
                                    {selectedRow.orphanMutations?.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Semua mutasi bank telah berhasil di-match dengan sales Xilnex!</p>
                                    ) : (
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-red-50 text-red-900 font-semibold border-b">
                                                    <th className="p-3">Tanggal Mutasi</th>
                                                    <th className="p-3">Bank</th>
                                                    <th className="p-3">Tag Kategori</th>
                                                    <th className="p-3">Sub-Grup</th>
                                                    <th className="p-3 text-right">Gross Amount</th>
                                                    <th className="p-3 text-right">Net Credit</th>
                                                    <th className="p-3">Keterangan Raw</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedRow.orphanMutations.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-red-50/50">
                                                        <td className="p-3 font-medium text-gray-900">{item.tanggal_mutasi}</td>
                                                        <td className="p-3 text-gray-600">{item.bank_name}</td>
                                                        <td className="p-3 text-gray-600">{item.category_tag}</td>
                                                        <td className="p-3 text-gray-600">{item.sub_group}</td>
                                                        <td className="p-3 text-right font-bold text-red-700">{formatRupiah(item.gross_amount)}</td>
                                                        <td className="p-3 text-right text-gray-700">{formatRupiah(item.net_amount)}</td>
                                                        <td className="p-3 text-[10px] text-gray-400 font-mono max-w-xs truncate">{item.raw_keterangan}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setSelectedRow(null)}
                                className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-semibold"
                            >
                                Tutup Rincian
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}

function SubGroupStatusBadge({ sg }) {
    if (!sg) return <span className="text-gray-300">-</span>;
    if (sg.selisih === 0 && sg.salesTotal > 0) {
        return <span className="text-xs font-bold text-emerald-600" title={`Gross: ${sg.bankGross.toLocaleString('id-ID')}`}>✓</span>;
    }
    if (sg.selisih !== 0) {
        return (
            <span className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200" title={`Selisih: ${sg.selisih.toLocaleString('id-ID')}`}>
                {sg.selisih > 0 ? `+${(sg.selisih/1000).toFixed(0)}k` : `${(sg.selisih/1000).toFixed(0)}k`}
            </span>
        );
    }
    return <span className="text-gray-400 text-[10px]">0</span>;
}
