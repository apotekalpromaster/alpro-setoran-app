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

    // Determine Date Range: Monday to Sunday of the previous week in WIB (UTC+7)
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

    // Fetch reports of the last week (using tanggal_jual)
    const { data: laporan, error: lapErr } = await supabase
      .from('laporan')
      .select('tanggal_jual, nominal_jual, potongan, nominal_setoran, user_id, profiles(username)')
      .gte('tanggal_jual', lastMondayStr)
      .lte('tanggal_jual', lastSundayStr);

    if (lapErr) throw lapErr;

    // Fetch POS sales of the last week
    const { data: posData, error: posErr } = await supabase
      .from('pos_sales_data')
      .select('kode_cabang, tanggal_jual, sales_pos')
      .gte('tanggal_jual', lastMondayStr)
      .lte('tanggal_jual', lastSundayStr);

    if (posErr) throw posErr;

    // Group by Apotek
    const byUser: { [name: string]: {
      namaApotek: string;
      xilnexSales: number;
      reportSales: number;
      potongan: number;
      nominalSetor: number;
    }} = {};

    const getEntry = (name: string) => {
      if (!byUser[name]) {
        byUser[name] = {
          namaApotek: name,
          xilnexSales: 0,
          reportSales: 0,
          potongan: 0,
          nominalSetor: 0,
        };
      }
      return byUser[name];
    };

    // Map reports
    if (laporan && laporan.length > 0) {
      laporan.forEach((r: any) => {
        const name = r.profiles?.username || 'Unknown';
        const entry = getEntry(name);
        entry.reportSales += Number(r.nominal_jual || 0);
        entry.potongan += Number(r.potongan || 0);
        entry.nominalSetor += Number(r.nominal_setoran || 0);
      });
    }

    // Map POS
    if (posData && posData.length > 0) {
      posData.forEach((p: any) => {
        const name = p.kode_cabang || 'Unknown';
        const entry = getEntry(name);
        entry.xilnexSales += Number(p.sales_pos || 0);
      });
    }

    // Filter for high discrepancies
    const highDiscrepancyList: any[] = [];
    Object.values(byUser).forEach(entry => {
      const delta1 = entry.reportSales - entry.xilnexSales;
      const delta2 = (entry.nominalSetor + entry.potongan) - entry.xilnexSales;

      if (Math.abs(delta1) > DISCREPANCY_THRESHOLD || Math.abs(delta2) > DISCREPANCY_THRESHOLD) {
        highDiscrepancyList.push({
          ...entry,
          delta1,
          delta2
        });
      }
    });

    // Sort by largest absolute discrepancy
    highDiscrepancyList.sort((a, b) => Math.max(Math.abs(b.delta1), Math.abs(b.delta2)) - Math.max(Math.abs(a.delta1), Math.abs(a.delta2)));

    if (highDiscrepancyList.length === 0) {
      return new Response(JSON.stringify({ message: 'Tidak ada laporan dengan selisih melebihi threshold.' }), {
        status: 200, headers: CORS
      });
    }

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'areamanager@apotekalpro.id, operation@apotekalpro.id, finance@apotekalpro.id, operation.excellence@apotekalpro.id';

    const periodStr = `${lastMonday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${lastSunday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const subject = `[AUDIT] Laporan Selisih Setoran Mingguan (>50k) - Periode ${periodStr}`;

    let tableRows = '';
    highDiscrepancyList.forEach(m => {
      const color1 = m.delta1 === 0 ? '#4b5563' : m.delta1 > 0 ? '#2563eb' : '#dc2626';
      const color2 = m.delta2 === 0 ? '#4b5563' : m.delta2 > 0 ? '#2563eb' : '#dc2626';
      const formatVal = (v: number) => v === 0 ? 'Rp 0' : (v > 0 ? '+' : '') + formatRupiah(v);
      
      tableRows += `
        <tr style="border-bottom: 1px solid #e5e7eb; font-size: 11px;">
          <td style="padding: 12px; color: #1f2937; font-weight: bold;">${m.namaApotek}</td>
          <td style="padding: 12px; color: #4b5563; text-align: right; font-family: monospace;">${formatRupiah(m.xilnexSales)}</td>
          <td style="padding: 12px; color: #4b5563; text-align: right; font-family: monospace;">${formatRupiah(m.reportSales)}</td>
          <td style="padding: 12px; color: #4b5563; text-align: right; font-family: monospace;">(${formatRupiah(m.potongan)})</td>
          <td style="padding: 12px; color: #4b5563; text-align: right; font-family: monospace;">${formatRupiah(m.nominalSetor)}</td>
          <td style="padding: 12px; color: ${color1}; text-align: right; font-weight: bold; font-family: monospace;">${formatVal(m.delta1)}</td>
          <td style="padding: 12px; color: ${color2}; text-align: right; font-weight: bold; font-family: monospace;">${formatVal(m.delta2)}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #f97316; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Laporan Audit Keuangan (Selisih &gt; 50k)</h2>
            <p style="color: #ffedd5; font-size: 12px; margin-top: 5px;">Periode Penjualan: ${periodStr}</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">Berikut adalah daftar setoran dengan selisih di atas <strong>${formatRupiah(DISCREPANCY_THRESHOLD)}</strong> untuk periode minggu lalu:</p>
            
            <table width="100%" style="border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb; font-size: 12px;">
              <thead>
                <tr style="background: #f8fafc;">
                  <th style="padding: 12px; text-align: left; color: #475569; border-bottom: 2px solid #cbd5e1;">Nama Toko</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Sales Xilnex</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Sales Manual</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Potongan</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Setoran</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Selisih 1 (POS vs Manual)</th>
                  <th style="padding: 12px; text-align: right; color: #475569; border-bottom: 2px solid #cbd5e1;">Selisih 2 (POS vs Setor+Pot)</th>
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
