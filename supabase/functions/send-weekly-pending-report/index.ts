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
      throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.");
    }

    const fromEmail = 'apotekalpro.master@gmail.com';
    const targetEmail = 'outlets@apotekalpro.id, areamanager@apotekalpro.id';
    const ccEmails = 'operation@apotekalpro.id, finance@apotekalpro.id, operation.excellence@apotekalpro.id';

    // 1. Fetch Users
    const { data: users, error: uErr } = await supabase
      .from('profiles')
      .select('id, username, email, frekuensi_setoran, area_manager, tanggal_aktif')
      .eq('role', 'User');
    if (uErr) throw uErr;

    // 2. Fetch all reports in entire database (paginated to bypass limit)
    let laporanRaw: any[] = [];
    let lFrom = 0;
    const limit = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('laporan')
        .select('user_id, tanggal_setor, tanggal_jual, jenis_pelaporan')
        .range(lFrom, lFrom + limit - 1);
      if (error) throw error;
      laporanRaw = [...laporanRaw, ...data];
      if (data.length < limit) hasMore = false;
      else lFrom += limit;
    }

    // 3. Compute duplicated dates
    const countMap: { [key: string]: number } = {};
    const primaryTypes = ['Setoran Harian', 'Setoran 3x Seminggu', 'Setoran Sales Dengan Potongan Penjualan'];
    laporanRaw.forEach((r: any) => {
      if (r.tanggal_jual && primaryTypes.includes(r.jenis_pelaporan)) {
        const key = `${r.user_id}_${r.tanggal_jual}`;
        countMap[key] = (countMap[key] || 0) + 1;
      }
    });
    
    const duplicateDatesMap: { [userId: string]: string[] } = {};
    Object.entries(countMap).forEach(([key, count]) => {
      if (count > 1) {
        const [userId, dateStr] = key.split('_');
        if (!duplicateDatesMap[userId]) {
          duplicateDatesMap[userId] = [];
        }
        duplicateDatesMap[userId].push(dateStr);
      }
    });

    // 4. Compute missing dates (> 4 days tolerance)
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 4);
    limitDate.setHours(23, 59, 59, 999);
    const limitDateStr = limitDate.toISOString().split('T')[0];

    const submittedSet = new Set(laporanRaw.map((r) => `${r.user_id}_${r.tanggal_setor}`));

    const getBizDays = (startStr: string, endStr: string) => {
      const days: string[] = [];
      const cur = new Date(startStr);
      const last = new Date(endStr);
      while (cur <= last) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          days.push(cur.toLocaleDateString('sv-SE'));
        }
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    };

    const isScheduledDay = (dateStr: string, frekuensi: string) => {
      const d = new Date(dateStr);
      const dow = d.getDay();
      const freq = (frekuensi || '').toUpperCase();
      if (freq.includes('3X SEMINGGU')) return [1, 3, 5].includes(dow);
      if (freq.includes('2X SEMINGGU')) return [2, 5].includes(dow);
      if (freq.includes('1X SEMINGGU') || freq.includes('SEMINGGU SEKALI')) return dow === 5;
      return true;
    };

    const pendingUsers: any[] = [];
    users.forEach((user: any) => {
      const startDateStr = user.tanggal_aktif || '2026-04-01';
      const bizDays = getBizDays(startDateStr, limitDateStr);
      const missing = bizDays.filter((day) => {
        const shouldReport = isScheduledDay(day, user.frekuensi_setoran);
        const didReport = submittedSet.has(`${user.id}_${day}`);
        return shouldReport && !didReport;
      });

      const duplicates = duplicateDatesMap[user.id] || [];

      if (missing.length > 0 || duplicates.length > 0) {
        pendingUsers.push({
          namaToko: user.username,
          frekuensi: user.frekuensi_setoran || 'SETIAP HARI',
          areaManager: user.area_manager || 'Tanpa Area Manager',
          tanggalBolong: missing,
          tanggalDuplikat: duplicates,
        });
      }
    });

    if (pendingUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'Lengkap! Tidak ada outlet yang pending/duplikat.' }), {
        status: 200, headers: CORS
      });
    }

    // 5. Group by Area Manager
    const grouped: { [amName: string]: any[] } = {};
    pendingUsers.forEach((item) => {
      const am = item.areaManager;
      if (!grouped[am]) {
        grouped[am] = [];
      }
      grouped[am].push(item);
    });

    const formatLocaleDate = (dStr: string) => {
      const parts = dStr.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    };

    // 6. Build HTML table grouped by Area Manager
    let groupedHTML = '';
    Object.entries(grouped).forEach(([amName, list]) => {
      let rowsHTML = '';
      list.forEach((item) => {
        const missText = item.tanggalBolong.length > 0 
          ? `<li><strong>Tunggakan:</strong> ${item.tanggalBolong.map(formatLocaleDate).join(', ')}</li>` 
          : '';
        const dupText = item.tanggalDuplikat.length > 0 
          ? `<li style="color: #ea580c;"><strong>Duplikasi:</strong> ${item.tanggalDuplikat.map(formatLocaleDate).join(', ')}</li>` 
          : '';
        
        rowsHTML += `
          <tr style="border-bottom: 1px solid #e5e7eb; font-size: 11px;">
            <td style="padding: 10px; color: #1f2937; font-weight: bold; width: 40%;">${item.namaToko}<br><span style="font-size: 9px; font-weight: normal; color: #6b7280;">(${item.frekuensi})</span></td>
            <td style="padding: 10px; color: #b91c1c;">
              <ul style="margin: 0; padding-left: 15px;">
                ${missText}
                ${dupText}
              </ul>
            </td>
          </tr>
        `;
      });

      groupedHTML += `
        <div style="margin-top: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fafafa;">
          <div style="background: #cbd5e1; padding: 10px 15px; color: #1e293b; font-weight: bold; font-size: 13px;">
            Area Manager: ${amName} (${list.length} Toko)
          </div>
          <table width="100%" style="border-collapse: collapse; background: white;">
            <thead>
              <tr style="background: #f1f5f9; font-size: 11px; color: #475569; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 10px; text-align: left;">Nama Outlet</th>
                <th style="padding: 10px; text-align: left;">Temuan Masalah</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      `;
    });

    const subject = `[WEEKLY PENDING] Rekap Laporan Tunggakan & Duplikasi Tanggal Setoran`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #475569; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">REKAPITULASI TUNGGAKAN MINGGUAN</h2>
            <p style="color: #cbd5e1; font-size: 12px; margin-top: 5px;">Apotek Alpro Setoran Harian</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">Halo Tim Operasional, Keuangan, & Area Manager,</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Berikut adalah laporan mingguan rekapitulasi keterlambatan penyerahan laporan setoran wajib (melewati toleransi 4 hari) dan temuan tanggal duplikasi per Area Manager:
            </p>
            
            ${groupedHTML}
            
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">
              Laporan ini digenerate otomatis oleh Sistem Apotek Alpro.<br>
              Mohon segera melakukan tindakan pembinaan kepada outlet terkait.
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
      to: targetEmail,
      cc: ccEmails,
      subject: subject,
      html: htmlContent
    });

    console.log(`[send-weekly-pending-report] Sent OK to: ${targetEmail}. Grouped count: ${pendingUsers.length}`);

    return new Response(JSON.stringify({ success: true, count: pendingUsers.length }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-weekly-pending-report] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
