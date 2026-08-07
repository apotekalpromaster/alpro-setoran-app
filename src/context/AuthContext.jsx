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
    const initialToken = getCachedItem('alpro_cached_token');

    const [user, setUser] = useState(initialUser);
    const [profile, setProfile] = useState(initialProfile);
    const [accessToken, setAccessToken] = useState(initialToken);
    const [loading, setLoading] = useState(false);
    // If BOTH cached items exist, mark authReady true immediately to prevent loading flicker
    const [authReady, setAuthReady] = useState(!!initialUser && !!initialProfile);

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

        // Safety fallback timeout (3s max) to ensure authReady is ALWAYS true
        const safetyTimer = setTimeout(() => {
            if (isMounted) {
                setLoading(false);
                setAuthReady(true);
            }
        }, 3000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;

            const currentUser = session?.user ?? null;

            if (currentUser) {
                setUser(currentUser);
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser)); } catch (e) {}

                const cachedProfile = getCachedItem(PROFILE_CACHE_KEY);
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || cachedProfile?.id !== currentUser.id) {
                    await fetchProfile(currentUser.id);
                } else {
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
            clearTimeout(safetyTimer);
        });

        return () => {
            isMounted = false;
            clearTimeout(safetyTimer);
            subscription.unsubscribe();
        };
    }, []);

    // Background session auto-refresh when tab becomes visible after being idle
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    // Proactively attempt session refresh to clear dormant sockets / expired tokens
                    const { data: { session }, error: refreshErr } = await supabase.auth.refreshSession();
                    if (session?.user && !refreshErr) {
                        setUser(session.user);
                        const cachedProfile = getCachedItem(PROFILE_CACHE_KEY);
                        if (!cachedProfile || cachedProfile.id !== session.user.id) {
                            await fetchProfile(session.user.id);
                        }
                    } else {
                        // Fallback check existing session
                        const { data: { session: existingSession } } = await supabase.auth.getSession();
                        if (existingSession?.user) {
                            setUser(existingSession.user);
                        } else {
                            console.warn('Session expired during idle. Forcing logout.');
                            setUser(null);
                            setProfile(null);
                            try {
                                localStorage.removeItem(USER_CACHE_KEY);
                                localStorage.removeItem(PROFILE_CACHE_KEY);
                            } catch (e) {}
                            setAuthReady(true);
                        }
                    }
                } catch (e) {
                    console.warn('Background session refresh failed:', e.message);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const signIn = async (email, password) => {
        setLoading(true);
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (!res.data?.user) {
            setLoading(false);
            setAuthReady(true);
        }
        return res;
    };

    const signOut = async () => {
        // Instantly clear local state & cache so UI updates immediately (0ms delay)
        setUser(null);
        setProfile(null);
        setLoading(false);
        setAuthReady(true);
        try {
            localStorage.removeItem(USER_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) {}

        // Race supabase.auth.signOut() with a 1.5s timeout so logout NEVER hangs
        try {
            await Promise.race([
                supabase.auth.signOut(),
                new Promise((resolve) => setTimeout(resolve, 1500))
            ]);
        } catch (err) {
            console.warn('SignOut network call completed with fallback:', err.message);
        }

        return { error: null };
    };

    return (
        <AuthContext.Provider value={{ user, profile, accessToken, loading, authReady, signIn, signOut, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    return useContext(AuthContext);
};
