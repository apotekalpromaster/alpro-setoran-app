import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import nodemailer from 'npm:nodemailer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCREPANCY_THRESHOLD = 50000;

function formatRupiah(num: number): string {
  return 'Rp ' + num.toLocaleString('id-ID');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL / Service Key tidak dikonfigurasi.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Tentukan Range Tanggal (Minggu Lalu: Senin s/d Minggu berbasis WIB)
    // Offset WIB = +7 Jam
    const now = new Date();
    const wibTime = now.getTime() + (7 * 60 * 60 * 1000);
    const todayWib = new Date(wibTime);
    todayWib.setUTCHours(0, 0, 0, 0);

    const dayOfWeek = todayWib.getUTCDay(); // 0 (Sun) - 6 (Sat)
    const diffToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;

    const lastSunday = new Date(todayWib.getTime() - (diffToLastSunday * 24 * 60 * 60 * 1000));
    lastSunday.setUTCHours(23, 59, 59, 999);

    const lastMonday = new Date(lastSunday.getTime() - (6 * 24 * 60 * 60 * 1000));
    lastMonday.setUTCHours(0, 0, 0, 0);

    const lastMondayStr = lastMonday.toISOString().split('T')[0];
    const lastSundayStr = lastSunday.toISOString().split('T')[0];

    // 2. Fetch Data Laporan dalam rentang tanggal_jual minggu lalu
    // Kita juga join ke profiles untuk mendapatkan nama cabang (username)
    const { data: laporan, error: lapErr } = await supabase
      .from('laporan')
      .select('tanggal_jual, nominal_jual, potongan, nominal_setoran, user_id, profiles(username)')
      .gte('tanggal_jual', lastMondayStr)
      .lte('tanggal_jual', lastSundayStr);

    if (lapErr) throw lapErr;

    // 3. Filter data dengan selisih > Threshold (50.000)
    const highDiscrepancyList: Array<{
      tanggal: string;
      namaToko: string;
      sales: string;
      setor: string;
      selisih: string;
      selisihRaw: number;
    }> = [];

    if (laporan && laporan.length > 0) {
      for (const row of laporan) {
        const sales = Number(row.nominal_jual || 0);
        const setor = Number(row.nominal_setoran || 0);
        const potong = Number(row.potongan || 0);
        const selisih = sales - potong - setor;

        if (Math.abs(selisih) > DISCREPANCY_THRESHOLD) {
          const profile = row.profiles as any;
          const namaToko = profile?.username || 'Cabang Tidak Diketahui';
          
          // Format tanggal ke format lokal
          const dateObj = new Date(row.tanggal_jual);
          const formattedDate = dateObj.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });

          highDiscrepancyList.push({
            tanggal: formattedDate,
            namaToko: namaToko,
            sales: formatRupiah(sales),
            setor: formatRupiah(setor),
            selisih: (selisih > 0 ? '-' : '+') + formatRupiah(Math.abs(selisih)),
            selisihRaw: selisih
          });
        }
      }
    }

    // Sort berdasarkan nilai selisih terbesar secara absolut
    highDiscrepancyList.sort((a, b) => Math.abs(b.selisihRaw) - Math.abs(a.selisihRaw));

    if (highDiscrepancyList.length === 0) {
      return new Response(JSON.stringify({ message: 'Tidak ada laporan dengan selisih melebihi threshold.' }), {
        status: 200, headers: CORS
      });
    }

    // 4. Kredensial SMTP
    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'areamanager@apotekalpro.id, operation@apotekalpro.id, finance@apotekalpro.id';

    const periodStr = `${lastMonday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${lastSunday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const subject = `[AUDIT] Laporan Selisih Setoran Mingguan (>50k) - Periode ${periodStr}`;

    // 5. Perakitan HTML Email (McKinsey Style)
    let tableRows = '';
    highDiscrepancyList.forEach(m => {
      const color = m.selisihRaw > 0 ? '#dc2626' : '#2563eb'; // Merah jika kurang, Biru jika lebih
      tableRows += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; color: #374151;">${m.tanggal}</td>
          <td style="padding: 12px; color: #1f2937; font-weight: bold;">${m.namaToko}</td>
          <td style="padding: 12px; color: #4b5563; text-align: right;">${m.sales}</td>
          <td style="padding: 12px; color: #4b5563; text-align: right;">${m.setor}</td>
          <td style="padding: 12px; color: ${color}; text-align: right; font-weight: bold;">${m.selisih}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #f97316; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Laporan Audit Keuangan</h2>
            <p style="color: #ffedd5; font-size: 12px; margin-top: 5px;">Periode: ${periodStr}</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">Berikut adalah daftar setoran dengan selisih di atas <strong>${formatRupiah(DISCREPANCY_THRESHOLD)}</strong> untuk periode minggu lalu:</p>
            
            <table width="100%" style="border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb; font-size: 13px;">
              <thead>
                <tr style="background: #f8fafc;">
                  <th style="padding: 12px; text-align: left; color: #475569; border-bottom: 2px solid #cbd5e1;">Tanggal</th>
                  <th style="padding: 12px; text-align: left; color: #475569; border-bottom: 2px solid #cbd5e1;">Nama Toko</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Sales</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Setoran</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Selisih</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">
              Laporan ini digenerate otomatis oleh Sistem Apotek Alpro.<br>
              Mohon lakukan investigasi pada toko yang tertera di atas.
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

    console.log(`[send-weekly-discrepancy-report] Sent OK to: ${targetEmail}. Rows: ${highDiscrepancyList.length}`);

    return new Response(JSON.stringify({ success: true, count: highDiscrepancyList.length, data: highDiscrepancyList }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-weekly-discrepancy-report] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
