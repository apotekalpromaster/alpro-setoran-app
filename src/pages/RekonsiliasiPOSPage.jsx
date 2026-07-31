import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import * as XLSX from 'xlsx';

export default function RekonsiliasiPOSPage() {
    const { profile } = useAuth();
    
    const [activeTab, setActiveTab] = useState('tabel'); 
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toLocaleDateString('sv-SE');
    });
    const [endDate, setEndDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const [selectedBranch, setSelectedBranch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); 

    // Draft states for manual filtering
    const [draftStartDate, setDraftStartDate] = useState(startDate);
    const [draftEndDate, setDraftEndDate] = useState(endDate);
    const [draftSelectedBranch, setDraftSelectedBranch] = useState(selectedBranch);
    const [draftStatusFilter, setDraftStatusFilter] = useState(statusFilter); 
    
    const [reconData, setReconData] = useState([]);
    const [branchesList, setBranchesList] = useState([]);
    
    const [parsedData, setParsedData] = useState([]);
    const [fileName, setFileName] = useState('');
    const [profilesForLookup, setProfilesForLookup] = useState([]);

    useEffect(() => {
        fetchBranches();
        fetchReconciliationData(startDate, endDate);
    }, []);

    const fetchBranches = async () => {
        try {
            const { data, error: err } = await supabase
                .from('profiles')
                .select('username, kode_toko')
                .eq('role', 'User')
                .order('username');
            if (err) throw err;
            setBranchesList(data.map(p => p.username) || []);
            setProfilesForLookup(data || []);
        } catch (e) {
            console.error('Gagal memuat cabang:', e.message);
        }
    };

    // Helper: fetch all rows with automatic pagination (bypass Supabase 1000 row limit)
    const fetchAllPaginated = async (queryBuilder) => {
        const PAGE_SIZE = 1000;
        let allData = [];
        let page = 0;
        while (true) {
            const { data, error } = await queryBuilder.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData = [...allData, ...data];
            if (data.length < PAGE_SIZE) break;
            page++;
        }
        return allData;
    };

    const fetchReconciliationData = async (start = startDate, end = endDate) => {
        setLoading(true);
        setError('');
        try {
            const reports = await fetchAllPaginated(
                supabase
                    .from('laporan')
                    .select(`
                        tanggal_jual,
                        nominal_jual,
                        nominal_setoran,
                        potongan,
                        profiles!laporan_user_id_fkey!inner ( username )
                    `)
                    .gte('tanggal_jual', start)
                    .lte('tanggal_jual', end)
            );

            const posData = await fetchAllPaginated(
                supabase
                    .from('pos_sales_data')
                    .select('kode_cabang, tanggal_jual, sales_pos')
                    .gte('tanggal_jual', start)
                    .lte('tanggal_jual', end)
            );

            const map = {};
            const getEntry = (branch, date) => {
                const key = `${branch}_${date}`;
                if (!map[key]) {
                    map[key] = {
                        branch,
                        date,
                        reportSales: 0,
                        reportSetoran: 0,
                        reportPotongan: 0,
                        posSales: 0,
                        hasReport: false,
                        hasPOS: false
                    };
                }
                return map[key];
            };

            reports.forEach(r => {
                const branch = r.profiles?.username;
                if (!branch) return;
                const entry = getEntry(branch, r.tanggal_jual);
                entry.reportSales += Number(r.nominal_jual || 0);
                entry.reportSetoran += Number(r.nominal_setoran || 0);
                entry.reportPotongan += Number(r.potongan || 0);
                entry.hasReport = true;
            });

            posData.forEach(p => {
                const entry = getEntry(p.kode_cabang, p.tanggal_jual);
                entry.posSales = Number(p.sales_pos || 0);
                entry.hasPOS = true;
            });

            const merged = Object.values(map).map(entry => {
                // Selisih 1: POS vs Sales Manual (Laporan)
                const delta1 = entry.posSales - entry.reportSales;
                let status1 = 'Cocok';
                if (!entry.hasReport && entry.hasPOS) {
                    status1 = 'BelumLapor';
                } else if (!entry.hasPOS && entry.hasReport) {
                    status1 = 'BelumPOS';
                } else if (!entry.hasReport && !entry.hasPOS) {
                    status1 = 'KurangData';
                } else if (delta1 !== 0) {
                    status1 = 'Selisih';
                }

                // Selisih 2: POS vs (Setoran + Potongan)
                const setoranPlusPotongan = entry.reportSetoran + entry.reportPotongan;
                const delta2 = entry.posSales - setoranPlusPotongan;
                let status2 = 'Cocok';
                if (!entry.hasReport && entry.hasPOS) {
                    status2 = 'BelumLapor';
                } else if (!entry.hasPOS && entry.hasReport) {
                    status2 = 'BelumPOS';
                } else if (!entry.hasReport && !entry.hasPOS) {
                    status2 = 'KurangData';
                } else if (delta2 !== 0) {
                    status2 = 'Selisih';
                }

                // Legacy status for stats summary card (use status1 as primary)
                const status = status1;
                return { ...entry, delta1, status1, delta2, status2, setoranPlusPotongan, status };
            });

            merged.sort((a, b) => {
                if (b.date !== a.date) return b.date.localeCompare(a.date);
                return a.branch.localeCompare(b.branch);
            });

            setReconData(merged);
        } catch (e) {
            setError('Gagal memuat data rekonsiliasi: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredReconData = useMemo(() => {
        return reconData.filter(item => {
            const matchBranch = !selectedBranch || item.branch === selectedBranch;
            const matchStatus = statusFilter === 'All' || item.status === statusFilter;
            return matchBranch && matchStatus;
        });
    }, [reconData, selectedBranch, statusFilter]);

    const stats = useMemo(() => {
        let total = reconData.length;
        let cocok = 0;
        let selisih = 0;
        let belumLapor = 0;
        let belumPOS = 0;

        reconData.forEach(item => {
            if (item.status1 === 'Cocok') cocok++;
            else if (item.status1 === 'Selisih') selisih++;
            else if (item.status1 === 'BelumLapor') belumLapor++;
            else if (item.status1 === 'BelumPOS') belumPOS++;
        });

        return { total, cocok, selisih, belumLapor, belumPOS };
    }, [reconData]);

    const grandTotals = useMemo(() => {
        return filteredReconData.reduce((acc, item) => {
            acc.posSales += item.posSales || 0;
            acc.reportSales += item.reportSales || 0;
            acc.reportSetoran += item.reportSetoran || 0;
            acc.reportPotongan += item.reportPotongan || 0;
            acc.setoranPlusPotongan += item.setoranPlusPotongan || 0;
            acc.delta1 += item.delta1 || 0;
            acc.delta2 += item.delta2 || 0;
            return acc;
        }, { posSales: 0, reportSales: 0, reportSetoran: 0, reportPotongan: 0, setoranPlusPotongan: 0, delta1: 0, delta2: 0 });
    }, [filteredReconData]);


// ============================================================
// HELPERS: Resolve Xilnex Col C + Col D -> Supabase column names
// ============================================================
function resolveCardCol(bank, cardType) {
    const b = (bank || '').toUpperCase().trim();
    const c = (cardType || '').toUpperCase().trim();
    const isBca = b.includes('BCA') || b === 'BC';
    const isBri = b.includes('BRI') || b === 'BR' || b === 'LBRI' || b === '+BRI';
    if (!isBca && !isBri) return null;
    const prefix = isBca ? 'card_bca_' : 'card_bri_';
    const map = {
        'AMEX': 'amex', 'BCA CARD': 'bca_card',
        'DEBIT BANK LAIN': 'debit_lain', 'DEBIT BANK SAMA': 'debit_sama',
        'JCB': 'jcb', 'MASTER': 'master', 'OTHERS': 'others',
        'QRIS': 'qris', 'UNIONPAY': 'unionpay', 'VISA': 'visa',
    };
    return map[c] ? prefix + map[c] : null;
}
function resolveOnlineCol(cardType) {
    const c = (cardType || '').toUpperCase().trim();
    if (c === 'ONLINE (HALODOC)')   return 'online_halodoc';
    if (c === 'ONLINE (TIKTOK)')    return 'online_tiktok';
    if (c === 'ONLINE (TOKOPEDIA)') return 'online_tokopedia';
    return null;
}
function createEmptyParsedRow(kode_cabang, tanggal_jual) {
    return {
        kode_cabang, tanggal_jual,
        sales_pos: 0,
        card_bca_amex: 0, card_bca_bca_card: 0, card_bca_debit_lain: 0,
        card_bca_debit_sama: 0, card_bca_jcb: 0, card_bca_master: 0,
        card_bca_others: 0, card_bca_qris: 0, card_bca_unionpay: 0, card_bca_visa: 0,
        card_bri_amex: 0, card_bri_bca_card: 0, card_bri_debit_lain: 0,
        card_bri_debit_sama: 0, card_bri_jcb: 0, card_bri_master: 0,
        card_bri_others: 0, card_bri_qris: 0, card_bri_unionpay: 0, card_bri_visa: 0,
        online_halodoc: 0, online_tiktok: 0, online_tokopedia: 0,
    };
}

const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        setError('');
        setSuccessMsg('');

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                if (workbook.SheetNames.length === 0) {
                    throw new Error('Berkas tidak memiliki sheet data.');
                }
                
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                
                if (rawRows.length < 13) {
                    throw new Error('Berkas tidak memiliki baris data yang cukup (header di baris 13).');
                }
                
                               // Create lookup map mapping both kode_toko and username to username
                const storeMap = {};
                profilesForLookup.forEach(p => {
                    if (p.kode_toko) {
                        storeMap[p.kode_toko.toString().trim().toLowerCase()] = p.username;
                    }
                    if (p.username) {
                        storeMap[p.username.toString().trim().toLowerCase()] = p.username;
                    }
                });

                // Auto-detect template format:
                // Mode A: New Template "Cash & Card Automation" (Header at Row 14, Index 13)
                // Mode B: Legacy Template "POS Simple" (Header at Row 13, Index 12)
                let isNewTemplate = false;
                let startRowIndex = 13; // Default data start index (Row 14) for legacy if index 12 is header

                if (rawRows.length >= 14) {
                    const row14Str = rawRows[13].map(c => (c || '').toString().toLowerCase()).join(' ');
                    if (row14Str.includes('date') && row14Str.includes('store') && row14Str.includes('cash amount')) {
                        isNewTemplate = true;
                        startRowIndex = 14; // Data starts on Row 15 (Index 14)
                    }
                }

                const rowMap = {};

                for (let i = startRowIndex; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || row.length === 0) continue;

                    const rawDateVal = (row[0] || '').toString().trim();
                    const rawStoreVal = (row[1] || '').toString().trim();
                    const rawColCVal = (row[2] || '').toString().trim();

                    if (!rawDateVal || !rawStoreVal) continue;

                    if (isNewTemplate) {
                        // NEW TEMPLATE LOGIC (Xilnex Cash & Card Automation):
                        // Col C[2]=CardType, Col D[3]=Bank/Merchant
                        // Col E[4]=Cash Tunai, Col F[5]=Card/EDC, Col G[6]=Online
                        const rawColCVal2 = (row[2] || '').toString().trim();
                        const rawColDVal  = (row[3] || '').toString().trim();
                        const lowerA = rawDateVal.toLowerCase();
                        const lowerB = rawStoreVal.toLowerCase();
                        const lowerC = rawColCVal2.toLowerCase();
                        if (lowerA.includes('total') || lowerB.includes('total') || lowerC.includes('total')) continue;

                        const colEVal = parseInt((row[4] || '').toString().replace(/[^0-9-]/g, ''), 10) || 0;
                        const colFVal = parseInt((row[5] || '').toString().replace(/[^0-9-]/g, ''), 10) || 0;
                        const colGVal = parseInt((row[6] || '').toString().replace(/[^0-9-]/g, ''), 10) || 0;

                        if (colEVal <= 0 && colFVal <= 0 && colGVal <= 0) continue;

                        const cleanStoreKey = rawStoreVal.toLowerCase();
                        const matchedUsername = storeMap[cleanStoreKey];
                        if (!matchedUsername) continue;

                        let formattedDate = '';
                        if (/^\d+(\.\d+)?$/.test(rawDateVal)) {
                            const excelDateNum = parseFloat(rawDateVal);
                            const d = new Date((excelDateNum - 25569) * 86400 * 1000);
                            if (!isNaN(d.getTime())) formattedDate = d.toLocaleDateString('sv-SE');
                        } else {
                            const d = new Date(rawDateVal);
                            if (!isNaN(d.getTime())) formattedDate = d.toLocaleDateString('sv-SE');
                        }
                        if (!matchedUsername || !formattedDate) continue;

                        const aggKey = matchedUsername + '_' + formattedDate;
                        if (!rowMap[aggKey]) rowMap[aggKey] = createEmptyParsedRow(matchedUsername, formattedDate);

                        if (colEVal > 0) rowMap[aggKey].sales_pos += colEVal;
                        if (colFVal > 0) {
                            const col = resolveCardCol(rawColDVal, rawColCVal2);
                            if (col && col in rowMap[aggKey]) rowMap[aggKey][col] += colFVal;
                        }
                        if (colGVal > 0) {
                            const col = resolveOnlineCol(rawColCVal2);
                            if (col && col in rowMap[aggKey]) rowMap[aggKey][col] += colGVal;
                        }
                    } else {
                        // LEGACY TEMPLATE LOGIC: cash amount only in Col C or Col E
                        const lowerDate = rawDateVal.toLowerCase();
                        if (lowerDate.includes('total') || lowerDate.includes('grand total')) continue;

                        const rawSalesVal = (row[2] || '').toString().trim();
                        const cleanStoreKey = rawStoreVal.toLowerCase();
                        const matchedUsername = storeMap[cleanStoreKey];
                        if (!matchedUsername) continue;

                        let formattedDate = '';
                        if (/^\d+(\.\d+)?$/.test(rawDateVal)) {
                            const excelDateNum = parseFloat(rawDateVal);
                            const d = new Date((excelDateNum - 25569) * 86400 * 1000);
                            if (!isNaN(d.getTime())) formattedDate = d.toLocaleDateString('sv-SE');
                        } else {
                            const d = new Date(rawDateVal);
                            if (!isNaN(d.getTime())) formattedDate = d.toLocaleDateString('sv-SE');
                        }

                        const cleanSales = parseInt(rawSalesVal.toString().replace(/[^0-9-]/g, ''), 10) || 0;
                        if (!matchedUsername || !formattedDate) continue;

                        const aggKey = matchedUsername + '_' + formattedDate;
                        if (!rowMap[aggKey]) rowMap[aggKey] = createEmptyParsedRow(matchedUsername, formattedDate);
                        rowMap[aggKey].sales_pos += cleanSales;
                    }
                }

                const rows = Object.values(rowMap);
                if (rows.length === 0) {
                    throw new Error('Tidak ada baris data valid yang berhasil dibaca. Pastikan nama cabang terdaftar di profiles (lookup kode_toko).');
                }
                
                setParsedData(rows);
            } catch (err) {
                setError(err.message);
                setParsedData([]);
            }
        };
        reader.readAsArrayBuffer(file);
    };

        const handleApplyFilter = () => {
        setStartDate(draftStartDate);
        setEndDate(draftEndDate);
        setSelectedBranch(draftSelectedBranch);
        setStatusFilter(draftStatusFilter);
        fetchReconciliationData(draftStartDate, draftEndDate);
    };

    const handleResetFilter = () => {
        const defaultStart = () => {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            return d.toLocaleDateString('sv-SE');
        };
        const defaultEnd = () => new Date().toLocaleDateString('sv-SE');

        const start = defaultStart();
        const end = defaultEnd();

        setDraftStartDate(start);
        setDraftEndDate(end);
        setDraftSelectedBranch('');
        setDraftStatusFilter('All');

        setStartDate(start);
        setEndDate(end);
        setSelectedBranch('');
        setStatusFilter('All');

        fetchReconciliationData(start, end);
    };

    const handleSavePOS = async () => {
        if (parsedData.length === 0) return;
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const uniqueBranches = [...new Set(parsedData.map(d => d.kode_cabang))];
            const dates = parsedData.map(d => d.tanggal_jual);
            const minDate = dates.reduce((a, b) => a < b ? a : b);
            const maxDate = dates.reduce((a, b) => a > b ? a : b);

            const { error: deleteError } = await supabase
                .from('pos_sales_data')
                .delete()
                .in('kode_cabang', uniqueBranches)
                .gte('tanggal_jual', minDate)
                .lte('tanggal_jual', maxDate);

            if (deleteError) throw deleteError;

            const chunkSize = 200;
            for (let i = 0; i < parsedData.length; i += chunkSize) {
                const chunk = parsedData.slice(i, i + chunkSize);
                const { error: insertError } = await supabase
                    .from('pos_sales_data')
                    .insert(chunk.map(row => ({
                        kode_cabang:          row.kode_cabang,
                        tanggal_jual:         row.tanggal_jual,
                        sales_pos:            row.sales_pos            ?? 0,
                        card_bca_amex:        row.card_bca_amex        ?? 0,
                        card_bca_bca_card:    row.card_bca_bca_card    ?? 0,
                        card_bca_debit_lain:  row.card_bca_debit_lain  ?? 0,
                        card_bca_debit_sama:  row.card_bca_debit_sama  ?? 0,
                        card_bca_jcb:         row.card_bca_jcb         ?? 0,
                        card_bca_master:      row.card_bca_master      ?? 0,
                        card_bca_others:      row.card_bca_others      ?? 0,
                        card_bca_qris:        row.card_bca_qris        ?? 0,
                        card_bca_unionpay:    row.card_bca_unionpay    ?? 0,
                        card_bca_visa:        row.card_bca_visa        ?? 0,
                        card_bri_amex:        row.card_bri_amex        ?? 0,
                        card_bri_bca_card:    row.card_bri_bca_card    ?? 0,
                        card_bri_debit_lain:  row.card_bri_debit_lain  ?? 0,
                        card_bri_debit_sama:  row.card_bri_debit_sama  ?? 0,
                        card_bri_jcb:         row.card_bri_jcb         ?? 0,
                        card_bri_master:      row.card_bri_master      ?? 0,
                        card_bri_others:      row.card_bri_others      ?? 0,
                        card_bri_qris:        row.card_bri_qris        ?? 0,
                        card_bri_unionpay:    row.card_bri_unionpay    ?? 0,
                        card_bri_visa:        row.card_bri_visa        ?? 0,
                        online_halodoc:       row.online_halodoc       ?? 0,
                        online_tiktok:        row.online_tiktok        ?? 0,
                        online_tokopedia:     row.online_tokopedia     ?? 0,
                        uploaded_by:          profile.id
                    })));

                if (insertError) throw insertError;
            }

            setSuccessMsg(`Berhasil mengunggah ${parsedData.length} baris data POS.`);
            setParsedData([]);
            setFileName('');
            fetchReconciliationData();
            setActiveTab('tabel');
        } catch (err) {
            setError('Gagal menyimpan data POS: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout title="Rekonsiliasi Xilnex Harian">
            <div className="max-w-screen-xl mx-auto space-y-6">
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('tabel')}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${
                            activeTab === 'tabel'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Tabel Rekonsiliasi
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${
                            activeTab === 'upload'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Upload Excel POS
                    </button>
                </div>

                {activeTab === 'tabel' ? (
                    <>
                        {/* Filter Rekonsiliasi - Always Visible */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2 pb-3 border-b border-gray-100">
                                <span className="material-symbols-outlined text-primary-500">filter_list</span> Filter Rekonsiliasi Xilnex
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Mulai Tanggal</label>
                                    <input
                                        type="date"
                                        value={draftStartDate}
                                        onChange={(e) => setDraftStartDate(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs"
                                        disabled={loading}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
                                    <input
                                        type="date"
                                        value={draftEndDate}
                                        onChange={(e) => setDraftEndDate(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs"
                                        disabled={loading}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Pilih Cabang</label>
                                    <select
                                        value={draftSelectedBranch}
                                        onChange={(e) => setDraftSelectedBranch(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs bg-gray-50 cursor-pointer"
                                        disabled={loading}
                                    >
                                        <option value="">Semua Cabang</option>
                                        {branchesList.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Status Kecocokan</label>
                                    <select
                                        value={draftStatusFilter}
                                        onChange={(e) => setDraftStatusFilter(e.target.value)}
                                        className="form-input w-full py-1.5 px-3 text-xs bg-gray-50 cursor-pointer"
                                        disabled={loading}
                                    >
                                        <option value="All">Semua Status</option>
                                        <option value="Cocok">Cocok (Sesuai)</option>
                                        <option value="Selisih">Selisih (Mismatch)</option>
                                        <option value="BelumLapor">Laporan Belum Diinput</option>
                                        <option value="BelumPOS">POS Belum Diupload</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={handleResetFilter}
                                    disabled={loading}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs h-8 px-4 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm">restart_alt</span> Reset Filter
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApplyFilter}
                                    disabled={loading}
                                    className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs h-8 px-4 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm">search</span> Terapkan Filter
                                </button>
                            </div>
                        </div>

                        {/* Loading State or Data */}
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <span className="material-symbols-outlined animate-spin text-4xl text-primary-500 mb-2">sync</span>
                                <p className="text-sm font-semibold text-gray-600">Memuat data rekonsiliasi Xilnex...</p>
                            </div>
                        ) : (
                            <>
                                {/* Stats Cards */}
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">Total Rekaman</span>
                                        <span className="block text-2xl font-extrabold text-gray-800 mt-1">{stats.total}</span>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-green-500">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">Cocok</span>
                                        <span className="block text-2xl font-extrabold text-green-600 mt-1">{stats.cocok}</span>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-red-500">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">Selisih</span>
                                        <span className="block text-2xl font-extrabold text-red-600 mt-1">{stats.selisih}</span>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-yellow-500">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">Belum Lapor</span>
                                        <span className="block text-2xl font-extrabold text-yellow-600 mt-1">{stats.belumLapor}</span>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-gray-400">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">Data Xilnex Belum Upload</span>
                                        <span className="block text-2xl font-extrabold text-gray-500 mt-1">{stats.belumPOS}</span>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    {error && (
                                        <div className="p-4 bg-red-50 text-red-700 border-b border-red-100 flex items-center gap-2">
                                            <span className="material-symbols-outlined">error</span>
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-left">
                                            <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                <tr className="border-b border-gray-200">
                                                    <th className="py-3 px-4 whitespace-nowrap" rowSpan="2">Tanggal Jual</th>
                                                    <th className="py-3 px-4 whitespace-nowrap" rowSpan="2">Nama Cabang</th>
                                                    <th className="py-3 px-4 text-right whitespace-nowrap bg-blue-50 text-blue-700" rowSpan="2">Sales Xilnex</th>
                                                    <th className="py-3 px-4 text-center text-purple-700 bg-purple-50" colSpan="3">Data Laporan Manual</th>
                                                    <th className="py-3 px-4 text-center text-red-700 bg-red-50" colSpan="2">Selisih POS vs Sales Manual</th>
                                                    <th className="py-3 px-4 text-center text-orange-700 bg-orange-50" colSpan="2">Selisih POS vs Setoran+Potongan</th>
                                                </tr>
                                                <tr className="border-b-2 border-gray-300">
                                                    <th className="py-2 px-4 text-right whitespace-nowrap bg-purple-50 text-purple-600">Sales Manual</th>
                                                    <th className="py-2 px-4 text-right whitespace-nowrap bg-purple-50 text-purple-600">Potongan</th>
                                                    <th className="py-2 px-4 text-right whitespace-nowrap bg-purple-50 text-purple-600">Nominal Setoran</th>
                                                    <th className="py-2 px-4 text-right whitespace-nowrap bg-red-50 text-red-500">Selisih 1</th>
                                                    <th className="py-2 px-4 text-center whitespace-nowrap bg-red-50 text-red-500">Status 1</th>
                                                    <th className="py-2 px-4 text-right whitespace-nowrap bg-orange-50 text-orange-500">Selisih 2</th>
                                                    <th className="py-2 px-4 text-center whitespace-nowrap bg-orange-50 text-orange-500">Status 2</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                                {filteredReconData.length === 0 ? (
                                                    <tr><td colSpan="10" className="py-10 text-center text-gray-400">Tidak ada data rekonsiliasi yang cocok dengan kriteria filter.</td></tr>
                                                ) : (
                                                    filteredReconData.map((item, idx) => {
                                                        const rowCls2 = (item.status1 === "Selisih" || item.status2 === "Selisih") ? "bg-red-50/30" : item.status1 === "BelumLapor" ? "bg-yellow-50/20" : "";
                                                        const B = (s, theme) => {
                                                            const col = s === "Cocok" ? "bg-green-50 text-green-700 border-green-200" : s === "Selisih" ? (theme === "orange" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-red-50 text-red-700 border-red-200") : s === "BelumLapor" ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-gray-100 text-gray-600 border-gray-300";
                                                            const lbl = {Cocok:"Cocok",Selisih:"Selisih",BelumLapor:"Blm Lapor",BelumPOS:"Xilnex Ksg"}[s] || "-";
                                                            return <span className={"px-2 py-0.5 text-[10px] font-bold rounded-full border " + col}>{lbl}</span>;
                                                        };
                                                        const D = (v) => v === 0 ? <span className="text-gray-400">Rp 0</span> : <span className={v > 0 ? "text-blue-600" : "text-red-600"}>{(v > 0 ? "+" : "") + formatRupiah(v)}</span>;
                                                        return (
                                                            <tr key={idx} className={"hover:bg-gray-50/50 transition-colors " + rowCls2}>
                                                                <td className="py-2.5 px-4 font-medium text-gray-900 whitespace-nowrap text-xs">{new Date(item.date).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</td>
                                                                <td className="py-2.5 px-4 text-xs font-semibold">{item.branch}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-blue-50/40">{item.hasPOS ? formatRupiah(item.posSales) : <span className="text-gray-300">-</span>}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-purple-50/30">{item.hasReport ? formatRupiah(item.reportSales) : <span className="text-gray-300">-</span>}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-purple-50/30">{item.hasReport ? formatRupiah(item.reportPotongan) : <span className="text-gray-300">-</span>}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-purple-50/30">{item.hasReport ? formatRupiah(item.reportSetoran) : <span className="text-gray-300">-</span>}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-red-50/20">{D(item.delta1)}</td>
                                                                <td className="py-2.5 px-4 text-center bg-red-50/20">{B(item.status1,"red")}</td>
                                                                <td className="py-2.5 px-4 text-right font-mono text-xs bg-orange-50/20">{D(item.delta2)}</td>
                                                                <td className="py-2.5 px-4 text-center bg-orange-50/20">{B(item.status2,"orange")}</td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                            <tfoot className="bg-gray-100 border-t-2 border-gray-400 text-xs font-bold text-gray-800">
                                                <tr>
                                                    <td className="py-3 px-4" colSpan="2">Grand Total ({filteredReconData.length} baris)</td>
                                                    <td className="py-3 px-4 text-right font-mono bg-blue-100">{formatRupiah(grandTotals.posSales)}</td>
                                                    <td className="py-3 px-4 text-right font-mono bg-purple-100">{formatRupiah(grandTotals.reportSales)}</td>
                                                    <td className="py-3 px-4 text-right font-mono bg-purple-100">{formatRupiah(grandTotals.reportPotongan)}</td>
                                                    <td className="py-3 px-4 text-right font-mono bg-purple-100">{formatRupiah(grandTotals.reportSetoran)}</td>
                                                    <td className="py-3 px-4 text-right font-mono bg-red-100"><span className={grandTotals.delta1 < 0 ? "text-red-700" : grandTotals.delta1 > 0 ? "text-blue-700" : "text-gray-500"}>{grandTotals.delta1 !== 0 ? (grandTotals.delta1 > 0 ? "+" : "") + formatRupiah(grandTotals.delta1) : "Rp 0"}</span></td>
                                                    <td className="py-3 px-4 bg-red-100"></td>
                                                    <td className="py-3 px-4 text-right font-mono bg-orange-100"><span className={grandTotals.delta2 < 0 ? "text-red-700" : grandTotals.delta2 > 0 ? "text-blue-700" : "text-gray-500"}>{grandTotals.delta2 !== 0 ? (grandTotals.delta2 > 0 ? "+" : "") + formatRupiah(grandTotals.delta2) : "Rp 0"}</span></td>
                                                    <td className="py-3 px-4 bg-orange-100"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                                        </>
                ) : (
                    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
                        <div className="text-center space-y-2">
                            <span className="material-symbols-outlined text-5xl text-primary-500">cloud_upload</span>
                            <h3 className="text-lg font-bold text-gray-800">Unggah Data Penjualan POS</h3>
                            <p className="text-xs text-gray-500 max-w-md mx-auto">
                                Unggah berkas Excel (.xlsx) dari sistem POS untuk dibandingkan secara otomatis dengan pelaporan setoran manual apotek.
                            </p>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {successMsg && (
                            <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined">check_circle</span>
                                <span>{successMsg}</span>
                            </div>
                        )}

                        <div className="border-2 border-dashed border-gray-300 hover:border-primary-400 transition-colors rounded-xl p-8 text-center relative cursor-pointer group">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="space-y-1">
                                <span className="text-sm font-bold text-gray-700 group-hover:text-primary-600 block">
                                    {fileName ? fileName : 'Pilih Berkas Excel POS (.xlsx)'}
                                </span>
                                <span className="text-xs text-gray-400 block">
                                    {fileName ? 'Klik atau seret file lain untuk mengganti' : 'Seret berkas ke sini atau klik untuk mencari'}
                                </span>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-2">
                            <span className="font-bold text-gray-700 block">ðŸ’¡ Ketentuan Format Excel:</span>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Menerima berkas spreadsheet Excel (*.xlsx, *.xls).</li>
                                <li>Mendukung <strong>Template Otomatis Baru (Cash & Card Automation)</strong> dengan Header pada <strong>baris 14</strong>, membaca sales tunai dari <strong>Kolom E (Cash Amount)</strong> yang bukan Rp 0, serta menyaring otomatis baris Total pada Kolom A, B, dan C.</li>
                                <li>Mendukung juga <strong>Template Lama</strong> dengan Header pada baris 13.</li>
                                <li>Kolom B (Store) otomatis dicocokkan dengan <strong>Kode Toko</strong> pada profil apotek untuk mendapatkan kode cabang yang sesuai.</li>
                            </ul>
                        </div>

                        {parsedData.length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600 font-medium">Preview Data Parsed:</span>
                                    <span className="font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">{parsedData.length} Baris Terbaca</span>
                                </div>
                                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                                    <table className="min-w-full text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0">
                                            <tr>
                                                <th className="p-2">Cabang</th>
                                                <th className="p-2">Tanggal</th>
                                                <th className="p-2 text-right">Sales Tunai</th>
                                                <th className="p-2 text-right">Total EDC</th>
                                                <th className="p-2 text-right">Total Online</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-gray-600">
                                            {parsedData.slice(0, 10).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="p-2 font-semibold">{row.kode_cabang}</td>
                                                    <td className="p-2">{row.tanggal_jual}</td>
                                                    <td className="p-2 text-right font-mono">{formatRupiah(row.sales_pos)}</td>
                                                    <td className="p-2 text-right font-mono text-blue-600">{formatRupiah(
                                                        (row.card_bca_amex||0)+(row.card_bca_bca_card||0)+(row.card_bca_debit_lain||0)+(row.card_bca_debit_sama||0)+(row.card_bca_jcb||0)+(row.card_bca_master||0)+(row.card_bca_others||0)+(row.card_bca_qris||0)+(row.card_bca_unionpay||0)+(row.card_bca_visa||0)+
                                                        (row.card_bri_amex||0)+(row.card_bri_bca_card||0)+(row.card_bri_debit_lain||0)+(row.card_bri_debit_sama||0)+(row.card_bri_jcb||0)+(row.card_bri_master||0)+(row.card_bri_others||0)+(row.card_bri_qris||0)+(row.card_bri_unionpay||0)+(row.card_bri_visa||0)
                                                    )}</td>
                                                    <td className="p-2 text-right font-mono text-purple-600">{formatRupiah((row.online_halodoc||0)+(row.online_tiktok||0)+(row.online_tokopedia||0))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    onClick={handleSavePOS}
                                    disabled={loading}
                                    className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined">save</span>
                                            Simpan POS & Lakukan Rekonsiliasi
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

