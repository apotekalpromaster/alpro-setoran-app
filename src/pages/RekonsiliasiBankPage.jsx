import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
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

export default function RekonsiliasiBankPage() {
    const { profile } = useAuth();

    const [activeTab, setActiveTab] = useState('tabel'); // 'tabel' | 'upload' | 'masters'
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
    const [toleranceH1, setToleranceH1] = useState(true);

    const [rawXilnexSales, setRawXilnexSales] = useState([]);
    const [rawBankMutations, setRawBankMutations] = useState([]);
    const [storeProfiles, setStoreProfiles] = useState([]);
    const [masterMappings, setMasterMappings] = useState(() => getStoredMasterMappings());

    // File selection states & parsed previews
    const [fileXilnex, setFileXilnex] = useState(null);
    const [parsedXilnex, setParsedXilnex] = useState([]);

    const [fileBriMut, setFileBriMut] = useState(null);
    const [parsedBriMut, setParsedBriMut] = useState([]);

    const [fileBcaMut, setFileBcaMut] = useState(null);
    const [parsedBcaMut, setParsedBcaMut] = useState([]);

    // Master File states
    const [masterFiles, setMasterFiles] = useState({
        deposit_card: { file: null, parsed: [], count: 0, loading: false },
        bri_mid: { file: null, parsed: [], count: 0, loading: false },
        bca_mid: { file: null, parsed: [], count: 0, loading: false },
        pku_cabang: { file: null, parsed: [], count: 0, loading: false }
    });

    const [selectedRowDetail, setSelectedRowDetail] = useState(null);

    useEffect(() => {
        fetchStoreProfiles();
        loadInitialMasters();
    }, []);

    const fetchStoreProfiles = async () => {
        try {
            const { data, error: err } = await supabase
                .from('profiles')
                .select('id, username, kode_toko, email, role')
                .eq('role', 'User')
                .order('username');
            if (err) throw err;
            setStoreProfiles(data || []);
        } catch (e) {
            console.error('Gagal memuat profil toko:', e.message);
        }
    };

    const loadInitialMasters = async () => {
        const dbMasters = await fetchMasterMappingsFromSupabase();
        if (dbMasters) {
            setMasterMappings(dbMasters);
        } else {
            setMasterMappings(getStoredMasterMappings());
        }
    };

    const masterCounts = useMemo(() => {
        return {
            deposit_card: Object.keys(masterMappings.deposit_cards || {}).length,
            bri_mid: Object.keys(masterMappings.bri_mids || {}).length,
            bca_mid: Object.keys(masterMappings.bca_mids || {}).length,
            pku_cabang: Object.keys(masterMappings.pku_cabang || {}).length
        };
    }, [masterMappings]);

    const reconGrid = useMemo(() => {
        return computeReconciliation({
            xilnexSales: rawXilnexSales,
            bankMutations: rawBankMutations,
            storeProfiles,
            toleranceH1
        });
    }, [rawXilnexSales, rawBankMutations, storeProfiles, toleranceH1]);

    const filteredGrid = useMemo(() => {
        return reconGrid.filter(row => {
            if (startDate && row.date < startDate) return false;
            if (endDate && row.date > endDate) return false;

            if (selectedBranch) {
                const matchStore = row.outcode.toLowerCase().includes(selectedBranch.toLowerCase()) ||
                                   row.storeName.toLowerCase().includes(selectedBranch.toLowerCase());
                if (!matchStore) return false;
            }

            if (selectedBank !== 'All' && row.bank !== selectedBank) return false;

            if (statusFilter !== 'All') {
                if (statusFilter === 'Cocok' && row.status !== 'Cocok') return false;
                if (statusFilter === 'Selisih' && !row.status.includes('Selisih')) return false;
                if (statusFilter === 'BelumMutasi' && row.status !== 'BelumMutasi') return false;
                if (statusFilter === 'Unmapped' && row.status !== 'Unmapped') return false;
            }

            return true;
        });
    }, [reconGrid, startDate, endDate, selectedBranch, selectedBank, statusFilter]);

    const stats = useMemo(() => {
        let totalXilnex = 0;
        let totalBankNet = 0;
        let totalBankMdr = 0;
        let totalSelisih = 0;
        let countCocok = 0;
        let countSelisih = 0;

        filteredGrid.forEach(row => {
            totalXilnex += row.xilnexTotal;
            totalBankNet += row.bankNet;
            totalBankMdr += row.bankMdr;
            totalSelisih += Math.abs(row.selisihNet);

            if (row.status === 'Cocok') countCocok++;
            else countSelisih++;
        });

        return {
            totalRows: filteredGrid.length,
            totalXilnex,
            totalBankNet,
            totalBankMdr,
            totalSelisih,
            countCocok,
            countSelisih
        };
    }, [filteredGrid]);

    const handleSelectXilnex = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileXilnex(file);
        setError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseXilnexSalesExcel(evt.target.result);
                setParsedXilnex(parsed);
            } catch (err) {
                setError('Gagal membaca file Xilnex: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSelectBriMut = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileBriMut(file);
        setError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseBriMutationExcel(evt.target.result, masterMappings.bri_mids);
                setParsedBriMut(parsed);
            } catch (err) {
                setError('Gagal membaca file mutasi BRI: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSelectBcaMut = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileBcaMut(file);
        setError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseBcaMutationExcel(evt.target.result, masterMappings.bca_mids);
                setParsedBcaMut(parsed);
            } catch (err) {
                setError('Gagal membaca file mutasi BCA: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleProcessDailyUploads = () => {
        setError('');
        setSuccessMsg('');
        let countAdded = 0;

        if (parsedXilnex.length > 0) {
            setRawXilnexSales(parsedXilnex);
            countAdded += parsedXilnex.length;
        }

        let newMutations = [...rawBankMutations];
        if (parsedBriMut.length > 0) {
            newMutations = [...newMutations.filter(b => b.bank_name !== 'BRI'), ...parsedBriMut];
            countAdded += parsedBriMut.length;
        }
        if (parsedBcaMut.length > 0) {
            newMutations = [...newMutations.filter(b => b.bank_name !== 'BCA'), ...parsedBcaMut];
            countAdded += parsedBcaMut.length;
        }

        setRawBankMutations(newMutations);

        if (countAdded > 0) {
            setSuccessMsg("Berhasil memproses total " + countAdded + " baris data transaksi harian Xilnex & Bank.");
            setActiveTab('tabel');
        } else {
            setError('Pilih minimal 1 file Excel (Xilnex / BRI / BCA) terlebih dahulu sebelum menekan tombol proses.');
        }
    };

    const handleSelectMasterFile = (e, masterType) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const buffer = evt.target.result;
                let parsed = [];
                if (masterType === 'deposit_card') parsed = parseDepositCardExcel(buffer);
                else if (masterType === 'bri_mid') parsed = parseBriMidExcel(buffer);
                else if (masterType === 'bca_mid') parsed = parseBcaMidExcel(buffer);
                else if (masterType === 'pku_cabang') parsed = parsePkuCabangExcel(buffer);

                setMasterFiles(prev => ({
                    ...prev,
                    [masterType]: { file, parsed, count: parsed.length, loading: false }
                }));
                setError('');
            } catch (err) {
                setError("Gagal membaca file master " + masterType + ": " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleProcessMasterFile = async (masterType) => {
        const item = masterFiles[masterType];
        if (!item.file || item.parsed.length === 0) {
            setError('Pilih file Excel master yang valid terlebih dahulu.');
            return;
        }

        setMasterFiles(prev => ({
            ...prev,
            [masterType]: { ...prev[masterType], loading: true }
        }));
        setError('');
        setSuccessMsg('');

        try {
            let partialMapping = {};

            if (masterType === 'deposit_card') {
                const map = {};
                item.parsed.forEach(i => { map[i.bca_deposit_card] = i.outcode; });
                partialMapping = { deposit_cards: map };
            } else if (masterType === 'bri_mid') {
                const map = {};
                item.parsed.forEach(i => { map[i.mid_bri] = i.outcode; });
                partialMapping = { bri_mids: map };
            } else if (masterType === 'bca_mid') {
                const map = {};
                item.parsed.forEach(i => { map[i.mid_bca] = i.outcode; });
                partialMapping = { bca_mids: map };
            } else if (masterType === 'pku_cabang') {
                const map = {};
                item.parsed.forEach(i => { map[i.outcode] = i.cabang_pku; });
                partialMapping = { pku_cabang: map };
            }

            const updated = saveMasterMappings(partialMapping);
            setMasterMappings(updated);

            const dbResult = await syncMasterMappingsToSupabase(partialMapping);

            if (dbResult.success) {
                setSuccessMsg("Berhasil memproses & menyimpan " + item.parsed.length + " data Master " + masterType.toUpperCase() + " ke Supabase Database & Browser Storage!");
            } else {
                setSuccessMsg("Master " + masterType.toUpperCase() + " tersimpan di browser Local Storage (" + item.parsed.length + " data). Supabase Note: " + (dbResult.error || "Tabel belum ada"));
            }

            setMasterFiles(prev => ({
                ...prev,
                [masterType]: { file: null, parsed: [], count: 0, loading: false }
            }));
        } catch (err) {
            setError("Gagal memproses master " + masterType + ": " + err.message);
            setMasterFiles(prev => ({
                ...prev,
                [masterType]: { ...prev[masterType], loading: false }
            }));
        }
    };

    return (
        <AdminLayout title="Rekonsiliasi Transaksi Xilnex vs Mutasi Bank">
            <div className="max-w-screen-2xl mx-auto space-y-6">

                <div className="flex border-b border-gray-200 bg-white px-4 rounded-xl shadow-sm">
                    <button
                        onClick={() => setActiveTab('tabel')}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'tabel'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg">fact_check</span>
                        Dashboard & Matriks Rekonsiliasi
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'upload'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg">cloud_upload</span>
                        Pusat Upload File Harian (Xilnex, BRI, BCA)
                    </button>
                    <button
                        onClick={() => setActiveTab('masters')}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'masters'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg">dataset</span>
                        Kelola Master MID & Cabang
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">error</span>
                            <span className="font-semibold text-xs">{error}</span>
                        </div>
                        <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold cursor-pointer">✕</button>
                    </div>
                )}
                {successMsg && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">check_circle</span>
                            <span className="font-semibold text-xs">{successMsg}</span>
                        </div>
                        <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 font-bold cursor-pointer">✕</button>
                    </div>
                )}

                {activeTab === 'tabel' && (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Penjualan Xilnex</span>
                                <span className="text-2xl font-black text-gray-800 mt-1 block font-mono">
                                    {formatRupiah(stats.totalXilnex)}
                                </span>
                                <span className="text-[11px] text-gray-500 mt-1 block">Kartu Kredit/Debit & QRIS</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-500">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Mutasi Net Bank (Riil)</span>
                                <span className="text-2xl font-black text-emerald-600 mt-1 block font-mono">
                                    {formatRupiah(stats.totalBankNet)}
                                </span>
                                <span className="text-[11px] text-gray-500 mt-1 block">Total uang masuk rekening</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Potongan MDR Bank</span>
                                <span className="text-2xl font-black text-amber-600 mt-1 block font-mono">
                                    {formatRupiah(stats.totalBankMdr)}
                                </span>
                                <span className="text-[11px] text-gray-500 mt-1 block">Biaya MDR / ADM Bank</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-red-500">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Akumulasi Selisih</span>
                                <span className="text-2xl font-black text-red-600 mt-1 block font-mono">
                                    {formatRupiah(stats.totalSelisih)}
                                </span>
                                <span className="text-[11px] text-red-600 font-semibold mt-1 block">
                                    {stats.countSelisih} Rekaman Butuh Perhatian
                                </span>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-gray-100">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary-500 text-lg">filter_alt</span>
                                    Filter & Parameter Rekonsiliasi
                                </h3>

                                <label className="flex items-center gap-3 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={toleranceH1}
                                        onChange={(e) => setToleranceH1(e.target.checked)}
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-gray-700">
                                        Aktifkan Opsi Toleransi Settlement H+1 (T+1)
                                    </span>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Mulai Tanggal</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Sampai Tanggal</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Cari Toko / Outcode</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: JKJSTT1 / KALIBATA"
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Filter Bank Merchant</label>
                                    <select
                                        value={selectedBank}
                                        onChange={(e) => setSelectedBank(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs bg-gray-50 cursor-pointer"
                                    >
                                        <option value="All">Semua Bank (BCA & BRI)</option>
                                        <option value="BCA">Bank BCA Only</option>
                                        <option value="BRI">Bank BRI Only</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Status Kecocokan</label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs bg-gray-50 cursor-pointer"
                                    >
                                        <option value="All">Semua Status</option>
                                        <option value="Cocok">Cocok (Sesuai Rp 0)</option>
                                        <option value="Selisih">Memiliki Selisih</option>
                                        <option value="BelumMutasi">Belum Ada Mutasi Bank</option>
                                        <option value="Unmapped">MID Belum Terhubung</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">
                                    Menampilkan {filteredGrid.length} Rekaman Perbandingan Transaksi
                                </span>
                                {rawXilnexSales.length === 0 && rawBankMutations.length === 0 && (
                                    <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                        ⚠️ Belum ada file harian diunggah. Silakan buka tab "Pusat Upload File Harian".
                                    </span>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-left">
                                    <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="py-3 px-4 whitespace-nowrap">Tanggal</th>
                                            <th className="py-3 px-4 whitespace-nowrap">Toko / Outcode</th>
                                            <th className="py-3 px-4 whitespace-nowrap">Cabang PKU</th>
                                            <th className="py-3 px-4 whitespace-nowrap text-center">Bank</th>
                                            <th className="py-3 px-4 text-right bg-blue-50/50 text-blue-700 whitespace-nowrap">Penjualan Xilnex</th>
                                            <th className="py-3 px-4 text-right bg-emerald-50/50 text-emerald-700 whitespace-nowrap">Mutasi Net Bank</th>
                                            <th className="py-3 px-4 text-right bg-amber-50/50 text-amber-700 whitespace-nowrap">MDR Bank</th>
                                            <th className="py-3 px-4 text-right whitespace-nowrap">Selisih (Net)</th>
                                            <th className="py-3 px-4 text-center whitespace-nowrap">Status Matching</th>
                                            <th className="py-3 px-4 text-center whitespace-nowrap">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                                        {filteredGrid.length === 0 ? (
                                            <tr>
                                                <td colSpan="10" className="py-12 text-center text-gray-400">
                                                    Tidak ada data rekonsiliasi yang sesuai dengan kriteria filter.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredGrid.map((row, idx) => (
                                                <tr
                                                    key={idx}
                                                    className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                                                    onClick={() => setSelectedRowDetail(row)}
                                                >
                                                    <td className="py-3 px-4 font-semibold text-gray-900 whitespace-nowrap">
                                                        {row.date}
                                                    </td>
                                                    <td className="py-3 px-4 font-bold text-gray-800">
                                                        {row.outcode}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-gray-500">
                                                        {row.cabang_pku || '-'}
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            row.bank === 'BCA' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                                                        }`}>
                                                            {row.bank}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-bold bg-blue-50/20 text-blue-900">
                                                        {formatRupiah(row.xilnexTotal)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-bold bg-emerald-50/20 text-emerald-900">
                                                        {formatRupiah(row.bankNet)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono text-amber-800 bg-amber-50/20">
                                                        {formatRupiah(row.bankMdr)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-bold">
                                                        {row.selisihNet === 0 ? (
                                                            <span className="text-gray-400">Rp 0</span>
                                                        ) : (
                                                            <span className={row.selisihNet > 0 ? 'text-red-600' : 'text-blue-600'}>
                                                                {(row.selisihNet > 0 ? '+' : '') + formatRupiah(row.selisihNet)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-center whitespace-nowrap">
                                                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${row.badgeColor}`}>
                                                            {row.statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setSelectedRowDetail(row); }}
                                                            className="p-1 text-gray-400 hover:text-primary-600 rounded transition-colors cursor-pointer"
                                                            title="Lihat Detail Transaksi"
                                                        >
                                                            <span className="material-symbols-outlined text-base">visibility</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'upload' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                            <span className="material-symbols-outlined text-4xl text-primary-500">cloud_sync</span>
                            <h3 className="text-lg font-bold text-gray-800">Unggah Berkas Transaksi Harian</h3>
                            <p className="text-xs text-gray-500 max-w-lg mx-auto">
                                Unggah file penjualan non-tunai Xilnex (Ref 1), mutasi BRI (Ref 5), dan mutasi BCA (Ref 6), lalu tekan <strong>"Proses & Mulai Rekonsiliasi"</strong>.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 text-primary-600 mb-2">
                                        <span className="material-symbols-outlined">receipt_long</span>
                                        <h4 className="font-bold text-sm text-gray-800">1. Data Xilnex Sales</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel Cash & Card Automation_...xlsx (Ref 1).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {fileXilnex ? (
                                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-blue-900 block truncate">📄 {fileXilnex.name}</span>
                                            <span className="text-[11px] font-semibold text-blue-700 block">✓ {parsedXilnex.length} baris terdeteksi</span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] text-gray-400 block italic">Belum ada file dipilih</span>
                                    )}
                                    <label className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Pilih Xilnex Excel
                                        <input type="file" accept=".xlsx,.xls" onChange={handleSelectXilnex} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 text-orange-600 mb-2">
                                        <span className="material-symbols-outlined">account_balance</span>
                                        <h4 className="font-bold text-sm text-gray-800">2. Mutasi Bank BRI</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel BRI PKU...xlsx (Ref 5 - OffUs, OnUs, QRIS).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {fileBriMut ? (
                                        <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-orange-900 block truncate">📄 {fileBriMut.name}</span>
                                            <span className="text-[11px] font-semibold text-orange-700 block">✓ {parsedBriMut.length} mutasi terdeteksi</span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] text-gray-400 block italic">Belum ada file dipilih</span>
                                    )}
                                    <label className="bg-orange-600 hover:bg-orange-700 text-white font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Pilih Mutasi BRI
                                        <input type="file" accept=".xlsx,.xls" onChange={handleSelectBriMut} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                                        <span className="material-symbols-outlined">account_balance</span>
                                        <h4 className="font-bold text-sm text-gray-800">3. Mutasi Bank BCA</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel BCA PKU...xlsx (Ref 6 - KR OTOMATIS, KREDIT).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {fileBcaMut ? (
                                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-blue-900 block truncate">📄 {fileBcaMut.name}</span>
                                            <span className="text-[11px] font-semibold text-blue-700 block">✓ {parsedBcaMut.length} mutasi terdeteksi</span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] text-gray-400 block italic">Belum ada file dipilih</span>
                                    )}
                                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Pilih Mutasi BCA
                                        <input type="file" accept=".xlsx,.xls" onChange={handleSelectBcaMut} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-xs text-gray-500 space-y-1">
                                <span className="font-bold text-gray-800 block text-sm">Siap Memproses Rekonsiliasi?</span>
                                <span>Pastikan Anda telah memilih file Excel harian yang ingin dibandingkan.</span>
                            </div>
                            <button
                                onClick={handleProcessDailyUploads}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer whitespace-nowrap"
                            >
                                <span className="material-symbols-outlined text-lg">play_circle</span>
                                Proses & Mulai Rekonsiliasi
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'masters' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                            <span className="material-symbols-outlined text-4xl text-primary-500">dataset</span>
                            <h3 className="text-lg font-bold text-gray-800">Kelola File Master & MID Bank</h3>
                            <p className="text-xs text-gray-500 max-w-lg mx-auto">
                                Unggah file master referensi untuk menghubungkan Merchant ID (MID) bank dengan kode toko (OUTCODE). Data otomatis tersimpan terpusat di <strong>Supabase Database</strong>.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-gray-800">Referensi 2: DEPOSIT CARD BCA</h4>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                            {masterCounts.deposit_card} Stored
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">Mapping Nomor Kartu BCA Deposit Card ke Outcode toko.</p>
                                </div>

                                <div className="space-y-3">
                                    {masterFiles.deposit_card.file ? (
                                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-gray-800 block truncate">📄 {masterFiles.deposit_card.file.name}</span>
                                            <span className="text-emerald-600 font-bold block">✓ {masterFiles.deposit_card.count} baris data terbaca</span>
                                        </div>
                                    ) : (
                                        <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-base">upload_file</span>
                                            Pilih Berkas DEPOSIT CARD.xlsx
                                            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleSelectMasterFile(e, 'deposit_card')} className="hidden" />
                                        </label>
                                    )}

                                    {masterFiles.deposit_card.file && (
                                        <button
                                            onClick={() => handleProcessMasterFile('deposit_card')}
                                            disabled={masterFiles.deposit_card.loading}
                                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {masterFiles.deposit_card.loading ? (
                                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-base">save</span>
                                                    Proses & Simpan ke Supabase
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-gray-800">Referensi 3: MASTER MID BRI</h4>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                            {masterCounts.bri_mid} Stored
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">Mapping Merchant ID (MID) BRI ke Outcode toko.</p>
                                </div>

                                <div className="space-y-3">
                                    {masterFiles.bri_mid.file ? (
                                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-gray-800 block truncate">📄 {masterFiles.bri_mid.file.name}</span>
                                            <span className="text-emerald-600 font-bold block">✓ {masterFiles.bri_mid.count} baris data terbaca</span>
                                        </div>
                                    ) : (
                                        <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-base">upload_file</span>
                                            Pilih Berkas MASTER MID BRI.xlsx
                                            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleSelectMasterFile(e, 'bri_mid')} className="hidden" />
                                        </label>
                                    )}

                                    {masterFiles.bri_mid.file && (
                                        <button
                                            onClick={() => handleProcessMasterFile('bri_mid')}
                                            disabled={masterFiles.bri_mid.loading}
                                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {masterFiles.bri_mid.loading ? (
                                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-base">save</span>
                                                    Proses & Simpan ke Supabase
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-gray-800">Referensi 4: MASTER MID BCA</h4>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                            {masterCounts.bca_mid} Stored
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">Mapping Merchant ID (MID) BCA (7-digit) ke Outcode toko.</p>
                                </div>

                                <div className="space-y-3">
                                    {masterFiles.bca_mid.file ? (
                                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-gray-800 block truncate">📄 {masterFiles.bca_mid.file.name}</span>
                                            <span className="text-emerald-600 font-bold block">✓ {masterFiles.bca_mid.count} baris data terbaca</span>
                                        </div>
                                    ) : (
                                        <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-base">upload_file</span>
                                            Pilih Berkas MASTER MID BCA.xlsx
                                            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleSelectMasterFile(e, 'bca_mid')} className="hidden" />
                                        </label>
                                    )}

                                    {masterFiles.bca_mid.file && (
                                        <button
                                            onClick={() => handleProcessMasterFile('bca_mid')}
                                            disabled={masterFiles.bca_mid.loading}
                                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {masterFiles.bca_mid.loading ? (
                                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-base">save</span>
                                                    Proses & Simpan ke Supabase
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-gray-800">Referensi 7: MASTER CABANG PKU</h4>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                            {masterCounts.pku_cabang} Stored
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">Mapping Outcode ke Kode Cabang PKU.</p>
                                </div>

                                <div className="space-y-3">
                                    {masterFiles.pku_cabang.file ? (
                                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                                            <span className="font-bold text-gray-800 block truncate">📄 {masterFiles.pku_cabang.file.name}</span>
                                            <span className="text-emerald-600 font-bold block">✓ {masterFiles.pku_cabang.count} baris data terbaca</span>
                                        </div>
                                    ) : (
                                        <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-base">upload_file</span>
                                            Pilih Berkas MASTER CABANG PKU.xlsx
                                            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleSelectMasterFile(e, 'pku_cabang')} className="hidden" />
                                        </label>
                                    )}

                                    {masterFiles.pku_cabang.file && (
                                        <button
                                            onClick={() => handleProcessMasterFile('pku_cabang')}
                                            disabled={masterFiles.pku_cabang.loading}
                                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {masterFiles.pku_cabang.loading ? (
                                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-base">save</span>
                                                    Proses & Simpan ke Supabase
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {selectedRowDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
                        <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-sm text-gray-800">
                                        Rincian Transaksi: {selectedRowDetail.outcode} ({selectedRowDetail.bank}) - {selectedRowDetail.date}
                                    </h3>
                                    <span className="text-xs text-gray-500">Status: {selectedRowDetail.statusLabel}</span>
                                </div>
                                <button
                                    onClick={() => setSelectedRowDetail(null)}
                                    className="text-gray-400 hover:text-gray-600 font-bold cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6 text-xs">
                                <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div>
                                        <span className="text-gray-500 block">Total Xilnex</span>
                                        <span className="font-bold font-mono text-blue-700 text-sm">{formatRupiah(selectedRowDetail.xilnexTotal)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block">Total Mutasi Bank (Net)</span>
                                        <span className="font-bold font-mono text-emerald-700 text-sm">{formatRupiah(selectedRowDetail.bankNet)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block">Selisih Net</span>
                                        <span className="font-bold font-mono text-red-600 text-sm">{formatRupiah(selectedRowDetail.selisihNet)}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-bold text-gray-700">Detail Baris Mutasi Bank ({selectedRowDetail.rawBank.length} baris):</h4>
                                    {selectedRowDetail.rawBank.length === 0 ? (
                                        <p className="text-gray-400 italic">Belum ada mutasi bank terdeteksi.</p>
                                    ) : (
                                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                                            <table className="min-w-full text-left divide-y divide-gray-200">
                                                <thead className="bg-gray-50 font-bold text-gray-600">
                                                    <tr>
                                                        <th className="p-2">Tgl</th>
                                                        <th className="p-2">MID</th>
                                                        <th className="p-2">Tag</th>
                                                        <th className="p-2 text-right">Gross</th>
                                                        <th className="p-2 text-right">MDR</th>
                                                        <th className="p-2 text-right">Net</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {selectedRowDetail.rawBank.map((b, i) => (
                                                        <tr key={i}>
                                                            <td className="p-2">{b.tanggal_mutasi}</td>
                                                            <td className="p-2 font-mono">{b.mid}</td>
                                                            <td className="p-2">{b.category_tag}</td>
                                                            <td className="p-2 text-right font-mono">{formatRupiah(b.gross_amount)}</td>
                                                            <td className="p-2 text-right font-mono text-amber-700">{formatRupiah(b.mdr_amount)}</td>
                                                            <td className="p-2 text-right font-mono font-bold text-emerald-700">{formatRupiah(b.net_amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                                <button
                                    onClick={() => setSelectedRowDetail(null)}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-4 py-1.5 rounded-lg text-xs cursor-pointer"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AdminLayout>
    );
}
