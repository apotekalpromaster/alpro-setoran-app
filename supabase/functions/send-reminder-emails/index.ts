import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL / Service Key tidak dikonfigurasi.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Logika Gap Analysis (7 Hari Terakhir)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // D-7
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    // Tarik profil yang aktif
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'User');

    if (profileErr) throw profileErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: 'Tidak ada profil cabang.' }), { status: 200, headers: CORS });
    }

    // Tarik laporan dalam 7 hari terakhir
    const { data: laporan, error: lapErr } = await supabase
      .from('laporan')
      .select('user_id, tanggal_jual, tanggal_setor')
      .gte('tanggal_jual', lastWeek.toISOString().split('T')[0])
      .lte('tanggal_jual', today.toISOString().split('T')[0]);

    if (lapErr) throw lapErr;

    // Kalkulasi Tunggakan
    const targetWorkingDates: Date[] = [];
    let loopDate = new Date(lastWeek);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1); // sampai H-1

    while (loopDate <= endDate) {
      if (loopDate.getDay() !== 0) { // Lewati hari Minggu
        const clone = new Date(loopDate);
        targetWorkingDates.push(clone);
      }
      loopDate.setDate(loopDate.getDate() + 1);
    }

    const menunggakList: Array<{ cabang: string, frekuensi: string, tunggakan: string[] }> = [];

    for (const p of profiles) {
      // Laporan milik cabang ini dalam 7 hari terakhir
      const cabangLaporan = (laporan || []).filter((l: any) => l.user_id === p.id);

      const reportedDates = new Set<string>();
      cabangLaporan.forEach((l: any) => {
        if (l.tanggal_jual) {
          const d = new Date(l.tanggal_jual);
          d.setHours(0, 0, 0, 0);
          reportedDates.add(d.getTime().toString());
        }
      });

      const missingDates: Date[] = [];
      for (const wDate of targetWorkingDates) {
        if (!reportedDates.has(wDate.getTime().toString())) {
          missingDates.push(wDate);
        }
      }

      // Hitung ekspektasi berdasar frekuensi_setoran (dalam skala 7 hari)
      const freq = (p.frekuensi_setoran || '').toUpperCase();
      let expectedCount = targetWorkingDates.length; // Default Harian (sekitar 6 hari/minggu)

      if (freq.includes('3X SEMINGGU')) {
        expectedCount = Math.floor(targetWorkingDates.length / 2);
      } else if (freq.includes('2X SEMINGGU')) {
        expectedCount = Math.floor(targetWorkingDates.length / 3);
      } else if (freq.includes('SEMINGGU SEKALI') || freq.includes('1X SEMINGGU')) {
        expectedCount = Math.floor(targetWorkingDates.length / 6);
      }

      const totalReported = reportedDates.size;

      if (totalReported < expectedCount && missingDates.length > 0) {
        menunggakList.push({
          cabang: p.username || 'Cabang Tidak Diketahui',
          frekuensi: p.frekuensi_setoran || 'Harian',
          tunggakan: missingDates.map(d => d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))
        });
      }
    }

    if (menunggakList.length === 0) {
      return new Response(JSON.stringify({ message: 'Semua cabang patuh! Tidak ada email yang perlu dikirim.' }), { status: 200, headers: CORS });
    }

    // 2. Pengaturan Email
    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'hendri.apotekalpro@gmail.com'; // UAT Phase

    // PRODUCTION TARGETS (KODE KOMENTAR)
    // const prodTo = 'outlets@apotekalpro.id, areamanager@apotekalpro.id';
    // const prodCc = 'operation@apotekalpro.id, finance@apotekalpro.id';

    const subject = `[REPORT] Laporan Apotek Menunggak Setoran (Mingguan)`;

    // 3. Perakitan HTML Email
    let tableRows = '';
    menunggakList.forEach(m => {
      tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; color: #374151; font-weight: bold;">${m.cabang}<br><span style="font-size: 10px; font-weight: normal; color: #6b7280;">(${m.frekuensi})</span></td>
                <td style="padding: 12px; color: #b91c1c; font-size: 13px;">
                    <ul style="margin: 0; padding-left: 16px;">
                        ${m.tunggakan.map(t => `<li style="margin-bottom: 2px;">${t}</li>`).join('')}
                    </ul>
                </td>
            </tr>
        `;
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #ea580c; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">⚠️ LAPORAN CABANG MENUNGGAK ⚠️</h2>
            <p style="color: #ffedd5; font-size: 12px; margin-top: 5px;">Rekapitulasi 7 Hari Terakhir</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">Berikut adalah daftar cabang apotek yang terdeteksi <strong>belum melengkapi</strong> Laporan Setoran Harian (melewati batas toleransi frekuensi setoran):</p>
            
            <table width="100%" style="border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb;">
              <thead>
                <tr style="background: #fef3c7;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #92400e; border-bottom: 2px solid #fde68a;">Nama Toko</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #92400e; border-bottom: 2px solid #fde68a;">Tanggal Tunggakan</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">Dihasilkan secara otomatis oleh pg_cron & Edge Functions<br>Aplikasi Setoran Harian Apotek Alpro</p>
          </div>
        </div>
      </div>
    `;

    // Pengiriman SMTP NodeMailer
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

    console.log(`[send-reminder-emails] Sent OK to: ${targetEmail}. Cabang menunggak: ${menunggakList.length}`);

    return new Response(JSON.stringify({ success: true, count: menunggakList.length, menunggak: menunggakList }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-reminder-emails] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
