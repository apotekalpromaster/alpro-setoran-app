import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const ccEmails = 'operation@apotekalpro.id, finance@apotekalpro.id, operation.excellence@apotekalpro.id';

    // Nodemailer Transporter with Connection Pooling
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,             // Enable connection pooling
      maxConnections: 1,      // Limit to max 1 concurrent connection to avoid 421 Google SMTP rate limits
      maxMessages: Infinity,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Read optional request body
    let bodyData: any = null;
    try {
      if (req.headers.get('content-type')?.includes('application/json')) {
        bodyData = await req.json();
      }
    } catch (_) {}

    let menunggakList: Array<{ cabang: string, frekuensi: string, email: string, tunggakan: string[], duplikasi: string[] }> = [];
    let customRecipient: string | null = null;
    let customOutletEmails: string[] = [];

    if (bodyData && bodyData.recipientEmail && bodyData.pending && bodyData.pending.length > 0) {
      // 1. MANUAL TRIGGER (from UI): sends consolidated email to specific Area Manager + all outlet emails in group
      customRecipient = bodyData.recipientEmail;
      bodyData.pending.forEach((p: any) => {
        if (p.email && p.email.trim()) {
          customOutletEmails.push(p.email.trim());
        }
        menunggakList.push({
          cabang: p.namaToko || p.cabang,
          frekuensi: p.frekuensi || 'Harian',
          email: p.email || '',
          tunggakan: (p.tanggalBolong || p.tunggakan || []).map((dStr: string) => {
            const parts = dStr.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
          }),
          duplikasi: (p.tanggalDuplikat || p.duplikasi || []).map((dStr: string) => {
            const parts = dStr.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
          })
        });
      });

      // Send consolidated manual AM email
      const targetEmail = customOutletEmails.length > 0 
        ? [...new Set(customOutletEmails)].join(', ') + ', ' + customRecipient 
        : 'outlets@apotekalpro.id, ' + customRecipient;

      const subject = `[REMINDER] Laporan Apotek Menunggak Setoran`;

      let tableRows = '';
      menunggakList.forEach(m => {
        const tglList = m.tunggakan.length > 0 
          ? `<li style="margin-bottom: 2px;">Tunggakan: ${m.tunggakan.join(', ')}</li>` 
          : '';
        const dupList = m.duplikasi.length > 0 
          ? `<li style="margin-bottom: 2px; color: #f59e0b;">Duplikasi: ${m.duplikasi.join(', ')}</li>` 
          : '';
        
        tableRows += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; color: #374151; font-weight: bold;">${m.cabang}<br><span style="font-size: 10px; font-weight: normal; color: #6b7280;">(${m.frekuensi})</span></td>
            <td style="padding: 12px; color: #b91c1c; font-size: 13px;">
              <ul style="margin: 0; padding-left: 16px;">
                ${tglList}
                ${dupList}
              </ul>
            </td>
          </tr>
        `;
      });

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: #ea580c; padding: 20px; text-align: center;">
              <h2 style="color: white; margin: 0;">LAPORAN CABANG MENUNGGAK & DUPLIKASI</h2>
              <p style="color: #ffedd5; font-size: 12px; margin-top: 5px;">Aplikasi Setoran Harian Apotek Alpro</p>
            </div>
            <div style="padding: 20px;">
              <p style="color: #374151; font-size: 14px; line-height: 1.6;">Berikut adalah daftar cabang apotek yang memiliki tunggakan setoran atau duplikasi tanggal:</p>
              <table width="100%" style="border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb;">
                <thead>
                  <tr style="background: #fef3c7;">
                    <th style="padding: 12px; text-align: left; font-size: 12px; color: #92400e; border-bottom: 2px solid #fde68a;">Nama Toko</th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; color: #92400e; border-bottom: 2px solid #fde68a;">Tanggal Temuan</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
              <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">Dihasilkan oleh Aplikasi Setoran Harian Apotek Alpro</p>
            </div>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: fromEmail,
        to: targetEmail,
        cc: ccEmails,
        subject: subject,
        html: htmlContent
      });

      console.log(`[send-reminder-emails] Manual email sent OK to: ${targetEmail}`);
      transporter.close(); // Close SMTP pool connection
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else {
      // 2. AUTOMATIC SCHEDULER: Loops through pending/duplicated outlets in hourly batches (25 per batch)
      // Fetch Area Manager emails map
      const { data: amProfiles } = await supabase
        .from('profiles')
        .select('username, email')
        .or('role.eq.Area Manager,role.eq.area manager,role.eq.AREA MANAGER');

      const amEmailMap: { [name: string]: string } = {};
      if (amProfiles) {
        amProfiles.forEach((am: any) => {
          if (am.username && am.email) {
            amEmailMap[am.username.trim().toUpperCase()] = am.email.trim();
          }
        });
      }

      const { data: users, error: uErr } = await supabase
        .from('profiles')
        .select('id, username, email, frekuensi_setoran, tanggal_aktif, area_manager')
        .eq('role', 'User');
      if (uErr) throw uErr;

      // Fetch all reports in entire database (paginated to bypass limit)
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

      // Compute duplicated dates
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

      // Compute missing dates
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 4);
      limitDate.setHours(23, 59, 59, 999);
      const limitDateStr = limitDate.toISOString().split('T')[0];

      const submittedSet = new Set(laporanRaw.map((r) => `${r.user_id}_${r.tanggal_jual}`));

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
            email: user.email,
            areaManager: user.area_manager || null,
            frekuensi: user.frekuensi_setoran || 'SETIAP HARI',
            tanggalBolong: missing,
            tanggalDuplikat: duplicates,
          });
        }
      });

      // Sort by highest number of total issues (missing + duplicate dates) first
      pendingUsers.sort((a, b) => (b.tanggalBolong.length + b.tanggalDuplikat.length) - (a.tanggalBolong.length + a.tanggalDuplikat.length));

      // Tentukan offset batch berdasarkan jam eksekusi WIB (UTC+7)
      // Jam 08:00 WIB (UTC 01:00) -> Offset 0   (Toko 1 - 25)
      // Jam 09:00 WIB (UTC 02:00) -> Offset 25  (Toko 26 - 50)
      // Jam 10:00 WIB (UTC 03:00) -> Offset 50  (Toko 51 - 75)
      // Jam 11:00 WIB (UTC 04:00) -> Offset 75  (Toko 76 - 100)
      const now = new Date();
      const wibHour = (now.getUTCHours() + 7) % 24;

      let offset = 0;
      if (wibHour === 9) {
        offset = 25;
      } else if (wibHour === 10) {
        offset = 50;
      } else if (wibHour >= 11) {
        offset = 75;
      }

      const MAX_PER_RUN = 25;
      const targetUsers = pendingUsers.slice(offset, offset + MAX_PER_RUN);

      console.log(`[send-reminder-emails] Jam WIB: ${wibHour}:00, Batch Offset: ${offset}. Total outlet bermasalah: ${pendingUsers.length}. Memproses ${targetUsers.length} outlet (Urutan ${offset + 1} s/d ${offset + targetUsers.length}).`);

      // Sequentially send individual emails one-by-one with 250ms delay
      let successCount = 0;
      let failCount = 0;
      for (const item of targetUsers) {
        if (!item.email || !item.email.includes('@')) {
          console.log(`[send-reminder-emails] Skip ${item.namaToko} - No registered email address.`);
          continue;
        }

        const subject = `[REMINDER] Keterlambatan Laporan & Duplikasi Tanggal Setoran - ${item.namaToko}`;
        
        let pendingListHTML = '';
        if (item.tanggalBolong.length > 0) {
          pendingListHTML = `
            <div style="margin-top: 15px;">
              <h4 style="margin: 0 0 5px 0; color: #b91c1c;">Tanggal Belum Dilaporkan (Tunggakan):</h4>
              <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
                ${item.tanggalBolong.slice(0, 30).map((tgl: string) => {
                  const parts = tgl.split('-');
                  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                  return `<li>${d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</li>`;
                }).join('')}
                ${item.tanggalBolong.length > 30 ? `<li>...dan ${item.tanggalBolong.length - 30} hari lainnya</li>` : ''}
              </ul>
            </div>
          `;
        }

        let duplicateListHTML = '';
        if (item.tanggalDuplikat.length > 0) {
          duplicateListHTML = `
            <div style="margin-top: 15px;">
              <h4 style="margin: 0 0 5px 0; color: #f59e0b;">Tanggal Laporan Duplikat:</h4>
              <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
                ${item.tanggalDuplikat.slice(0, 30).map((tgl: string) => {
                  const parts = tgl.split('-');
                  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                  return `<li>${d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</li>`;
                }).join('')}
                ${item.tanggalDuplikat.length > 30 ? `<li>...dan ${item.tanggalDuplikat.length - 30} tanggal lainnya</li>` : ''}
              </ul>
            </div>
          `;
        }

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: #ea580c; padding: 20px; text-align: center;">
                <h2 style="color: white; margin: 0;">PEMBERITAHUAN KEPATUHAN SETORAN</h2>
                <p style="color: #ffedd5; font-size: 12px; margin-top: 5px;">Apotek Alpro Setoran Harian</p>
              </div>
              <div style="padding: 20px;">
                <p style="color: #374151; font-size: 14px; line-height: 1.6;">Halo Tim <strong>${item.namaToko}</strong>,</p>
                <p style="color: #374151; font-size: 14px; line-height: 1.6;">
                  Berdasarkan audit sistem setoran harian, ditemukan indikasi ketidakpatuhan berupa adanya <strong>tanggal belum dilaporkan</strong> (melewati toleransi 4 hari) atau <strong>laporan duplikat</strong> pada outlet Anda.
                </p>
                
                ${pendingListHTML}
                ${duplicateListHTML}
                
                <p style="color: #374151; font-size: 14px; line-height: 1.6; margin-top: 20px;">
                  Mohon segera melengkapi laporan setoran yang belum masuk, atau merevisi laporan yang duplikat melalui aplikasi setoran harian Apotek Alpro.
                </p>
                
                <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
                  <a href="https://alpro-setoran-app.vercel.app/" style="background: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Buka Aplikasi Setoran</a>
                </div>
                
                <p style="margin-top: 30px; font-size: 11px; color: #6b7280; text-align: center;">
                  Dihasilkan otomatis oleh pg_cron & Edge Functions<br>
                  Aplikasi Setoran Harian Apotek Alpro
                </p>
              </div>
            </div>
          </div>
        `;

        try {
          // CC email dinamis ke Area Manager yang membawahi toko
          let targetCC: string | undefined = undefined;
          if (item.areaManager) {
            const matchedAm = amEmailMap[item.areaManager.trim().toUpperCase()];
            if (matchedAm) {
              targetCC = matchedAm;
            }
          }

          await transporter.sendMail({
            from: fromEmail,
            to: item.email,
            ...(targetCC ? { cc: targetCC } : {}),
            subject: subject,
            html: htmlContent
          });
          successCount++;
        } catch (mailErr) {
          console.error(`[send-reminder-emails] Gagal kirim ke ${item.namaToko}:`, mailErr);
          failCount++;
        }

        // Delay 250ms per email to avoid hitting rate limits
        await delay(250);
      }

      transporter.close(); // Close SMTP connection pool
      console.log(`[send-reminder-emails] Option A run finished. Processed: ${targetUsers.length} of ${pendingUsers.length}. Sukses: ${successCount}, Gagal: ${failCount}`);
      return new Response(JSON.stringify({ success: true, processed: targetUsers.length, totalPending: pendingUsers.length, count: successCount, failed: failCount }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-reminder-emails] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
