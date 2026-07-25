import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();
const PROFILE_CACHE_KEY = 'alpro_cached_profile';
const USER_CACHE_KEY = 'alpro_cached_user';

export function AuthProvider({ children }) {
    const getCachedItem = (key) => {
        try {
            const cached = localStorage.getItem(key);
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    };

    const initialUser = getCachedItem(USER_CACHE_KEY);
    const initialProfile = getCachedItem(PROFILE_CACHE_KEY);

    const [user, setUser] = useState(initialUser);
    const [profile, setProfile] = useState(initialProfile);
    // If both user and profile are in cache, initial loading is false! Otherwise true until session resolves.
    const [loading, setLoading] = useState(!(initialUser && initialProfile));

    const fetchProfile = async (userId, isInitial = false) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            setProfile(data);
            try {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
            } catch (e) {}
            return data;
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!isMounted) return;
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (currentUser) {
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser)); } catch (e) {}
                fetchProfile(currentUser.id, false);
            } else {
                setUser(null);
                setProfile(null);
                try {
                    localStorage.removeItem(USER_CACHE_KEY);
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                } catch (e) {}
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (currentUser) {
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser)); } catch (e) {}
                await fetchProfile(currentUser.id, false);
            } else {
                setUser(null);
                setProfile(null);
                try {
                    localStorage.removeItem(USER_CACHE_KEY);
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                } catch (e) {}
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
            setUser(res.data.user);
            try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.data.user)); } catch (e) {}
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
        try {
            localStorage.removeItem(USER_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) {}
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
