import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100">
                <div className="flex items-center gap-2 text-primary-600">
                    <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
                    <span className="font-medium">Memuat...</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && allowedRoles.length > 0) {
        const userRole = (profile?.role || '').toString().trim().toLowerCase();
        const hasPermission = allowedRoles.some(
            (role) => role.toString().trim().toLowerCase() === userRole
        );

        if (!hasPermission) {
            console.warn(`[ProtectedRoute] Access denied for path. User role: "${profile?.role}", Allowed:`, allowedRoles);
            return <Navigate to="/" replace />;
        }
    }

    return children;
}
