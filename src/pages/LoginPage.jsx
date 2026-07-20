import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
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
            setStatus({ message: 'Memverifikasi username...', type: 'loading' });
            const { data: emailResult, error: rpcLookupErr } = await supabase
                .rpc('get_email_by_username', { p_username: username.trim() });

            if (rpcLookupErr) {
                console.error('[LoginPage] RPC get_email_by_username error:', rpcLookupErr);
                throw new Error('Gagal memverifikasi username. Coba lagi beberapa saat.');
            }

            const resolvedEmail = emailResult ?? null;

            if (!resolvedEmail) {
                throw new Error('Username tidak ditemukan. Periksa kembali username Anda.');
            }

            // Step 2: Login dengan email yang sudah di-resolve
            setStatus({ message: 'Masuk...', type: 'loading' });
            const { data, error } = await signIn(resolvedEmail, password);

            if (error) throw error;

            setStatus({ message: 'Login berhasil! Mengalihkan...', type: 'success' });

            // Step 3: Ambil role via RPC / Direct Query untuk menentukan redirect
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

            const cleanRole = (role || '').toString().trim().toLowerCase();

            // Redirect berdasarkan role (case-insensitive)
            if (cleanRole === 'admin' || cleanRole === 'finance') {
                navigate('/admin/beranda', { replace: true });
            } else if (cleanRole === 'areamanager') {
                navigate('/areamanager/dashboard', { replace: true });
            } else {
                navigate('/beranda', { replace: true });
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-white/20">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 mb-4 shadow-inner">
                        <span className="material-symbols-outlined text-3xl">monitoring</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Apotek Alpro</h1>
                    <p className="text-xs text-gray-500 mt-1">Sistem Pelaporan Setoran Harian</p>
                </div>

                {status.message && (
                    <div
                        className={`mb-6 p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 ${
                            status.type === 'loading'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : status.type === 'success'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                    >
                        {status.type === 'loading' && (
                            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                        )}
                        {status.type === 'success' && (
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                        )}
                        {status.type === 'error' && (
                            <span className="material-symbols-outlined text-sm">error</span>
                        )}
                        <span>{status.message}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                            Username / Kode Toko
                        </label>
                        <AutocompleteInput
                            value={username}
                            onChange={(val) => setUsername(val)}
                            placeholder="Contoh: BTTSDL1 / admin"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                            Kata Sandi
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                            >
                                <span className="material-symbols-outlined text-sm">
                                    {showPassword ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm cursor-pointer disabled:opacity-50 mt-2"
                    >
                        {isLoading ? 'Processing...' : 'Masuk ke Sistem'}
                    </button>
                </form>
            </div>
        </div>
    );
}
