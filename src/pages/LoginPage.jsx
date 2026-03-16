import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import AutocompleteInput from '../components/AutocompleteInput';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' });
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { signIn } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setStatus({ message: '', type: '' });

        try {
            if (!username.trim()) throw new Error('Username tidak boleh kosong.');

            // Step 1: Cari email dari username via RPC SECURITY DEFINER
            // Fungsi ini bypass RLS secara aman agar anon role bisa membaca email
            setStatus({ message: 'Memverifikasi username...', type: 'loading' });
            const { data: emailResult, error: rpcLookupErr } = await supabase
                .rpc('get_email_by_username', { p_username: username.trim() });

            if (rpcLookupErr) {
                console.error('[LoginPage] RPC get_email_by_username error:', rpcLookupErr);
                throw new Error('Gagal memverifikasi username. Coba lagi beberapa saat.');
            }

            // emailResult is a scalar TEXT (null if not found)
            const resolvedEmail = emailResult ?? null;

            if (!resolvedEmail) {
                throw new Error('Username tidak ditemukan. Periksa kembali username Anda.');
            }

            // Step 2: Login dengan email yang sudah di-resolve
            setStatus({ message: 'Masuk...', type: 'loading' });
            const { data, error } = await signIn(resolvedEmail, password);

            if (error) throw error;

            setStatus({ message: 'Login berhasil! Mengalihkan...', type: 'success' });

            // Step 3: Ambil role via RPC untuk menentukan redirect
            // Menggunakan SECURITY DEFINER agar tidak terkena RLS setelah login
            let role = null;
            try {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_profile_by_user_id', { p_user_id: data.user.id });

                if (rpcError) {
                    console.error('[LoginPage] RPC get_profile_by_user_id error:', rpcError);
                } else if (Array.isArray(rpcData) && rpcData.length > 0) {
                    role = rpcData[0]?.role;
                } else if (rpcData?.role) {
                    role = rpcData.role;
                }
            } catch (profileErr) {
                console.error('[LoginPage] Fallback ke query direct profiles:', profileErr);
                const { data: profileRows } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', data.user.id)
                    .limit(1);
                role = profileRows?.[0]?.role ?? null;
            }

            // Redirect berdasarkan role, default ke /beranda jika role tidak diketahui
            if (role === 'Admin' || role === 'Finance') {
                navigate('/admin');
            } else {
                navigate('/beranda');
            }

        } catch (err) {
            console.error('[LoginPage] Login error:', err);
            const friendlyMsg = err.message?.includes('Invalid login credentials')
                ? 'Username atau kata sandi salah.'
                : err.message?.includes('Database error')
                ? 'Terjadi gangguan koneksi database. Coba lagi beberapa saat.'
                : err.message || 'Login gagal. Hubungi administrator.';
            setStatus({ message: friendlyMsg, type: 'error' });
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        if (!username.trim()) {
            setStatus({ message: 'Masukkan username terlebih dahulu untuk reset password.', type: 'error' });
            return;
        }

        setStatus({ message: 'Mencari akun...', type: 'loading' });

        // Cari email berdasarkan username via RPC (aman, bypass RLS)
        const { data: resolvedEmail, error: lookupErr } = await supabase
            .rpc('get_email_by_username', { p_username: username.trim() });

        if (lookupErr || !resolvedEmail) {
            setStatus({ message: 'Username tidak ditemukan atau terjadi kesalahan.', type: 'error' });
            return;
        }

        if (!window.confirm(`Kirim instruksi reset password ke email terdaftar untuk "${username}"?`)) {
            setStatus({ message: '', type: '' });
            return;
        }

        setStatus({ message: 'Memproses permintaan...', type: 'loading' });
        const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail);

        if (error) {
            setStatus({ message: 'Gagal: ' + error.message, type: 'error' });
        } else {
            setStatus({ message: 'Instruksi pemulihan telah dikirim ke email terdaftar.', type: 'success' });
        }
    };

    return (
        <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans p-4">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white shadow-2xl rounded-2xl">
                <div className="text-center">
                    <div className="mx-auto flex justify-center mb-6">
                        {/* Logo placeholder - assuming logo comes from Google Drive normally, we use a placeholder or local asset in Vite */}
                        <img src="/logo.png" alt="Logo Apotek Alpro" className="h-20 w-auto object-contain transition-transform hover:scale-105" />
                    </div>
                    <h2 className="mt-5 text-3xl font-extrabold text-primary-500">Selamat Datang Kembali</h2>
                    <p className="mt-2 text-sm text-gray-500">Silakan masuk untuk melanjutkan</p>
                </div>

                <div className="border-t border-primary-500/30"></div>

                <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
                    {/* Username field — resolusi ke email dilakukan via RPC di backend */}
                    <div className="relative fade-in">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="material-symbols-outlined text-gray-400">person</span>
                        </div>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            autoComplete="off"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm pl-10 pr-4 py-3 uppercase transition-all"
                            placeholder="USERNAME"
                        />
                    </div>

                    <div className="relative fade-in">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="material-symbols-outlined text-gray-400">lock</span>
                        </div>
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm pl-10 pr-10 py-3 transition-all"
                            placeholder="KATA SANDI"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer group" onClick={() => setShowPassword(!showPassword)}>
                            <span className="material-symbols-outlined text-gray-400 group-hover:text-primary-500 transition-colors">
                                {showPassword ? 'visibility_off' : 'visibility'}
                            </span>
                        </div>
                    </div>
                    <div className="text-right mt-2">
                        <a href="#" onClick={handleForgotPassword} className="text-xs text-primary-500 hover:text-primary-600 font-medium transition-colors">Lupa Password?</a>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <><span className="material-symbols-outlined animate-spin text-sm align-middle mr-1">sync</span> Memproses...</>
                            ) : 'Masuk'}
                        </button>
                    </div>
                </form>

                <div className={`text-center text-sm font-bold h-4 mt-2 ${status.type === 'error' ? 'text-red-600' : status.type === 'success' ? 'text-green-600' : 'text-orange-500 animate-pulse'}`}>
                    {status.message}
                </div>

                <div className="text-center text-xs text-gray-400 pt-6 border-t border-gray-100 mt-6">
                    <p>&copy; 2025 OSS Department, Apotek Alpro</p>
                </div>
            </div>
        </div>
    );
}
