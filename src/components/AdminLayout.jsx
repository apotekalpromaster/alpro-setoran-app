import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AIChatFAB from './AIChatFAB';
import { useNotification } from '../context/NotificationContext';
import NotificationDrawer from './NotificationDrawer';

const NAV_ITEMS = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin/beranda' },
    { label: 'Manajemen Laporan', icon: 'table_view', path: '/admin/laporan' },
    { label: 'Rekonsiliasi Xilnex', icon: 'compare', path: '/admin/rekonsiliasi' },
    { label: 'Laporan Analitik', icon: 'bar_chart', path: '/admin/analitik' },
    { label: 'Laporan Pending', icon: 'pending_actions', path: '/admin/pending' },
    { label: 'Audit Input Backdate', icon: 'history_toggle_off', path: '/admin/backdate' },
    { label: 'Audit & Troubleshooting Bank', icon: 'troubleshoot', path: '/admin/troubleshooting' },
    { label: 'Pengaturan', icon: 'settings', path: '/pengaturan' },
    { label: 'Petunjuk Penggunaan', icon: 'help', path: '/bantuan' },
];

export default function AdminLayout({ children, title, activePath }) {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const toggleDesktop = () => setCollapsed((c) => !c);
    const toggleMobile = () => setMobileOpen((o) => !o);

    const currentPath = activePath || location.pathname;

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-20 md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200
                    flex flex-col shadow-sm flex-shrink-0
                    transform transition-all duration-300 ease-in-out
                    ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}
                    md:relative md:translate-x-0
                    ${collapsed ? 'md:w-[68px]' : 'md:w-64'}
                `}
            >
                {/* Header Sidebar dengan Tombol Toggle Ciutkan/Perluas di Bagian Atas */}
                <div className={`h-16 border-b border-gray-100 flex items-center justify-between flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="material-symbols-outlined text-3xl text-primary-500 flex-shrink-0">monitoring</span>
                        {!collapsed && (
                            <div className="min-w-0">
                                <span className="font-extrabold text-gray-800 tracking-tight text-base whitespace-nowrap">Apotek Alpro</span>
                                <p className="text-xs text-gray-400 font-medium -mt-0.5">Admin Panel</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={toggleDesktop}
                        title={collapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
                        className="hidden md:flex items-center justify-center p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-xl">
                            {collapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                    </button>
                </div>

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

                <nav className="flex-1 overflow-y-auto p-2 space-y-1 mt-3 custom-scrollbar">
                    {NAV_ITEMS.map((item) => {
                        const isActive = currentPath === item.path || location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                                title={item.label}
                                className={`
                                    w-full flex items-center gap-3 rounded-lg text-sm font-medium text-left transition-colors cursor-pointer
                                    ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'}
                                    ${isActive
                                        ? 'bg-orange-50 text-primary-600 font-bold'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                `}
                            >
                                <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-400'}`}>
                                    {item.icon}
                                </span>
                                {!collapsed && <span className="text-left truncate flex-1">{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-2 border-t border-gray-100">
                    <button
                        onClick={signOut}
                        title="Keluar"
                        className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-2.5'}`}
                    >
                        <span className="material-symbols-outlined text-xl flex-shrink-0">logout</span>
                        {!collapsed && 'Keluar'}
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleMobile}
                            className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-2xl">menu</span>
                        </button>
                        <button
                            onClick={toggleDesktop}
                            title={collapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
                            className="hidden md:flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer mr-1"
                        >
                            <span className="material-symbols-outlined text-xl">
                                {collapsed ? 'menu_open' : 'menu'}
                            </span>
                        </button>
                        <h1 className="text-lg font-bold text-gray-800">{title}</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-semibold text-gray-700">{profile?.username || 'Admin'}</p>
                            <p className="text-[10px] text-gray-400">{profile?.role || 'Finance'}</p>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-orange-100 text-primary-600 flex items-center justify-center font-bold text-sm">
                            {(profile?.username || 'A')[0].toUpperCase()}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
                    {children}
                </main>
            </div>

            <AIChatFAB />
        </div>
    );
}
