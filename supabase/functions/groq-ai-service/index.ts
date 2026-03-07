// Supabase Edge Function: groq-ai-service
// 🔐 SECURITY: GROQ_API_KEY is stored ONLY in Supabase Secrets.
//    It is NEVER exposed to the client/frontend.
//
// Supports two 'action' modes:
//   'admin_summary'  — financial data analysis (llama-3.3-70b-versatile)
//   'chat'           — smart assistant for users (llama-3.1-8b-instant)
//
// Required Supabase Secrets:
//   GROQ_API_KEY — from https://console.groq.com/

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ─── Constants ────────────────────────────────────────────────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_ADMIN = 'llama-3.3-70b-versatile';
const MODEL_CHAT = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 30_000;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── System prompts ───────────────────────────────────────────────────────────

const ADMIN_SUMMARY_SYSTEM = `Anda adalah analis keuangan senior untuk jaringan apotek "Apotek Alpro" di Indonesia.
Tugas Anda adalah menganalisis data laporan setoran harian dari seluruh cabang dan memberikan insight yang tajam, ringkas, dan actionable.

Panduan respons:
- Gunakan Bahasa Indonesia formal namun mudah dipahami.
- Format output menggunakan Markdown (header ##, bold, list).
- Fokus pada: total nominal, cabang berperforma tinggi/rendah, selisih signifikan, anomali, dan rekomendasi.
- Sertakan 1–2 rekomendasi concrete berdasarkan data.
- Maksimal 350 kata. Tidak perlu salam pembuka atau penutup.`;

const SOP_CONTEXT = `
PANDUAN APLIKASI PELAPORAN SETORAN HARIAN APOTEK ALPRO:
1. Cara Login: Gunakan username (bukan email). Kata sandi default diberikan oleh Admin.
2. Cara Lapor Setoran: Buka menu "Lapor Setoran". Isi nominal setoran, pilih metode, tambahkan potongan (jika ada), lalu lapor. WAJIB melampirkan foto struk EDC/transfer/resi bukti setor bank yang valid.
3. Metode Setoran: Bisa melalui Transfer Bank, Setor Tunai via Teller, atau Mesin CDM. Jika menggunakan Deposit Card dan mesin bermasalah/kartu tertelan, laporkan masalah segera ke tim Finance dan lampirkan bukti foto kendalanya.
4. Logika "Hari Belum Lapor" (Tunggakan/Pending): Sistem memantau selisih hari kalender batas setoran. Hari Minggu DIKECUALIKAN dari kewajiban hitungan "Hari Kerja" pelaporan. Apabila terlambat, sistem Admin akan mendeteksinya.
5. Admin/Finance (Monitoring & Analitik): Admin bisa melihat grafik performa cabang, memonitor cabang yang lambat setor via "Laporan Pending", mengirim Email Reminder masal untuk tagihan tunggakan, dan memfilter riwayat menggunakan "Tanggal Sales" atau nama KCP (Apotek) spesifik untuk pencocokan.
`;

const STRICT_SYSTEM_PROMPT = `Kamu adalah Asisten AI internal Apotek Alpro. Tugas utamamu HANYA menjawab pertanyaan seputar penggunaan aplikasi Pelaporan Setoran Harian berdasarkan panduan berikut: 
${SOP_CONTEXT}
Aturan mutlak: DILARANG menebak-nebak atau memberikan informasi di luar panduan. Jika user bertanya hal di luar sistem ini, tolak dengan sopan dan arahkan kembali ke topik aplikasi. Jawab senatural mungkin, tidak kaku, bahasa Indonesia ramah.`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface RequestBody {
    action: 'admin_summary' | 'chat' | 'chat_history';
    prompt?: string;
    messages?: GroqMessage[];
    username?: string;
}

interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// ─── Core API call ────────────────────────────────────────────────────────────
async function callGroq(messages: GroqMessage[], model: string, maxTokens = 512): Promise<string> {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi di Supabase Secrets.');

    const res = await Promise.race([
        fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages,
                max_tokens: maxTokens,
                temperature: 0.7,
            }),
        }),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Groq API timeout — coba lagi dalam beberapa saat.')), TIMEOUT_MS)
        ),
    ]);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq tidak mengembalikan konten. Coba lagi.');

    return content as string;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleAdminSummary(dataString: string): Promise<string> {
    if (!dataString || dataString.length < 10) {
        return 'Tidak ada data yang cukup untuk dianalisis.';
    }

    const messages: GroqMessage[] = [
        { role: 'system', content: ADMIN_SUMMARY_SYSTEM },
        {
            role: 'user',
            content: `Berikut adalah data laporan setoran dari semua cabang apotek dalam periode ini (format JSON):\n\n\`\`\`json\n${dataString}\n\`\`\`\n\nBerikan analisis komprehensif berdasarkan data di atas.`,
        },
    ];

    return callGroq(messages, MODEL_ADMIN, 600);
}

async function handleChat(userMessage: string, username?: string): Promise<string> {
    if (!userMessage?.trim()) return 'Pertanyaan Anda kosong. Silakan ketik pertanyaan Anda.';

    const greeting = username ? `Pengguna bernama ${username} bertanya: ` : '';

    const messages: GroqMessage[] = [
        { role: 'system', content: STRICT_SYSTEM_PROMPT as string },
        { role: 'user', content: `${greeting}${userMessage}` },
    ];

    return callGroq(messages, MODEL_CHAT, 300);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

    try {
        const body = (await req.json()) as RequestBody;

        if (!body?.action) {
            return new Response(JSON.stringify({ error: 'Parameter action diperlukan.' }), {
                status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        let reply: string;

        switch (body.action) {
            case 'admin_summary':
                reply = await handleAdminSummary(body.prompt || '');
                break;
            case 'chat':
                reply = await handleChat(body.prompt || '', body.username);
                break;
            case 'chat_history':
                if (!body.messages || !Array.isArray(body.messages)) {
                    throw new Error("Parameter messages (array) diperlukan untuk aksi chat_history.");
                }

                // SECURITY: Remove any user-injected system prompts to prevent overrides
                const safeHistory = body.messages.filter(msg => msg.role !== 'system');

                // Enforce our strict system prompt at index 0
                const lockedMessages: GroqMessage[] = [
                    { role: 'system', content: STRICT_SYSTEM_PROMPT },
                    ...safeHistory
                ];

                reply = await callGroq(lockedMessages, MODEL_CHAT, 600);
                break;
            default:
                return new Response(JSON.stringify({ error: `Action '${body.action}' tidak dikenali.` }), {
                    status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
                });
        }

        return new Response(JSON.stringify({ reply }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
        console.error('[groq-ai-service] Error:', message);

        const isTimeout = message.includes('timeout');
        const userMsg = isTimeout
            ? '⏱ Layanan AI sedang sibuk atau koneksi lambat. Coba lagi dalam beberapa detik.'
            : `Layanan AI mengalami kendala: ${message}`;

        return new Response(JSON.stringify({ error: userMsg }), {
            status: 503,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
});
