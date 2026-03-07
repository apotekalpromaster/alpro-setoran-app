import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ─── Navigation items ──────────────────────────────────────────────────────── */
const NAV_ITEMS = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Manajemen Laporan', icon: 'table_view', path: '/admin/laporan' },
    { label: 'Laporan Analitik', icon: 'bar_chart', path: '/admin/analitik' },
    { label: 'Laporan Pending', icon: 'pending_actions', path: '/admin/pending' },
    { label: 'Pengaturan', icon: 'settings', path: '/admin/pengaturan' },
];

/* ─── Floating Chat FAB ─────────────────────────────────────────────────────── */
function ChatFAB() {
    const [open, setOpen] = useState(false);
    return (
        <>
            {/* Chat window */}
            {open && (
                <div
                    className="fixed bottom-24 right-5 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-slide-in"
                    style={{ maxHeight: '420px' }}
                >
                    {/* Header */}
                    <div className="bg-primary-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-white text-xl">smart_toy</span>
                            <span className="text-white font-bold text-sm">Asisten Alpro</span>
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            className="text-white/80 hover:text-white transition-colors"
                            aria-label="Tutup chat"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>

                    {/* Messages area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        <div className="flex items-start gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="material-symbols-outlined text-primary-500 text-sm">smart_toy</span>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-xl rounded-tl-none px-3 py-2 text-sm text-gray-700 shadow-sm max-w-[85%]">
                                Halo Admin! Saya asisten digital Alpro. Fitur chat AI akan segera hadir. 🚀
                            </div>
                        </div>
                    </div>

                    {/* Input bar */}
                    <div className="border-t border-gray-200 p-3 bg-white flex items-center gap-2 flex-shrink-0">
                        <input
                            type="text"
                            placeholder="Ketik pesan..."
                            disabled
                            className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none bg-gray-50 cursor-not-allowed text-gray-400"
                        />
                        <button disabled className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center opacity-40 cursor-not-allowed">
                            <span className="material-symbols-outlined text-white text-sm">send</span>
                        </button>
                    </div>
                </div>
            )}

            {/* FAB button */}
            <button
                onClick={() => setOpen((o) => !o)}
                aria-label="Buka asisten chat"
                className={`
                    fixed bottom-5 right-5 z-50
                    h-14 w-14 rounded-full shadow-lg shadow-primary-500/40
                    bg-primary-500 hover:bg-primary-600
                    flex items-center justify-center
                    transition-all duration-300
                    ${open ? 'rotate-12 scale-95' : 'hover:scale-110'}
                `}
            >
                <span className="material-symbols-outlined text-white text-2xl">
                    {open ? 'close' : 'smart_toy'}
                </span>
            </button>
        </>
    );
}

/* ─── Main AdminLayout ───────────────────────────────────────────────────────── */
export default function AdminLayout({ children, title }) {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

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
                    <span className="material-symbols-outlined text-3xl text-primary-500 flex-shrink-0">monitoring</span>
                    {!collapsed && (
                        <div className="min-w-0">
                            <span className="font-extrabold text-gray-800 tracking-tight text-base whitespace-nowrap">Apotek Alpro</span>
                            <p className="text-xs text-gray-400 font-medium -mt-0.5">Admin Panel</p>
                        </div>
                    )}
                </div>

                {/* Admin badge */}
                {!collapsed && (
                    <div className="px-4 py-3 mx-3 mt-4 bg-orange-50 rounded-lg border border-orange-100 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-white text-lg">shield_person</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{profile?.username || 'Admin'}</p>
                            <p className="text-xs text-gray-500">{profile?.role || 'Finance'}</p>
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div className="flex justify-center mt-4">
                        <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-lg">shield_person</span>
                        </div>
                    </div>
                )}

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto p-2 space-y-1 mt-3">
                    {NAV_ITEMS.map((item) => {
                        const isActive = location.pathname === item.path;
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
                        <h1 className="text-base sm:text-xl font-bold text-gray-800">{title}</h1>
                    </div>

                    {/* Admin info (right side) */}
                    <div className="flex items-center gap-2.5">
                        <div className="bg-orange-100 text-orange-700 h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-lg">shield_person</span>
                        </div>
                        <div className="hidden sm:block min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate max-w-[160px]">
                                {profile?.username || 'Admin'}
                            </p>
                            <p className="text-xs text-gray-400 truncate max-w-[160px]">{profile?.role || 'Admin'}</p>
                        </div>
                    </div>
                </header>

                {/* CONTENT */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                    {children}
                </main>
            </div>

            {/* ══ FLOATING ACTION BUTTON ══════════════════════════════════════════ */}
            <ChatFAB />
        </div>
    );
}
