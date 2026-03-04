// Supabase Edge Function: send-reminder-emails
// Sends batch courtesy reminder emails via Gmail SMTP to pharmacies that
// have not submitted their deposit reports on expected working days.
//
// Required Supabase Secrets:
//   GMAIL_SMTP_USER     — Gmail address (e.g., alerts@gmail.com)
//   GMAIL_SMTP_PASSWORD — Gmail App Password
//   APP_URL             — Frontend URL for the CTA link

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingItem {
  namaToko: string;
  email: string | null;
  tanggalBolong: string[];
  frekuensi?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function buildHTML(item: PendingItem, appUrl: string): string {
  const dateItems = item.tanggalBolong
    .map((d) => `<li style="margin-bottom:6px;color:#b91c1c;font-weight:600">${formatDate(d)}</li>`)
    .join('');

  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto">
<tr><td>
  <table width="100%" style="background:#f97316;border-radius:12px 12px 0 0">
    <tr><td style="padding:24px 32px">
      <p style="margin:0 0 4px;color:#fed7aa;font-size:12px;font-weight:700;text-transform:uppercase">Pengingat Laporan Setoran — Apotek Alpro</p>
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800">Halo, ${item.namaToko} 👋</h1>
    </td></tr>
  </table>
  <table width="100%" style="background:#fff;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,.08)">
    <tr><td style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7">
        Sistem kami mendeteksi bahwa toko Anda <strong>belum mengirimkan laporan setoran</strong> pada hari-hari berikut:
      </p>
      <ul style="margin:0 0 20px 16px;padding:0;list-style:disc">${dateItems}</ul>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7">
        Mohon segera lengkapi laporan. Jika Anda merasa sudah melaporkan, abaikan email ini.
      </p>
      <div style="text-align:center;margin-top:8px">
        <a href="${appUrl}/setoran"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">
          Buat Laporan Sekarang →
        </a>
      </div>
    </td></tr>
    <tr><td style="padding:14px 32px;background:#f9fafb;border-top:1px solid #f1f5f9;border-radius:0 0 12px 12px">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Email otomatis — jangan balas email ini.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const body = await req.json() as { pending: PendingItem[] };
    const pending = body?.pending ?? [];

    if (!pending.length) {
      return new Response(JSON.stringify({ success: 0, failed: 0, skipped: 0 }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');
    const appUrl = Deno.env.get('APP_URL') ?? 'https://apotek-alpro.com';

    if (!smtpUser || !smtpPass) throw new Error('GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.');

    // Open a single smtp connection for the entire batch
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    let success = 0, failed = 0, skipped = 0;

    for (const item of pending) {
      if (!item.email) { skipped++; continue; }

      try {
        await transporter.sendMail({
          from: smtpUser,
          to: item.email,
          subject: `📋 Pengingat: ${item.tanggalBolong.length} Hari Laporan Belum Masuk — ${item.namaToko}`,
          html: buildHTML(item, appUrl),
        });
        success++;
      } catch (e) {
        failed++;
        console.error(`[reminder] Failed ${item.namaToko}:`, e);
      }
    }


    console.log(`[send-reminder-emails] Done — success:${success} failed:${failed} skipped:${skipped}`);
    return new Response(JSON.stringify({ success, failed, skipped }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan.';
    console.error('[send-reminder-emails] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
