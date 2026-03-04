import { useAuth } from '../context/AuthContext';

export default function BerandaPage() {
    const { profile, signOut } = useAuth();

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">

            {/* SIDEBAR PLACEHOLDER */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex md:flex-col shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary-500">local_pharmacy</span>
                </div>
                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                    <a href="#" className="flex items-center gap-3 px-4 py-3 bg-orange-50 text-primary-600 rounded-lg font-bold">
                        <span className="material-symbols-outlined">home</span> Beranda
                    </a>
                    {/* Other links will go here */}
                </nav>
                <div className="p-4 border-t border-gray-100">
                    <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors">
                        <span className="material-symbols-outlined">logout</span> Keluar
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT WRAPPER */}
            <div className="flex-1 flex flex-col overflow-hidden relative">

                {/* HEADER PLACEHOLDER */}
                <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined md:hidden cursor-pointer">menu</span>
                        <h1 className="text-xl font-bold text-gray-800">Beranda</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="bg-primary-100 text-primary-700 p-2 rounded-full material-symbols-outlined text-sm">person</span>
                        <span className="font-bold text-sm hidden sm:block">{profile?.username || 'User'}</span>
                    </div>
                </header>

                {/* MAIN CONTENT (Skeleton) */}
                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-screen-2xl mx-auto">

                        {/* Welcome Banner */}
                        <div className="mb-6 bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
                            <h2 className="text-2xl font-bold text-gray-800">Halo, {profile?.username || 'Tim Alpro'}!</h2>
                            <p className="text-gray-500 mt-1">Selamat datang di Sistem Pelaporan Setoran Harian.</p>
                        </div>

                        {/* Quick Actions (Skeleton matched from original HTML) */}
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-gray-400">bolt</span> Aksi Cepat
                            </h3>
                            <div className="flex flex-wrap gap-4">
                                <button className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-primary-600 transition-all shadow-md transform hover:-translate-y-0.5">
                                    <span className="material-symbols-outlined">add_circle</span> Buat Laporan Baru
                                </button>
                                <button className="flex items-center gap-2 bg-white text-gray-700 font-semibold py-3 px-6 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all shadow-sm">
                                    <span className="material-symbols-outlined">history</span> Riwayat Laporan
                                </button>
                            </div>
                        </div>

                        {/* Activity Container Skeleton */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-gray-400">list_alt</span> Aktivitas Terkini
                            </h3>
                            <div className="flex flex-col gap-3">
                                <div className="animate-pulse flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                        <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                                        <div className="flex-1 space-y-2 py-1 w-48">
                                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}
