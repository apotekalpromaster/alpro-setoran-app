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

    const smtpUser = Deno.env.get('GMAIL_SMTP_USER');
    const smtpPass = Deno.env.get('GMAIL_SMTP_PASSWORD');

    if (!smtpUser || !smtpPass) {
      throw new Error('GMAIL_SMTP_USER / GMAIL_SMTP_PASSWORD tidak dikonfigurasi.');
    }

    const { issue_id, action_type, recipient_email } = await req.json();

    if (!issue_id) {
      throw new Error('Parameter issue_id wajib diisi.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: issue, error: issueErr } = await supabase
      .from('finance_troubleshooting_issues')
      .select('*')
      .eq('id', issue_id)
      .single();

    if (issueErr || !issue) {
      throw new Error('Data issue tidak ditemukan.');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const targetEmail = recipient_email || 'operation@apotekalpro.id, finance@apotekalpro.id';
    const nomStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(issue.nominal_selisih || 0);

    let subject = `[TROUBLESHOOTING AUDIT BANK] Notification for Store ${issue.kode_toko}`;
    let messageBody = '';

    if (action_type === 'NEW_ISSUE') {
      subject = `[AUDIT BANK] Perhatian: Isu Selisih Bank Baru - Toko ${issue.kode_toko} (SLA 2 Hari)`;
      messageBody = `
        <p>Halo Tim Toko <strong>${issue.kode_toko}</strong>,</p>
        <p>Tim Finance telah mengunggah keluhan / selisih audit bank yang memerlukan tanggapan Anda:</p>
        <ul>
          <li><strong>Kategori Issue:</strong> ${issue.kategori_issue}</li>
          <li><strong>Nominal Selisih:</strong> ${nomStr}</li>
          <li><strong>Penjelasan Finance:</strong> ${issue.keterangan_finance || '-'}</li>
          <li><strong>Batas Batas SLA:</strong> 2 Hari Kerjasama</li>
        </ul>
        <p>Mohon segera memberikan klarifikasi dan mengunggah bukti pada menu <strong>Troubleshooting Audit Bank</strong> di Dashboard Toko Anda.</p>
      `;
    } else if (action_type === 'STORE_RESPONDED') {
      subject = `[TANGGAPAN TOKO] Toko ${issue.kode_toko} Memuat Tanggapan Audit Bank`;
      messageBody = `
        <p>Tim Finance yang terhormat,</p>
        <p>Toko <strong>${issue.kode_toko}</strong> telah mengirimkan tanggapan untuk keluhan <strong>${issue.kategori_issue}</strong>:</p>
        <ul>
          <li><strong>Action Outlet:</strong> ${issue.action_outlet || '-'}</li>
          <li><strong>PIC Outlet:</strong> ${issue.pic_outlet || '-'}</li>
          <li><strong>Nominal Selisih:</strong> ${nomStr}</li>
        </ul>
        <p>Silakan buka Dashboard Finance untuk meninjau (Approve/Reject) tanggapan ini.</p>
      `;
    } else if (action_type === 'APPROVED') {
      subject = `[AUDIT BANK SETUJU] Isu Audit Bank Toko ${issue.kode_toko} Telah Disetujui Finance`;
      messageBody = `
        <p>Halo Toko <strong>${issue.kode_toko}</strong>,</p>
        <p>Tanggapan Anda mengenai selisih <strong>${issue.kategori_issue}</strong> sebesar <strong>${nomStr}</strong> telah <strong>DISETUJUI (APPROVED)</strong> oleh Tim Finance. Isu ini dinyatakan selesai/closed.</p>
      `;
    } else if (action_type === 'REJECTED') {
      subject = `[AUDIT BANK DITOLAK] Tanggapan Toko ${issue.kode_toko} Memerlukan Revisi`;
      messageBody = `
        <p>Halo Toko <strong>${issue.kode_toko}</strong>,</p>
        <p>Tanggapan Anda untuk isu <strong>${issue.kategori_issue}</strong> telah <strong>DITOLAK (REJECTED)</strong> oleh Tim Finance dengan catatan:</p>
        <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 10px; margin: 10px 0; color: #991b1b;">
          <strong>Alasan Rejection:</strong> ${issue.reject_notes || '-'}
        </div>
        <p>Mohon segera memperbaiki tanggapan dan mengunggah ulang bukti pada dashboard Anda.</p>
      `;
    }

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
        <div style="max-width: 650px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background: #d97706; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 18px;">TROUBLESHOOTING AUDIT BANK FINANCE</h2>
          </div>
          <div style="padding: 24px; color: #374151;">
            ${messageBody}
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://alpro-setoran-app.vercel.app/" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Buka Aplikasi Setoran</a>
            </div>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: 'apotekalpro.master@gmail.com',
      to: targetEmail,
      subject: subject,
      html: htmlTemplate,
    });

    transporter.close();
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[send-troubleshooting-notification] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
