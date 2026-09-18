import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as XLSX from 'npm:xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Content-Disposition',
};

// 3 Jenis Pelaporan Utama Pemenuhan Omset Penjualan
const PRIMARY_REPORT_TYPES = [
  'Setoran Harian',
  'Setoran 3x Seminggu',
  'Setoran Sales Dengan Potongan Penjualan',
  'Setoran Sales Dengan Potongan Penjualan (Top Up Petty Cash Toko)',
  'Setoran Sales Dgn Potongan (Top Up Petty Cash)'
];

const isPrimaryReportType = (jenis: string): boolean => {
  if (!jenis) return false;
  return (
    PRIMARY_REPORT_TYPES.includes(jenis) ||
    jenis.includes('Dengan Potongan Penjualan') ||
    jenis.includes('Potongan Penjualan') ||
    jenis.includes('Top Up Petty Cash')
  );
};

const HARI_MAP: { [key: number]: string } = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
};

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Konfigurasi SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Parse Query Parameters
    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'xlsx').toLowerCase();
    const areaManagerParam = url.searchParams.get('area_manager') || 'all';
    const scopeParam = (url.searchParams.get('scope') || 'primary').toLowerCase(); // 'primary' vs 'all'

    // Default Baseline: 1 April 2026
    const startDateParam = url.searchParams.get('start_date') || '2026-04-01';

    // Default End Date: Hari ini (H-0) dalam Waktu Indonesia Barat (WIB / UTC+7)
    const now = new Date();
    const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const defaultEndDateStr = wibDate.toISOString().split('T')[0];
    const endDateParam = url.searchParams.get('end_date') || defaultEndDateStr;

    // 3. Fetch Master Toko (profiles dengan role = 'User')
    const { data: usersData, error: uErr } = await supabase
      .from('profiles')
      .select('id, username, email, kode_toko, frekuensi_setoran, area_manager')
      .eq('role', 'User');

    if (uErr) throw uErr;

    const usersMap: { [userId: string]: any } = {};
    (usersData || []).forEach(u => {
      usersMap[u.id] = u;
    });

    let targetUserIds = Object.keys(usersMap);
    if (areaManagerParam !== 'all') {
      targetUserIds = targetUserIds.filter(id => {
        const u = usersMap[id];
        return u.area_manager && u.area_manager.toLowerCase() === areaManagerParam.toLowerCase();
      });
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'Tidak ada data user/toko yang sesuai filter.' }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 4. Fetch Seluruh Laporan Aktif dalam Rentang Tanggal (Dengan Loop Pagination Anti-Truncate)
    let laporanRaw: any[] = [];
    let lFrom = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error: lErr } = await supabase
        .from('laporan')
        .select('*')
        .gte('tanggal_jual', startDateParam)
        .lte('tanggal_jual', endDateParam)
        .in('user_id', targetUserIds)
        .range(lFrom, lFrom + PAGE_SIZE - 1);

      if (lErr) throw lErr;
      const validBatch = batch || [];
      laporanRaw = laporanRaw.concat(validBatch);

      if (validBatch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        lFrom += PAGE_SIZE;
      }
    }

    // 5. Filter Laporan Aktif (Abaikan yang di-Archived atau Dibatalkan/Dihapus)
    const activeReports = laporanRaw.filter((r: any) =>
      r.status !== 'Archived' &&
      r.jenis_pelaporan !== 'DIHAPUS / DIBATALKAN' &&
      r.jenis_pelaporan !== 'HAPUS_DATA' &&
      r.tanggal_jual &&
      r.user_id
    );

    // Filter Scope: 'primary' (default) hanya pelaporan omset utama, 'all' semua jenis laporan
    const scopedReports = activeReports.filter((r: any) => {
      if (scopeParam === 'all') return true;
      return isPrimaryReportType(r.jenis_pelaporan);
    });

    // 6. Kelompokkan Laporan Berdasarkan Kombinasi: user_id + '_' + tanggal_jual
    const groupedReports: { [key: string]: any[] } = {};
    scopedReports.forEach(r => {
      const key = `${r.user_id}_${r.tanggal_jual}`;
      if (!groupedReports[key]) {
        groupedReports[key] = [];
      }
      groupedReports[key].push(r);
    });

    // Ambil Hanya Kelompok yang Memiliki Laporan Duplikat (Jumlah Laporan > 1)
    const duplicateGroupKeys = Object.keys(groupedReports).filter(key => groupedReports[key].length > 1);

    // 7. Kompilasi Data Sheet 1 (Summary per Toko) & Sheet 2 (Detail Audit per Laporan)
    const storeStatsMap: {
      [userId: string]: {
        username: string;
        kodeToko: string;
        areaManager: string;
        email: string;
        frekuensi: string;
        duplicateDates: { [dateStr: string]: number };
        totalReportsCount: number;
      };
    } = {};

    // Rincian Detail Baris (Sheet 2)
    const rawDetailGroups: Array<{
      date: string;
      username: string;
      reports: any[];
    }> = [];

    duplicateGroupKeys.forEach(key => {
      const parts = key.split('_');
      const userId = parts[0];
      const dateStr = parts[1];
      const reportsInGroup = groupedReports[key];

      // Urutkan laporan dalam kelompok berdasarkan timestamp / created_at tertua ke terbaru
      reportsInGroup.sort((a, b) => {
        const timeA = a.timestamp || a.created_at || '';
        const timeB = b.timestamp || b.created_at || '';
        return timeA.localeCompare(timeB);
      });

      const user = usersMap[userId] || {};
      const username = user.username || 'Toko Tidak Dikenal';

      if (!storeStatsMap[userId]) {
        storeStatsMap[userId] = {
          username,
          kodeToko: user.kode_toko || '-',
          areaManager: user.area_manager || 'Belum Ditentukan',
          email: user.email || '-',
          frekuensi: user.frekuensi_setoran || 'SETIAP HARI',
          duplicateDates: {},
          totalReportsCount: 0,
        };
      }

      storeStatsMap[userId].duplicateDates[dateStr] = reportsInGroup.length;
      storeStatsMap[userId].totalReportsCount += reportsInGroup.length;

      rawDetailGroups.push({
        date: dateStr,
        username,
        reports: reportsInGroup,
      });
    });

    // Urutkan grup detail: secara kronologis tanggal_jual (terlama ke terbaru), lalu nama toko
    rawDetailGroups.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.username.localeCompare(b.username);
    });

    // Buat data baris untuk Sheet 2 (Detail)
    const detailRows: any[] = [];
    let detailCounter = 1;

    rawDetailGroups.forEach(group => {
      const dObj = new Date(group.date + 'T00:00:00Z');
      const dayName = HARI_MAP[dObj.getUTCDay()] || '-';

      group.reports.forEach((r, idx) => {
        const u = usersMap[r.user_id] || {};

        // Kalkulasi Total Non Tunai
        const nonTunaiVal = Number(r.bca_debit || 0) + Number(r.bca_kredit || 0) + Number(r.bca_qris || 0) +
                            Number(r.bri_debit || 0) + Number(r.bri_kredit || 0) + Number(r.bri_qris || 0) +
                            Number(r.bank_transfer || 0) || Number(r.total_non_tunai || 0);

        // Kalkulasi Total Online
        const onlineVal = Number(r.online_halodoc || 0) + Number(r.online_tiktok || 0) + Number(r.online_tokopedia || 0) ||
                          Number(r.total_online || 0);

        // Kalkulasi Total Lain-lain
        const voucherVal = Number(r.voucher_amount || 0);
        const pointsVal = Number(r.points_amount || 0);
        const totalLainVal = Number(r.total_lain_lain || 0) || (voucherVal + pointsVal);

        const urutanInput = idx === 0
          ? 'Laporan #1 (Input Pertama)'
          : `Laporan #${idx + 1} (Input Duplikat)`;

        detailRows.push({
          'No': detailCounter++,
          'Tanggal Penjualan': r.tanggal_jual,
          'Hari': dayName,
          'Nama Cabang / Toko': u.username || group.username,
          'Kode Toko': u.kode_toko || '-',
          'Area Manager': u.area_manager || 'Belum Ditentukan',
          'Urutan Input': urutanInput,
          'ID Laporan (UUID)': r.id,
          'Waktu Input Sistem': r.timestamp || r.created_at || '-',
          'Jenis Pelaporan': r.jenis_pelaporan,
          'Nominal Jual (Sales)': Number(r.nominal_jual || 0),
          'Nominal Setor (Kas Fisik)': Number(r.nominal_setoran || 0),
          'Potongan Penjualan': Number(r.potongan || 0),
          'Total Non-Tunai / EDC': nonTunaiVal,
          'Total Sales Online': onlineVal,
          'Voucher Amount': voucherVal,
          'Points Amount': pointsVal,
          'Total Lain-lain': totalLainVal,
          'Tanggal Setor ke Bank': r.tanggal_setor || '-',
          'Status Laporan': r.status || '-',
          'Catatan / Penjelasan': r.penjelasan || r.catatan_koreksi || '-'
        });
      });
    });

    // Buat data baris untuk Sheet 1 (Summary per Toko)
    const summaryList = Object.values(storeStatsMap).map(s => {
      const datesList = Object.keys(s.duplicateDates).sort();
      const ringkasan = datesList.map(d => `${d} (${s.duplicateDates[d]} lap)`).join(', ');

      return {
        username: s.username,
        kodeToko: s.kodeToko,
        areaManager: s.areaManager,
        email: s.email,
        frekuensi: s.frekuensi,
        totalTanggalDuplikat: datesList.length,
        totalLaporanGanda: s.totalReportsCount,
        ringkasanTanggal: ringkasan,
        statusTindakan: 'Perlu Tindakan: Hapus/Koreksi Laporan Ganda'
      };
    });

    // Urutkan summary dari jumlah tanggal duplikat terbanyak (descending)
    summaryList.sort((a, b) => {
      if (b.totalTanggalDuplikat !== a.totalTanggalDuplikat) {
        return b.totalTanggalDuplikat - a.totalTanggalDuplikat;
      }
      return a.username.localeCompare(b.username);
    });

    const summarySheetData = summaryList.map((s, idx) => ({
      'No': idx + 1,
      'Nama Cabang / Toko': s.username,
      'Kode Toko': s.kodeToko,
      'Area Manager': s.areaManager,
      'Email Toko': s.email,
      'Frekuensi Setoran': s.frekuensi,
      'Jumlah Tanggal Duplikat': s.totalTanggalDuplikat,
      'Total Entri Laporan Ganda': s.totalLaporanGanda,
      'Rincian Tanggal Duplikat': s.ringkasanTanggal,
      'Status Rekomendasi': s.statusTindakan
    }));

    // 8. Kompilasi Workbook Excel atau Format CSV
    const wb = XLSX.utils.book_new();

    // Sheet 1: Rekap per Toko
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{
      'Keterangan': 'Bersih! Tidak ditemukan adanya laporan penjualan duplikat sejak 1 April 2026.'
    }]);
    wsSummary['!cols'] = [
      { wch: 6 },   // No
      { wch: 28 },  // Nama Cabang / Toko
      { wch: 14 },  // Kode Toko
      { wch: 22 },  // Area Manager
      { wch: 30 },  // Email Toko
      { wch: 20 },  // Frekuensi Setoran
      { wch: 24 },  // Jumlah Tanggal Duplikat
      { wch: 25 },  // Total Entri Laporan Ganda
      { wch: 45 },  // Rincian Tanggal Duplikat
      { wch: 40 },  // Status Rekomendasi
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Toko Duplikat');

    // Sheet 2: Rincian Data Laporan Duplikat
    const wsDetail = XLSX.utils.json_to_sheet(detailRows.length > 0 ? detailRows : [{
      'Keterangan': 'Nihil. Tidak ada data baris laporan yang saling menduplikasi.'
    }]);
    wsDetail['!cols'] = [
      { wch: 6 },   // No
      { wch: 18 },  // Tanggal Penjualan
      { wch: 12 },  // Hari
      { wch: 28 },  // Nama Cabang / Toko
      { wch: 14 },  // Kode Toko
      { wch: 22 },  // Area Manager
      { wch: 28 },  // Urutan Input
      { wch: 38 },  // ID Laporan (UUID)
      { wch: 28 },  // Waktu Input Sistem
      { wch: 26 },  // Jenis Pelaporan
      { wch: 22 },  // Nominal Jual (Sales)
      { wch: 24 },  // Nominal Setor (Kas Fisik)
      { wch: 18 },  // Potongan Penjualan
      { wch: 22 },  // Total Non-Tunai / EDC
      { wch: 20 },  // Total Sales Online
      { wch: 16 },  // Voucher Amount
      { wch: 16 },  // Points Amount
      { wch: 16 },  // Total Lain-lain
      { wch: 22 },  // Tanggal Setor ke Bank
      { wch: 16 },  // Status Laporan
      { wch: 30 },  // Catatan / Penjelasan
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Rincian Laporan Duplikat');

    // 9. Generate Output Stream
    const cleanStartDate = startDateParam.replace(/[^0-9-]/g, '');
    const cleanEndDate = endDateParam.replace(/[^0-9-]/g, '');

    if (format === 'csv') {
      const csvSource = detailRows.length > 0 ? wsDetail : wsSummary;
      const csvString = '\uFEFF' + XLSX.utils.sheet_to_csv(csvSource);
      const csvFilename = `Report_Laporan_Duplikat_Sales_${cleanStartDate}_sd_${cleanEndDate}.csv`;

      return new Response(csvString, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${csvFilename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    // Format Excel (.xlsx)
    const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const xlsxFilename = `Report_Laporan_Duplikat_Sales_${cleanStartDate}_sd_${cleanEndDate}.xlsx`;

    return new Response(xlsxBuffer, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${xlsxFilename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error: any) {
    console.error('[export-duplicate-sales-report] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Terjadi kesalahan sistem saat mengekspor laporan duplikat.',
        details: error
      }),
      {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      }
    );
  }
});
