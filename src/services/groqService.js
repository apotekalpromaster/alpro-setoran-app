import { supabase } from './supabaseClient';

/**
 * Mengirim riwayat percakapan ke Edge Function 'groq-ai-service'
 * Edge Function menyimpan token GROQ API dengan aman.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} username (opsional)
 */
export async function sendChatMessages(messages, username = '') {
    try {
        // Abort controller dengan batas waktu 12 detik agar UI tidak stuck
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'chat_history', messages, username },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (error) throw error;

        return data?.reply || "Maaf, Asisten AI tidak memberikan respon.";
    } catch (error) {
        console.error("Assistant Error:", error);
        if (error.name === 'AbortError') {
            return "⚠️ Koneksi AI mengalami batas waktu (timeout). Silakan coba kirim ulang pertanyaan Anda.";
        }
        return "⚠️ Layanan AI sedang tidak dapat dijangkau atau sedang sibuk. Silakan coba beberapa saat lagi.";
    }
}

export async function askAssistant(userQuery, username) {
    return sendChatMessages([{ role: 'user', content: userQuery }], username);
}

export async function generateAnalyticsSummary(tableData) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const { data, error } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'admin_summary', prompt: JSON.stringify(tableData) },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (error) throw error;
        return data?.reply || "Gagal membuat analisis AI.";
    } catch (error) {
        console.error("Admin Summary Error:", error);
        return "Gagal mendapatkan analisis AI. Edge function mungkin tidak merespons.";
    }
}
