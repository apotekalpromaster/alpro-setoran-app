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
    computeReconciliation
} from '../services/reconciliationService';

export default function RekonsiliasiPOSPage() {
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
    const [toleranceH1, setToleranceH1] = useState(true);

    const [rawXilnexSales, setRawXilnexSales] = useState([]);
    const [rawBankMutations, setRawBankMutations] = useState([]);
    const [storeProfiles, setStoreProfiles] = useState([]);
    const [masterMappings, setMasterMappings] = useState(() => getStoredMasterMappings());

    const [uploadedXilnexName, setUploadedXilnexName] = useState('');
    const [uploadedBriName, setUploadedBriName] = useState('');
    const [uploadedBcaName, setUploadedBcaName] = useState('');
    const [masterUploadStatus, setMasterUploadStatus] = useState('');

    const [selectedRowDetail, setSelectedRowDetail] = useState(null);

    useEffect(() => {
        fetchStoreProfiles();
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

    const handleUploadXilnex = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadedXilnexName(file.name);
        setError('');
        setSuccessMsg('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseXilnexSalesExcel(evt.target.result);
                setRawXilnexSales(parsed);
                setSuccessMsg(`Berhasil membaca ${parsed.length} baris data penjualan non-tunai Xilnex.`);
            } catch (err) {
                setError('Gagal membaca file Xilnex: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleUploadBriMutation = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadedBriName(file.name);
        setError('');
        setSuccessMsg('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseBriMutationExcel(evt.target.result, masterMappings.bri_mids);
                setRawBankMutations(prev => [...prev.filter(b => b.bank_name !== 'BRI'), ...parsed]);
                setSuccessMsg(`Berhasil membaca ${parsed.length} baris mutasi BRI (OffUs / OnUs / QRIS).`);
            } catch (err) {
                setError('Gagal membaca file mutasi BRI: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleUploadBcaMutation = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadedBcaName(file.name);
        setError('');
        setSuccessMsg('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = parseBcaMutationExcel(evt.target.result, masterMappings.bca_mids);
                setRawBankMutations(prev => [...prev.filter(b => b.bank_name !== 'BCA'), ...parsed]);
                setSuccessMsg(`Berhasil membaca ${parsed.length} baris mutasi BCA (KR OTOMATIS / KREDIT / TANGGAL).`);
            } catch (err) {
                setError('Gagal membaca file mutasi BCA: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleUploadMasterFile = (e, masterType) => {
        const file = e.target.files[0];
        if (!file) return;
        setMasterUploadStatus(`Membaca ${file.name}...`);
        setError('');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const buffer = evt.target.result;
                let newMasters = { ...masterMappings };

                if (masterType === 'deposit_card') {
                    const list = parseDepositCardExcel(buffer);
                    const map = {};
                    list.forEach(item => { map[item.bca_deposit_card] = item.outcode; });
                    newMasters = saveMasterMappings({ deposit_cards: map });
                    setMasterUploadStatus(`Berhasil memperbarui ${list.length} data Deposit Card BCA.`);
                } else if (masterType === 'bri_mid') {
                    const list = parseBriMidExcel(buffer);
                    const map = {};
                    list.forEach(item => { map[item.mid_bri] = item.outcode; });
                    newMasters = saveMasterMappings({ bri_mids: map });
                    setMasterUploadStatus(`Berhasil memperbarui ${list.length} data MID BRI.`);
                } else if (masterType === 'bca_mid') {
                    const list = parseBcaMidExcel(buffer);
                    const map = {};
                    list.forEach(item => { map[item.mid_bca] = item.outcode; });
                    newMasters = saveMasterMappings({ bca_mids: map });
                    setMasterUploadStatus(`Berhasil memperbarui ${list.length} data MID BCA.`);
                } else if (masterType === 'pku_cabang') {
                    const list = parsePkuCabangExcel(buffer);
                    const map = {};
                    list.forEach(item => { map[item.outcode] = item.cabang_pku; });
                    newMasters = saveMasterMappings({ pku_cabang: map });
                    setMasterUploadStatus(`Berhasil memperbarui ${list.length} data Kode Cabang PKU.`);
                }

                setMasterMappings(newMasters);
            } catch (err) {
                setError(`Gagal memuat master ${masterType}: ` + err.message);
                setMasterUploadStatus('');
            }
        };
        reader.readAsArrayBuffer(file);
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
                            <span className="material-symbols-outlined">error</span>
                            <span className="font-semibold text-sm">{error}</span>
                        </div>
                        <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold cursor-pointer">✕</button>
                    </div>
                )}
                {successMsg && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined">check_circle</span>
                            <span className="font-semibold text-sm">{successMsg}</span>
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
                                        ⚠️ Belum ada file yang diunggah. Silakan upload file Xilnex/Bank di tab "Pusat Upload".
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
                            <h3 className="text-lg font-bold text-gray-800">Unggah Berkas Harian (Xilnex & Bank)</h3>
                            <p className="text-xs text-gray-500 max-w-lg mx-auto">
                                Unggah file laporan Xilnex (Ref 1), mutasi BRI (Ref 5), dan mutasi BCA (Ref 6) untuk diproses secara otomatis oleh parser engine.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-primary-600 mb-2">
                                        <span className="material-symbols-outlined">receipt_long</span>
                                        <h4 className="font-bold text-sm text-gray-800">1. Data Xilnex Sales</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel `Cash & Card Automation_...xlsx` (Header Baris 14, Kolom F & G).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {uploadedXilnexName && (
                                        <span className="text-[11px] font-bold text-emerald-600 block truncate">
                                            ✓ {uploadedXilnexName} ({rawXilnexSales.length} baris)
                                        </span>
                                    )}
                                    <label className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Upload Xilnex Excel
                                        <input type="file" accept=".xlsx,.xls" onChange={handleUploadXilnex} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-orange-600 mb-2">
                                        <span className="material-symbols-outlined">account_balance</span>
                                        <h4 className="font-bold text-sm text-gray-800">2. Mutasi Bank BRI</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel `BRI PKU...xlsx` (Mengekstrak OffUs, OnUs, QRIS & MDR).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {uploadedBriName && (
                                        <span className="text-[11px] font-bold text-emerald-600 block truncate">
                                            ✓ {uploadedBriName}
                                        </span>
                                    )}
                                    <label className="bg-orange-600 hover:bg-orange-700 text-white font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Upload Mutasi BRI
                                        <input type="file" accept=".xlsx,.xls" onChange={handleUploadBriMutation} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                                        <span className="material-symbols-outlined">account_balance</span>
                                        <h4 className="font-bold text-sm text-gray-800">3. Mutasi Bank BCA</h4>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        File Excel `BCA PKU...xlsx` (Mengekstrak KR OTOMATIS, KREDIT, TGH & DDR).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {uploadedBcaName && (
                                        <span className="text-[11px] font-bold text-emerald-600 block truncate">
                                            ✓ {uploadedBcaName}
                                        </span>
                                    )}
                                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                                        <span className="material-symbols-outlined text-base">upload_file</span>
                                        Upload Mutasi BCA
                                        <input type="file" accept=".xlsx,.xls" onChange={handleUploadBcaMutation} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'masters' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                            <span className="material-symbols-outlined text-4xl text-primary-500">dataset</span>
                            <h3 className="text-lg font-bold text-gray-800">Kelola File Master & MID Bank (1x Import)</h3>
                            <p className="text-xs text-gray-500 max-w-lg mx-auto">
                                Unggah file master referensi untuk menghubungkan Merchant ID (MID) bank dengan kode toko (`OUTCODE`).
                            </p>

                            {masterUploadStatus && (
                                <div className="p-3 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 max-w-md mx-auto">
                                    {masterUploadStatus}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <h4 className="font-bold text-sm text-gray-800">Referensi 2: DEPOSIT CARD BCA</h4>
                                <p className="text-xs text-gray-500">Mapping Nomor Kartu BCA Deposit Card ke Outcode toko.</p>
                                <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                    <span className="material-symbols-outlined text-base">upload_file</span>
                                    Import DEPOSIT CARD.xlsx
                                    <input type="file" accept=".xlsx,.xls" onChange={(e) => handleUploadMasterFile(e, 'deposit_card')} className="hidden" />
                                </label>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <h4 className="font-bold text-sm text-gray-800">Referensi 3: MASTER MID BRI</h4>
                                <p className="text-xs text-gray-500">Mapping MID BRI ke Outcode toko.</p>
                                <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                    <span className="material-symbols-outlined text-base">upload_file</span>
                                    Import MASTER MID BRI.xlsx
                                    <input type="file" accept=".xlsx,.xls" onChange={(e) => handleUploadMasterFile(e, 'bri_mid')} className="hidden" />
                                </label>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <h4 className="font-bold text-sm text-gray-800">Referensi 4: MASTER MID BCA</h4>
                                <p className="text-xs text-gray-500">Mapping MID BCA ke Outcode toko.</p>
                                <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                    <span className="material-symbols-outlined text-base">upload_file</span>
                                    Import MASTER MID BCA.xlsx
                                    <input type="file" accept=".xlsx,.xls" onChange={(e) => handleUploadMasterFile(e, 'bca_mid')} className="hidden" />
                                </label>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                                <h4 className="font-bold text-sm text-gray-800">Referensi 7: MASTER CABANG PKU</h4>
                                <p className="text-xs text-gray-500">Mapping Outcode ke Kode Cabang PKU.</p>
                                <label className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                    <span className="material-symbols-outlined text-base">upload_file</span>
                                    Import MASTER CABANG PKU.xlsx
                                    <input type="file" accept=".xlsx,.xls" onChange={(e) => handleUploadMasterFile(e, 'pku_cabang')} className="hidden" />
                                </label>
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
