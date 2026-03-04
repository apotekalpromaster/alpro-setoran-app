import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Manajemen Laporan', icon: 'table_view', path: '/admin/laporan' },
    { label: 'Laporan Analitik', icon: 'bar_chart', path: '/admin/analitik' },
    { label: 'Laporan Pending', icon: 'pending_actions', path: '/admin/pending' },
    { label: 'Pengaturan', icon: 'settings', path: '/admin/pengaturan' },
];

export default function AdminLayout({ children, title }) {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-gray-900/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* SIDEBAR */}
            <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 flex flex-col shadow-xl
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
                {/* Logo */}
                <div className="p-5 border-b border-gray-700/50 flex items-center gap-3">
                    <span className="material-symbols-outlined text-3xl text-orange-400">local_pharmacy</span>
                    <div>
                        <span className="font-extrabold text-white text-base">Apotek Alpro</span>
                        <p className="text-xs text-gray-400 font-medium -mt-0.5">Admin Panel</p>
                    </div>
                </div>

                {/* Admin badge */}
                <div className="px-3 py-2 mx-3 mt-4 bg-orange-500/10 rounded-lg border border-orange-500/20 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-white text-sm">shield_person</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{profile?.username || 'Admin'}</p>
                        <p className="text-xs text-orange-400">{profile?.role || 'Finance'}</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1 mt-3">
                    {NAV_ITEMS.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? 'bg-orange-500 text-white font-bold shadow-lg shadow-orange-500/25'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-xl ${isActive ? 'text-white' : 'text-gray-500'}`}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Logout */}
                <div className="p-3 border-t border-gray-700/50">
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span> Keluar
                    </button>
                </div>
            </aside>

            {/* MAIN WRAPPER */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* HEADER */}
                <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm z-10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button className="md:hidden text-gray-500" onClick={() => setSidebarOpen(true)}>
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h1 className="text-base sm:text-xl font-bold text-gray-800">{title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-bold">
                            {profile?.role || 'Admin'}
                        </span>
                        <div className="bg-orange-500 h-9 w-9 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-lg">shield_person</span>
                        </div>
                        <span className="font-bold text-sm hidden sm:block">{profile?.username || 'Admin'}</span>
                    </div>
                </header>

                {/* CONTENT */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    );
}
