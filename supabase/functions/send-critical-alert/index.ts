// Supabase Edge Function: send-critical-alert
// Sends a formatted urgent alert email via Gmail SMTP when a critical
// deposit report is submitted (e.g., Deposit Card Terblokir / Tertelan ATM).
//
// Required Supabase Secrets:
//   GMAIL_SMTP_USER     — Gmail address (e.g., alerts@gmail.com)
//   GMAIL_SMTP_PASSWORD — Gmail App Password (NOT the account password)
//                         Generate at: myaccount.google.com/apppasswords
//   ALERT_EMAIL_TO      — Recipient address (comma-separated for multiple)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  formData: {
    jenis_pelaporan: string;
    metode_setoran?: string;
    tanggal_jual?: string;
    tanggal_setor?: string;
    nominal_setoran?: number;
    nomor_deposit_card?: string;
    nomor_mesin_atm?: string;
    lokasi_mesin_atm?: string;
    waktu_kejadian?: string;
    kcp_terdekat?: string;
    penjelasan?: string;
  };
  username: string;
}

function row(label: string, value?: string | number): string {
  if (!value) return '';
  return `<tr>
    <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">${label}</td>
    <td style="padding:6px 12px;font-weight:600;font-size:13px">${value}</td>
  </tr>`;
}

function buildHTML(p: AlertPayload): string {
  const f = p.formData;
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' });
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto">
<tr><td>
  <table width="100%" style="background:#991b1b;border-radius:12px 12px 0 0">
    <tr><td style="padding:28px 32px">
      <p style="margin:0 0 4px;color:#fca5a5;font-size:12px;font-weight:700;text-transform:uppercase">⚠ Laporan Darurat — Apotek Alpro</p>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">${f.jenis_pelaporan}</h1>
      <p style="margin:8px 0 0;color:#fca5a5;font-size:13px">Diterima: ${now}</p>
    </td></tr>
  </table>
  <table width="100%" style="background:#f97316">
    <tr><td style="padding:10px 32px;color:#fff;font-size:13px;font-weight:700">🚨 Tindakan segera diperlukan dari tim Finance / Operasional.</td></tr>
  </table>
  <table width="100%" style="background:#fff;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,.08)">
    <tr><td style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:14px;color:#374151">Laporan diajukan oleh: <strong>${p.username}</strong></p>
      <table width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <tr style="background:#fef2f2"><th colspan="2" style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase">Detail Laporan</th></tr>
        ${row('Tanggal Penjualan', f.tanggal_jual)}
        ${row('Tanggal Setoran', f.tanggal_setor)}
        ${row('Metode Setoran', f.metode_setoran)}
        ${row('Nomor Deposit Card', f.nomor_deposit_card)}
        ${row('Nomor Mesin ATM', f.nomor_mesin_atm)}
        ${row('Lokasi Mesin ATM', f.lokasi_mesin_atm)}
        ${row('Waktu Kejadian', f.waktu_kejadian)}
        ${row('KCP Terdekat', f.kcp_terdekat)}
        ${row('Nominal Setoran', f.nominal_setoran ? `Rp ${Number(f.nominal_setoran).toLocaleString('id-ID')}` : undefined)}
      </table>
      ${f.penjelasan ? `<div style="margin-top:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#c2410c;text-transform:uppercase">Penjelasan</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${f.penjelasan}</p>
      </div>` : ''}
      <p style="margin-top:20px;font-size:13px;color:#6b7280;text-align:center">Segera koordinasi dengan apotek untuk penanganan lebih lanjut.</p>
    </td></tr>
    <tr><td style="padding:14px 32px;background:#f9fafb;border-top:1px solid #f1f5f9;border-radius:0 0 12px 12px">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Email otomatis dari sistem Apotek Alpro — jangan balas email ini.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const payload = (await req.json()) as AlertPayload;

    if (!payload?.formData?.jenis_pelaporan) {
      return new Response(JSON.stringify({ error: 'Payload tidak valid.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');
    const toRaw = Deno.env.get('ALERT_EMAIL_TO');

    if (!smtpUser || !smtpPass) throw new Error('GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.');
    if (!toRaw) throw new Error('ALERT_EMAIL_TO tidak dikonfigurasi.');

    const toList = toRaw.split(',').map((e) => e.trim()).filter(Boolean);
    const subject = `🚨 [DARURAT] ${payload.formData.jenis_pelaporan} — ${payload.username}`;
    const html = buildHTML(payload);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    for (const to of toList) {
      await transporter.sendMail({
        from: smtpUser,
        to,
        subject,
        html,
      });
    }

    console.log('[send-critical-alert] Sent OK to:', toList.join(', '));
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-critical-alert] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
