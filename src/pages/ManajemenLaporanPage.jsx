import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';
import AutocompleteInput from '../components/AutocompleteInput';

const DISCREPANCY_THRESHOLD = 50000;
const PAGE_SIZE = 500;
const MAX_ROWS = 100000;

const BADGE_CONFIG = {
    'Setoran Harian': { label: 'Setoran Harian', cls: 'bg-green-100 text-green-800 border border-green-200' },
    'Setoran 3x Seminggu': { label: 'Setoran 3x Seminggu', cls: 'bg-green-100 text-green-800 border border-green-200' },
    'Setoran Sales Dengan Potongan Penjualan': { label: 'Setoran Potongan', cls: 'bg-green-100 text-green-800 border border-green-200' },
    'Setoran Uang Pecahan Kecil': { label: 'Uang Pecahan Kecil', cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
    'Pengembalian Petty Cash': { label: 'Petty Cash', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
    'Deposit Card Terblokir (Salah Input PIN 3x)': { label: 'Card Terblokir', cls: 'bg-red-100 text-red-800 border border-red-200' },
    'Deposit Card Tertelan Mesin ATM': { label: 'Card Tertelan', cls: 'bg-red-100 text-red-800 border border-red-200' },
    'Belum Dilaporkan': { label: 'Belum Lapor', cls: 'bg-amber-100 text-amber-800 border border-amber-200' }
};

function getBadge(jenis) {
    return BADGE_CONFIG[jenis] || { label: jenis, cls: 'bg-gray-100 text-gray-800 border border-gray-200' };
}

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
    const [isAnomalyCollapsed, setIsAnomalyCollapsed] = useState(false);

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
                        total_non_tunai,
                        total_online, online_halodoc, online_tiktok, online_tokopedia,
                        bca_debit, bca_kredit, bca_qris,
                        bri_debit, bri_kredit, bri_qris,
                        bank_transfer,
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
                        .select(`
                        kode_cabang, tanggal_jual, sales_pos,
                        card_bca_amex, card_bca_bca_card, card_bca_debit_lain, card_bca_debit_sama, card_bca_jcb, card_bca_master, card_bca_others, card_bca_qris, card_bca_unionpay, card_bca_visa,
                        card_bri_amex, card_bri_bca_card, card_bri_debit_lain, card_bri_debit_sama, card_bri_jcb, card_bri_master, card_bri_others, card_bri_qris, card_bri_unionpay, card_bri_visa,
                        online_halodoc, online_tiktok, online_tokopedia
                    `)
                        .in('kode_cabang', searchKeys)
                        .in('tanggal_jual', allDates)
                        .range(posFrom, posTo);

                    if (posErr) throw posErr;
                    const posRows = posData || [];
                    posRows.forEach(item => {
                        const edcSum = (Number(item.card_bca_amex || 0) + Number(item.card_bca_bca_card || 0) + Number(item.card_bca_debit_lain || 0) + Number(item.card_bca_debit_sama || 0) + Number(item.card_bca_jcb || 0) + Number(item.card_bca_master || 0) + Number(item.card_bca_others || 0) + Number(item.card_bca_qris || 0) + Number(item.card_bca_unionpay || 0) + Number(item.card_bca_visa || 0)) +
                                       (Number(item.card_bri_amex || 0) + Number(item.card_bri_bca_card || 0) + Number(item.card_bri_debit_lain || 0) + Number(item.card_bri_debit_sama || 0) + Number(item.card_bri_jcb || 0) + Number(item.card_bri_master || 0) + Number(item.card_bri_others || 0) + Number(item.card_bri_qris || 0) + Number(item.card_bri_unionpay || 0) + Number(item.card_bri_visa || 0));
                        const onlineSum = Number(item.online_halodoc || 0) + Number(item.online_tiktok || 0) + Number(item.online_tokopedia || 0);
                        posSalesMap[item.kode_cabang + '_' + item.tanggal_jual] = {
                            posSales: Number(item.sales_pos || 0),
                            posNonTunai: edcSum,
                            posOnline: onlineSum
                        };
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
                const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
                const posVal = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
                const posNonTunai = typeof posEntry === 'object' ? posEntry.posNonTunai : undefined;
                const posOnline = typeof posEntry === 'object' ? posEntry.posOnline : undefined;

                const totalNonTunai = Number(row.bca_debit || 0) + Number(row.bca_kredit || 0) + Number(row.bca_qris || 0) +
                                      Number(row.bri_debit || 0) + Number(row.bri_kredit || 0) + Number(row.bri_qris || 0) +
                                      Number(row.bank_transfer || 0) || Number(row.total_non_tunai || 0);

                const totalOnline = Number(row.total_online || 0) || 
                                    (Number(row.online_halodoc || 0) + Number(row.online_tiktok || 0) + Number(row.online_tokopedia || 0));

                return {
                    ...row,
                    total_non_tunai: totalNonTunai,
                    total_online: totalOnline,
                    username: uName,
                    kode_toko: kToko,
                    email: row.profiles?.email || '',
                    posVal,
                    posNonTunai,
                    posOnline,
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
                            const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
                            const posVal = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
                            const posNonTunai = typeof posEntry === 'object' ? posEntry.posNonTunai : undefined;
                            const posOnline = typeof posEntry === 'object' ? posEntry.posOnline : undefined;

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
                                total_non_tunai: 0,
                                total_online: 0,
                                username: p.username,
                                kode_toko: p.kode_toko,
                                email: '',
                                isUnreported: true,
                                posVal,
                                posNonTunai,
                                posOnline,
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

    // Grand Totals (FIXED: added Online Sales accumulators & totals)
    const totals = useMemo(() => {
        let totalSales = 0;
        let totalPotongan = 0;
        let totalSetor = 0;
        let totalNonTunai = 0;
        let totalOnline = 0;
        let totalPosSales = 0;
        let totalPosNonTunai = 0;
        let totalPosOnline = 0;
        const seenOutletDates = new Set();

        filtered.forEach((r) => {
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(r.jenis_pelaporan);
            if (isValidTypeForPOS && !r.isUnreported) {
                totalSales += Number(r.nominal_jual || 0);
            }
            totalPotongan += Number(r.potongan || 0);
            totalSetor += Number(r.nominal_setoran || 0);
            totalNonTunai += Number(r.total_non_tunai || 0);
            totalOnline += Number(r.total_online || 0);

            const posValAll = r.posVal;
            const posVal = isValidTypeForPOS ? posValAll : undefined;

            const uniqKey = (r.kode_toko || r.username) + '_' + r.tanggal_jual;
            if (posVal !== undefined && posVal !== null && !seenOutletDates.has(uniqKey)) {
                totalPosSales += Number(posVal || 0);
                if (r.posNonTunai !== undefined && r.posNonTunai !== null) {
                    totalPosNonTunai += Number(r.posNonTunai || 0);
                }
                if (r.posOnline !== undefined && r.posOnline !== null) {
                    totalPosOnline += Number(r.posOnline || 0);
                }
                seenOutletDates.add(uniqKey);
            }
        });

        const totalSelisih1 = totalSales - totalPosSales;
        const totalSelisih2 = (totalPotongan + totalSetor) - totalPosSales;
        const totalSelisihNonTunai = totalNonTunai - totalPosNonTunai;
        const totalSelisihOnline = totalOnline - totalPosOnline;
        const hasAnyPosForTotals = totalPosSales > 0 || totalPosNonTunai > 0 || totalPosOnline > 0;

        return { 
            totalSales, 
            totalPotongan, 
            totalSetor, 
            totalNonTunai, 
            totalOnline,
            totalPosSales, 
            totalPosNonTunai, 
            totalPosOnline,
            totalSelisih1, 
            totalSelisih2, 
            totalSelisihNonTunai, 
            totalSelisihOnline,
            hasAnyPosForTotals 
        };
    }, [filtered]);

    // CSV export
    const downloadCSV = () => {
        if (!filtered.length) return;
        const header = 'Nama Apotek,Tgl Setor,Tgl Jual,Waktu Kirim,Jenis,Metode,Deposit Card,KCP,Data Sales (Xilnex),Nominal Sales,Potongan,Nominal Setor,Selisih 1 (VS Nominal),Selisih 2 (VS Setor),Sales Non-Tunai (Xilnex),Total Non-Tunai Toko,Selisih Non-Tunai,Sales Online (Xilnex),Total Online Toko,Selisih Online\n';
        const body = filtered.map((r) => {
            const posValAll = r.posVal;
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            const posVal1 = isValidTypeForPOS ? posValAll : undefined;

            const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
            const hasPOSAll = posValAll !== undefined && posValAll !== null;

            const posNonTunaiVal = isValidTypeForPOS ? r.posNonTunai : undefined;
            const posOnlineVal = isValidTypeForPOS ? r.posOnline : undefined;

            const s1 = hasPOS1 ? (r.nominal_jual || 0) - posVal1 : '';
            const s2 = hasPOSAll ? ((r.potongan || 0) + (r.nominal_setoran || 0)) - posValAll : '';
            const sNonTunai = posNonTunaiVal !== undefined && posNonTunaiVal !== null ? (r.total_non_tunai || 0) - posNonTunaiVal : '';
            const sOnline = posOnlineVal !== undefined && posOnlineVal !== null ? (r.total_online || 0) - posOnlineVal : '';

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
                s2,
                posNonTunaiVal !== undefined ? posNonTunaiVal : '',
                r.total_non_tunai || 0,
                sNonTunai,
                posOnlineVal !== undefined ? posOnlineVal : '',
                r.total_online || 0,
                sOnline
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
                            <p className="text-[11px] text-gray-500 leading-normal">Kelola verifikasi data Xilnex cabang.</p>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => navigate('/admin/rekonsiliasi')} 
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 h-9 px-4 border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 text-xs font-bold rounded-lg transition-all"
                        >
                            <span className="material-symbols-outlined text-base">compare</span> Rekonsiliasi Xilnex
                        </button>
                    </div>
                </div>

                {/* FILTER GRID CARD */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                        {/* Search + Autocomplete */}
                        <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
                            <AutocompleteInput
                                label="Pencarian Nama / Kode Cabang"
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
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal Sales</label>
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
                                <span className="text-xs font-bold text-gray-700">Filter Selisih &gt; Rp 50.000</span>
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
                            <div className="mx-6 mt-5 mb-1 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg overflow-hidden animate-fade-in shadow-2xs">
                                <div 
                                    onClick={() => setIsAnomalyCollapsed(p => !p)}
                                    className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-red-100/50 transition-colors"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0">warning</span>
                                        <div>
                                            <p className="text-xs font-bold text-red-800 uppercase">Peringatan Anomali &amp; Tunggakan Laporan Outlet</p>
                                            <p className="text-[10px] text-red-600">
                                                {isAnomalyCollapsed ? 'Klik untuk melihat rincian tanggal duplikat dan apotek belum lapor.' : 'Terdeteksi tangal duplikat atau tunggakan laporan sales.'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-transform shadow-2xs"
                                        aria-label={isAnomalyCollapsed ? 'Tampilkan' : 'Sembunyikan'}
                                    >
                                        <span className="material-symbols-outlined text-base">
                                            {isAnomalyCollapsed ? 'expand_more' : 'expand_less'}
                                        </span>
                                    </button>
                                </div>

                                {!isAnomalyCollapsed && (
                                    <div className="px-4 pb-4 pt-1 border-t border-red-100/80 space-y-3">
                                        {duplicateOutletDates.length > 0 && (
                                            <div>
                                                <p className="text-xs text-red-800 font-bold">
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
                                            <div>
                                                <p className="text-xs text-red-800 font-bold">
                                                    Apotek belum melaporkan penjualan (sales) untuk tanggal berikut:
                                                </p>
                                                <ul className="list-disc list-inside text-xs text-red-700 mt-1 font-semibold max-h-32 overflow-y-auto custom-scrollbar">
                                                    {unreportedOutletDates.map((d, i) => (
                                                        <li key={i}>{d.username} pada tanggal {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        
                                        <p className="text-[10px] text-red-600 font-medium">Harap periksa apakah ada kesalahan penginputan tanggal atau kelalaian pelaporan pada outlet bersangkutan.</p>
                                    </div>
                                )}
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
                                <table className="w-full text-sm text-left text-gray-500 table-fixed min-w-[2050px] border-collapse">
                                    <colgroup>
                                        <col style={{ width: '160px' }} />
                                        <col style={{ width: '90px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '130px' }} />
                                        <col style={{ width: '120px' }} />
                                        <col style={{ width: '110px' }} />
                                        <col style={{ width: '105px' }} />
                                        <col style={{ width: '115px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '135px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '135px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '125px' }} />
                                        <col style={{ width: '60px' }} />
                                    </colgroup>
                                    <thead className="text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 z-20 border-b border-gray-200 bg-gray-100">
                                        <tr>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Nama Apotek</th>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Tgl Sales</th>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Waktu Kirim</th>
                                            <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Jenis &amp; Metode</th>
                                            <th className="px-3 py-3 text-right bg-blue-50 text-blue-900 font-bold sticky top-0 z-20 border-b border-gray-200">Sales Tunai (Xilnex)</th>
                                            <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Sales Tunai Toko</th>
                                            <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Potongan Sales</th>
                                            <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Setoran Tunai Bank</th>
                                            <th className="px-3 py-3 text-center bg-red-50 text-red-800 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Sales Tunai</th>
                                            <th className="px-3 py-3 text-center bg-orange-50 text-orange-800 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Setor Bank</th>
                                            <th className="px-3 py-3 text-right bg-purple-50 text-purple-900 font-bold sticky top-0 z-20 border-b border-gray-200">Sales Non-Tunai (Xilnex)</th>
                                            <th className="px-3 py-3 text-right bg-blue-50/50 text-blue-900 font-bold sticky top-0 z-20 border-b border-gray-200">Total Non-Tunai Toko</th>
                                            <th className="px-3 py-3 text-center bg-indigo-50 text-indigo-900 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Non-Tunai</th>
                                            <th className="px-3 py-3 text-right bg-emerald-50 text-emerald-900 font-bold sticky top-0 z-20 border-b border-gray-200">Sales Online (Xilnex)</th>
                                            <th className="px-3 py-3 text-right bg-teal-50 text-teal-900 font-bold sticky top-0 z-20 border-b border-gray-200">Total Online Toko</th>
                                            <th className="px-3 py-3 text-center bg-emerald-50/50 text-emerald-950 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Online</th>
                                            <th className="px-3 py-3 text-center bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                                        {paginatedRows.map((row) => {
                                            const badge = getBadge(row.jenis_pelaporan);
                                            const isAnomali = badge.cls.includes('bg-red-100');

                                            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(row.jenis_pelaporan);
                                            const posValAll = row.posVal;
                                            const posNonTunaiAll = row.posNonTunai;
                                            const posOnlineAll = row.posOnline;

                                            const posVal1 = isValidTypeForPOS ? posValAll : undefined;
                                            const posNonTunaiVal = isValidTypeForPOS ? posNonTunaiAll : undefined;
                                            const posOnlineVal = isValidTypeForPOS ? posOnlineAll : undefined;

                                            const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
                                            const hasPOSAll = posValAll !== undefined && posValAll !== null;
                                            const hasPOSNonTunai = posNonTunaiVal !== undefined && posNonTunaiVal !== null;
                                            const hasPOSOnline = posOnlineVal !== undefined && posOnlineVal !== null;

                                            const s1 = hasPOS1 ? (row.nominal_jual || 0) - posVal1 : null;
                                            const s2 = hasPOSAll ? ((row.potongan || 0) + (row.nominal_setoran || 0)) - posValAll : null;
                                            const sNonTunai = hasPOSNonTunai ? (row.total_non_tunai || 0) - posNonTunaiVal : null;
                                            const sOnline = hasPOSOnline ? (row.total_online || 0) - posOnlineVal : null;

                                            return (
                                                <tr key={row.id} className={'hover:bg-gray-50/50 transition-colors group ' + (row.isUnreported ? 'bg-amber-50/15 italic text-gray-500' : (isAnomali ? 'bg-red-50/30' : ''))}>
                                                    <td className="px-3 py-3 font-bold text-gray-900 text-xs break-words" title={row.username}>
                                                        <div>{row.username}</div>
                                                        <div className="text-[10px] text-gray-400 font-mono font-normal">({row.kode_toko})</div>
                                                    </td>
                                                    <td className="px-3 py-3 font-bold text-gray-900 text-xs">
                                                        {row.tanggal_jual ? new Date(row.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs font-mono">
                                                        {row.timestamp ? new Date(row.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-'}
                                                    </td>
                                                    <td className="px-3 py-3 text-xs">
                                                        <div>
                                                            <p className="font-semibold text-gray-800 text-[11px] break-words" title={row.jenis_pelaporan}>{row.jenis_pelaporan}</p>
                                                            <span className={'inline-block text-[9px] font-bold px-2 py-0.25 rounded-full mt-0.5 ' + badge.cls}>
                                                                {badge.label}
                                                            </span>
                                                            {row.metode_setoran && row.metode_setoran !== '-' && (
                                                                <span className="block text-[10px] text-gray-400 mt-0.5">{row.metode_setoran}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs bg-blue-50/30 font-semibold">
                                                        {posVal1 !== undefined ? formatRupiah(posVal1) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-900 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.nominal_jual || 0)}</td>
                                                    <td className="px-3 py-3 text-right text-red-600 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.potongan || 0)}</td>
                                                    <td className="px-3 py-3 text-right font-bold text-green-700 font-mono text-xs">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.nominal_setoran || 0)}</td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-red-50/10">
                                                        {selisihChipNew(s1)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-orange-50/10">
                                                        {selisihChipNew(s2)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-purple-950 font-mono text-xs bg-purple-50/30 font-bold">
                                                        {posNonTunaiVal !== undefined ? formatRupiah(posNonTunaiVal) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-bold text-blue-800 font-mono text-xs bg-blue-50/20">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.total_non_tunai || 0)}</td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-indigo-50/20">
                                                        {selisihChipNew(sNonTunai)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-emerald-950 font-mono text-xs bg-emerald-50/30 font-bold">
                                                        {posOnlineVal !== undefined ? formatRupiah(posOnlineVal) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-bold text-teal-800 font-mono text-xs bg-teal-50/20">{row.isUnreported ? <span className="text-gray-300">-</span> : formatRupiah(row.total_online || 0)}</td>
                                                    <td className="px-3 py-3 text-center font-mono text-xs bg-emerald-50/20">
                                                        {selisihChipNew(sOnline)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {row.isUnreported ? (
                                                            <span className="text-gray-300">-</span>
                                                        ) : (
                                                            <button
                                                                title="Lihat Detail"
                                                                onClick={() => navigate(`/riwayat/${row.id}`)}
                                                                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-primary-600 hover:bg-orange-50 transition-colors border border-gray-200 bg-white cursor-pointer"
                                                            >
                                                                <span className="material-symbols-outlined text-base">visibility</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-orange-100 font-bold border-t-2 border-orange-300 text-gray-900 text-xs sticky bottom-0 z-20 shadow-md">
                                        <tr>
                                            <td colSpan="4" className="px-3 py-3 text-left font-extrabold text-gray-900 uppercase tracking-wider text-[11px]">
                                                GRAND TOTAL
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-blue-900 font-mono bg-blue-200/60">
                                                {formatRupiah(totals.totalPosSales)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono">
                                                {formatRupiah(totals.totalSales)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-red-700 font-mono">
                                                {formatRupiah(totals.totalPotongan)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-green-800 font-mono">
                                                {formatRupiah(totals.totalSetor)}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-red-200/50">
                                                {totals.hasAnyPosForTotals ? selisihChipNew(totals.totalSelisih1) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-orange-200/50">
                                                {totals.hasAnyPosForTotals ? selisihChipNew(totals.totalSelisih2) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-purple-950 font-mono bg-purple-200/60">
                                                {formatRupiah(totals.totalPosNonTunai)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-blue-900 font-mono bg-blue-200/40">
                                                {formatRupiah(totals.totalNonTunai)}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-indigo-200/50">
                                                {totals.hasAnyPosForTotals ? selisihChipNew(totals.totalSelisihNonTunai) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-emerald-950 font-mono bg-emerald-200/60">
                                                {formatRupiah(totals.totalPosOnline)}
                                            </td>
                                            <td className="px-3 py-3 text-right font-extrabold text-teal-900 font-mono bg-teal-200/40">
                                                {formatRupiah(totals.totalOnline)}
                                            </td>
                                            <td className="px-3 py-3 text-center font-extrabold font-mono bg-emerald-200/50">
                                                {totals.hasAnyPosForTotals ? selisihChipNew(totals.totalSelisihOnline) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-3 py-3 bg-orange-100"></td>
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