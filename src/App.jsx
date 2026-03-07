import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FormWizardProvider } from './context/FormWizardContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import BerandaPage from './pages/BerandaPage';
import AdminBerandaPage from './pages/AdminBerandaPage';

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

// Phase 8
import PengaturanPage from './pages/PengaturanPage';
import BantuanPage from './pages/BantuanPage';
import BantuanAdminPage from './pages/BantuanAdminPage';

function AppRoutes() {
  const { user, profile } = useAuth();

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Finance';

  return (
    <Routes>
      {/* Login / Root */}
      <Route
        path="/"
        element={
          user
            ? <Navigate to={isAdmin ? '/admin' : '/beranda'} replace />
            : <LoginPage />
        }
      />

      {/* ===== USER ROUTES ===== */}
      <Route
        path="/beranda"
        element={
          <ProtectedRoute allowedRoles={['User']}>
            <BerandaPage />
          </ProtectedRoute>
        }
      />

      {/* Wizard Form — wrap the three steps in a single FormWizardProvider
          so state (FormWizardContext) is shared and persists across navigation */}
      <Route
        path="/setoran/*"
        element={
          <ProtectedRoute allowedRoles={['User']}>
            <FormWizardProvider>
              <Routes>
                <Route index element={<SetoranPage />} />
                <Route path="detail" element={<DetailSetoranPage />} />
                <Route path="ringkasan" element={<RingkasanPage />} />
                <Route path="konfirmasi" element={<KonfirmasiPage />} />
              </Routes>
            </FormWizardProvider>
          </ProtectedRoute>
        }
      />

      {/* ===== RIWAYAT ROUTES ===== */}
      <Route
        path="/riwayat"
        element={
          <ProtectedRoute allowedRoles={['User']}>
            <RiwayatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/riwayat/:id"
        element={
          <ProtectedRoute allowedRoles={['User']}>
            <DetailRiwayatPage />
          </ProtectedRoute>
        }
      />

      {/* ===== ADMIN / FINANCE ROUTES ===== */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['Admin', 'Finance']}>
            <AdminBerandaPage />
          </ProtectedRoute>
        }
      />
      <Route path="/admin/laporan" element={<ProtectedRoute allowedRoles={['Admin', 'Finance']}><ManajemenLaporanPage /></ProtectedRoute>} />
      <Route path="/admin/analitik" element={<ProtectedRoute allowedRoles={['Admin', 'Finance']}><LaporanAnalitikPage /></ProtectedRoute>} />
      <Route path="/admin/pending" element={<ProtectedRoute allowedRoles={['Admin', 'Finance']}><LaporanPendingPage /></ProtectedRoute>} />
      <Route path="/admin/bantuan" element={<ProtectedRoute allowedRoles={['Admin', 'Finance']}><BantuanAdminPage /></ProtectedRoute>} />

      {/* ===== SHARED ROUTES (User + Admin) ===== */}
      <Route
        path="/pengaturan"
        element={
          <ProtectedRoute allowedRoles={['User', 'Admin', 'Finance']}>
            <PengaturanPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bantuan"
        element={
          <ProtectedRoute allowedRoles={['User', 'Admin', 'Finance']}>
            <BantuanPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
