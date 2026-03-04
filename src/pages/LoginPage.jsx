import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
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
            const { data, error } = await signIn(email, password);

            if (error) {
                throw error;
            }

            setStatus({ message: 'Login berhasil! Mengalihkan...', type: 'success' });

            // Fetch profile to redirect correctly
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profile?.role === 'Admin' || profile?.role === 'Finance') {
                navigate('/admin');
            } else {
                navigate('/beranda');
            }

        } catch (err) {
            setStatus({ message: err.message || 'Login gagal.', type: 'error' });
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        if (!email) {
            setStatus({ message: 'Masukkan email terlebih dahulu.', type: 'error' });
            return;
        }

        if (!window.confirm(`Kirim instruksi reset password ke "${email}"?`)) return;

        setStatus({ message: 'Memproses permintaan...', type: 'loading' });
        const { error } = await supabase.auth.resetPasswordForEmail(email);

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
                        <div className="h-20 w-20 bg-primary-100 text-primary-500 rounded-full flex items-center justify-center transition-transform hover:scale-105">
                            <span className="material-symbols-outlined text-4xl">local_pharmacy</span>
                        </div>
                    </div>
                    <h2 className="mt-5 text-3xl font-extrabold text-primary-500">Selamat Datang Kembali</h2>
                    <p className="mt-2 text-sm text-gray-500">Silakan masuk untuk melanjutkan</p>
                </div>

                <div className="border-t border-primary-500/30"></div>

                <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="material-symbols-outlined text-gray-400">email</span>
                        </div>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm pl-10 py-3 transition-all"
                            placeholder="EMAIL ALPRO"
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
