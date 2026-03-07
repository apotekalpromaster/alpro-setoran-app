import { supabase } from './supabaseClient';

/**
 * Mengirim riwayat percakapan ke Edge Function 'groq-ai-service'
 * Edge Function menyimpan token GROQ API dengan aman.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} username (opsional)
 */
export async function sendChatMessages(messages, username = '') {
    try {
        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'chat_history', messages, username }
        });

        if (error) throw error;

        // Asumsi Edge function mengembalikan { reply: "teks balasan..." }
        return data.reply || "Maaf, AI tidak memberikan respon.";
    } catch (error) {
        console.error("Assistant Error:", error);
        return "Layanan AI sedang sibuk atau terjadi kesalahan jaringan.";
    }
}

export async function askAssistant(userQuery, username) {
    return sendChatMessages([{ role: 'user', content: userQuery }], username);
}

export async function generateAnalyticsSummary(tableData) {
    try {
        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'admin_summary', prompt: JSON.stringify(tableData) }
        });

        if (error) throw error;
        return data.reply || "Gagal membuat analisis AI.";
    } catch (error) {
        console.error("Admin Summary Error:", error);
        return "Gagal mendapatkan analisis AI. Edge function mungkin tidak merespons.";
    }
}
