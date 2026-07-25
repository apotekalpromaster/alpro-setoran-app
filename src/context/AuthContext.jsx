import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();
const PROFILE_CACHE_KEY = 'alpro_cached_profile';

export function AuthProvider({ children }) {
    // Read initial profile from localStorage cache synchronously
    const getInitialProfile = () => {
        try {
            const cached = localStorage.getItem(PROFILE_CACHE_KEY);
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    };

    const initialProfile = getInitialProfile();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(initialProfile);
    // If profile is already cached in localStorage, start loading = false immediately!
    const [loading, setLoading] = useState(!initialProfile);

    const fetchProfile = async (userId, isInitial = false) => {
        try {
            // Set global loading to true ONLY if initial boot and profile is not cached yet
            if ((isInitial && !initialProfile) || (!profile && !initialProfile)) {
                setLoading(true);
            }
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            setProfile(data);
            try {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn('Failed to cache profile in localStorage:', e);
            }
            return data;
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            if (isInitial && !initialProfile) {
                setProfile(null);
            }
            return null;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!isMounted) return;
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id, true);
            } else {
                setProfile(null);
                try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            setUser(session?.user ?? null);
            if (session?.user) {
                const isInitial = (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && !profile && !initialProfile;
                await fetchProfile(session.user.id, isInitial);
            } else {
                setProfile(null);
                try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (email, password) => {
        setLoading(true);
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.data?.user) {
            await fetchProfile(res.data.user.id, true);
        } else {
            setLoading(false);
        }
        return res;
    };

    const signOut = async () => {
        setLoading(true);
        setProfile(null);
        setUser(null);
        try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
        const res = await supabase.auth.signOut();
        setLoading(false);
        return res;
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    return useContext(AuthContext);
};
