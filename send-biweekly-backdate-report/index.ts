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

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error('GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.');
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'areamanager@apotekalpro.id, operation@apotekalpro.id, finance@apotekalpro.id, operation.excellence@apotekalpro.id';

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // 1. Calculate 15 days ago date range
    const today = new Date();
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(today.getDate() - 15);
    fifteenDaysAgo.setHours(0, 0, 0, 0);
    const minSalesDateStr = fifteenDaysAgo.toISOString().split('T')[0];

    // 2. Fetch reports from last 15 days
    let allReports: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('laporan')
        .select('id, user_id, tanggal_jual, tanggal_setor, created_at, jenis_pelaporan, nominal_setoran, profiles(username, area_manager)')
        .gte('tanggal_jual', minSalesDateStr)
        .range(from, from + step - 1)
        .order('tanggal_jual', { ascending: false });

      if (error) throw error;
      allReports = [...allReports, ...(data || [])];
      if (!data || data.length < step) hasMore = false;
      else from += step;
    }

    // 3. Filter backdate incidents (> 4 days gap)
    const backdateIncidents: any[] = [];
    allReports.forEach((r) => {
      if (!r.tanggal_jual) return;
      const salesDate = new Date(r.tanggal_jual);

      let inputDateStr = r.tanggal_setor;
      if (r.created_at) {
        inputDateStr = r.created_at.split('T')[0];
      }
      if (!inputDateStr) return;

      const inputDate = new Date(inputDateStr);
      const diffMs = inputDate.getTime() - salesDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 4) {
        const profileObj = r.profiles || {};
        backdateIncidents.push({
          id: r.id,
          namaToko: profileObj.username || 'Unknown Toko',
          amName: profileObj.area_manager || 'Tanpa Area Manager',
          tanggalJual: r.tanggal_jual,
          tanggalInput: inputDateStr,
          diffDays,
          jenisPelaporan: r.jenis_pelaporan || 'Setoran Harian',
          nominalSetoran: r.nominal_setoran || 0,
        });
      }
    });

    // 4. Group by Area Manager
    const groupedData: { [amName: string]: any[] } = {};
    backdateIncidents.forEach((item) => {
      if (!groupedData[item.amName]) {
        groupedData[item.amName] = [];
      }
      groupedData[item.amName].push(item);
    });

    const totalIncidents = backdateIncidents.length;
    const todayFormatted = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const subject = `[AUDIT KEPATUHAN 2 MINGGUAN] Rekapitulasi Input Backdate Setoran (>4 Hari) - ${todayFormatted}`;

    let bodyHTML = '';
    if (totalIncidents === 0) {
      bodyHTML = `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; text-align: center; color: #065f46;">
          <h3 style="margin: 0; font-size: 16px;">Kepatuhan 100% Sempurna</h3>
          <p style="margin: 5px 0 0 0; font-size: 13px;">Tidak ditemukan insiden penginputan laporan backdate (> 4 hari dari tanggal sales) pada periode 15 hari terakhir.</p>
        </div>
      `;
    } else {
      let groupTablesHTML = '';
      Object.entries(groupedData).forEach(([amName, items]) => {
        let rowsHTML = '';
        items.forEach((item, idx) => {
          const partsJual = item.tanggalJual.split('-');
          const dJual = `${partsJual[2]}/${partsJual[1]}/${partsJual[0]}`;
          const partsInput = item.tanggalInput.split('-');
          const dInput = `${partsInput[2]}/${partsInput[1]}/${partsInput[0]}`;
          const nomStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.nominalSetoran);

          rowsHTML += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">${idx + 1}</td>
              <td style="padding: 10px; font-weight: bold; color: #111827; font-size: 13px;">${item.namaToko}</td>
              <td style="padding: 10px; color: #374151; font-size: 12px;">${dJual}</td>
              <td style="padding: 10px; color: #374151; font-size: 12px;">${dInput}</td>
              <td style="padding: 10px; font-size: 12px;">
                <span style="background: #fee2e2; color: #991b1b; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 11px;">
                  +${item.diffDays} Hari
                </span>
              </td>
              <td style="padding: 10px; color: #4b5563; font-size: 12px;">${item.jenisPelaporan}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #111827; font-size: 12px;">${nomStr}</td>
            </tr>
          `;
        });

        groupTablesHTML += `
          <div style="margin-top: 25px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #fef3c7; padding: 12px 16px; border-bottom: 1px solid #fde68a;">
              <h4 style="margin: 0; color: #92400e; font-size: 14px;">Area Manager: <strong>${amName}</strong> (${items.length} Insiden Backdate)</h4>
            </div>
            <table width="100%" style="border-collapse: collapse;">
              <thead>
                <tr style="background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
                  <th style="padding: 10px; text-align: center;">#</th>
                  <th style="padding: 10px; text-align: left;">Nama Toko</th>
                  <th style="padding: 10px; text-align: left;">Tanggal Sales</th>
                  <th style="padding: 10px; text-align: left;">Tanggal Input</th>
                  <th style="padding: 10px; text-align: left;">Keterlambatan</th>
                  <th style="padding: 10px; text-align: left;">Jenis Laporan</th>
                  <th style="padding: 10px; text-align: right;">Nominal</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        `;
      });

      bodyHTML = `
        <div style="margin-top: 15px;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Ditemukan total <strong>${totalIncidents} insiden penginputan backdate (&gt; 4 hari)</strong> selama 15 hari terakhir. Berikut rincian terkelompok berdasarkan Area Manager:
          </p>
          ${groupTablesHTML}
        </div>
      `;
    }

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 750px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background: #d97706; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 20px;">AUDIT KEPATUHAN INPUT BACKDATE (2 MINGGUAN)</h2>
            <p style="color: #fef3c7; font-size: 13px; margin-top: 6px;">Evaluasi Periode 15 Hari Terakhir - Tanggal Audit: ${todayFormatted}</p>
          </div>
          <div style="padding: 24px;">
            ${bodyHTML}
            <div style="text-align: center; margin-top: 35px; margin-bottom: 15px;">
              <a href="https://alpro-setoran-app.vercel.app/admin/backdate" style="background: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Buka Dashboard Audit Backdate</a>
            </div>
            <p style="margin-top: 30px; font-size: 11px; color: #9ca3af; text-align: center;">
              Laporan Otomatis 2 Mingguan (Tanggal 1 & 16)<br>
              Aplikasi Setoran Harian Apotek Alpro
            </p>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: subject,
      html: htmlTemplate,
    });

    transporter.close();
    console.log(`[send-biweekly-backdate-report] Biweekly audit report sent OK to: ${targetEmail}. Total incidents: ${totalIncidents}`);
    return new Response(JSON.stringify({ success: true, incidents: totalIncidents }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-biweekly-backdate-report] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
