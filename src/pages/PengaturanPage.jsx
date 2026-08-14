import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import UserLayout from '../components/UserLayout';

/* ─── Alert helpers ─────────────────────────────────────────────────────────── */
function Toast({ message, type = 'success', onClose }) {
    const styles = {
        success: 'bg-green-50 border-green-300 text-green-800',
        error: 'bg-red-50 border-red-300 text-red-700',
        info: 'bg-blue-50 border-blue-300 text-blue-700',
    };
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    return (
        <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 mb-4 animate-slide-in ${styles[type]}`}>
            <span className="material-symbols-outlined flex-shrink-0 mt-0.5">{icons[type]}</span>
            <p className="text-sm font-medium flex-1">{message}</p>
            <button onClick={onClose} className="opacity-50 hover:opacity-100">
                <span className="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
    );
}

/* ─── Section wrapper ───────────────────────────────────────────────────────── */
function Section({ title, icon, color = 'text-primary-500', children }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <span className={`material-symbols-outlined ${color}`}>{icon}</span>
                <h2 className="text-base font-bold text-gray-800">{title}</h2>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

/* ─── Field component ───────────────────────────────────────────────────────── */
function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
            {children}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main Page Component
═══════════════════════════════════════════════════════════════════════════════ */
export default function PengaturanPage() {
    const { profile, user } = useAuth();

    // ─── Password section ─────────────────────────────────────────────────────
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwLoading, setPwLoading] = useState(false);
    const [pwToast, setPwToast] = useState(null);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);

    useEffect(() => {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (hash.includes('type=recovery') || hash.includes('access_token=') || search.includes('reset=true')) {
            setIsRecoveryMode(true);
        }
    }, []);

    // ─── Profil section ───────────────────────────────────────────────────────
    const [profForm, setProfForm] = useState({ kcp_terdekat: '', nomor_deposit_card: '' });
    const [profLoading, setProfLoading] = useState(false);
    const [profToast, setProfToast] = useState(null);

    useEffect(() => {
        if (profile) {
            setProfForm({
                kcp_terdekat: profile.kcp_terdekat || '',
                nomor_deposit_card: profile.nomor_deposit_card || '',
            });
        }
    }, [profile]);

    /* ── Ganti Password ──────────────────────────────────────────────────────── */
    const handleChangePw = async (e) => {
        e.preventDefault();
        if (pwForm.next !== pwForm.confirm) {
            setPwToast({ type: 'error', msg: 'Konfirmasi kata sandi baru tidak cocok.' });
            return;
        }
        if (pwForm.next.length < 8) {
            setPwToast({ type: 'error', msg: 'Kata sandi baru minimal 8 karakter.' });
            return;
        }
        setPwLoading(true);
        setPwToast(null);
        try {
            // Only require current password if NOT in recovery mode
            if (!isRecoveryMode) {
                if (!pwForm.current) {
                    throw new Error('Masukkan Kata Sandi Saat Ini.');
                }
                const { error: signInErr } = await supabase.auth.signInWithPassword({
                    email: user?.email,
                    password: pwForm.current,
                });
                if (signInErr) throw new Error('Kata sandi saat ini salah. Periksa kembali.');
            }

            // Now update password
            const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
            if (updateErr) throw updateErr;

            setPwForm({ current: '', next: '', confirm: '' });
            setPwToast({ type: 'success', msg: '✅ Kata sandi berhasil diperbarui. Silakan login ulang jika sesi berakhir.' });
        } catch (err) {
            setPwToast({ type: 'error', msg: err.message || 'Gagal memperbarui kata sandi.' });
        } finally {
            setPwLoading(false);
        }
    };

    /* ── Update Profil ───────────────────────────────────────────────────────── */
    const handleUpdateProfil = async (e) => {
        e.preventDefault();
        setProfLoading(true);
        setProfToast(null);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    kcp_terdekat: profForm.kcp_terdekat || null,
                    nomor_deposit_card: profForm.nomor_deposit_card || null,
                })
                .eq('id', profile.id);
            if (error) throw error;
            setProfToast({ type: 'success', msg: '✅ Data profil berhasil diperbarui.' });
        } catch (err) {
            setProfToast({ type: 'error', msg: err.message || 'Gagal menyimpan data profil.' });
        } finally {
            setProfLoading(false);
        }
    };

    return (
        <UserLayout title="Pengaturan" activeRoute="/pengaturan">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* Header */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h1 className="text-2xl font-black text-gray-900">Pengaturan Akun</h1>
                    <p className="text-gray-500 text-sm mt-1">Kelola kata sandi akun, data profil, dan nomor deposit card toko Anda.</p>
                </div>

                {/* ── 1. KEAMANAN KATA SANDI ──────────────────────────────────── */}
                <Section title="Keamanan — Ubah Kata Sandi" icon="lock" color="text-red-500">
                    {pwToast && (
                        <Toast message={pwToast.msg} type={pwToast.type} onClose={() => setPwToast(null)} />
                    )}
                    <form onSubmit={handleChangePw} className="space-y-4">
                        {isRecoveryMode ? (
                            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-600 text-base">lock_reset</span>
                                <span>Mode Pemulihan Kata Sandi: Anda dapat langsung memasukkan Kata Sandi Baru tanpa perlu Kata Sandi Saat Ini.</span>
                            </div>
                        ) : (
                            <Field label="Kata Sandi Saat Ini">
                                <input
                                    type="password"
                                    value={pwForm.current}
                                    onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))}
                                    required={!isRecoveryMode}
                                    placeholder="••••••••"
                                    className="form-input"
                                />
                            </Field>
                        )}
                        <Field label="Kata Sandi Baru">
                            <input
                                type="password"
                                value={pwForm.next}
                                onChange={(e) => setPwForm(p => ({ ...p, next: e.target.value }))}
                                required
                                minLength={8}
                                placeholder="Minimal 8 karakter"
                                className="form-input"
                            />
                        </Field>
                        <Field label="Konfirmasi Kata Sandi Baru">
                            <input
                                type="password"
                                value={pwForm.confirm}
                                onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                                required
                                placeholder="Ulangi kata sandi baru"
                                className="form-input"
                            />
                        </Field>
                        <button
                            type="submit"
                            disabled={pwLoading}
                            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto text-xs font-extrabold cursor-pointer"
                        >
                            {pwLoading ? (
                                <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Memperbarui...</>
                            ) : (
                                <><span className="material-symbols-outlined text-sm">lock_reset</span> Perbarui Kata Sandi</>
                            )}
                        </button>
                    </form>
                </Section>

                {/* ── 2. DATA PROFIL ──────────────────────────────────────────── */}
                <Section title="Data Profil & Deposit Card" icon="badge" color="text-blue-500">
                    {profToast && (
                        <Toast message={profToast.msg} type={profToast.type} onClose={() => setProfToast(null)} />
                    )}

                    {/* Read-only info */}
                    <div className="mb-5 p-4 bg-gray-50 rounded-xl text-sm space-y-2 border border-gray-100">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-medium text-xs">Nama Pengguna (Kode Toko)</span>
                            <span className="font-bold text-gray-800 text-xs">{profile?.username || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-medium text-xs">Email Penanggung Jawab</span>
                            <span className="font-mono text-gray-700 text-xs">{user?.email || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-medium text-xs">Peran Pengguna</span>
                            <span className="font-bold text-primary-600 text-xs">{profile?.role || '-'}</span>
                        </div>
                    </div>

                    <form onSubmit={handleUpdateProfil} className="space-y-4">
                        <Field label="KCP Bank Terdekat">
                            <input
                                type="text"
                                value={profForm.kcp_terdekat}
                                onChange={(e) => setProfForm(p => ({ ...p, kcp_terdekat: e.target.value.toUpperCase() }))}
                                placeholder="cth: KCP MANGGA DUA"
                                className="form-input uppercase text-xs"
                            />
                        </Field>
                        <Field label="Nomor Deposit Card Toko">
                            <input
                                type="text"
                                value={profForm.nomor_deposit_card}
                                onChange={(e) => setProfForm(p => ({ ...p, nomor_deposit_card: e.target.value.toUpperCase() }))}
                                placeholder="cth: 4XXX-XXXX-XXXX-7890"
                                className="form-input font-mono uppercase text-xs"
                            />
                        </Field>
                        <button
                            type="submit"
                            disabled={profLoading}
                            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto text-xs font-extrabold cursor-pointer"
                        >
                            {profLoading ? (
                                <><span className="material-symbols-outlined animate-spin text-sm">sync</span> Menyimpan...</>
                            ) : (
                                <><span className="material-symbols-outlined text-sm">save</span> Simpan Profil</>
                            )}
                        </button>
                    </form>
                </Section>

                {/* ── FOOTER INFO ──────────────────────────────────────────────── */}
                <div className="text-center py-4">
                    <p className="text-xs text-gray-400">Butuh bantuan? Kunjungi <a href="/bantuan" className="text-primary-600 font-semibold hover:underline">Panduan Pengguna</a>.</p>
                </div>

            </div>
        </UserLayout>
    );
}
