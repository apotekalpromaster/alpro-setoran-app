// Supabase Edge Function: upload-to-drive
// Receives a multipart/form-data request with a 'file' field,
// authenticates to Google Drive via OAuth2 Refresh Token,
// and uploads the file to a configured Drive folder.
//
// Required Supabase Secrets:
//   GOOGLE_CLIENT_ID             — 
//   GOOGLE_CLIENT_SECRET         — 
//   GOOGLE_REFRESH_TOKEN         — 
//   GOOGLE_DRIVE_FOLDER_ID       — 

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 40_000; // 40 s — Allows larger files before Supabase 50s limit hits

// ─── CORS headers ────────────────────────────────────────────────────────────
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Exchange OAuth2 refresh token for a short-lived Google access token */
async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    return json.access_token as string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    // Preflight
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

    try {
        // 1) Parse the incoming multipart form
        const form = await req.formData();
        const file = form.get('file') as File | null;

        if (!file) {
            return new Response(JSON.stringify({ error: 'No file provided' }), {
                status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        // Removed size validations as per user request to allow flexibility

        // 2) Load OAuth2 credentials from Supabase secret
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
        const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');

        if (!clientId || !clientSecret || !refreshToken || !folderId) {
            throw new Error('Konfigurasi Google OAuth (Client ID, Secret, Refresh Token) atau Folder ID tidak lengkap di secrets.');
        }

        // 3) Get access token (with timeout guard)
        const accessToken = await Promise.race([
            getAccessToken(clientId, clientSecret, refreshToken),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Autentikasi Google timeout. Coba lagi.')), 10_000)
            ),
        ]);

        // 4) Build multipart body for Google Drive resumable upload
        const metadata = JSON.stringify({ name: file.name, parents: [folderId] });
        const fileBytes = await file.arrayBuffer();

        const boundary = `--boundary_${Date.now()}`;
        const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
        const filePart = `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
        const endPart = `\r\n--${boundary}--`;

        const encoder = new TextEncoder();
        const body = new Uint8Array([
            ...encoder.encode(metaPart),
            ...encoder.encode(filePart),
            ...new Uint8Array(fileBytes),
            ...encoder.encode(endPart),
        ]);

        // 5) Upload to Drive (timeout-guarded)
        const uploadRes = await Promise.race([
            fetch(DRIVE_UPLOAD_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Upload ke Google Drive timeout. Cek koneksi dan coba lagi.')), TIMEOUT_MS)
            ),
        ]);

        if (!uploadRes.ok) {
            const text = await uploadRes.text();
            throw new Error(`Drive upload gagal (${uploadRes.status}): ${text}`);
        }

        const driveData = await uploadRes.json();
        const fileId = driveData.id as string;

        // 6) Make file publicly readable (so URL works without auth)
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        });

        const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=view`;

        return new Response(JSON.stringify({ url: publicUrl, fileId }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
        console.error('[upload-to-drive] Error:', message);

        // Classify user-facing error
        const isTimeout = message.includes('timeout');
        const isConfig = message.includes('secret tidak dikonfigurasi');
        const userFriendly = isTimeout
            ? '⏱ Koneksi ke Google Drive timeout. Jaringan mungkin sedang lambat. Coba lagi dalam beberapa saat.'
            : isConfig
                ? '⚙️  Konfigurasi server belum lengkap. Hubungi administrator.'
                : `Gagal mengunggah file: ${message}`;

        return new Response(JSON.stringify({ error: userFriendly }), {
            status: 502,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
});
