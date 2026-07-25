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
const MODEL_CHAT = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 12_000;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── System prompts ───────────────────────────────────────────────────────────

const ADMIN_SUMMARY_SYSTEM = `Anda adalah Senior Financial Analyst Apotek Alpro. Analisis data konsolidasi keuangan JSON ini.
Berikan analisis terstruktur dalam Bahasa Indonesia formal dengan format markdown rapi:

1. **Ringkasan Konsolidasi Penjualan & Setoran**:
   Rangkum Total Sales Xilnex (POS), Total Sales Manual, Total Potongan, dan Total Setoran secara tepat sesuai data JSON (scorecard_keseluruhan).
2. **Toko dengan Performa Terbaik & Sampel Cabang**:
   Sebutkan toko dari sampel data (performa_per_toko) yang memiliki sales tertinggi dan terendah atau potongan signifikan.
3. **Audit Anomali & Rekonsiliasi**:
   Sampaikan total selisih rekonsiliasi dan kasus anomali yang ada dari data JSON.
4. **Saran Strategis Singkat**:
   Berikan 2-3 langkah taktis perbaikan operasional/audit.`;

const BUKU_PANDUAN = `# 📖 Buku Panduan Resmi & SOP Operasional Aplikasi Setoran Harian Apotek Alpro V2.0

Dokumen ini adalah acuan resmi operasional Aplikasi Pelaporan Setoran Harian Apotek Alpro untuk seluruh peran pengguna: Toko (User), Area Manager (AM), dan Admin Finance.

---

## 🏬 1. PANDUAN ROLE TOKO / USER (KASIR APOTEK)

### A. Pengisian Formulir Laporan Setoran (3-Step Form)
- **Langkah 1 (Tanggal & Jenis)**: Masuk ke menu **Buat Laporan**. Pilih jenis pelaporan dari 10 kategori, tentukan tanggal penjualan, dan metode setoran.
  - **Fitur Multi-Tanggal**: Klik "+ Tambah Tanggal Penjualan" jika hendak melaporkan beberapa hari penjualan sekaligus. Sistem akan memisahkan baris laporan per tanggal secara otomatis.
- **Langkah 2 (Nominal & Upload Bukti)**: Input Total Penjualan Kasir, Potongan Admin (jika ada), dan Nominal Setoran. Unggah bukti foto struk ATM/transfer (maksimal 10 MB, format JPG/PNG/HEIC).
- **Langkah 3 (Verifikasi & Kirim)**: Periksa ringkasan kalkulasi otomatis (Penjualan - Potongan = Setoran), lalu klik **Kirim Laporan**.

### B. Pengajuan Koreksi Laporan (Salah Input / Salah Lapor / Edit / Memperbaiki Setoran)
- **Apa yang dilakukan jika salah input setoran / salah angka / salah foto / ingin mengedit / memperbaiki setoran yang telah dikirim?**:
  Toko TIDAK perlu panik atau menghubungi manual. Aplikasi memiliki fasilitas resmi **Koreksi Laporan**:
  1. Buka menu **Koreksi Laporan** di sidebar navigasi sebelah kiri.
  2. Cari tanggal laporan setoran yang mengalami salah input, lalu klik tombol **Ajukan Koreksi**.
  3. Masukkan angka nominal perbaikan, unggah bukti foto struk/transfer baru (jika ada), dan berikan penjelasan alasan koreksi secara jelas.
  4. Klik **Kirim Pengajuan Koreksi**. Pengajuan ini akan otomatis masuk ke antrean **Persetujuan Area Manager (AM)**.
  5. Toko akan menerima notifikasi lonceng & badge saat pengajuan koreksi disetujui atau ditolak oleh Area Manager.

### C. Troubleshooting Bank Toko
- Jika Finance menemukan dispute/selisih audit bank:
  1. Lonceng notifikasi & badge sidebar menu **Troubleshooting Bank** akan menyala.
  2. Buka menu **Troubleshooting Bank**, klik **Tanggapi Isu**.
  3. Tuliskan penjelasan cabang dan unggah foto bukti pendukung, lalu klik **Kirim Respon**.

---

## 👔 2. PANDUAN ROLE AREA MANAGER (AM)

### A. Dashboard Monitoring Wilayah
- **KPI Stat Cards**: Menampilkan Total Outlet Binaan, Persentase Outlet Patuh Setor, dan Total Nominal Setoran Wilayah.
- **Filter Jenis Pelaporan**: Memfilter laporan Normal, Selisih, hingga toko yang **"Belum Dilaporkan"** (untuk mendeteksi outlet yang belum lapor setoran).
- **Filter Kasus Khusus**: Menyaring toko dengan kendala Terblokir, Tertelan, Uang Kurang, atau Mesin ATM Rusak.

### B. Persetujuan Koreksi Laporan (Approval)
- Buka menu **Persetujuan Koreksi**.
- Bandingkan data awal vs data koreksi yang diajukan toko serta baca alasannya.
- Klik **Setujui (Approve)** atau **Tolak (Reject)** dengan menyertakan catatan revisi.

### C. Troubleshooting Bank Area Manager
- Buka menu **Troubleshooting Bank** (AM) untuk memantau isu bank di wilayahnya.
- Gunakan tombol **"Ingatkan Toko via WA"** untuk menyalin pesan pengingat otomatis dan menegur toko yang belum merespon.

---

## 💳 3. PANDUAN ROLE ADMIN FINANCE

### A. Dashboard Rekap & POS Auto-Sync
- **Matching POS Xilnex**: Data penjualan POS Xilnex disinkronkan otomatis dari Google Drive setiap hari via Edge Function (\`sync-pos-sales-from-drive\`).
- **Verifikasi & Export**: Memverifikasi kesesuaian setoran toko dengan mutasi bank dan mengunduh rekapitulasi ke Excel.

### B. Manajemen Troubleshooting Bank (Finance)
- Klik **+ Buat Isu Baru** untuk menerbitkan isu dispute bank bagi toko.
- Update status isu: **Need Info** (butuh respon toko), **In Progress** (diurus ke bank), **Resolved** (selesai).

---

## 📋 4. KATALOG 10 JENIS PELAPORAN SETORAN
1. **Normal (Harian)**: Setoran harian rutin 100% cocok tanpa selisih.
2. **Setoran 3x Seminggu**: Pelaporan setoran khusus bagi outlet dengan jadwal 3x seminggu.
3. **Setoran Uang Kurang**: Terdapat selisih minus (kalkulasi otomatis selisih & kolom alasan).
4. **Setoran Uang Lebih**: Terdapat selisih surplus fisik kasir.
5. **Deposit Card Terblokir (Salah PIN 3x)**: Input nomor kartu & KCP. **Otomatis mengirimkan Email Darurat ke Finance**.
6. **Deposit Card Tertelan Mesin ATM**: Input nomor mesin ATM & KCP. **Otomatis mengirimkan Email Darurat ke Finance**.
7. **Mesin ATM Rusak / Out of Service**: Pelaporan kendala ATM rusak/mati listrik di KCP.
8. **Setoran Gabungan (2 Hari / Libur)**: Pelaporan akumulasi penjualan libur menggunakan fitur Multi-Tanggal.
9. **Pencairan QRIS / EDC Belum Masuk Rekening**: Transaksi non-tunai yang belum masuk mutasi bank.
10. **Lain-lain (Kasus Khusus)**: Pelaporan kendala spesifik lainnya yang wajib dilengkapi penjelasan detail.

---

## 🔔 5. PUSAT NOTIFIKASI REAL-TIME & ALPRO ASSISTANT AI
- **Lonceng Header Popover**: Menampilkan pemberitahuan real-time (koreksi disetujui/ditolak, isu bank baru, respon toko).
- **Badge Sidebar**: Angka indikator oranye unread pada menu spesifik jika ada tindakan yang perlu direspon.
- **Alpro Assistant AI**: Chatbot berbasis Groq Llama-3 24/7 di kanan bawah Beranda yang hafal seluruh SOP V2.0 di atas.`;

const STRICT_SYSTEM_PROMPT = `Kamu adalah Asisten AI internal resmi Apotek Alpro (Alpro Assistant). Tugas utamamu adalah menjawab pertanyaan pengguna secara ramah, profesional, dan presisi.

ATURAN KETAT (ANTI-HALUSINASI):
1. Jawab pertanyaan pengguna HANYA berdasarkan informasi di dalam BUKU_PANDUAN V2.0 berikut.
2. DILARANG KERAS berhalusinasi, mengarang aturan, atau memberikan informasi di luar BUKU_PANDUAN V2.0 ini.
3. Jelaskan langkah-langkah secara urut dan jelas (Langkah 1, Langkah 2, dst.) jika pengguna bertanya tentang cara penggunaan fitur.
4. Sebutkan peran pengguna (Toko, Area Manager, atau Admin Finance) jika pertanyaan spesifik untuk peran tertentu.
5. Jika pengguna bertanya tentang informasi yang memang tidak tercantum dalam BUKU_PANDUAN, jawab secara jujur dan instruksikan pengguna untuk menghubungi tim Admin Finance atau Area Manager setempat.

BUKU_PANDUAN:
${BUKU_PANDUAN}`;

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
            content: `Data Laporan: ${dataString}`,
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
