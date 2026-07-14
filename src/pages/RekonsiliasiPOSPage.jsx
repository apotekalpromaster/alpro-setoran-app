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
    
    const [reconData, setReconData] = useState([]);
    const [branchesList, setBranchesList] = useState([]);
    
    const [parsedData, setParsedData] = useState([]);
    const [fileName, setFileName] = useState('');
    const [profilesForLookup, setProfilesForLookup] = useState([]);

    useEffect(() => {
        fetchBranches();
        fetchReconciliationData();
    }, [startDate, endDate]);

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

    const fetchReconciliationData = async () => {
        setLoading(true);
        setError('');
        try {
            const { data: reports, error: rErr } = await supabase
                .from('laporan')
                .select(`
                    tanggal_jual,
                    nominal_jual,
                    profiles!laporan_user_id_fkey!inner ( username )
                `)
                .gte('tanggal_jual', startDate)
                .lte('tanggal_jual', endDate);

            if (rErr) throw rErr;

            const { data: posData, error: pErr } = await supabase
                .from('pos_sales_data')
                .select('kode_cabang, tanggal_jual, sales_pos')
                .gte('tanggal_jual', startDate)
                .lte('tanggal_jual', endDate);

            if (pErr) throw pErr;

            const map = {};
            const getEntry = (branch, date) => {
                const key = `${branch}_${date}`;
                if (!map[key]) {
                    map[key] = {
                        branch,
                        date,
                        reportSales: 0,
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
                entry.hasReport = true;
            });

            posData.forEach(p => {
                const entry = getEntry(p.kode_cabang, p.tanggal_jual);
                entry.posSales = Number(p.sales_pos || 0);
                entry.hasPOS = true;
            });

            const merged = Object.values(map).map(entry => {
                const delta = entry.reportSales - entry.posSales;
                let status = 'Cocok';
                if (!entry.hasReport) {
                    status = 'KurangLaporan';
                } else if (!entry.hasPOS) {
                    status = 'KurangPOS';
                } else if (delta !== 0) {
                    status = 'Selisih';
                }
                return { ...entry, delta, status };
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
        let kurangLaporan = 0;
        let kurangPOS = 0;

        reconData.forEach(item => {
            if (item.status === 'Cocok') cocok++;
            else if (item.status === 'Selisih') selisih++;
            else if (item.status === 'KurangLaporan') kurangLaporan++;
            else if (item.status === 'KurangPOS') kurangPOS++;
        });

        return { total, cocok, selisih, kurangLaporan, kurangPOS };
    }, [reconData]);

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
                
                // Header is on row 13 (index 12)
                const headers = rawRows[12].map(h => (h || '').toString().trim());
                
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
                
                const rows = [];
                
                // Data starts on row 14 (index 13)
                for (let i = 13; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || row.length === 0) continue;
                    
                    const rawDateVal = (row[0] || '').toString().trim();
                    const rawStoreVal = (row[1] || '').toString().trim();
                    const rawSalesVal = (row[2] || '').toString().trim();
                    
                    // Filter: "hilangkan baris pada kolom A yang memiliki kata Total ataupun Grand Total"
                    const lowerDate = rawDateVal.toLowerCase();
                    if (lowerDate.includes('total') || lowerDate.includes('grand total') || !rawDateVal) {
                        continue;
                    }
                    
                    // Lookup B (Store) to profiles
                    const cleanStoreKey = rawStoreVal.toLowerCase();
                    const matchedUsername = storeMap[cleanStoreKey];
                    
                    if (!matchedUsername) {
                        continue;
                    }
                    
                    // Format Date to YYYY-MM-DD
                    let formattedDate = '';
                    if (/^\d+(\.\d+)?$/.test(rawDateVal)) {
                        const excelDateNum = parseFloat(rawDateVal);
                        const d = new Date((excelDateNum - 25569) * 86400 * 1000);
                        if (!isNaN(d.getTime())) {
                            formattedDate = d.toLocaleDateString('sv-SE');
                        }
                    } else {
                        const d = new Date(rawDateVal);
                        if (!isNaN(d.getTime())) {
                            formattedDate = d.toLocaleDateString('sv-SE');
                        }
                    }
                    
                    const cleanSales = parseInt(rawSalesVal.toString().replace(/[^0-9-]/g, ''), 10) || 0;
                    
                    if (matchedUsername && formattedDate) {
                        rows.push({
                            kode_cabang: matchedUsername,
                            tanggal_jual: formattedDate,
                            sales_pos: cleanSales
                        });
                    }
                }
                
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
                        kode_cabang: row.kode_cabang,
                        tanggal_jual: row.tanggal_jual,
                        sales_pos: row.sales_pos,
                        uploaded_by: profile.id
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
        <AdminLayout title="Rekonsiliasi POS Harian">
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
                                <span className="block text-2xl font-extrabold text-yellow-600 mt-1">{stats.kurangLaporan}</span>
                            </div>
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-gray-400">
                                <span className="block text-xs font-bold text-gray-400 uppercase">POS Belum Upload</span>
                                <span className="block text-2xl font-extrabold text-gray-500 mt-1">{stats.kurangPOS}</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary-500">filter_list</span> Filter Rekonsiliasi
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Mulai Tanggal</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="form-input w-full py-2 px-3"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Sampai Tanggal</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="form-input w-full py-2 px-3"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Pilih Cabang</label>
                                    <select
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                        className="form-input w-full py-2 px-3 bg-gray-50"
                                    >
                                        <option value="">Semua Cabang</option>
                                        {branchesList.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Status Kecocokan</label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="form-input w-full py-2 px-3 bg-gray-50"
                                    >
                                        <option value="All">Semua Status</option>
                                        <option value="Cocok">Cocok (Sesuai)</option>
                                        <option value="Selisih">Selisih (Mismatch)</option>
                                        <option value="KurangLaporan">Laporan Belum Diinput</option>
                                        <option value="KurangPOS">POS Belum Diupload</option>
                                    </select>
                                </div>
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
                                        <tr>
                                            <th className="py-3.5 px-6">Tanggal Jual</th>
                                            <th className="py-3.5 px-6">Nama Cabang</th>
                                            <th className="py-3.5 px-6 text-right">Sales POS</th>
                                            <th className="py-3.5 px-6 text-right">Sales Manual (Laporan)</th>
                                            <th className="py-3.5 px-6 text-right">Selisih</th>
                                            <th className="py-3.5 px-6 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                        {loading ? (
                                            <tr>
                                                <td colSpan="6" className="py-10 text-center text-gray-400">
                                                    <span className="animate-spin inline-block h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></span>
                                                    Memuat data...
                                                </td>
                                            </tr>
                                        ) : filteredReconData.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="py-10 text-center text-gray-400">
                                                    Tidak ada data rekonsiliasi yang cocok dengan kriteria filter.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredReconData.map((item, idx) => {
                                                let statusBadge = '';
                                                let rowCls = '';

                                                if (item.status === 'Cocok') {
                                                    statusBadge = <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200">Cocok</span>;
                                                } else if (item.status === 'Selisih') {
                                                    statusBadge = <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">Selisih</span>;
                                                    rowCls = 'bg-red-50/40';
                                                } else if (item.status === 'KurangLaporan') {
                                                    statusBadge = <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">Belum Lapor</span>;
                                                    rowCls = 'bg-yellow-50/20';
                                                } else {
                                                    statusBadge = <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-50 text-gray-600 border border-gray-200">POS Kosong</span>;
                                                }

                                                return (
                                                    <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${rowCls}`}>
                                                        <td className="py-4 px-6 font-medium text-gray-900">
                                                            {new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </td>
                                                        <td className="py-4 px-6 font-semibold">{item.branch}</td>
                                                        <td className="py-4 px-6 text-right font-mono">
                                                            {item.hasPOS ? formatRupiah(item.posSales) : '-'}
                                                        </td>
                                                        <td className="py-4 px-6 text-right font-mono">
                                                            {item.hasReport ? formatRupiah(item.reportSales) : '-'}
                                                        </td>
                                                        <td className={`py-4 px-6 text-right font-bold font-mono ${item.delta < 0 ? 'text-red-600' : item.delta > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                            {item.delta !== 0 ? (item.delta > 0 ? '+' : '') + formatRupiah(item.delta) : 'Rp 0'}
                                                        </td>
                                                        <td className="py-4 px-6 text-center">{statusBadge}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
                            <span className="font-bold text-gray-700 block">💡 Ketentuan Format Excel:</span>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Menerima berkas spreadsheet Excel (*.xlsx, *.xls).</li>
                                <li>Baris header wajib berada pada <strong>baris 13</strong>, yang mendefinisikan kolom: <strong>Date</strong> (Kolom A), <strong>Store</strong> (Kolom B), dan <strong>Cash Amount Total</strong> (Kolom C).</li>
                                <li>Kolom B (Store) otomatis dicocokkan dengan <strong>Kode Toko</strong> pada profil apotek untuk mendapatkan kode cabang yang sesuai.</li>
                                <li>Baris total/grand total pada Kolom A otomatis disaring dan diabaikan.</li>
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
                                                <th className="p-2 text-right">Sales POS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-gray-600">
                                            {parsedData.slice(0, 10).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="p-2 font-semibold">{row.kode_cabang}</td>
                                                    <td className="p-2">{row.tanggal_jual}</td>
                                                    <td className="p-2 text-right font-mono">{formatRupiah(row.sales_pos)}</td>
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