import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FormWizardProvider } from './context/FormWizardContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import BerandaPage from './pages/BerandaPage';
import AdminBerandaPage from './pages/AdminBerandaPage';
import AreaManagerDashboardPage from './pages/AreaManagerDashboardPage';

// Wizard
import SetoranPage from './pages/SetoranPage';
import DetailSetoranPage from './pages/DetailSetoranPage';
import RingkasanPage from './pages/RingkasanPage';
import KonfirmasiPage from './pages/KonfirmasiPage';

// Phase 5
import RiwayatPage from './pages/RiwayatPage';
import DetailRiwayatPage from './pages/DetailRiwayatPage';

// Phase 6
import ManajemenLaporanPage from './pages/ManajemenLaporanPage';
import LaporanAnalitikPage from './pages/LaporanAnalitikPage';
import LaporanPendingPage from './pages/LaporanPendingPage';
import LaporanBackdatePage from './pages/LaporanBackdatePage';

// Phase 9 (Improvement V2)
import RekonsiliasiPOSPage from './pages/RekonsiliasiPOSPage';
import RekonsiliasiBankPage from './pages/RekonsiliasiBankPage';
import KoreksiLaporanPage from './pages/KoreksiLaporanPage';
import AreaManagerKoreksiApprovalPage from './pages/AreaManagerKoreksiApprovalPage';
import AreaManagerTroubleshootingPage from './pages/AreaManagerTroubleshootingPage';
import TroubleshootingTokoPage from './pages/TroubleshootingTokoPage';
import TroubleshootingFinancePage from './pages/TroubleshootingFinancePage';

// Phase 8
import PengaturanPage from './pages/PengaturanPage';
import BantuanPage from './pages/BantuanPage';

function RootRedirect() {
  const { user, profile, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 font-sans">
        <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
          <span className="material-symbols-outlined animate-spin text-4xl text-amber-500">sync</span>
          <span className="text-sm font-semibold text-gray-700">Mengalihkan...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = (profile?.role || '').toString().trim().toLowerCase();

  if (userRole === 'admin' || userRole === 'finance') {
    return <Navigate to="/admin/beranda" replace />;
  }

  if (userRole === 'areamanager') {
    return <Navigate to="/areamanager/dashboard" replace />;
  }

  return <Navigate to="/beranda" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <FormWizardProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* ===== USER / CABANG ROUTES ===== */}
          <Route
            path="/beranda"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <BerandaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setoran"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <SetoranPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setoran/detail"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <DetailSetoranPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setoran/ringkasan"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <RingkasanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setoran/konfirmasi"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <KonfirmasiPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/riwayat"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <RiwayatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/koreksi"
            element={
              <ProtectedRoute allowedRoles={['User', 'AreaManager']}>
                <KoreksiLaporanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/troubleshooting"
            element={
              <ProtectedRoute allowedRoles={['User']}>
                <TroubleshootingTokoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/riwayat/:id"
            element={
              <ProtectedRoute allowedRoles={['User', 'Admin', 'Finance', 'AreaManager']}>
                <DetailRiwayatPage />
              </ProtectedRoute>
            }
          />

          {/* ===== AREA MANAGER ROUTES ===== */}
          <Route
            path="/areamanager/dashboard"
            element={
              <ProtectedRoute allowedRoles={['AreaManager']}>
                <AreaManagerDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/areamanager/koreksi-approval"
            element={
              <ProtectedRoute allowedRoles={['AreaManager']}>
                <AreaManagerKoreksiApprovalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/areamanager/troubleshooting"
            element={
              <ProtectedRoute allowedRoles={['AreaManager']}>
                <AreaManagerTroubleshootingPage />
              </ProtectedRoute>
            }
          />

          {/* ===== ADMIN / FINANCE ROUTES ===== */}
          <Route
            path="/admin/beranda"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <AdminBerandaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/laporan"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <ManajemenLaporanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/analitik"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <LaporanAnalitikPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pending"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <LaporanPendingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/backdate"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <LaporanBackdatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rekonsiliasi"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <RekonsiliasiPOSPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rekonsiliasi-bank"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <RekonsiliasiBankPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/troubleshooting"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
                <TroubleshootingFinancePage />
              </ProtectedRoute>
            }
          />

          {/* ===== SHARED / GLOBAL ROUTES ===== */}
          <Route
            path="/pengaturan"
            element={
              <ProtectedRoute allowedRoles={['User', 'Admin', 'Finance', 'AreaManager']}>
                <PengaturanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bantuan"
            element={
              <ProtectedRoute allowedRoles={['User', 'Admin', 'Finance', 'AreaManager']}>
                <BantuanPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FormWizardProvider>
    </NotificationProvider>
  </AuthProvider>
);
}
