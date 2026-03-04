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
        return <Navigate to="/" replace />;
    }

    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/" replace />; // Or to a 'Not Authorized' page
    }

    return children;
}
