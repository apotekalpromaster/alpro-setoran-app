/**
 * Service to handle Google Drive integrations with 12s AbortController timeout & Base64 Fallback.
 */
import { supabase } from './supabaseClient'

export async function uploadToDrive(file) {
    if (!file) return null;
    let controller = null;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase configuration.");
        }

        controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try { controller.abort(); } catch (e) {}
        }, 12000);

        const response = await fetch(`${supabaseUrl}/functions/v1/upload-to-drive`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${supabaseKey}`,
            },
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP Error ${response.status}`);
        }

        return data.url;
    } catch (error) {
        console.warn('Upload to Drive failed or timed out, triggering Base64 fallback:', error.message);
        // Fallback: Convert file to Base64 data URL so user submission is NEVER blocked!
        if (file && typeof window !== 'undefined' && window.FileReader) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });
        }
        return null;
    }
}