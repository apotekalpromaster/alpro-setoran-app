import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();
const PROFILE_CACHE_KEY = 'alpro_cached_profile';
const USER_CACHE_KEY = 'alpro_cached_user';

function getCachedItem(key) {
    try {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    } catch (e) {
        return null;
    }
}

export function AuthProvider({ children }) {
    const initialUser = getCachedItem(USER_CACHE_KEY);
    const initialProfile = getCachedItem(PROFILE_CACHE_KEY);

    const [user, setUser] = useState(initialUser);
    const [profile, setProfile] = useState(initialProfile);
    const [loading, setLoading] = useState(true);
    const [authReady, setAuthReady] = useState(false);

    const isFetchingProfile = useRef(false);

    const fetchProfile = async (userId) => {
        if (isFetchingProfile.current) return null;
        isFetchingProfile.current = true;
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            setProfile(data);
            try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
            return data;
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            return null;
        } finally {
            isFetchingProfile.current = false;
            setLoading(false);
            setAuthReady(true);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;

            const currentUser = session?.user ?? null;

            if (currentUser) {
                setUser(currentUser);
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser)); } catch (e) {}

                const cachedProfileId = getCachedItem(PROFILE_CACHE_KEY)?.id;
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || cachedProfileId !== currentUser.id) {
                    await fetchProfile(currentUser.id);
                } else {
                    // Profile already in cache for same user - just mark ready
                    setLoading(false);
                    setAuthReady(true);
                }
            } else {
                setUser(null);
                setProfile(null);
                try {
                    localStorage.removeItem(USER_CACHE_KEY);
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                } catch (e) {}
                setLoading(false);
                setAuthReady(true);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (email, password) => {
        setLoading(true);
        setAuthReady(false);
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (!res.data?.user) {
            setLoading(false);
            setAuthReady(true);
        }
        return res;
    };

    const signOut = async () => {
        setLoading(true);
        setAuthReady(false);
        setProfile(null);
        setUser(null);
        try {
            localStorage.removeItem(USER_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) {}
        const res = await supabase.auth.signOut();
        setLoading(false);
        setAuthReady(true);
        return res;
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, authReady, signIn, signOut, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    return useContext(AuthContext);
};
