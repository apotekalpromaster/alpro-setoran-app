import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
    { label: 'Beranda', icon: 'home', path: '/beranda' },
    { label: 'Buat Laporan', icon: 'add_circle', path: '/setoran' },
    { label: 'Riwayat', icon: 'history', path: '/riwayat' },
    { label: 'Pengaturan', icon: 'settings', path: '/pengaturan' },
    { label: 'Panduan', icon: 'help', path: '/panduan' },
];

export default function UserLayout({ children, title, activeRoute }) {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* SIDEBAR */}
            <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
                {/* Logo */}
                <div className="p-5 border-b border-gray-100 flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-3xl text-primary-500">local_pharmacy</span>
                    <span className="font-extrabold text-gray-800 tracking-tight text-lg">Alpro</span>
                </div>

                {/* User badge */}
                <div className="px-4 py-3 mx-3 mt-4 bg-orange-50 rounded-lg border border-orange-100 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-white text-lg">person</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{profile?.username || 'User'}</p>
                        <p className="text-xs text-gray-500">{profile?.frekuensi_setoran || 'SETIAP HARI'}</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1 mt-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = activeRoute === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? 'bg-orange-50 text-primary-600 font-bold'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-xl ${isActive ? 'text-primary-500' : 'text-gray-400'}`}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Logout */}
                <div className="p-3 border-t border-gray-100">
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span> Keluar
                    </button>
                </div>
            </aside>

            {/* MAIN WRAPPER */}
            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
                {/* HEADER */}
                <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm z-10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            className="md:hidden text-gray-500 hover:text-gray-700"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h1 id="header-title" className="text-base sm:text-xl font-bold text-gray-800">{title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-primary-100 text-primary-700 h-9 w-9 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-lg">person</span>
                        </div>
                        <span className="font-bold text-sm hidden sm:block" id="header-username">
                            {profile?.username || 'User'}
                        </span>
                    </div>
                </header>

                {/* CONTENT */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 2xl:p-10 custom-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    );
}
