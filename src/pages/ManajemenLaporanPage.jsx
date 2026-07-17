import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import AutocompleteInput from '../components/AutocompleteInput';

const DISCREPANCY_THRESHOLD = 50000;
const PAGE_SIZE = 500;
const MAX_ROWS = 100000;

export default function ManajemenLaporanPage() {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('sv-SE');

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 100;

    // Filters
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [searchTerm, setSearchTerm] = useState('');
    const [showHighSelisih, setShowHighSelisih] = useState(false);
    const [kcpFilter, setKcpFilter] = useState('');
    const [jenisFilter, setJenisFilter] = useState('');

    // Data
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Memuat data laporan...');
    const [error, setError] = useState('');
    const [fetchTriggered, setFetchTriggered] = useState(false);
    const [hitLimit, setHitLimit] = useState(false);

    const fetchData = async () => {
        if (!startDate || !endDate) return;
        setLoading(true);
        setLoadingMsg('Memuat data laporan...');
        setError('');
        setFetchTriggered(true);
        setHitLimit(false);
        setCurrentPage(1);

        try {
            let allData = [];
            let from = 0;
            let done = false;

            while (!done) {
                const to = from + PAGE_SIZE - 1;
                let query = supabase
                    .from('laporan')
                    .select(`
                        id,
                        tanggal_jual,
                        tanggal_setor,
                        timestamp,
                        jenis_pelaporan,
                        metode_setoran,
                        nominal_jual,
                        nominal_setoran,
                        potongan,
                        nomor_deposit_card,
                        kcp_terdekat,
                        user_id,
                        profiles!laporan_user_id_fkey!inner ( username, email, kode_toko )
                    `)
                    .gte('tanggal_jual', startDate)
                    .lte('tanggal_jual', endDate);

                if (searchTerm) {
                    query = query.ilike('profiles.username', `%${searchTerm}%`);
                }
                if (jenisFilter) {
                    query = query.eq('jenis_pelaporan', jenisFilter);
                }
                if (kcpFilter) {
                    query = query.ilike('kcp_terdekat', `%${kcpFilter}%`);
                }

                const { data, error: err } = await query
                    .order('tanggal_jual', { ascending: false })
                    .range(from, to);

                if (err) throw err;

                const batch = data || [];
                allData = allData.concat(batch);

                setLoadingMsg(`Mengambil data... (${allData.length} baris ditemukan)`);

                if (allData.length >= MAX_ROWS) {
                    setHitLimit(true);
                    done = true;
                } else if (batch.length < PAGE_SIZE) {
                    done = true;
                } else {
                    from += PAGE_SIZE;
                }
            }

            // Fetch all User profiles to identify active outlets and their activation dates
            const { data: profileList, error: pErr } = await supabase
                .from('profiles')
                .select('id, username, kode_toko, tanggal_aktif')
                .eq('role', 'User');

            let activeProfiles = profileList || [];
            if (searchTerm) {
                activeProfiles = activeProfiles.filter(p => p.username.toLowerCase().includes(searchTerm.toLowerCase()));
            }

            // Generate dates between startDate and endDate (capped at yesterday)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('sv-SE');

            const filterStart = startDate || '2026-04-01';
            const filterEnd = endDate || yesterdayStr;

            const dateList = [];
            let curDate = new Date(filterStart);
            const endLimit = new Date(yesterdayStr < filterEnd ? yesterdayStr : filterEnd);
            while (curDate <= endLimit) {
                dateList.push(curDate.toLocaleDateString('sv-SE'));
                curDate.setDate(curDate.getDate() + 1);
            }

            // Fetch POS sales data for all active profiles and all generated dates
            const searchKeys = [...new Set([
                ...activeProfiles.map(p => p.kode_toko).filter(Boolean),
                ...activeProfiles.map(p => p.username).filter(Boolean),
                ...allData.map(r => r.profiles?.kode_toko).filter(Boolean),
                ...allData.map(r => r.profiles?.username).filter(Boolean)
            ])];
            
            const allDates = [...new Set([
                ...dateList,
                ...allData.map(r => r.tanggal_jual).filter(Boolean)
            ])];

            let posSalesMap = {};
            if (searchKeys.length > 0 && allDates.length > 0) {
                let posDone = false;
                let posFrom = 0;
                const POS_PAGE_SIZE = 1000;
                while (!posDone) {
                    const posTo = posFrom + POS_PAGE_SIZE - 1;
                    const { data: posData, error: posErr } = await supabase
                        .from('pos_sales_data')
                        .select('kode_cabang, tanggal_jual, sales_pos')
                        .in('kode_cabang', searchKeys)
                        .in('tanggal_jual', allDates)
                        .range(posFrom, posTo);

                    if (posErr) throw posErr;
                    const posRows = posData || [];
                    posRows.forEach(item => {
                        posSalesMap[item.kode_cabang + '_' + item.tanggal_jual] = item.sales_pos;
                    });

                    if (posRows.length < POS_PAGE_SIZE) {
                        posDone = true;
                    } else {
                        posFrom += POS_PAGE_SIZE;
                    }
                }
            }

            // Map actual reports
            const mappedReports = allData.map((row) => {
                const uName = row.profiles?.username || '-';
                const kToko = row.profiles?.kode_toko || '-';
                const codeKey = kToko + '_' + row.tanggal_jual;
                const nameKey = uName + '_' + row.tanggal_jual;
                const posVal = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
                return {
                    ...row,
                    username: uName,
                    kode_toko: kToko,
                    email: row.profiles?.email || '',
                    posVal,
                };
            });

            // Generate unreported placeholders
            const showSales = !jenisFilter || ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(jenisFilter);
            let unreportedList = [];

            if (showSales && activeProfiles.length > 0 && dateList.length > 0) {
                activeProfiles.forEach(p => {
                    const activeDate = p.tanggal_aktif || '2026-04-01';
                    dateList.forEach(dateStr => {
                        if (dateStr < activeDate) return;

                        // Check if database has report for this user and date
                        const hasPrimaryReport = allData.some(r => 
                            r.user_id === p.id && 
                            r.tanggal_jual === dateStr &&
                            ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                        );

                        if (!hasPrimaryReport) {
                            const codeKey = p.kode_toko + '_' + dateStr;
                            const nameKey = p.username + '_' + dateStr;
                            const posVal = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];

                            unreportedList.push({
                                id: 'unreported_' + p.id + '_' + dateStr,
                                tanggal_jual: dateStr,
                                tanggal_setor: '-',
                                timestamp: null,
                                jenis_pelaporan: 'Belum Dilaporkan',
                                metode_setoran: '-',
                                nominal_jual: 0,
                                potongan: 0,
                                nominal_setoran: 0,
                                username: p.username,
                                kode_toko: p.kode_toko,
                                email: '',
                                isUnreported: true,
                                posVal,
                            });
                        }
                    });
                });
            }

            // Combine and set rows
            const combinedRows = [...mappedReports, ...unreportedList].sort((a, b) => {
                const dateCompare = b.tanggal_jual.localeCompare(a.tanggal_jual);
                if (dateCompare !== 0) return dateCompare;
                return a.username.localeCompare(b.username);
            });

            setRows(combinedRows);
        } catch (e) {
            setError(e.message || 'Gagal memuat data.');
        } finally {
            setLoading(false);
        }
    };

    // 1. Cari tanggal duplikat untuk tipe pelaporan utama per outlet
    const duplicateOutletDates = useMemo(() => {
        const counts = {};
        rows.forEach(r => {
            const isPrimary = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            if (isPrimary && !r.isUnreported) {
                const key = r.username + '_' + r.tanggal_jual;
                counts[key] = (counts[key] || 0) + 1;
            }
        });
        return Object.keys(counts).filter(k => counts[k] > 1).map(k => {
            const idx = k.lastIndexOf('_');
            const username = k.substring(0, idx);
            const date = k.substring(idx + 1);
            return { username, date };
        });
    }, [rows]);

    // 2. Cari tanggal sales belum dilaporkan
    const unreportedOutletDates = useMemo(() => {
        return rows.filter(r => r.isUnreported).map(r => ({
            username: r.username,
            date: r.tanggal_jual
        }));
    }, [rows]);

    // Client-side filter
    const filtered = useMemo(() => {
        return rows.filter((r) => {
            const mockSelisih = r.isUnreported ? -(r.posVal || 0) : ((r.nominal_jual || 0) - (r.potongan || 0) - (r.nominal_setoran || 0));
            const matchSelisih = !showHighSelisih || Math.abs(mockSelisih) > DISCREPANCY_THRESHOLD;
            return matchSelisih;
        });
    }, [rows, showHighSelisih]);

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const paginatedRows = useMemo(() => {
        return filtered.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE
        );
    }, [filtered, currentPage]);

    // Grand Totals
    const totals = useMemo(() => {
        let totalSales = 0;
        let totalPotongan = 0;
        let totalSetor = 0;
        let totalPosSales = 0;
        let totalSalesForPos = 0;
        const seenOutletDates = new Set();

        filtered.forEach((r) => {
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(r.jenis_pelaporan);
            if (isValidTypeForPOS && !r.isUnreported) {
                totalSales += Number(r.nominal_jual || 0);
            }
            totalPotongan += Number(r.potongan || 0);
            totalSetor += Number(r.nominal_setoran || 0);

            const posValAll = r.posVal;
            const posVal = isValidTypeForPOS ? posValAll : undefined;

            const uniqKey = (r.kode_toko || r.username) + '_' + r.tanggal_jual;
            if (posVal !== undefined && posVal !== null && !seenOutletDates.has(uniqKey)) {
                totalPosSales += Number(posVal);
                totalSalesForPos += Number(r.nominal_jual || 0);
                seenOutletDates.add(uniqKey);
            }
        });

        // Compare grand total values directly to prevent double-counting of POS sales across multiple report types
        const totalSelisih1 = totalSales - totalPosSales;
        const totalSelisih2 = (totalPotongan + totalSetor) - totalPosSales;
        const hasAnyPosForTotals = totalPosSales > 0;
        const hasAnyPosForTotals2 = totalPosSales > 0;

        return { totalSales, totalPotongan, totalSetor, totalPosSales, totalSelisih1, totalSelisih2, hasAnyPosForTotals, hasAnyPosForTotals2 };
    }, [filtered]);

    // CSV export
    const downloadCSV = () => {
        if (!filtered.length) return;
        const header = 'Nama Apotek,Tgl Setor,Tgl Jual,Waktu Kirim,Jenis,Metode,Deposit Card,KCP,Data Sales (Xilnex),Nominal Sales,Potongan,Nominal Setor,Selisih 1 (VS Nominal),Selisih 2 (VS Setor)\n';
        const body = filtered.map((r) => {
            const posValAll = r.posVal;
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            const posVal1 = isValidTypeForPOS ? posValAll : undefined;

            const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
            const hasPOSAll = posValAll !== undefined && posValAll !== null;

            const s1 = hasPOS1 ? (r.nominal_jual || 0) - posVal1 : '';
            const s2 = hasPOSAll ? ((r.potongan || 0) + (r.nominal_setoran || 0)) - posValAll : '';

            return [
                `"${r.username}"`,
                r.tanggal_setor,
                r.tanggal_jual,
                r.timestamp ? new Date(r.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-',
                `"${r.jenis_pelaporan}"`,
                `"${r.metode_setoran}"`,
                `"${r.nomor_deposit_card || ''}"`,
                `"${r.kcp_terdekat || ''}"`,
                posVal1 !== undefined ? posVal1 : '',
                r.nominal_jual || 0,
                r.potongan || 0,
                r.nominal_setoran || 0,
                s1,
                s2
            ].join(',');
        }).join('\n');
        
        let footer = '';
        if (hitLimit) {
            footer += `\n\n# WARNING: Data dalam berkas CSV ini terpotong (maksimal ${MAX_ROWS} baris).\n# Silakan gunakan filter rentang tanggal yang lebih sempit untuk mengunduh laporan lengkap.\n`;
        } else {
            footer += `\n\n# Info: Ekspor data lengkap (${filtered.length} baris).\n`;
        }
        
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        footer += `# Tanggal Ekspor: ${timestamp} WIB\n`;
        footer += `# Filter - Nama: ${searchTerm || 'Semua'}, Jenis: ${jenisFilter || 'Semua'}, KCP: ${kcpFilter || 'Semua'}, Selisih: ${showHighSelisih ? '> 50rb' : 'Semua'}\n`;

        const blob = new Blob([header + body + footer], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_${startDate}_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSearchInput = (val) => {
        setSearchTerm(val);
    };

    const selisihChipNew = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-300">-</span>;
        if (val < 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">-{formatRupiah(Math.abs(val))}</span>;
        if (val > 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">+{formatRupiah(val)}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">Sesuai</span>;
    };

    const renderJenisBadge = (jenis) => {
        let cls = 'bg-gray-100 text-gray-700';
        if (jenis.includes('Harian') || jenis.includes('3x')) cls = 'bg-blue-50 text-blue-700 border border-blue-200';
        else if (jenis.includes('Potongan')) cls = 'bg-amber-50 text-amber-700 border border-amber-200';
        else if (jenis.includes('Pecahan')) cls = 'bg-purple-50 text-purple-700 border border-purple-200';
        else if (jenis.includes('Lebih')) cls = 'bg-indigo-50 text-indigo-700 border border-indigo-200';
        else if (jenis.includes('Belum')) cls = 'bg-amber-100 text-amber-800 border border-amber-200';
        return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${cls}`}>{jenis === 'Belum Dilaporkan' ? 'Belum Lapor' : jenis}</span>;
    };

    return (
        <AdminLayout title="Manajemen Laporan">
            <div className="space-y-6">
                
                {/* QUICK NAVIGATION PANEL */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-500 text-3xl">payments</span>
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm">Modul Rekonsiliasi &amp; Koreksi</h4>
                            <p className="text-[11px] text-gray-500 leading-normal">Kelola verifikasi data POS dan persetujuan permohonan koreksi laporan cabang.</p>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => navigate('/finance/rekonsiliasi-pos')} 
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 text-xs font-bold rounded-lg transition-all"
                        >
                            <span className="material-symbols-outlined text-base">compare</span> Rekonsiliasi Xilnex
                        </button>
                        <button 
                            onClick={() => navigate('/finance/koreksi-approval')} 
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 border border-orange-200 text-orange-700 bg-orange-50/50 hover:bg-orange-50 text-xs font-bold rounded-lg transition-all"
                        >
                            <span className="material-symbols-outlined text-base">edit_note</span> Persetujuan Koreksi
                        </button>
                    </div>
                </div>

                {/* FILTER GRID CARD */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                        {/* Search + Autocomplete */}
                        <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
                            <AutocompleteInput
                                label="Pencarian Apotek"
                                value={searchTerm}
                                onChange={handleSearchInput}
                                onSelect={(item) => item && setSearchTerm(item.username)}
                                table="profiles"
                                column="username"
                                extraFilters={(q) => q.eq('role', 'User')}
                                placeholder="Ketik nama apotek..."
                                icon="store"
                                minChars={2}
                            />
                        </div>

                        {/* Jenis Pelaporan */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Jenis Pelaporan</label>
                            <select
                                value={jenisFilter}
                                onChange={(e) => setJenisFilter(e.target.value)}
                                className="form-input w-full py-2 px-3 bg-gray-50 text-xs cursor-pointer"
                            >
                                <option value="">Semua Jenis</option>
                                <option value="Setoran Harian">Setoran Harian</option>
                                <option value="Setoran 3x Seminggu">Setoran 3x Seminggu</option>
                                <option value="Setoran Sales Dengan Potongan Penjualan">Setoran Potongan</option>
                                <option value="Setoran Uang Pecahan Kecil">Setoran Pecahan Kecil</option>
                                <option value="Setoran Uang Lebih">Setoran Uang Lebih</option>
                                <option value="Pengembalian Petty Cash">Pengembalian Petty Cash</option>
                                <option value="Deposit Card Terblokir (Salah Input PIN 3x)">Deposit Card Terblokir</option>
                                <option value="Deposit Card Tertelan Mesin ATM">Deposit Card Tertelan ATM</option>
                            </select>
                        </div>

                        {/* Date Dari */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal Sales</label>
                            <input 
                                type="date" 
                                value={startDate} 
                                min="2026-04-01" 
                                onChange={(e) => setStartDate(e.target.value)} 
                                className="form-input w-full py-1.5 px-3 text-xs" 
                            />
                        </div>

                        {/* Date Sampai */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai</label>
                            <input 
                                type="date" 
                                value={endDate} 
                                min="2026-04-01" 
                                onChange={(e) => setEndDate(e.target.value)} 
                                className="form-input w-full py-1.5 px-3 text-xs" 
                            />
                        </div>

                        {/* KCP filter */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Filter KCP</label>
                            <input 
                                type="text" 
                                value={kcpFilter} 
                                onChange={(e) => setKcpFilter(e.target.value.toUpperCase())} 
                                placeholder="KCP..." 
                                className="form-input w-full py-1.5 px-3 text-xs uppercase" 
                            />
                        </div>
                    </div>

                    {/* ACTION ROW (BELOW INPUTS) */}
                    <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-100 gap-4">
                        {/* Toggle Filter */}
                        <div className="w-full sm:w-auto">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <div
                                    onClick={() => setShowHighSelisih((p) => !p)}
                                    className={`relative w-9 h-5 rounded-full transition-colors ${showHighSelisih ? 'bg-orange-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-xs transition-transform ${showHighSelisih ? 'translate-x-4' : ''}`} />
                                </div>
                                <span className="text-xs font-bold text-gray-700">Tampilkan Selisih &gt; 50rb</span>
                            </label>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button 
                                onClick={fetchData} 
                                className="flex-1 sm:flex-initial btn-primary h-9 px-5 text-xs flex items-center justify-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-sm">filter_list</span> Terapkan Filter
                            </button>
                            <button 
                                onClick={downloadCSV} 
                                disabled={!filtered.length} 
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> Ekspor CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* TABLE */}
                {hitLimit && (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm animate-pulse">
                        <span className="material-symbols-outlined text-amber-500">warning</span>
                        <span><strong>Data terlalu besar (${MAX_ROWS.toLocaleString()} baris maks).</strong> Mohon persempit rentang tanggal filter untuk mendapatkan data yang lebih akurat.</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">{loadingMsg}</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                ) : fetchTriggered && (
                    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
                        {/* Summary bar */}
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <span className="text-xs text-gray-600 font-semibold">
                                {filtered.length} baris ditemukan
                                {filtered.length !== rows.length && ` (dari ${rows.length} total)`}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                                {startDate} s/d {endDate}
                            </span>
                        </div>

                        {(duplicateOutletDates.length > 0 || unreportedOutletDates.length > 0) && (
                            <div className="mx-6 mt-5 mb-1 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3 animate-fade-in shadow-xs">
                                <span className="material-symbols-outlined text-red-500 flex-shrink-0 mt-0.5">warning</span>
                                <div className="w-full">
                                    <p className="text-xs font-bold text-red-800 uppercase">Pemberitahuan Penting Penjualan Outlet</p>
                                    
                                    {duplicateOutletDates.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-xs text-red-700 font-bold">
                                                Terdapat pelaporan tanggal sales duplikat untuk:
                                            </p>
                                            <ul className="list-disc list-inside text-xs text-red-700 mt-1 font-semibold">
                                                {duplicateOutletDates.map((d, i) => (
                                                    <li key={i}>{d.username} pada tanggal {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {unreportedOutletDates.length > 0 && (
                                        <div className="mt-3">
                                            <p className="text-xs text-red-700 font-bold">
                                                Apotek belum melaporkan penjualan (sales) untuk tanggal berikut:
                                            </p>
                                            <ul className="list-disc list-inside text-xs text-red-700 mt-1 font-semibold max-h-32 overflow-y-auto custom-scrollbar">
                                                {unreportedOutletDates.map((d, i) => (
                                                    <li key={i}>{d.username} pada tanggal {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    <p className="text-[10px] text-red-600 mt-2 font-medium">Harap periksa apakah ada kesalahan penginputan tanggal atau kelalaian pelaporan pada outlet bersangkutan.</p>
                                </div>
                            </div>
                        )}
                        {filtered.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 mb-3 border border-gray-100">
                                    <span className="material-symbols-outlined text-gray-400 text-3xl">search_off</span>
                                </div>
                                <p className="text-gray-500 font-bold text-sm">Data tidak ditemukan.</p>
                                <p className="text-xs text-gray-400 mt-1">Coba sesuaikan filter pencarian atau periode tanggal Anda.</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-auto max-h-[600px] border border-gray-100 rounded-lg shadow-inner bg-white">
                                <table className="w-full text-sm text-left text-gray-500 table-fixed min-w-[1850px] border-collapse">
                                    <colgroup>
                                        <col style={{ width: '180px' }} />
                                        <col style={{ width: '95px' }} />
                                        <col style={{ width: '95px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '135px' }} />
                                        <col style={{ width: '135px' }} />
                                        <col style={{ width: '100px' }} />
                                        <col style={{ width: '80px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '140px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '160px' }} />
                                        <col style={{ width: '160px' }} />
                                        <col style={{ width: '60px' }} />
                                    </colgroup>
                                    <thead className="text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 z-20 border-b border-gray-200">
                                        <tr>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nama Apotek</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Tgl Setor</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Tgl Sales</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Waktu Kirim</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Jenis Laporan</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Metode</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Deposit Card</th>
                                            <th className="px-3 py-3 bg-gray-50 sticky top-0 z-20 border-b border-gray-200">KCP</th>
                                            <th className="px-3 py-3 text-right bg-blue-50 text-blue-700 font-bold sticky top-0 z-20 border-b border-gray-200">Data Sales (Xilnex)</th>
                                            <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nominal Sales</th>
                                            <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Potongan Penjualan (Petty Cash)</th>
                                            <th className="px-3 py-3 text-right bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Nominal Setor</th>
                                            <th className="px-3 py-3 text-center bg-red-50 text-red-700 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Data Sales (Xilnex) VS Nominal Sales</th>
                                            <th className="px-3 py-3 text-center bg-orange-50 text-orange-700 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Data Sales (Xilnex) VS Potongan + Nominal Setor</th>
                                            <th className="px-3 py-3 text-center bg-gray-50 sticky top-0 z-20 border-b border-gray-200">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                                        {paginatedRows.map((row) => {
                                            const posValAll = row.posVal;
                                            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(row.jenis_pelaporan);
                                            const posVal1 = isValidTypeForPOS ? posValAll : undefined;

                                            const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
                                            const hasPOSAll = posValAll !== undefined && posValAll !== null;

                                            const s1 = hasPOS1 ? (row.nominal_jual || 0) - posVal1 : null;
                                            const s2 = hasPOSAll ? ((row.potongan || 0) + (row.nominal_setoran || 0)) - posValAll : null;

                                            return (
                                                <tr key={row.id} className={'hover:bg-gray-50/50 transition-colors group ' + (row.isUnreported ? 'bg-amber-50/15 italic text-gray-500' : '')}>
                                                    <td className="px-3 py-3 font-bold text-gray-900 text-xs break-words" title={row.username}>{row.username}</td>
                                                    <td className="px-3 py-3 text-gray-600 text-xs">
                                                        {row.isUnreported ? '-' : new Date(row.tanggal_setor).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-600 text-xs">
                                                        {row.tanggal_jual ? new Date(row.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs font-mono">
                                                        {row.timestamp ? new Date(row.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-'}
                                                    </td>
                                                    <td className="px-3 py-3 text-xs">
                                                        <div>
                                                            {renderJenisBadge(row.jenis_pelaporan)}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-xs text-gray-500 break-words" title={row.metode_setoran}>{row.metode_setoran}</td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs font-mono">{row.nomor_deposit_card || '-'}</td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs break-words">{row.kcp_terdekat || '-'}</td>
                                                    <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs bg-blue-50/30 font-semibold">
                                                        {posVal1 !== undefined ? formatRupiah(posVal1) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.nominal_jual || 0)}</td>
                                                    <td className="px-3 py-3 text-right text-gray-500 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.potongan || 0)}</td>
                                                    <td className="px-3 py-3 text-right font-bold text-gray-900 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.nominal_setoran || 0)}</td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-red-50/10">
                                                        {selisihChipNew(s1)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-orange-50/10">
                                                        {selisihChipNew(s2)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {row.isUnreported ? (
                                                            <span className="text-gray-300">-</span>
                                                        ) : (
                                                            <button
                                                                title="Lihat Detail"
                                                                onClick={() => navigate(`/riwayat/${row.id}`)}
                                                                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-primary-600 hover:bg-orange-50 transition-colors border border-gray-200 bg-white"
                                                            >
                                                                <span className="material-symbols-outlined text-base">visibility</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900 text-xs sticky bottom-0 z-20">
                                        <tr>
                                            <td colSpan="8" className="px-3 py-3 text-left font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                                                Grand Total
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-blue-800 font-mono bg-blue-100">
                                                {formatRupiah(totals.totalPosSales)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono bg-gray-100">
                                                {formatRupiah(totals.totalSales)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-gray-600 font-mono bg-gray-100">
                                                {formatRupiah(totals.totalPotongan)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono bg-gray-100">
                                                {formatRupiah(totals.totalSetor)}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-red-100">
                                                {totals.hasAnyPosForTotals ? selisihChipNew(totals.totalSelisih1) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-orange-100">
                                                {totals.hasAnyPosForTotals2 ? selisihChipNew(totals.totalSelisih2) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 bg-gray-100"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="mt-0 flex justify-between items-center bg-gray-50 p-3 rounded-b-xl border-t border-gray-200">
                                        <span className="text-xs text-gray-500 font-medium">
                                            Menampilkan Halaman <strong className="text-gray-700">{currentPage}</strong> dari <strong className="text-gray-700">{totalPages}</strong> ({filtered.length} baris)
                                        </span>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Sebelumnya
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Berikutnya
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {!fetchTriggered && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
                        <span className="material-symbols-outlined text-5xl mb-3">table_view</span>
                        <p className="text-sm font-medium">Pilih rentang tanggal dan klik Terapkan untuk memuat data.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}