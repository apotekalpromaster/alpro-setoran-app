import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Utility helper to execute Supabase database queries with a mandatory safety timeout.
 * Prevents UI from being stuck in skeleton loading state if network or token refresh stalls.
 * @param {Promise} queryPromise - Supabase query promise (e.g. supabase.from(...).select(...))
 * @param {number} timeoutMs - Max wait time in milliseconds (default: 6000ms)
 * @returns {Promise} Resolves with Supabase query response or throws timeout error
 */
export async function safeSupabaseQuery(queryPromise, timeoutMs = 6000) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error('Waktu permintaan data habis (Timeout). Silakan periksa koneksi internet Anda.'));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([queryPromise, timeoutPromise]);
        clearTimeout(timer);
        return result;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}
