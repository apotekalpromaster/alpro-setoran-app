import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

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

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('RESEND_API_KEY tidak dikonfigurasi.');

    // 🔴 HARDCODED UAT EMAIL 🔴
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

    // Kirim menggunakan Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Apotek Alpro Alerts <onboarding@resend.dev>',
        to: targetEmail,
        subject: subject,
        html: htmlContent
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Resend API Error: ${errorText}`);
    }

    console.log(`[send-critical-alert] Sent OK to: ${targetEmail}`);
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
