import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AIChatFAB from './AIChatFAB';

/* ─── Navigation items ──────────────────────────────────────────────────────── */
const NAV_ITEMS = [
    { label: 'Beranda', icon: 'home', path: '/beranda' },
    { label: 'Lapor Setoran', icon: 'add_circle', path: '/setoran' },
    { label: 'Riwayat Laporan', icon: 'history', path: '/riwayat' },
    { label: 'Pengaturan', icon: 'settings', path: '/pengaturan' },
    { label: 'Petunjuk Penggunaan', icon: 'menu_book', path: '/bantuan' },
];

// AIChatFAB is imported from './AIChatFAB'

/* ─── Main UserLayout ───────────────────────────────────────────────────────── */
export default function UserLayout({ children, title, activeRoute }) {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();

    // sidebarOpen: null = desktop collapsed, false = mobile closed, true = either open
    const [collapsed, setCollapsed] = useState(false); // desktop collapse
    const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer

    const toggleDesktop = () => setCollapsed((c) => !c);
    const toggleMobile = () => setMobileOpen((o) => !o);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-20 md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200
                    flex flex-col shadow-sm flex-shrink-0
                    transform transition-all duration-300 ease-in-out
                    /* Mobile: drawer behaviour */
                    ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}
                    /* Desktop: inline — always visible but can be collapsed */
                    md:relative md:translate-x-0
                    ${collapsed ? 'md:w-[68px]' : 'md:w-64'}
                `}
            >
                {/* Logo / Brand */}
                <div className={`h-16 border-b border-gray-100 flex items-center flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'gap-3 px-5'}`}>
                    <span className="material-symbols-outlined text-3xl text-primary-500 flex-shrink-0">local_pharmacy</span>
                    {!collapsed && (
                        <span className="font-extrabold text-gray-800 tracking-tight text-lg whitespace-nowrap">Alpro</span>
                    )}
                </div>

                {/* User badge */}
                {!collapsed && (
                    <div className="px-4 py-3 mx-3 mt-4 bg-orange-50 rounded-lg border border-orange-100 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-white text-lg">person</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{profile?.username || 'User'}</p>
                            <p className="text-xs text-gray-500">{profile?.frekuensi_setoran || 'SETIAP HARI'}</p>
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div className="flex justify-center mt-4">
                        <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-lg">person</span>
                        </div>
                    </div>
                )}

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto p-2 space-y-1 mt-3">
                    {NAV_ITEMS.map((item) => {
                        const isActive = activeRoute === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                                title={item.label}
                                className={`
                                    w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                                    ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'}
                                    ${isActive
                                        ? 'bg-orange-50 text-primary-600 font-bold'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                `}
                            >
                                <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-400'}`}>
                                    {item.icon}
                                </span>
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Logout */}
                <div className="p-2 border-t border-gray-100">
                    <button
                        onClick={signOut}
                        title="Keluar"
                        className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-2.5'}`}
                    >
                        <span className="material-symbols-outlined text-xl flex-shrink-0">logout</span>
                        {!collapsed && 'Keluar'}
                    </button>
                </div>
            </aside>

            {/* ══ MAIN WRAPPER ═════════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* HEADER */}
                <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm z-10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {/* Hamburger: mobile opens drawer, desktop collapses sidebar */}
                        <button
                            className="text-gray-500 hover:text-primary-500 transition-colors focus:outline-none"
                            onClick={() => {
                                if (window.innerWidth < 768) {
                                    toggleMobile();
                                } else {
                                    toggleDesktop();
                                }
                            }}
                            aria-label="Toggle sidebar"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h1 id="header-title" className="text-base sm:text-xl font-bold text-gray-800">{title}</h1>
                    </div>

                    {/* Username (right side) */}
                    <div className="flex items-center gap-2.5">
                        <div className="bg-primary-100 text-primary-700 h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-lg">person</span>
                        </div>
                        <div className="hidden sm:block min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate max-w-[160px]" id="header-username">
                                {profile?.username || 'User'}
                            </p>
                            <p className="text-xs text-gray-400 truncate max-w-[160px]">{profile?.role || 'User'}</p>
                        </div>
                    </div>
                </header>

                {/* CONTENT */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 2xl:p-10 custom-scrollbar">
                    {children}
                </main>
            </div>

            {/* ══ FLOATING ACTION BUTTON ══════════════════════════════════════════ */}
            <AIChatFAB role="user" />
        </div>
    );
}
