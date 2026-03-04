// Supabase Edge Function: upload-to-drive
// Receives a multipart/form-data request with a 'file' field,
// authenticates to Google Drive via a Service Account JWT,
// and uploads the file to a configured shared Drive folder.
//
// Required Supabase Secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON key from Google Cloud Console
//   GOOGLE_DRIVE_FOLDER_ID       — ID of the destination Drive folder

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TIMEOUT_MS = 25_000; // 25 s — stay inside Supabase Edge 50s limit

// ─── CORS headers ────────────────────────────────────────────────────────────
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Base64url-encode a Uint8Array */
function b64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build a signed JWT so we can exchange it for an OAuth2 access token */
async function buildServiceAccountJWT(sa: {
    client_email: string;
    private_key: string;
}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = b64url(new TextEncoder().encode(JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
    })));

    // Import RSA private key
    const pem = sa.private_key.replace(/\\n/g, '\n');
    const pemBody = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
    const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyBytes.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const data = new TextEncoder().encode(`${header}.${payload}`);
    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, data);
    const sig = b64url(new Uint8Array(sigBuf));

    return `${header}.${payload}.${sig}`;
}

/** Exchange a signed JWT for a short-lived Google OAuth2 access token */
async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
    const jwt = await buildServiceAccountJWT(sa);

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
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

        // Validate size (max 10 MB)
        if (file.size > 10 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: 'File terlalu besar. Maksimal 10 MB.' }), {
                status: 413, headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        // 2) Load service account from Supabase secret
        const saRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
        if (!saRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret tidak dikonfigurasi.');
        const sa = JSON.parse(saRaw);

        const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');
        if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID secret tidak dikonfigurasi.');

        // 3) Get access token (with timeout guard)
        const accessToken = await Promise.race([
            getAccessToken(sa),
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
