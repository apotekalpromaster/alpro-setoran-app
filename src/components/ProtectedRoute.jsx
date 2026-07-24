import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, profile, loading } = useAuth();

    // If session or profile is still loading, show loading spinner
    if (loading || (user && !profile)) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100 font-sans">
                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <span className="material-symbols-outlined animate-spin text-4xl text-amber-500">sync</span>
                    <span className="text-sm font-semibold text-gray-700">Memuat profil pengguna...</span>
                </div>
            </div>
        );
    }

    // If no authenticated user, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Role-based authorization check (case-insensitive)
    if (allowedRoles && allowedRoles.length > 0) {
        const userRole = (profile?.role || '').toString().trim().toLowerCase();
        const hasPermission = allowedRoles.some(
            (role) => role.toString().trim().toLowerCase() === userRole
        );

        if (!hasPermission) {
            console.warn(`[ProtectedRoute] Access denied. Role "${profile?.role}" is not allowed for this route.`);
            return <Navigate to="/" replace />;
        }
    }

    return children;
}
