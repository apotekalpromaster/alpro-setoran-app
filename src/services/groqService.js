import { supabase } from './supabaseClient'

/**
 * Calls the Supabase Edge Function 'groq-ai-service'
 * The Edge Function securely holds the GROQ_API_KEY.
 */

export async function askAssistant(userQuery, username) {
    try {
        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'chat', prompt: userQuery, username }
        });

        if (error) throw error;
        return data.reply || "Maaf, AI tidak memberikan respon.";
    } catch (error) {
        console.error("Assistant Error:", error);
        return "Layanan AI sedang sibuk atau terjadi kesalahan.";
    }
}

export async function getAdminSummary(dataString) {
    try {
        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'admin_summary', prompt: dataString }
        });

        if (error) throw error;
        return data.reply || "Gagal membuat summary.";
    } catch (error) {
        console.error("Admin Summary Error:", error);
        return "Gagal mendapatkan analisis AI.";
    }
}
