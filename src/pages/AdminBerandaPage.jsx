import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';

export default function AdminBerandaPage() {
    const { profile } = useAuth();

    return (
        <AdminLayout title="Dashboard Keuangan">

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
        </AdminLayout>
    );
}
