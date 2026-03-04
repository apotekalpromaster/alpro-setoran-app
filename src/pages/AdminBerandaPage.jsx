import { useAuth } from '../context/AuthContext';

export default function AdminBerandaPage() {
    const { profile, signOut } = useAuth();

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50 font-sans text-gray-800">

            {/* SIDEBAR ADMIN (Skeleton) */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 hidden md:flex md:flex-col shadow-sm text-slate-300">
                <div className="p-4 border-b border-slate-800 flex items-center justify-center bg-slate-950">
                    <span className="material-symbols-outlined text-4xl text-primary-500">admin_panel_settings</span>
                    <span className="ml-2 font-bold text-white tracking-widest text-lg">ALPRO<span className="text-primary-500 text-xs align-top">PRO</span></span>
                </div>
                <nav className="flex-1 overflow-y-auto w-full py-4 space-y-1">
                    <div className="px-4 py-2 mt-4"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dashboard</p></div>
                    <a href="#" className="flex items-center gap-3 px-6 py-3 bg-slate-800 text-white rounded-r-full font-medium border-l-4 border-primary-500 transition-colors">
                        <span className="material-symbols-outlined">analytics</span> Keuangan
                    </a>
                    {/* Other admin links */}
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg font-medium transition-colors">
                        <span className="material-symbols-outlined">logout</span> Keluar
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT WRAPPER */}
            <div className="flex-1 flex flex-col overflow-hidden relative">

                {/* HEADER ADMIN PLACEHOLDER */}
                <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined md:hidden cursor-pointer">menu</span>
                        <h1 className="text-xl font-bold text-gray-800">Dashboard Keuangan</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="bg-primary-100 text-primary-700 p-2 rounded-full material-symbols-outlined text-sm">shield_person</span>
                        <span className="font-bold text-sm hidden sm:block">{profile?.username || 'Admin'}</span>
                    </div>
                </header>

                {/* MAIN CONTENT (Skeleton) */}
                <main className="flex-1 overflow-y-auto p-6">

                    {/* Filter Bar */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-gray-600">
                            <span className="material-symbols-outlined">filter_alt</span><span className="font-semibold text-sm">Filter Periode:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                            <select className="form-input py-2 pl-3 pr-8 text-sm border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 cursor-pointer">
                                <option value="last_30">30 Hari Terakhir</option>
                            </select>
                        </div>
                    </div>

                    {/* Stats Cards (Skeleton) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {/* Sales */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute right-0 top-0 h-full w-1 bg-primary-500"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Sales Tunai</p>
                                    <h3 className="text-2xl font-bold text-gray-800 mt-1">Rp 0</h3>
                                </div>
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><span className="material-symbols-outlined">payments</span></div>
                            </div>
                        </div>

                        {/* Deposit */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Setoran</p>
                                    <h3 className="text-2xl font-bold text-gray-800 mt-1">Rp 0</h3>
                                </div>
                                <div className="p-2 bg-green-50 text-green-600 rounded-lg"><span className="material-symbols-outlined">account_balance</span></div>
                            </div>
                        </div>

                        {/* Delta */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute right-0 top-0 h-full w-1 bg-red-500"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Uang Belum Disetor</p>
                                    <h3 className="text-2xl font-bold text-red-600 mt-1">Rp 0</h3>
                                </div>
                                <div className="p-2 bg-red-50 text-red-600 rounded-lg"><span className="material-symbols-outlined">money_off</span></div>
                            </div>
                        </div>

                        {/* Pending Reporters */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Apotek Belum Lapor</p>
                                    <h3 className="text-2xl font-bold text-gray-800 mt-1">0 / 0</h3>
                                </div>
                                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><span className="material-symbols-outlined">storefront</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Chart Section Container */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">Tren Setoran vs Penjualan</h3>
                                <p className="text-sm text-gray-500">Perbandingan total penjualan dan uang yang disetor per hari.</p>
                            </div>
                        </div>
                        <div className="relative h-80 w-full flex items-center justify-center bg-gray-50 rounded border border-dashed border-gray-200 text-gray-400">
                            <div className="text-center">
                                <span className="material-symbols-outlined text-4xl mb-2 text-gray-300">show_chart</span>
                                <p>Chart Component Setup In Progress...</p>
                            </div>
                        </div>
                    </div>

                </main>
            </div>
        </div>
    );
}
