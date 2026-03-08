import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  cabang: string;
  tanggal: string;
  masalah: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const payload = (await req.json()) as AlertPayload;

    if (!payload?.masalah) {
      return new Response(JSON.stringify({ error: 'Payload tidak valid.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      console.error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
      // Margin of Safety: non-blocking response to frontend
      return new Response(JSON.stringify({ success: true, warning: 'SMTP secrets missing' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 🔴 HARDCODED UAT EMAIL 🔴
    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'hendri.apotekalpro@gmail.com';
    const subject = `[URGENT] Masalah Deposit Card - ${payload.cabang}`;

    // Build HTML Email
    const htmlDate = new Date(payload.tanggal).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' });
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #ef4444; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">🚨 LAPORAN DARURAT 🚨</h2>
          </div>
          <div style="padding: 20px;">
            <p><strong>Cabang / User:</strong> ${payload.cabang}</p>
            <p><strong>Waktu Laporan:</strong> ${htmlDate}</p>
            <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin-top: 20px;">
              <h4 style="margin-top: 0; color: #991b1b;">Detail Masalah:</h4>
              <p style="margin-bottom: 0; color: #7f1d1d; font-weight: bold;">${payload.masalah}</p>
            </div>
            <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Sistem Peringatan Dini - Aplikasi Setoran Harian Apotek Alpro</p>
          </div>
        </div>
      </div>
    `;

    // 🔥 PENGIRIMAN EMAIL via Nodemailer SMTP 🔥
    try {
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
        to: targetEmail,
        subject: subject,
        html: htmlContent
      });

      console.log(`[send-critical-alert] Sent OK to: ${targetEmail} via Gmail SMTP`);
    } catch (smtpErr) {
      console.error('[send-critical-alert] SMTP Error:', smtpErr);
      // Margin of Safety: JANGAN throw error agar tidak mengembalikan status 500
      // sehingga UI form cabang tetap melaju sukses tanpa blocking
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-critical-alert] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
