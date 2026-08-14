import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function ResetPasswordPage() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [isSessionValid, setIsSessionValid] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const checkRecoverySession = async () => {
            setIsCheckingSession(true);
            try {
                const hash = location.hash || window.location.hash || '';
                const search = location.search || window.location.search || '';

                if (hash.includes('error=') || search.includes('error=')) {
                    const cleanStr = hash ? (hash.startsWith('#') ? hash.slice(1) : hash) : (search.startsWith('?') ? search.slice(1) : search);
                    const params = new URLSearchParams(cleanStr);
                    const errorDesc = params.get('error_description') || 'Tautan pemulihan tidak valid atau telah kedaluwarsa.';
                    setStatus({ message: `Gagal: ${decodeURIComponent(errorDesc).replace(/\+/g, ' ')}`, type: 'error' });
                    setIsSessionValid(false);
                    setIsCheckingSession(false);
                    return;
                }

                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session) {
                    setIsSessionValid(true);
                } else {
                    const { data: refreshData } = await supabase.auth.refreshSession();
                    if (refreshData?.session) {
                        setIsSessionValid(true);
                    } else {
                        setStatus({ 
                            message: 'Sesi pemulihan tidak ditemukan. Tautan mungkin telah kadaluwarsa. Silakan minta tautan baru.', 
                            type: 'error' 
                        });
                        setIsSessionValid(false);
                    }
                }
            } catch (err) {
                console.error('[ResetPasswordPage] Session check error:', err);
                setStatus({ message: 'Terjadi kesalahan saat mengonfirmasi tautan reset password.', type: 'error' });
                setIsSessionValid(false);
            } finally {
                setIsCheckingSession(false);
            }
        };

        checkRecoverySession();
    }, [location]);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setStatus({ message: '', type: '' });

        try {
            if (!newPassword || newPassword.length < 6) {
                throw new Error('Kata sandi baru minimal 6 karakter.');
            }
            if (newPassword !== confirmPassword) {
                throw new Error('Konfirmasi kata sandi tidak cocok.');
            }

            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) throw error;

            setStatus({ message: '✓ Kata sandi berhasil diperbarui! Mengalihkan ke halaman login...', type: 'success' });
            setTimeout(() => {
                navigate('/login', { replace: true });
            }, 2500);
        } catch (err) {
            console.error('[ResetPasswordPage] Update password error:', err);
            setStatus({ message: err.message || 'Gagal memperbarui kata sandi.', type: 'error' });
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans p-4">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white shadow-2xl rounded-2xl">
                <div className="text-center">
                    <div className="mx-auto flex justify-center mb-4">
                        <img src="/logo.png" alt="Logo Apotek Alpro" className="h-16 w-auto object-contain" />
                    </div>
                    <h2 className="text-2xl font-black text-primary-500">Buat Kata Sandi Baru</h2>
                    <p className="mt-1 text-xs text-gray-500">Masukkan kata sandi baru untuk akun Anda</p>
                </div>

                <div className="border-t border-primary-500/30"></div>

                {isCheckingSession ? (
                    <div className="text-center py-6 space-y-2">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary-500">sync</span>
                        <p className="text-xs text-gray-500 font-medium">Memverifikasi tautan pemulihan...</p>
                    </div>
                ) : (
                    <>
                        {status.message && (
                            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs ${
                                status.type === 'error'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-green-50 text-green-700 border-green-200'
                            }`}>
                                <div className="flex items-center gap-2 text-left">
                                    <span className={`material-symbols-outlined text-base shrink-0 ${
                                        status.type === 'error' ? 'text-red-500' : 'text-green-500'
                                    }`}>
                                        {status.type === 'error' ? 'error' : 'check_circle'}
                                    </span>
                                    <span>{status.message}</span>
                                </div>
                            </div>
                        )}

                        {isSessionValid ? (
                            <form onSubmit={handleUpdatePassword} className="space-y-4">
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3.5 py-2.5"
                                        placeholder="KATA SANDI BARU (min. 6 karakter)"
                                    />
                                </div>

                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-3.5 py-2.5"
                                        placeholder="ULANGI KATA SANDI BARU"
                                    />
                                </div>

                                <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showPassword}
                                            onChange={(e) => setShowPassword(e.target.checked)}
                                            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                                        />
                                        <span>Tampilkan Kata Sandi</span>
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 focus:outline-none transition-all disabled:opacity-70 cursor-pointer"
                                >
                                    {isLoading ? (
                                        <><span className="material-symbols-outlined animate-spin text-sm align-middle mr-1">sync</span> Memperbarui...</>
                                    ) : 'Simpan Kata Sandi Baru'}
                                </button>
                            </form>
                        ) : (
                            <button
                                onClick={() => navigate('/login', { replace: true })}
                                className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs transition-colors"
                            >
                                Kembali ke Halaman Login
                            </button>
                        )}
                    </>
                )}

                <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
                    <p>&copy; 2025 OSS Department, Apotek Alpro</p>
                </div>
            </div>
        </div>
    );
}
