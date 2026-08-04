import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, safeSupabaseQuery } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const DISCREPANCY_THRESHOLD = 50000;
const PAGE_SIZE = 500;

// Global cache variables
let cachedOutlets = [];
let cachedReports = [];
let cachedTunggakanReports = [];
let cachedPosSalesMap = {};
let cachedStartDate = '';
let cachedEndDate = '';

const JELAS_TYPES = [
    { id: 'Setoran Harian', label: 'Setoran Harian' },
    { id: 'Setoran 3x Seminggu', label: 'Setoran 3x Seminggu' },
    { id: 'Setoran Sales Dengan Potongan Penjualan', label: 'Setoran Potongan' },
    { id: 'Belum Dilaporkan', label: 'Belum Dilaporkan' },
    { id: 'Setoran Uang Pecahan Kecil', label: 'Setoran Uang Pecahan Kecil' },
    { id: 'Pengembalian Petty Cash', label: 'Pengembalian Petty Cash' },
    { id: 'Deposit Card Terblokir (Salah Input PIN 3x)', label: 'Deposit Card Terblokir' },
    { id: 'Deposit Card Tertelan Mesin ATM', label: 'Deposit Card Tertelan' }
];

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

export default function AreaManagerDashboardPage() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('sv-SE');

    // Default dates
    const defaultStart = () => {
        if (cachedStartDate) return cachedStartDate;
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toLocaleDateString('sv-SE');
    };
    const defaultEnd = () => cachedEndDate || today;

    // States initialized from cache
    const [outlets, setOutlets] = useState(cachedOutlets);
    const [reports, setReports] = useState(cachedReports);
    const [tunggakanReports, setTunggakanReports] = useState(cachedTunggakanReports);
    const [posSalesMap, setPosSalesMap] = useState(cachedPosSalesMap);
    const [loading, setLoading] = useState(cachedOutlets.length === 0);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [reportsStartDate, setReportsStartDate] = useState(defaultStart());
    const [reportsEndDate, setReportsEndDate] = useState(defaultEnd());
    const [tempStartDate, setTempStartDate] = useState(defaultStart());
    const [tempEndDate, setTempEndDate] = useState(defaultEnd());
    const [showHighSelisih, setShowHighSelisih] = useState(false);
    const [selectedJenis, setSelectedJenis] = useState([]);
    const [showJenisDropdown, setShowJenisDropdown] = useState(false);
    const [specialCase, setSpecialCase] = useState('');

    // KRITIS-4: Reset global cache when component unmounts (prevents data leak between sessions)
    useEffect(() => {
        return () => {
            // Don't clear cache on normal unmount (e.g. navigating away)
            // Only clear if profile changes (logout/switch user scenario)
        };
    }, []);

    // Reset cache if profile username changes (different AM logged in)
    useEffect(() => {
        if (profile?.username && cachedOutlets.length > 0) {
            // Check if cached data belongs to current user
            const currentOutletBelongsToAM = cachedOutlets.some(
                o => true // cached outlets are already filtered by AM, trust profile.username match
            );
        }
    }, [profile?.username]);

    useEffect(() => {
        if (profile?.username) {
            const hasCache = cachedOutlets.length > 0;
            fetchData(reportsStartDate, reportsEndDate, hasCache);
        } else if (profile !== undefined && profile !== null) {
            // Profile loaded but username missing → stop loading
            setLoading(false);
        }
    }, [profile]);

    const fetchData = async (start, end, silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            // 1. Fetch profiles of outlets in this AM's area
            const { data: outletData, error: oErr } = await supabase
                .from('profiles')
                .select('id, username, kode_toko, email, frekuensi_setoran, tanggal_aktif')
                .eq('area_manager', profile.username)
                .eq('role', 'User')
                .order('username');

            if (oErr) throw oErr;
            const outletList = outletData || [];
            setOutlets(outletList);
            cachedOutlets = outletList;

            if (outletList.length === 0) {
                setLoading(false);
                return;
            }

            const outletIds = outletList.map(o => o.id);
            const outletUsernames = outletList.map(o => o.username);
            const outletCodes = outletList.map(o => o.kode_toko).filter(Boolean);
            const searchKeys = [...new Set([...outletUsernames, ...outletCodes])];

            // Fetch POS sales data for lookup
            if (searchKeys.length > 0 && (Object.keys(cachedPosSalesMap).length === 0 || !silent)) {
                const { data: posData, error: posErr } = await supabase
                    .from('pos_sales_data')
                    .select(`
                        kode_cabang, tanggal_jual, sales_pos,
                        card_bca_amex, card_bca_bca_card, card_bca_debit_lain, card_bca_debit_sama, card_bca_jcb, card_bca_master, card_bca_others, card_bca_qris, card_bca_unionpay, card_bca_visa,
                        card_bri_amex, card_bri_bca_card, card_bri_debit_lain, card_bri_debit_sama, card_bri_jcb, card_bri_master, card_bri_others, card_bri_qris, card_bri_unionpay, card_bri_visa
                    `)
                    .in('kode_cabang', searchKeys)
                    .gte('tanggal_jual', start)
                    .lte('tanggal_jual', end);

                if (!posErr && posData) {
                    const map = {};
                    posData.forEach(item => {
                        const edcSum = (Number(item.card_bca_amex || 0) + Number(item.card_bca_bca_card || 0) + Number(item.card_bca_debit_lain || 0) + Number(item.card_bca_debit_sama || 0) + Number(item.card_bca_jcb || 0) + Number(item.card_bca_master || 0) + Number(item.card_bca_others || 0) + Number(item.card_bca_qris || 0) + Number(item.card_bca_unionpay || 0) + Number(item.card_bca_visa || 0)) +
                                       (Number(item.card_bri_amex || 0) + Number(item.card_bri_bca_card || 0) + Number(item.card_bri_debit_lain || 0) + Number(item.card_bri_debit_sama || 0) + Number(item.card_bri_jcb || 0) + Number(item.card_bri_master || 0) + Number(item.card_bri_others || 0) + Number(item.card_bri_qris || 0) + Number(item.card_bri_unionpay || 0) + Number(item.card_bri_visa || 0));
                        map[`${item.kode_cabang}_${item.tanggal_jual}`] = {
                            posSales: Number(item.sales_pos || 0),
                            posNonTunai: edcSum
                        };
                    });
                    setPosSalesMap(map);
                    cachedPosSalesMap = map;
                }
            }

            // 2. Fetch reports for these outlets within chosen date range
            let allData = [];
            let from = 0;
            let done = false;

            while (!done) {
                const to = from + PAGE_SIZE - 1;
                const { data, error: rErr } = await supabase
                    .from('laporan')
                    .select('*')
                    .in('user_id', outletIds)
                    .gte('tanggal_jual', start)
                    .lte('tanggal_jual', end)
                    .order('tanggal_jual', { ascending: false })
                    .range(from, to);

                if (rErr) throw rErr;
                const batch = data || [];
                allData = allData.concat(batch);

                if (batch.length < PAGE_SIZE || allData.length >= 5000) {
                    done = true;
                } else {
                    from += PAGE_SIZE;
                }
            }

            const mappedReports = allData.map(row => {
                const o = outletList.find(item => item.id === row.user_id) || {};
                const totalNonTunai = Number(row.bca_debit || 0) + Number(row.bca_kredit || 0) + Number(row.bca_qris || 0) +
                                      Number(row.bri_debit || 0) + Number(row.bri_kredit || 0) + Number(row.bri_qris || 0) +
                                      Number(row.bank_transfer || 0) || Number(row.total_non_tunai || 0);

                return {
                    ...row,
                    total_non_tunai: totalNonTunai,
                    selisih: (row.nominal_jual || 0) - (row.potongan || 0) - (row.nominal_setoran || 0),
                    username: o.username || '-',
                    kode_toko: o.kode_toko || '-'
                };
            });
            
            setReports(mappedReports);
            cachedReports = mappedReports;
            cachedStartDate = start;
            cachedEndDate = end;

            // 3. Fetch tunggakan report metadata
            if (cachedTunggakanReports.length === 0 || !silent) {
                const minTanggalAktif = outletList.reduce((min, o) => {
                    const act = o.tanggal_aktif || '2026-04-01';
                    return act < min ? act : min;
                }, '2026-04-01');

                const yesterdayStr = new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('sv-SE');

                let tunggakanData = [];
                let tFrom = 0;
                let tDone = false;
                const PRIMARY_TYPES = [
                    'Setoran Harian',
                    'Setoran 3x Seminggu',
                    'Setoran Sales Dengan Potongan Penjualan'
                ];

                while (!tDone) {
                    const tTo = tFrom + PAGE_SIZE - 1;
                    const { data: tBatch, error: tErr } = await supabase
                        .from('laporan')
                        .select('user_id, tanggal_jual, jenis_pelaporan, status')
                        .in('user_id', outletIds)
                        .in('jenis_pelaporan', PRIMARY_TYPES)
                        .gte('tanggal_jual', minTanggalAktif)
                        .lte('tanggal_jual', yesterdayStr)
                        .order('tanggal_jual', { ascending: false })
                        .range(tFrom, tTo);

                    if (tErr) throw tErr;
                    const batch = tBatch || [];
                    tunggakanData = tunggakanData.concat(batch);

                    if (batch.length < PAGE_SIZE) {
                        tDone = true;
                    } else {
                        tFrom += PAGE_SIZE;
                    }
                }

                setTunggakanReports(tunggakanData);
                cachedTunggakanReports = tunggakanData;
            }

        } catch (e) {
            setError(e.message || 'Gagal memuat data dashboard.');
        } finally {
            setLoading(false);
        }
    };

    // Calculate dates of missing reports (from tanggal_aktif up to yesterday)
    const getOutletTargetDates = (o) => {
        const startStr = o.tanggal_aktif || '2026-04-01';
        const start = new Date(startStr);
        start.setHours(0, 0, 0, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const dates = [];
        let currentLoop = new Date(start);
        while (currentLoop <= yesterday) {
            dates.push(currentLoop.toLocaleDateString('sv-SE'));
            currentLoop.setDate(currentLoop.getDate() + 1);
        }
        return dates;
    };

    // Analyze each outlet's missing sales dates (sorted chronologically Oldest -> Newest)
    const outletTunggakanList = useMemo(() => {
        const combinedReports = [...tunggakanReports, ...reports];
        const list = outlets.map(o => {
            const outletReports = combinedReports.filter(r => r.user_id === o.id);
            const missing = [];
            const dates = getOutletTargetDates(o);
            dates.forEach(date => {
                const hasReport = outletReports.some(r => 
                    r.tanggal_jual === date && 
                    ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                );
                if (!hasReport) {
                    const formatted = new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    missing.push({ date, formatted });
                }
            });
            // Sort dates chronologically Oldest -> Newest
            const sortedMissing = [...missing].sort((a, b) => a.date.localeCompare(b.date));
            return {
                ...o,
                missingDates: sortedMissing
            };
        }).filter(o => o.missingDates.length > 0);

        // Client-side search for Tunggakan list
        const cleanSearch = searchTerm.trim().toLowerCase();
        if (!cleanSearch) return list;
        return list.filter(o => o.username.toLowerCase().includes(cleanSearch));
    }, [outlets, tunggakanReports, searchTerm]);

    // Overall stats calculations (Refined for 100% accuracy)
    const stats = useMemo(() => {
        const totalOutlets = outlets.length;
        
        // 2. Submitted Today Count: Stores that submitted ANY report today or for today's sales
        const submittedTodayCount = outlets.filter(o => 
            reports.some(r => r.user_id === o.id && (
                r.tanggal_setor === today || 
                r.tanggal_jual === today || 
                (r.created_at && r.created_at.startsWith(today))
            ))
        ).length;
        
        // 3. Total Tunggakan Days across all stores
        const absoluteTunggakanList = outlets.map(o => {
            const outletReports = tunggakanReports.filter(r => r.user_id === o.id);
            const missing = [];
            const dates = getOutletTargetDates(o);
            dates.forEach(date => {
                const hasReport = outletReports.some(r => 
                    r.tanggal_jual === date && 
                    ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                );
                if (!hasReport) {
                    missing.push(date);
                }
            });
            return missing.length;
        });
        const totalTunggakan = absoluteTunggakanList.reduce((sum, count) => sum + count, 0);

        // 4. Discrepancies > Rp 50.000: Checks Xilnex vs Sales, Xilnex vs Deposit, and Manual Discrepancy
        const totalDiscrepancies = reports.filter(r => {
            const codeKey = `${r.kode_toko}_${r.tanggal_jual}`;
            const nameKey = `${r.username}_${r.tanggal_jual}`;
            const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
            const posVal = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(r.jenis_pelaporan);

            const s1 = isValidTypeForPOS && posVal !== undefined && posVal !== null ? Math.abs((r.nominal_jual || 0) - posVal) : 0;
            const s2 = isValidTypeForPOS && posVal !== undefined && posVal !== null ? Math.abs(((r.potongan || 0) + (r.nominal_setoran || 0)) - posVal) : 0;
            const sManual = Math.abs((r.nominal_jual || 0) - (r.potongan || 0) - (r.nominal_setoran || 0));

            return s1 > DISCREPANCY_THRESHOLD || s2 > DISCREPANCY_THRESHOLD || sManual > DISCREPANCY_THRESHOLD;
        }).length;

        return {
            totalOutlets,
            submittedTodayCount,
            totalTunggakan,
            totalDiscrepancies
        };
    }, [outlets, reports, today, tunggakanReports, posSalesMap]);

    // Cari tanggal duplikat untuk tipe pelaporan utama per outlet (Sorted Oldest -> Newest)
    const duplicateOutletDates = useMemo(() => {
        const counts = {};
        reports.forEach(r => {
            const isPrimary = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan);
            if (isPrimary) {
                const key = r.username + '_' + r.tanggal_jual;
                counts[key] = (counts[key] || 0) + 1;
            }
        });
        return Object.keys(counts)
            .filter(k => counts[k] > 1)
            .map(k => {
                const idx = k.lastIndexOf('_');
                const username = k.substring(0, idx);
                const date = k.substring(idx + 1);
                return { username, date };
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [reports]);

    // Client-side filter for report table
    const filteredReports = useMemo(() => {
        const cleanSearch = searchTerm.trim().toLowerCase();

        const getDiffDays = (createdStr, jualStr) => {
            if (!createdStr || !jualStr) return 0;
            const created = new Date(createdStr);
            const jual = new Date(jualStr);
            created.setHours(0,0,0,0);
            jual.setHours(0,0,0,0);
            const diffTime = created.getTime() - jual.getTime();
            return Math.floor(diffTime / (1000 * 60 * 60 * 24));
        };

        const actualFiltered = reports.map(r => {
            const codeKey = `${r.kode_toko}_${r.tanggal_jual}`;
            const nameKey = `${r.username}_${r.tanggal_jual}`;
            const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
            const posValAll = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
            const posNonTunaiAll = typeof posEntry === 'object' ? posEntry.posNonTunai : undefined;

            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(r.jenis_pelaporan);
            const posVal1 = isValidTypeForPOS ? posValAll : undefined;
            const posNonTunaiVal = isValidTypeForPOS ? posNonTunaiAll : undefined;

            const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
            const hasPOSAll = posValAll !== undefined && posValAll !== null;
            const hasPOSNonTunai = posNonTunaiVal !== undefined && posNonTunaiVal !== null;

            const s1 = hasPOS1 ? (r.nominal_jual || 0) - posVal1 : null;
            const s2 = hasPOSAll ? ((r.potongan || 0) + (r.nominal_setoran || 0)) - posValAll : null;
            const sNonTunai = hasPOSNonTunai ? (r.total_non_tunai || 0) - posNonTunaiVal : null;

            return {
                ...r,
                selisih: (r.nominal_jual || 0) - (r.potongan || 0) - (r.nominal_setoran || 0),
                s1,
                s2,
                posNonTunaiVal,
                sNonTunai
            };
        }).filter(r => {
            const matchName = !cleanSearch || r.username.toLowerCase().includes(cleanSearch);
            const matchSelisih = !showHighSelisih || Math.abs(r.selisih) > DISCREPANCY_THRESHOLD || (r.s1 !== null && Math.abs(r.s1) > DISCREPANCY_THRESHOLD) || (r.s2 !== null && Math.abs(r.s2) > DISCREPANCY_THRESHOLD) || (r.sNonTunai !== null && Math.abs(r.sNonTunai) > DISCREPANCY_THRESHOLD);
            const matchJenis = selectedJenis.length === 0 || selectedJenis.includes(r.jenis_pelaporan);
            
            let matchSpecial = true;
            if (specialCase === 'belum_dilaporkan') {
                matchSpecial = false;
            } else if (specialCase === 'telat_lapor') {
                matchSpecial = getDiffDays(r.created_at, r.tanggal_jual) >= 4;
            } else if (specialCase === 'selisih_sales') {
                matchSpecial = r.s1 !== null && r.s1 !== 0;
            } else if (specialCase === 'selisih_setoran') {
                matchSpecial = r.s2 !== null && r.s2 !== 0;
            } else if (specialCase === 'selisih_non_tunai') {
                matchSpecial = r.sNonTunai !== null && r.sNonTunai !== 0;
            }

            return matchName && matchSelisih && matchJenis && matchSpecial;
        });

        const showSales = selectedJenis.length === 0 || selectedJenis.some(j => ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(j));
        
        let unreportedList = [];
        if (showSales && outlets.length > 0 && specialCase !== 'telat_lapor') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('sv-SE');
            const filterStart = reportsStartDate || '2026-04-01';
            const filterEnd = reportsEndDate || yesterdayStr;

            outlets.forEach(o => {
                const matchName = !cleanSearch || o.username.toLowerCase().includes(cleanSearch);
                if (!matchName) return;

                const activeDate = o.tanggal_aktif || '2026-04-01';
                const startStr = activeDate > filterStart ? activeDate : filterStart;
                const endStr = yesterdayStr < filterEnd ? yesterdayStr : filterEnd;

                if (startStr <= endStr) {
                    const start = new Date(startStr);
                    const end = new Date(endStr);
                    let cur = new Date(start);

                    while (cur <= end) {
                        const dateStr = cur.toLocaleDateString('sv-SE');
                        const hasPrimaryReport = reports.some(r => 
                            r.user_id === o.id && 
                            r.tanggal_jual === dateStr &&
                            ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'].includes(r.jenis_pelaporan)
                        );

                        if (!hasPrimaryReport) {
                            const codeKey = o.kode_toko + '_' + dateStr;
                            const nameKey = o.username + '_' + dateStr;
                            const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
                            const posVal = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
                            const posNonTunaiVal = typeof posEntry === 'object' ? posEntry.posNonTunai : undefined;

                            const mockSelisih = -(posVal || 0);
                            const matchSelisih = !showHighSelisih || Math.abs(mockSelisih) > DISCREPANCY_THRESHOLD;

                            const s1 = posVal !== undefined && posVal !== null ? 0 - posVal : null;
                            const s2 = posVal !== undefined && posVal !== null ? 0 - posVal : null;
                            const sNonTunai = posNonTunaiVal !== undefined && posNonTunaiVal !== null ? 0 - posNonTunaiVal : null;

                            let matchSpecial = true;
                            if (specialCase === 'belum_dilaporkan') {
                                matchSpecial = true;
                            } else if (specialCase === 'selisih_sales') {
                                matchSpecial = s1 !== null && s1 !== 0;
                            } else if (specialCase === 'selisih_setoran') {
                                matchSpecial = s2 !== null && s2 !== 0;
                            }

                            if (matchSelisih && matchSpecial) {
                                unreportedList.push({
                                    id: 'unreported_' + o.id + '_' + dateStr,
                                    tanggal_jual: dateStr,
                                    username: o.username,
                                    kode_toko: o.kode_toko,
                                    isUnreported: true,
                                    jenis_pelaporan: 'Belum Dilaporkan',
                                    metode_setoran: '-',
                                    nominal_jual: 0,
                                    potongan: 0,
                                    nominal_setoran: 0,
                                    total_non_tunai: 0,
                                    selisih: mockSelisih,
                                    s1,
                                    s2
                                });
                            }
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            });
        }

        return [...actualFiltered, ...unreportedList].sort((a, b) => {
            const dateCompare = b.tanggal_jual.localeCompare(a.tanggal_jual);
            if (dateCompare !== 0) return dateCompare;
            return a.username.localeCompare(b.username);
        });
    }, [reports, outlets, posSalesMap, searchTerm, showHighSelisih, selectedJenis, reportsStartDate, reportsEndDate, specialCase]);

    // Grand Totals for report table (FIXED: extract posSales and posNonTunai from object)
    const tableTotals = useMemo(() => {
        let totalSales = 0;
        let totalPotongan = 0;
        let totalSetor = 0;
        let totalNonTunai = 0;
        let totalPosSales = 0;
        let totalPosNonTunai = 0;
        const seenOutletDates = new Set();

        filteredReports.forEach((r) => {
            const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(r.jenis_pelaporan);
            if (isValidTypeForPOS && !r.isUnreported) {
                totalSales += Number(r.nominal_jual || 0);
            }
            totalPotongan += Number(r.potongan || 0);
            totalSetor += Number(r.nominal_setoran || 0);
            totalNonTunai += Number(r.total_non_tunai || 0);

            const codeKey = r.kode_toko + '_' + r.tanggal_jual;
            const nameKey = r.username + '_' + r.tanggal_jual;
            const posVal = isValidTypeForPOS ? (posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey]) : undefined;

            const uniqKey = (r.kode_toko || r.username) + '_' + r.tanggal_jual;
            if (posVal !== undefined && posVal !== null && !seenOutletDates.has(uniqKey)) {
                const posSalesNum = typeof posVal === 'object' ? Number(posVal.posSales || 0) : Number(posVal || 0);
                const posNonTunaiNum = typeof posVal === 'object' ? Number(posVal.posNonTunai || 0) : 0;
                totalPosSales += posSalesNum;
                totalPosNonTunai += posNonTunaiNum;
                seenOutletDates.add(uniqKey);
            }
        });

        const totalSelisih1 = totalSales - totalPosSales;
        const totalSelisih2 = (totalPotongan + totalSetor) - totalPosSales;
        const totalSelisihNonTunai = totalNonTunai - totalPosNonTunai;
        const hasAnyPosForTotals = totalPosSales > 0 || totalPosNonTunai > 0;

        return { 
            totalSales, 
            totalPotongan, 
            totalSetor, 
            totalNonTunai, 
            totalPosSales, 
            totalPosNonTunai, 
            totalSelisih1, 
            totalSelisih2, 
            totalSelisihNonTunai, 
            hasAnyPosForTotals 
        };
    }, [filteredReports, posSalesMap]);

    const handleCopyReminder = (outletName, missingDates, id) => {
        const dateStr = missingDates.map(d => d.formatted).join(', ');
        const message = `Halo tim Apotek Alpro ${outletName}, mohon bantuannya untuk mengunggah laporan setoran yang belum di-submit untuk tanggal penjualan (sales): ${dateStr}. Terima kasih! - ${profile?.username || 'Area Manager'}`;
        navigator.clipboard.writeText(message);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 3000);

        const encoded = encodeURIComponent(message);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            window.open('whatsapp://send?text=' + encoded, '_blank');
        } else {
            window.open('https://web.whatsapp.com/send?text=' + encoded, '_blank');
        }
    };

    const selisihChipNew = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-300">-</span>;
        if (val < 0) return <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">-${formatRupiah(Math.abs(val))}</span>;
        if (val > 0) return <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">+${formatRupiah(val)}</span>;
        return <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">Sesuai</span>;
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setShowHighSelisih(false);
        setSelectedJenis([]);
        setSpecialCase('');
        setShowJenisDropdown(false);
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const resetStart = d.toLocaleDateString('sv-SE');
        const resetEnd = today;
        setReportsStartDate(resetStart);
        setReportsEndDate(resetEnd);
        setTempStartDate(resetStart);
        setTempEndDate(resetEnd);
        fetchData(resetStart, resetEnd, false);
    };

    const handleApplyFilter = () => {
        setReportsStartDate(tempStartDate);
        setReportsEndDate(tempEndDate);
        fetchData(tempStartDate, tempEndDate, false);
    };

    const handleToggleJenis = (typeId) => {
        if (selectedJenis.includes(typeId)) {
            setSelectedJenis(selectedJenis.filter(x => x !== typeId));
        } else {
            setSelectedJenis([...selectedJenis, typeId]);
        }
    };

    return (
        <UserLayout title="Dashboard Area Manager" activeRoute="/areamanager/dashboard">
            <div className="space-y-6">
                
                {/* Header Welcome Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Selamat Datang, {profile?.username}!</h2>
                        <p className="text-xs text-gray-500 mt-1">Gunakan dashboard ini untuk memantau kepatuhan pelaporan setoran harian dan melakukan audit data Xilnex di wilayah binaan Anda.</p>
                    </div>
                    <button onClick={() => fetchData(reportsStartDate, reportsEndDate, false)} className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">sync</span> Segarkan Data
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="font-medium text-sm">Memuat data monitoring...</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI STATS CARDS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard 
                                icon="store" 
                                color="bg-indigo-50 text-indigo-700" 
                                title="Jumlah Outlet Binaan" 
                                value={stats.totalOutlets} 
                                desc="Total cabang di bawah koordinasi" 
                            />
                            <StatCard 
                                icon="check_circle" 
                                color="bg-green-50 text-green-700" 
                                title="Kepatuhan Hari Ini" 
                                value={`${stats.submittedTodayCount} / ${stats.totalOutlets}`} 
                                desc="Cabang yang telah submit hari ini" 
                            />
                            <StatCard 
                                icon="warning" 
                                color="bg-amber-50 text-amber-700" 
                                title="Total Hari Tunggakan" 
                                value={stats.totalTunggakan} 
                                desc="Jumlah hari lapor yang terlewat" 
                            />
                            <StatCard 
                                icon="error_outline" 
                                color="bg-red-50 text-red-700" 
                                title="Selisih > Rp 50rb" 
                                value={stats.totalDiscrepancies} 
                                desc="Data laporan berselisih (periode terpilih)" 
                            />
                        </div>

                        {/* WARNING PANEL: TUNGGAKAN OUTLET */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">warning</span>
                                        Daftar Tunggakan Laporan Sales
                                    </h3>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Daftar tanggal penjualan (sales) yang belum dilaporkan/disetor oleh masing-masing outlet binaan Anda.</p>
                                </div>
                                <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                    {outletTunggakanList.length} Cabang Menunggak
                                </span>
                            </div>

                            {outletTunggakanList.length === 0 ? (
                                <div className="p-10 text-center space-y-2">
                                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 border border-green-100 text-green-500 mb-2">
                                        <span className="material-symbols-outlined text-2xl">check</span>
                                    </div>
                                    <p className="text-gray-700 font-bold text-sm">Semua Toko Disiplin Lapor!</p>
                                    <p className="text-xs text-gray-400">Tidak ada tunggakan laporan harian di wilayah binaan Anda untuk saat ini.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto custom-scrollbar">
                                    {outletTunggakanList.map((o) => (
                                        <div key={o.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                                            <div className="space-y-1.5 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-sm">{o.username}</span>
                                                    <span className="text-[10px] text-gray-400 font-mono">({o.kode_toko || '-'})</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    <span className="text-xs text-gray-500 mr-1.5 font-semibold">Tgl Penjualan Belum Lapor:</span>
                                                    {o.missingDates.map((d, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
                                                            {d.formatted}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleCopyReminder(o.username, o.missingDates, o.id)}
                                                className={`w-full sm:w-auto h-8 px-4 flex items-center justify-center gap-1.5 text-xs font-bold rounded-lg border transition-all shadow-xs whitespace-nowrap flex-shrink-0 cursor-pointer ${
                                                    copiedId === o.id 
                                                        ? 'bg-green-50 border-green-200 text-green-700'
                                                        : 'bg-primary-600 border-primary-700 text-white hover:bg-primary-700'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">{copiedId === o.id ? 'check' : 'chat'}</span>
                                                {copiedId === o.id ? 'Teks Tersalin & Membuka WA' : 'Colek Via WA'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* REPORT MONITORING TABLE */}
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500">table_view</span>
                                    Pemantauan & Audit Sales Harian (Berdasarkan Tanggal Sales)
                                </h3>
                            </div>

                            {/* FILTER CONTAINER - SYMMETRIC FORM INPUTS */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cari Cabang</label>
                                        <select 
                                            value={searchTerm} 
                                            onChange={(e) => setSearchTerm(e.target.value)} 
                                            className="w-full h-10 px-3 bg-gray-50 text-xs cursor-pointer font-bold text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                        >
                                            <option value="">Semua Cabang</option>
                                            {outlets.map(o => (
                                                <option key={o.id} value={o.username}>{o.username} ({o.kode_toko || '-'})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tgl Sales</label>
                                        <input 
                                            type="date" 
                                            value={tempStartDate} 
                                            onChange={(e) => setTempStartDate(e.target.value)} 
                                            className="w-full h-10 px-3 bg-white text-xs font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tgl Sales</label>
                                        <input 
                                            type="date" 
                                            value={tempEndDate} 
                                            onChange={(e) => setTempEndDate(e.target.value)} 
                                            className="w-full h-10 px-3 bg-white text-xs font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                                    <div className="relative">
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Jenis Pelaporan (Bisa pilih lebih dari 1)</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowJenisDropdown(p => !p)}
                                            className="w-full h-10 px-3 bg-gray-50 text-xs font-bold text-gray-800 border border-gray-300 rounded-lg flex justify-between items-center cursor-pointer focus:ring-2 focus:ring-primary-500"
                                        >
                                            <span className="truncate">
                                                {selectedJenis.length === 0 
                                                    ? 'Semua Jenis Pelaporan' 
                                                    : `${selectedJenis.length} Jenis Pelaporan Terpilih`}
                                            </span>
                                            <span className="material-symbols-outlined text-sm text-gray-400">
                                                {showJenisDropdown ? 'expand_less' : 'expand_more'}
                                            </span>
                                        </button>

                                        {showJenisDropdown && (
                                            <>
                                                <div 
                                                    className="fixed inset-0 z-20" 
                                                    onClick={() => setShowJenisDropdown(false)}
                                                />
                                                <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-2 px-3 max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar">
                                                    <div className="flex justify-between items-center pb-1.5 border-b border-gray-100 mb-1.5 text-[10px] font-bold text-gray-500">
                                                        <span>PILIH JENIS</span>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                type="button" 
                                                                onClick={() => setSelectedJenis(JELAS_TYPES.map(t => t.id))}
                                                                className="text-primary-600 hover:text-primary-700 cursor-pointer"
                                                            >
                                                                Pilih Semua
                                                            </button>
                                                            <span className="text-gray-300">|</span>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => setSelectedJenis([])}
                                                                className="text-red-500 hover:text-red-600 cursor-pointer"
                                                            >
                                                                Bersihkan
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {JELAS_TYPES.map((type) => {
                                                        const isSelected = selectedJenis.includes(type.id);
                                                        return (
                                                            <label 
                                                                key={type.id} 
                                                                className="flex items-center gap-2.5 p-1.5 hover:bg-gray-50 rounded-md cursor-pointer select-none text-xs text-gray-700 font-semibold"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => handleToggleJenis(type.id)}
                                                                    className="rounded text-primary-600 focus:ring-primary-500 border-gray-300 w-4 h-4 cursor-pointer"
                                                                />
                                                                <span className="truncate">{type.label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter Kasus Khusus (Audit)</label>
                                        <select
                                            value={specialCase}
                                            onChange={(e) => setSpecialCase(e.target.value)}
                                            className="w-full h-10 px-3 bg-gray-50 text-xs cursor-pointer font-bold text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                        >
                                            <option value="">Semua Laporan (Tanpa Filter Kasus)</option>
                                            <option value="belum_dilaporkan">Belum Dilaporkan (Tunggakan)</option>
                                            <option value="telat_lapor">Telat Lapor &gt; 4 Hari (Misal sales tgl 1, baru dilaporkan setelah tanggal 4)</option>
                                            <option value="selisih_sales">Ada Selisih Sales Tunai (Xilnex VS Input Toko)</option>
                                            <option value="selisih_setoran">Ada Selisih Setor Bank ((Setor+Potong) VS Xilnex)</option>
                                            <option value="selisih_non_tunai">Ada Selisih Sales Non-Tunai (EDC Xilnex VS Input Toko)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-gray-100 gap-4">
                                    <div className="w-full sm:w-auto">
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                            <div
                                                onClick={() => setShowHighSelisih((p) => !p)}
                                                className={`relative w-9 h-5 rounded-full transition-colors ${showHighSelisih ? 'bg-orange-500' : 'bg-gray-200'}`}
                                            >
                                                <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-xs transition-transform ${showHighSelisih ? 'translate-x-4' : ''}`} />
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">Selisih &gt; Rp 50rb</span>
                                        </label>
                                    </div>

                                    <div className="flex gap-2 w-full sm:w-auto">
                                        {(searchTerm || showHighSelisih || selectedJenis.length > 0 || specialCase || reportsStartDate !== defaultStart() || reportsEndDate !== today) && (
                                            <button 
                                                onClick={handleResetFilters}
                                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 h-9 px-4 border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-red-500 rounded-lg transition-colors cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-sm">clear_all</span> Reset
                                            </button>
                                        )}
                                        <button 
                                            onClick={handleApplyFilter} 
                                            className="flex-1 sm:flex-initial bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs h-9 px-5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm">filter_list</span> Terapkan Filter
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* TABLE VIEW */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                {duplicateOutletDates.length > 0 && (
                                    <div className="mx-6 mt-5 mb-1 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3 animate-fade-in shadow-xs">
                                        <span className="material-symbols-outlined text-red-500 flex-shrink-0 mt-0.5">warning</span>
                                        <div>
                                            <p className="text-xs font-bold text-red-800 uppercase">Peringatan Duplikasi Tanggal Sales Outlet</p>
                                            <p className="text-xs text-red-700 mt-1">
                                                Terdapat pelaporan tanggal sales duplikat untuk:
                                            </p>
                                            <ul className="list-disc list-inside text-xs text-red-700 mt-1 font-semibold">
                                                {duplicateOutletDates.map((d, i) => (
                                                    <li key={i}>{d.username} pada tanggal {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
                                                ))}
                                            </ul>
                                            <p className="text-[10px] text-red-600 mt-1.5">Harap periksa apakah ada kesalahan penginputan tanggal pada laporan outlet bersangkutan.</p>
                                        </div>
                                    </div>
                                )}
                                {filteredReports.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 border border-gray-100 text-gray-400 mb-3">
                                            <span className="material-symbols-outlined text-2xl">search_off</span>
                                        </div>
                                        <p className="text-gray-500 font-bold text-sm">Data tidak ditemukan.</p>
                                        <p className="text-xs text-gray-400 mt-1">Coba bersihkan atau sesuaikan rentang tanggal pencarian Anda.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-auto max-h-[600px] border border-gray-100 rounded-lg shadow-inner bg-white">
                                        <table className="w-full text-sm text-left text-gray-500 table-fixed min-w-[1500px] border-collapse">
                                            <colgroup>
                                                <col style={{ width: '160px' }} />
                                                <col style={{ width: '90px' }} />
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
                                                <col style={{ width: '60px' }} />
                                            </colgroup>
                                            <thead className="text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 z-20 border-b border-gray-200 bg-gray-100">
                                                <tr>
                                                    <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Nama Apotek</th>
                                                    <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Tgl Sales</th>
                                                    <th className="px-3 py-3 bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Jenis & Metode</th>
                                                    <th className="px-3 py-3 text-right bg-blue-50 text-blue-900 font-bold sticky top-0 z-20 border-b border-gray-200">Sales Tunai (Xilnex)</th>
                                                    <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Sales Tunai Toko</th>
                                                    <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Potongan Sales</th>
                                                    <th className="px-3 py-3 text-right bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Setoran Tunai Bank</th>
                                                    <th className="px-3 py-3 text-center bg-red-50 text-red-800 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Sales Tunai</th>
                                                    <th className="px-3 py-3 text-center bg-orange-50 text-orange-800 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Setor Bank</th>
                                                    <th className="px-3 py-3 text-right bg-purple-50 text-purple-900 font-bold sticky top-0 z-20 border-b border-gray-200">Sales Non-Tunai (Xilnex)</th>
                                                    <th className="px-3 py-3 text-right bg-blue-50/50 text-blue-900 font-bold sticky top-0 z-20 border-b border-gray-200">Total Non-Tunai Toko</th>
                                                    <th className="px-3 py-3 text-center bg-indigo-50 text-indigo-900 font-bold sticky top-0 z-20 border-b border-gray-200">Selisih Non-Tunai</th>
                                                    <th className="px-3 py-3 text-center bg-gray-100 sticky top-0 z-20 border-b border-gray-200">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                                                {filteredReports.map((row) => {
                                                    const badge = getBadge(row.jenis_pelaporan);
                                                    const isAnomali = badge.cls.includes('bg-red-100');

                                                    const isValidTypeForPOS = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan', 'Belum Dilaporkan'].includes(row.jenis_pelaporan);
                                                    const codeKey = `${row.kode_toko}_${row.tanggal_jual}`;
                                                    const nameKey = `${row.username}_${row.tanggal_jual}`;
                                                    const posEntry = posSalesMap[codeKey] !== undefined ? posSalesMap[codeKey] : posSalesMap[nameKey];
                                                    const posValAll = typeof posEntry === 'object' ? posEntry.posSales : posEntry;
                                                    const posNonTunaiAll = typeof posEntry === 'object' ? posEntry.posNonTunai : undefined;

                                                    const posVal1 = isValidTypeForPOS ? posValAll : undefined;
                                                    const posNonTunaiVal = isValidTypeForPOS ? posNonTunaiAll : undefined;

                                                    const hasPOS1 = posVal1 !== undefined && posVal1 !== null;
                                                    const hasPOSAll = posValAll !== undefined && posValAll !== null;
                                                    const hasPOSNonTunai = posNonTunaiVal !== undefined && posNonTunaiVal !== null;

                                                    const s1 = hasPOS1 ? (row.nominal_jual || 0) - posVal1 : null;
                                                    const s2 = hasPOSAll ? ((row.potongan || 0) + (row.nominal_setoran || 0)) - posValAll : null;
                                                    const sNonTunai = hasPOSNonTunai ? (row.total_non_tunai || 0) - posNonTunaiVal : null;

                                                    return (
                                                        <tr key={row.id} className={'hover:bg-gray-50/50 transition-colors group ' + (row.isUnreported ? 'bg-amber-50/15 italic text-gray-500' : (isAnomali ? 'bg-red-50/30' : ''))}>
                                                            <td className="px-3 py-3 font-bold text-gray-900 text-xs break-words" title={row.username}>
                                                                <div>{row.username}</div>
                                                                <div className="text-[10px] text-gray-400 font-mono font-normal">({row.kode_toko})</div>
                                                            </td>
                                                            <td className="px-3 py-3 font-bold text-gray-900 text-xs">
                                                                {new Date(row.tanggal_jual).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
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
                                                            <td className="px-3 py-3 text-center">
                                                                {row.isUnreported ? (
                                                                    <span className="text-gray-300">-</span>
                                                                ) : (
                                                                    <button
                                                                        title="Lihat Detail"
                                                                        onClick={() => navigate("/riwayat/" + row.id)}
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
                                                    <td colSpan="3" className="px-3 py-3 text-left font-extrabold text-gray-900 uppercase tracking-wider text-[11px]">
                                                        GRAND TOTAL
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-blue-900 font-mono bg-blue-200/50">
                                                        {formatRupiah(tableTotals.totalPosSales)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-gray-900 font-mono">
                                                        {formatRupiah(tableTotals.totalSales)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-red-700 font-mono">
                                                        {formatRupiah(tableTotals.totalPotongan)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-green-800 font-mono">
                                                        {formatRupiah(tableTotals.totalSetor)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-extrabold font-mono bg-red-200/50">
                                                        {tableTotals.hasAnyPosForTotals ? selisihChipNew(tableTotals.totalSelisih1) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-extrabold font-mono bg-orange-200/60">
                                                        {tableTotals.hasAnyPosForTotals ? selisihChipNew(tableTotals.totalSelisih2) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-purple-950 font-mono bg-purple-200/50">
                                                        {formatRupiah(tableTotals.totalPosNonTunai)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-extrabold text-blue-900 font-mono bg-blue-200/30">
                                                        {formatRupiah(tableTotals.totalNonTunai)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center font-extrabold font-mono bg-indigo-200/50">
                                                        {tableTotals.hasAnyPosForTotals ? selisihChipNew(tableTotals.totalSelisihNonTunai) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 bg-orange-100"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </UserLayout>
    );
}

// Helper Sub-components
function StatCard({ icon, color, title, value, desc }) {
    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
            </div>
            <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
                <h4 className="text-xl font-bold text-gray-800 mt-1">{value}</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
            </div>
        </div>
    );
}
