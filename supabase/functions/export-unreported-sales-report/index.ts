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
    const filterMode = (url.searchParams.get('filter') || 'menunggak').toLowerCase(); // 'menunggak' vs 'all'

    // Default Baseline: 1 April 2026
    const startDateParam = url.searchParams.get('start_date') || '2026-04-01';

    // Default End Date: Kemarin (H-1) dalam Waktu Indonesia Barat (WIB / UTC+7)
    const now = new Date();
    const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    wibDate.setUTCDate(wibDate.getUTCDate() - 1);
    const defaultEndDateStr = wibDate.toISOString().split('T')[0];
    const endDateParam = url.searchParams.get('end_date') || defaultEndDateStr;

    // 3. Fetch Master Toko (profiles dengan role = 'User')
    const { data: usersData, error: uErr } = await supabase
      .from('profiles')
      .select('id, username, email, kode_toko, frekuensi_setoran, tanggal_aktif, area_manager')
      .eq('role', 'User');

    if (uErr) throw uErr;

    let users = usersData || [];
    if (areaManagerParam !== 'all') {
      users = users.filter(u => u.area_manager && u.area_manager.toLowerCase() === areaManagerParam.toLowerCase());
    }

    if (users.length === 0) {
      return new Response(JSON.stringify({ message: 'Tidak ada data user/toko yang sesuai kriteria.' }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 4. Tentukan Batas Minimal Tanggal untuk Fetch Laporan
    let minFetchDate = startDateParam;
    users.forEach(u => {
      const act = u.tanggal_aktif || '2026-04-01';
      if (act < minFetchDate) minFetchDate = act;
    });

    // 5. Fetch Seluruh Laporan Aktif Pada Rentang Tanggal (Dengan Loop Pagination Anti-Truncate)
    let laporanRaw: any[] = [];
    let lFrom = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error: lErr } = await supabase
        .from('laporan')
        .select('user_id, tanggal_jual, jenis_pelaporan, status')
        .gte('tanggal_jual', minFetchDate)
        .lte('tanggal_jual', endDateParam)
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

    // 6. Filter Laporan Hanya untuk 3 Jenis Pelaporan Utama yang Valid
    const activePrimaryReports = laporanRaw.filter((r: any) =>
      r.status !== 'Archived' &&
      r.jenis_pelaporan !== 'DIHAPUS / DIBATALKAN' &&
      r.jenis_pelaporan !== 'HAPUS_DATA' &&
      isPrimaryReportType(r.jenis_pelaporan)
    );

    // Kumpulan Kunci Unik Laporan yang Sudah Disubmit: user_id + '_' + tanggal_jual
    const submittedSet = new Set(
      activePrimaryReports
        .filter(r => r.user_id && r.tanggal_jual)
        .map(r => `${r.user_id}_${r.tanggal_jual}`)
    );

    // Rekam Tanggal Laporan Terakhir per User
    const latestReportMap: { [userId: string]: string } = {};
    activePrimaryReports.forEach(r => {
      if (r.user_id && r.tanggal_jual) {
        if (!latestReportMap[r.user_id] || r.tanggal_jual > latestReportMap[r.user_id]) {
          latestReportMap[r.user_id] = r.tanggal_jual;
        }
      }
    });

    // 7. Kalkulasi Hari Bolong (Tunggakan) per Toko
    interface StoreSummary {
      no: number;
      username: string;
      kodeToko: string;
      areaManager: string;
      email: string;
      frekuensi: string;
      tanggalMulaiAudit: string;
      totalTunggakan: number;
      statusKepatuhan: string;
      ringkasanTanggal: string;
      tanggalTerakhirMelapor: string;
      missingDays: string[];
    }

    const summaryList: StoreSummary[] = [];
    const detailRows: any[] = [];
    let detailCounter = 1;

    users.forEach(u => {
      // Tanggal mulai audit per toko:
      // Jika toko baru aktif setelah 1 April 2026, mulai dari tanggal_aktif
      // Jika sebelum 1 April atau kosong, gunakan baseline 2026-04-01
      let userStart = startDateParam;
      if (u.tanggal_aktif && u.tanggal_aktif > startDateParam) {
        userStart = u.tanggal_aktif;
      }

      const missing: string[] = [];
      const cur = new Date(userStart + 'T00:00:00Z');
      const end = new Date(endDateParam + 'T00:00:00Z');

      while (cur <= end) {
        const dateStr = cur.toISOString().split('T')[0];
        const key = `${u.id}_${dateStr}`;
        if (!submittedSet.has(key)) {
          missing.push(dateStr);
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      // Sort tanggal bolong chronologically
      missing.sort();

      const lastReportDate = latestReportMap[u.id] || 'Belum Pernah Melapor';
      const statusKepatuhan = missing.length === 0 
        ? 'DISIPLIN (NIHIL TUNGGAKAN)' 
        : `MENUNGGAK ${missing.length} HARI`;

      summaryList.push({
        no: 0,
        username: u.username || '-',
        kodeToko: u.kode_toko || '-',
        areaManager: u.area_manager || 'Belum Ditentukan',
        email: u.email || '-',
        frekuensi: u.frekuensi_setoran || 'SETIAP HARI',
        tanggalMulaiAudit: userStart,
        totalTunggakan: missing.length,
        statusKepatuhan,
        ringkasanTanggal: missing.length > 0 ? missing.join(', ') : '-',
        tanggalTerakhirMelapor: lastReportDate,
        missingDays: missing
      });
    });

    // 8. Sorting: Toko dengan jumlah tunggakan terbanyak di urutan paling atas
    summaryList.sort((a, b) => {
      if (b.totalTunggakan !== a.totalTunggakan) {
        return b.totalTunggakan - a.totalTunggakan;
      }
      return a.username.localeCompare(b.username);
    });

    // Filter jika mode 'menunggak' (hanya toko dengan tunggakan > 0)
    let filteredSummary = summaryList;
    if (filterMode === 'menunggak') {
      filteredSummary = summaryList.filter(s => s.totalTunggakan > 0);
    }

    // Nomor urut dan kompilasi Detail Rows
    filteredSummary.forEach((s, idx) => {
      s.no = idx + 1;

      // Buat baris rincian per tanggal bolong
      s.missingDays.forEach(dayStr => {
        const dObj = new Date(dayStr + 'T00:00:00Z');
        const dayName = HARI_MAP[dObj.getUTCDay()] || '-';

        detailRows.push({
          'No': detailCounter++,
          'Tanggal Penjualan Menunggak': dayStr,
          'Hari': dayName,
          'Nama Cabang / Toko': s.username,
          'Kode Toko': s.kodeToko,
          'Area Manager': s.areaManager,
          'Email Toko': s.email,
          'Frekuensi Setoran': s.frekuensi,
          'Keterangan': 'Belum Lapor Sales Harian / 3x Seminggu / Potongan'
        });
      });
    });

    // Struktur Data Sheet 1 (Summary)
    const summarySheetData = filteredSummary.map(s => ({
      'No': s.no,
      'Nama Cabang / Toko': s.username,
      'Kode Toko': s.kodeToko,
      'Area Manager': s.areaManager,
      'Email Toko': s.email,
      'Frekuensi Setoran': s.frekuensi,
      'Tanggal Mulai Audit': s.tanggalMulaiAudit,
      'Total Hari Menunggak': s.totalTunggakan,
      'Status Kepatuhan': s.statusKepatuhan,
      'Ringkasan Tanggal Menunggak': s.ringkasanTanggal,
      'Tanggal Terakhir Melapor': s.tanggalTerakhirMelapor
    }));

    // 9. Kompilasi Workbook Excel atau Format CSV
    const wb = XLSX.utils.book_new();

    // Sheet 1: Rekap per Toko
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{
      'Keterangan': 'Luar biasa! Seluruh toko telah disiplin dan tidak memiliki tunggakan setoran.'
    }]);
    wsSummary['!cols'] = [
      { wch: 6 },   // No
      { wch: 28 },  // Nama Cabang / Toko
      { wch: 14 },  // Kode Toko
      { wch: 22 },  // Area Manager
      { wch: 30 },  // Email Toko
      { wch: 20 },  // Frekuensi Setoran
      { wch: 20 },  // Tanggal Mulai Audit
      { wch: 22 },  // Total Hari Menunggak
      { wch: 28 },  // Status Kepatuhan
      { wch: 50 },  // Ringkasan Tanggal Menunggak
      { wch: 25 },  // Tanggal Terakhir Melapor
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Rekap Tunggakan per Toko');

    // Sheet 2: Rincian per Tanggal Bolong
    const wsDetail = XLSX.utils.json_to_sheet(detailRows.length > 0 ? detailRows : [{
      'Keterangan': 'Nihil. Tidak ada tanggal penjualan yang menunggak.'
    }]);
    wsDetail['!cols'] = [
      { wch: 6 },   // No
      { wch: 26 },  // Tanggal Penjualan Menunggak
      { wch: 12 },  // Hari
      { wch: 28 },  // Nama Cabang / Toko
      { wch: 14 },  // Kode Toko
      { wch: 22 },  // Area Manager
      { wch: 30 },  // Email Toko
      { wch: 20 },  // Frekuensi Setoran
      { wch: 50 },  // Keterangan
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Rincian Tanggal Menunggak');

    // 10. Generate Output Stream
    const cleanStartDate = startDateParam.replace(/[^0-9-]/g, '');
    const cleanEndDate = endDateParam.replace(/[^0-9-]/g, '');

    if (format === 'csv') {
      const csvSource = detailRows.length > 0 ? wsDetail : wsSummary;
      const csvString = '\uFEFF' + XLSX.utils.sheet_to_csv(csvSource);
      const csvFilename = `Report_Toko_Menunggak_Setoran_Sales_${cleanStartDate}_sd_${cleanEndDate}.csv`;

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
    const xlsxFilename = `Report_Toko_Menunggak_Setoran_Sales_${cleanStartDate}_sd_${cleanEndDate}.xlsx`;

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
    console.error('[export-unreported-sales-report] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Terjadi kesalahan sistem saat mengekspor laporan.',
        details: error 
      }), 
      {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      }
    );
  }
});
