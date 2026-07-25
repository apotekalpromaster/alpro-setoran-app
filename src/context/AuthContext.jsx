import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId, isInitial = false) => {
        try {
            // Set global loading to true ONLY if initial boot or profile is not available yet
            if (isInitial || !profile) {
                setLoading(true);
            }
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            setProfile(data);
            return data;
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            if (isInitial || !profile) {
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
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            setUser(session?.user ?? null);
            if (session?.user) {
                // Background refresh token / tab focus: silent update without toggling global loading
                const isInitial = (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && !profile;
                await fetchProfile(session.user.id, isInitial);
            } else {
                setProfile(null);
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
