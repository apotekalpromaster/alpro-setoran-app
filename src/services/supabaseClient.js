import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        lock: async (name, acquireTimeout, fn) => {
            return await fn();
        },
    }
});

/**
 * Utility helper to execute Supabase database queries with a mandatory safety timeout.
 * Converts Supabase Postgrest thenables into native JavaScript Promises.
 * Prevents UI from being stuck in skeleton loading state if network or token refresh stalls.
 * @param {Promise|Object} queryPromise - Supabase query promise or builder (e.g. supabase.from(...).select(...))
 * @param {number} timeoutMs - Max wait time in milliseconds (default: 6000ms)
 * @returns {Promise} Resolves with Supabase query response or throws timeout error
 */
export async function safeSupabaseQuery(queryPromise, timeoutMs = 30000) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error('Waktu permintaan data habis (Timeout). Silakan refresh/reload halaman.'));
        }, timeoutMs);
    });

    try {
        const actualPromise = Promise.resolve(queryPromise);
        const result = await Promise.race([actualPromise, timeoutPromise]);
        clearTimeout(timer);
        return result;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

/**
 * Resolves a fresh, non-expired Supabase JWT access token.
 * Automatically triggers session refresh if current token is expired or expiring soon (< 60s).
 */
export async function getFreshAccessToken() {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
            const expiresAt = sessionData.session.expires_at;
            const nowSec = Math.floor(Date.now() / 1000);
            if (!expiresAt || expiresAt - nowSec > 60) {
                return sessionData.session.access_token;
            }
        }

        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session?.access_token) {
            return refreshData.session.access_token;
        }
    } catch (err) {
        console.warn('getFreshAccessToken warning:', err);
    }

    if (typeof localStorage !== 'undefined') {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('-auth-token')) {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (parsed?.access_token) return parsed.access_token;
                }
            }
        } catch (e) {}
    }

    return null;
}
