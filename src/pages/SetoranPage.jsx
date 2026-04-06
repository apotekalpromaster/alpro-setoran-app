import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormWizard } from '../context/FormWizardContext';
import { JENIS_PELAPORAN_LIST } from '../lib/validators';
import UserLayout from '../components/UserLayout';

const STEP_INFO = ['Detail Laporan', 'Detail Setoran', 'Ringkasan & Kirim'];

export default function SetoranPage() {
    const { profile } = useAuth();
    const { formData, updateField } = useFormWizard();
    const navigate = useNavigate();

    const [errors, setErrors] = useState({});

    const handleAddTanggalTambahan = () => {
        updateField({ tanggalPenjualanTambahan: [...formData.tanggalPenjualanTambahan, ''] });
    };

    const handleRemoveTanggalTambahan = (idx) => {
        const updated = formData.tanggalPenjualanTambahan.filter((_, i) => i !== idx);
        updateField({ tanggalPenjualanTambahan: updated });
    };

    const handleTanggalTambahanChange = (idx, val) => {
        const updated = [...formData.tanggalPenjualanTambahan];
        updated[idx] = val;
        updateField({ tanggalPenjualanTambahan: updated });
    };

    const showMultiTanggal =
        formData.jenisPelaporan === 'Setoran 3x Seminggu' ||
        formData.jenisPelaporan === 'Setoran Uang Pecahan Kecil';

    const validate = () => {
        const e = {};
        const CUTOFF_DATE = '2026-04-01';
        const CUTOFF_MSG = 'Tanggal pelaporan paling awal yang diizinkan adalah 1 April 2026';

        if (!formData.jenisPelaporan) e.jenisPelaporan = 'Jenis pelaporan harus diisi.';

        if (!formData.tanggalPenjualan) {
            e.tanggalPenjualan = 'Tanggal penjualan harus diisi.';
        } else if (formData.tanggalPenjualan < CUTOFF_DATE) {
            e.tanggalPenjualan = CUTOFF_MSG;
        }

        if (!formData.tanggalSetoran) {
            e.tanggalSetoran = 'Tanggal setoran harus diisi.';
        } else if (formData.tanggalSetoran < CUTOFF_DATE) {
            e.tanggalSetoran = CUTOFF_MSG;
        }

        if (!formData.metodeSetoran) e.metodeSetoran = 'Metode setoran harus diisi.';
        if (formData.metodeSetoran === 'Metode Setoran Lain' && !formData.metodeLain) {
            e.metodeLain = 'Nama metode lain harus diisi.';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        navigate('/setoran/detail');
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <UserLayout title="Input Setoran" activeRoute="/setoran">
            <div className="max-w-2xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        {STEP_INFO.map((label, i) => (
                            <div key={i} className={`flex items-center gap-2 text-xs font-bold ${i === 0 ? 'text-primary-600' : 'text-gray-400'}`}>
                                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                    {i + 1}
                                </span>
                                <span className="hidden sm:block">{label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-500" style={{ width: '33%' }} />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 space-y-8 animate-slide-in">
                    <div className="text-center border-b border-gray-100 pb-6">
                        <h2 className="text-lg font-bold text-gray-800">Detail Laporan</h2>
                        <p className="text-sm text-gray-500 mt-1">Lengkapi data di bawah ini dengan teliti.</p>
                    </div>

                    {/* Jenis Pelaporan */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Pelaporan</label>
                        <select
                            value={formData.jenisPelaporan}
                            onChange={(e) => updateField({ jenisPelaporan: e.target.value })}
                            className={`form-input bg-gray-50 focus:bg-white ${errors.jenisPelaporan ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        >
                            <option value="">Pilih jenis pelaporan</option>
                            {JENIS_PELAPORAN_LIST.map((j) => <option key={j}>{j}</option>)}
                        </select>
                        {errors.jenisPelaporan && <p className="text-red-600 text-xs mt-1">{errors.jenisPelaporan}</p>}
                    </div>

                    {/* Tanggal Penjualan & Setoran */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Penjualan</label>
                            <input
                                type="date" max={today} min="2026-04-01"
                                value={formData.tanggalPenjualan}
                                onChange={(e) => updateField({ tanggalPenjualan: e.target.value })}
                                className={`form-input ${errors.tanggalPenjualan ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                            />
                            {errors.tanggalPenjualan && <p className="text-red-600 text-xs mt-1">{errors.tanggalPenjualan}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Setoran</label>
                            <input
                                type="date" max={today} min="2026-04-01"
                                value={formData.tanggalSetoran}
                                onChange={(e) => updateField({ tanggalSetoran: e.target.value })}
                                className={`form-input ${errors.tanggalSetoran ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                            />
                            {errors.tanggalSetoran && <p className="text-red-600 text-xs mt-1">{errors.tanggalSetoran}</p>}
                        </div>
                    </div>

                    {/* Multi-tanggal (untuk 3x Seminggu / Pecahan Kecil) */}
                    {showMultiTanggal && (
                        <div className="space-y-4 bg-orange-50 p-4 rounded-lg border border-orange-100">
                            <label className="block text-sm font-bold text-orange-800">Tanggal Penjualan Tambahan</label>
                            <div className="space-y-3">
                                {formData.tanggalPenjualanTambahan.map((tgl, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <input
                                            type="date" max={today} min="2026-04-01"
                                            value={tgl}
                                            onChange={(e) => handleTanggalTambahanChange(idx, e.target.value)}
                                            className="form-input flex-1"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTanggalTambahan(idx)}
                                            className="flex-shrink-0 h-10 w-10 flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleAddTanggalTambahan}
                                className="text-sm font-medium text-white bg-green-500 hover:bg-green-600 flex items-center gap-1 py-2 px-4 rounded-lg shadow-sm transition-all transform hover:-translate-y-0.5"
                            >
                                <span className="material-symbols-outlined text-base">add</span> Tambah Tanggal
                            </button>
                        </div>
                    )}

                    {/* Metode Setoran */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Metode Setoran</label>
                        <select
                            value={formData.metodeSetoran}
                            onChange={(e) => updateField({ metodeSetoran: e.target.value })}
                            className={`form-input bg-gray-50 focus:bg-white ${errors.metodeSetoran ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        >
                            <option value="">Pilih metode setoran</option>
                            <option>Teller Bank</option>
                            <option>ATM BCA Menggunakan Deposit Card</option>
                            <option>Metode Setoran Lain</option>
                        </select>
                        {errors.metodeSetoran && <p className="text-red-600 text-xs mt-1">{errors.metodeSetoran}</p>}
                    </div>

                    {/* Metode Lain (conditional) */}
                    {formData.metodeSetoran === 'Metode Setoran Lain' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Metode Lain Yang Digunakan</label>
                            <input
                                type="text"
                                value={formData.metodeLain}
                                onChange={(e) => updateField({ metodeLain: e.target.value.toUpperCase() })}
                                placeholder="Contoh: TRANSFER ANTAR BANK"
                                className={`form-input ${errors.metodeLain ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                            />
                            {errors.metodeLain && <p className="text-red-600 text-xs mt-1">{errors.metodeLain}</p>}
                        </div>
                    )}

                    <div className="pt-4 border-t border-gray-100">
                        <button
                            type="submit"
                            className="w-full flex justify-center py-3.5 px-4 rounded-lg shadow-lg shadow-primary-500/30 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 transition-all transform hover:-translate-y-0.5"
                        >
                            Lanjut ke Detail <span className="material-symbols-outlined ml-2 text-base align-middle">arrow_forward</span>
                        </button>
                    </div>
                </form>

                <div className="mt-8 text-center text-xs text-gray-400">&copy; 2025 OSS Department, Apotek Alpro</div>
            </div>
        </UserLayout>
    );
}
