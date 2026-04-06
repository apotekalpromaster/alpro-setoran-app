import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { formatRupiah } from '../lib/validators';
import AdminLayout from '../components/AdminLayout';

/**
 * LaporanPendingPage — Gap Analysis
 *
 * Algorithm:
 * 1. Fetch all active User profiles (with email, frekuensi_setoran)
 * 2. Fetch all laporan tanggal_setor in the selected date range
 * 3. For each business day in the range:
 *    - If a user hasn't submitted any laporan on that day AND
 *    - Their frekuensi_setoran requires a report that day → mark as PENDING
 * 4. Display list of (user, pending dates) pairs for follow-up
 */

const PERIOD_OPTIONS = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: 'last_7', label: '7 Hari Terakhir' },
    { value: 'last_30', label: '30 Hari Terakhir' },
    { value: 'custom', label: 'Pilih Tanggal...' },
];

function getDateRange(period) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    let start = new Date(today); start.setHours(0, 0, 0, 0);
    if (period === 'yesterday') { start.setDate(today.getDate() - 1); today.setDate(today.getDate() - 1); }
    else if (period === 'last_7') start.setDate(today.getDate() - 6);
    else if (period === 'last_30') start.setDate(today.getDate() - 29);
    const fmt = (d) => d.toISOString().split('T')[0];
    return { start: fmt(start), end: fmt(today) };
}

function getBusinessDaysBetween(start, end) {
    const days = [];
    const cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) {
        const dow = cur.getDay(); // 0=Sun, 1=Mon...6=Sat
        if (dow !== 0 && dow !== 6) days.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

function isScheduledDay(date, frekuensi) {
    const d = new Date(date);
    const dow = d.getDay(); // 0=Sun,1=Mon...
    if (frekuensi === 'SETIAP HARI') return true; // Mon-Fri already filtered
    if (frekuensi === '3X SEMINGGU') return [1, 3, 5].includes(dow); // Mon, Wed, Fri
    if (frekuensi === '2X SEMINGGU') return [2, 5].includes(dow);   // Tue, Fri
    if (frekuensi === '1X SEMINGGU') return dow === 5;              // Friday only
    return true; // default: every day
}

function formatDateDisplay(iso) {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LaporanPendingPage() {
    const [period, setPeriod] = useState('last_7');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingData, setPendingData] = useState([]);
    const [periodDisplay, setPeriodDisplay] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailResult, setEmailResult] = useState('');

    useEffect(() => { loadPendingData(); }, []);

    const loadPendingData = async () => {
        const { start, end } = period !== 'custom' ? getDateRange(period) : { start: startDate, end: endDate };
        if (!start || !end) return;

        setPeriodDisplay(`${formatDateDisplay(start)} s/d ${formatDateDisplay(end)}`);
        setLoading(true); setError(''); setPendingData([]); setEmailResult('');

        try {
            // 1. All active users
            const { data: users, error: uErr } = await supabase
                .from('profiles')
                .select('id, username, email, frekuensi_setoran')
                .eq('role', 'User');
            if (uErr) throw uErr;

            // 2. All reports in range
            const { data: laporanRaw, error: lErr } = await supabase
                .from('laporan')
                .select('user_id, tanggal_setor')
                .gte('tanggal_setor', start)
                .lte('tanggal_setor', end);
            if (lErr) throw lErr;

            // 3. Build a Set<userId_date> of submitted dates
            const submitted = new Set(laporanRaw.map((r) => `${r.user_id}_${r.tanggal_setor}`));

            // 4. Business days in range
            const bizDays = getBusinessDaysBetween(start, end);

            // 5. For each user find missing days
            const results = [];
            users.forEach((user) => {
                const missingDays = bizDays.filter((day) => {
                    const shouldReport = isScheduledDay(day, user.frekuensi_setoran || 'SETIAP HARI');
                    const didReport = submitted.has(`${user.id}_${day}`);
                    return shouldReport && !didReport;
                });
                if (missingDays.length > 0) {
                    results.push({
                        id: user.id,
                        namaToko: user.username,
                        email: user.email,
                        frekuensi: user.frekuensi_setoran || 'SETIAP HARI',
                        tanggalBolong: missingDays,
                    });
                }
            });

            // Sort by most missing days first
            results.sort((a, b) => b.tanggalBolong.length - a.tanggalBolong.length);
            setPendingData(results);
        } catch (e) {
            setError(e.message || 'Gagal memuat data pending.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendReminder = async () => {
        if (!pendingData.length) return;
        if (!window.confirm(`Kirim email pengingat ke ${pendingData.length} toko?`)) return;
        setSendingEmail(true); setEmailResult('');
        try {
            const { data, error: err } = await supabase.functions.invoke('send-reminder-emails', {
                body: { pending: pendingData },
            });
            if (err) throw err;
            setEmailResult(`✅ Selesai! Sukses: ${data?.success ?? '?'}, Gagal: ${data?.failed ?? '?'}`);
        } catch (e) {
            setEmailResult(`❌ Gagal: ${e.message}`);
        } finally {
            setSendingEmail(false);
        }
    };

    return (
        <AdminLayout title="Monitoring Laporan Pending">
            <div className="space-y-6">
                {/* Filter */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex flex-col md:flex-row items-end gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Periode</label>
                            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="form-input bg-gray-50">
                                {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        {period === 'custom' && (
                            <div className="flex gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Dari</label>
                                    <input type="date" value={startDate} min="2026-04-01" onChange={(e) => setStartDate(e.target.value)} className="form-input w-36" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-sm">ke</span>
                                    <input type="date" value={endDate} min="2026-04-01" onChange={(e) => setEndDate(e.target.value)} className="form-input w-36" />
                                </div>
                            </div>
                        )}
                        <button onClick={loadPendingData} className="btn-primary h-10 px-5 text-sm flex-shrink-0">
                            <span className="material-symbols-outlined text-sm">analytics</span> Analisis
                        </button>
                    </div>
                </div>

                {/* Info bar + Send email */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="material-symbols-outlined text-orange-500 align-middle">pending_actions</span>
                        Menampilkan toko yang belum melapor pada:
                        <span className="font-bold text-gray-900 bg-orange-50 px-2 py-0.5 rounded text-sm ml-1">{periodDisplay || '...'}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <button
                            onClick={handleSendReminder}
                            disabled={sendingEmail || !pendingData.length}
                            className="flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-lg hover:bg-primary-600 transition-colors shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {sendingEmail
                                ? <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Mengirim...</>
                                : <><span className="material-symbols-outlined text-sm">mail</span> Kirim Email Pengingat</>
                            }
                        </button>
                        {emailResult && <p className="text-xs font-medium text-gray-700">{emailResult}</p>}
                    </div>
                </div>

                {/* Table / States */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="flex flex-col items-center gap-2 text-primary-600">
                            <span className="material-symbols-outlined animate-spin text-4xl">sync</span>
                            <span className="text-sm font-medium">Menganalisis data laporan...</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl">
                        <span className="material-symbols-outlined">error</span><p className="text-sm">{error}</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {pendingData.length === 0 ? (
                            <div className="p-16 text-center">
                                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-50 mb-4">
                                    <span className="material-symbols-outlined text-green-500 text-4xl">check_circle</span>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">Semua Laporan Lengkap!</h3>
                                <p className="text-gray-500 mt-1 text-sm">Tidak ada toko yang pending laporan pada periode ini.</p>
                            </div>
                        ) : (
                            <>
                                {/* Red summary banner */}
                                <div className="bg-red-50 border-b border-red-100 px-6 py-3 flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">warning</span>
                                    <p className="text-sm font-bold text-red-700">
                                        {pendingData.length} toko belum melapor — {pendingData.reduce((s, p) => s + p.tanggalBolong.length, 0)} total hari bolong
                                    </p>
                                </div>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-4 w-12 text-center">#</th>
                                                <th className="px-6 py-4">Nama Toko</th>
                                                <th className="px-6 py-4">Frekuensi</th>
                                                <th className="px-6 py-4">Email Terdaftar</th>
                                                <th className="px-6 py-4">Tanggal Belum Lapor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {pendingData.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 text-gray-400 text-center">{idx + 1}</td>
                                                    <td className="px-6 py-4 font-bold text-gray-900">{item.namaToko}</td>
                                                    <td className="px-6 py-4 text-xs text-gray-500">{item.frekuensi}</td>
                                                    <td className="px-6 py-4">
                                                        {item.email
                                                            ? <span className="text-gray-700">{item.email}</span>
                                                            : <span className="text-red-500 italic text-xs flex items-center gap-1"><span className="material-symbols-outlined text-sm">warning</span>Email tidak tersedia</span>
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {item.tanggalBolong.map((tgl) => (
                                                                <span key={tgl} className="inline-flex items-center bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-md border border-red-100 font-medium">
                                                                    <span className="material-symbols-outlined text-[10px] mr-1">calendar_today</span>
                                                                    {formatDateDisplay(tgl)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
