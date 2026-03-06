/**
 * Service to handle Google Drive integrations by calling an Edge Function.
 */
import { supabase } from './supabaseClient'

export async function uploadToDrive(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase configuration.");
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/upload-to-drive`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${supabaseKey}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            // Edge Function sends { error: 'user friendly message' }
            throw new Error(data.error || `HTTP Error ${response.status}`);
        }

        return data.url;
    } catch (error) {
        console.error('Upload Error:', error);
        // Clean up the error message for the user if it's already a custom error
        const msg = error.message.replace('Gagal mengunggah file. ', '');
        throw new Error(msg);
    }
}
