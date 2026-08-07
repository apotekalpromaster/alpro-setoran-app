import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KoreksiNotificationPayload {
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
  cabang?: string;
  kodeToko?: string;
  pelaporEmail?: string;
  jenisKoreksi?: string;
  tanggalSales?: string;
  jenisPelaporan?: string;
  alasan?: string;
  rincianPerubahan?: string;
  waktuPengajuan?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const payload = (await req.json()) as KoreksiNotificationPayload;

    if (!payload?.to) {
      return new Response(JSON.stringify({ error: 'Parameter "to" (email tujuan) wajib diisi.' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      console.error('GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.');
      return new Response(JSON.stringify({ success: false, warning: 'SMTP secrets missing' }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const recipientEmail = payload.to;
    const ccEmails = payload.cc ? payload.cc : undefined;
    const emailSubject = payload.subject || `[PERMOHONAN KOREKSI LAPORAN] ${payload.cabang || 'Cabang'} - ${payload.tanggalSales || ''}`;

    const bodyHtml = payload.html || `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 650px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
          <div style="background: #9333ea; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 20px;">PERMOHONAN KOREKSI LAPORAN SALES</h2>
            <p style="color: #f3e8ff; font-size: 12px; margin-top: 5px;">Aplikasi Setoran Harian Apotek Alpro</p>
          </div>
          <div style="padding: 24px; color: #374151; font-size: 14px; line-height: 1.6;">
            <p>Halo Bpk/Ibu <strong>Area Manager</strong>,</p>
            <p>Terdapat permohonan koreksi data laporan sales baru dari cabang yang memerlukan peninjauan dan persetujuan Anda:</p>
            
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <h3 style="margin-top: 0; color: #6b21a8; font-size: 15px; border-bottom: 1px dashed #d8b4fe; padding-bottom: 8px;">📌 RINCIAN PERMOHONAN:</h3>
              <ul style="list-style: none; padding: 0; margin: 0; line-height: 1.8;">
                <li><strong>Nama Cabang / Toko:</strong> ${payload.cabang || '-'} (${payload.kodeToko || '-'})</li>
                <li><strong>Pelapor (Staf Toko):</strong> ${payload.pelaporEmail || '-'}</li>
                <li><strong>Jenis Koreksi:</strong> ${payload.jenisKoreksi || 'Koreksi Data'}</li>
                <li><strong>Tanggal Sales:</strong> ${payload.tanggalSales || '-'}</li>
                <li><strong>Jenis Pelaporan:</strong> ${payload.jenisPelaporan || '-'}</li>
                <li><strong>Waktu Pengajuan:</strong> ${payload.waktuPengajuan || new Date().toLocaleString('id-ID')} WIB</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 14px; margin: 16px 0; border-radius: 4px;">
              <h4 style="margin: 0 0 6px 0; color: #c2410c;">📋 ALASAN / PENJELASAN KOREKSI:</h4>
              <p style="margin: 0; color: #9a3412; font-style: italic;">"${payload.alasan || '-'}"</p>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <h4 style="margin: 0 0 8px 0; color: #334155;">🔍 RINGKASAN PERUBAHAN DATA DIAJUKAN:</h4>
              <pre style="font-family: monospace; font-size: 13px; color: #1e293b; background: white; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; white-space: pre-wrap; margin: 0;">${payload.rincianPerubahan || '-'}</pre>
            </div>

            <div style="text-align: center; margin-top: 28px; margin-bottom: 16px;">
              <a href="https://alpro-setoran-uat.vercel.app/areamanager/koreksi-approval" style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Buka Halaman Persetujuan Koreksi</a>
            </div>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">
              Dihasilkan otomatis oleh Edge Functions — Aplikasi Setoran Harian Apotek Alpro
            </p>
          </div>
        </div>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: fromEmail,
      to: recipientEmail,
      ...(ccEmails ? { cc: ccEmails } : {}),
      subject: emailSubject,
      html: bodyHtml,
    });

    console.log(`[send-koreksi-notification] Sent OK to: ${recipientEmail}`);
    transporter.close();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-koreksi-notification] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
