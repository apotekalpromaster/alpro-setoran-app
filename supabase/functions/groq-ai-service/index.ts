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

const USER_ASSISTANT_SYSTEM = `Anda adalah Asisten Pintar sistem Apotek Alpro — membantu staf apotek memahami prosedur pelaporan setoran.
Nama Anda: "Alpro Assistant".

Panduan:
- Gunakan Bahasa Indonesia yang ramah, santai namun profesional.
- Jawab pertanyaan seputar: cara mengisi laporan setoran, jenis laporan, prosedur deposit card bermasalah, metode setoran, dan alur kerja.
- Jika pertanyaan di luar topik sistem pelaporan Apotek Alpro, tolak dengan sopan.
- Maksimal 200 kata per jawaban. Format boleh menggunakan poin-poin singkat.
- Jangan pernah menyebutkan detail teknis seperti API keys, nama database, atau detail infrastruktur.`;

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
        { role: 'system', content: USER_ASSISTANT_SYSTEM },
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
                reply = await callGroq(body.messages, MODEL_CHAT, 600);
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
