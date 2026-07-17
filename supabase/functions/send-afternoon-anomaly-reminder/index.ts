import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'operation@apotekalpro.id, finance@apotekalpro.id, areamanager@apotekalpro.id';

    // Get current date string in WIB (UTC+7)
    const now = new Date();
    const wibTime = now.getTime() + (7 * 60 * 60 * 1000);
    const dateWib = new Date(wibTime);
    const formattedDate = dateWib.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const subject = `[WEEKLY REMINDER] Cek Anomali Laporan Setoran Harian - ${formattedDate}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #3b82f6; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Pengingat Review Mingguan</h2>
            <p style="color: #dbeafe; font-size: 12px; margin-top: 5px;">Aplikasi Setoran Harian Apotek Alpro</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">Halo Tim Operasional, Keuangan, & Area Manager,</p>
            
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Ini adalah pengingat mingguan otomatis untuk melakukan peninjauan terhadap setoran masuk di dashboard masing-masing.
            </p>
            
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; font-size: 13px; color: #1e3a8a;">
              <strong>Hal-hal yang perlu dievaluasi:</strong>
              <ul style="margin: 5px 0 0 0; padding-left: 20px;">
                <li>Apakah ada anomali atau selisih setoran melebihi toleransi (> Rp 50.000)?</li>
                <li>Apakah ada indikasi fraud (misal: hanya melapor uang pecahan kecil tanpa setoran penjualan utama)?</li>
                <li>Apakah ada permohonan koreksi atau penghapusan laporan yang butuh verifikasi dan persetujuan (wewenang khusus milik Area Manager)?</li>
              </ul>
            </div>

            <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
              <a href="https://alpro-setoran-app.vercel.app/admin" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 10px; font-size: 13px;">Dashboard Admin (Ops & Fin)</a>
              <a href="https://alpro-setoran-app.vercel.app/areamanager/dashboard" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 13px;">Dashboard Area Manager</a>
            </div>
            
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">
              Dihasilkan otomatis oleh pg_cron & Edge Functions<br>
              Aplikasi Setoran Harian Apotek Alpro
            </p>
          </div>
        </div>
      </div>
    `;

    // Kirim Email via SMTP
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

    console.log(`[send-afternoon-anomaly-reminder] Sent OK to: ${targetEmail}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-afternoon-anomaly-reminder] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
