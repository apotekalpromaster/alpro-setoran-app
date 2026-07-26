import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as XLSX from 'npm:xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_FOLDER_ID = '1lreZQGF8F-3sFdPkQ1jzcQpVanz8ovY0';

function getMatchedUsername(rawStoreStr: string, storeMap: { [key: string]: string }): string {
  if (!rawStoreStr) return '';
  const clean = rawStoreStr.trim().toLowerCase();
  if (storeMap[clean]) return storeMap[clean];

  // Handle composite store string like "0001-JKJSTT1"
  if (clean.includes('-')) {
    const parts = clean.split('-');
    const part0 = parts[0].trim();
    const part1 = parts[1].trim();
    if (storeMap[part0]) return storeMap[part0];
    if (storeMap[part1]) return storeMap[part1];
  }
  return '';
}

function parseFormattedDate(rawVal: any): string {
  if (!rawVal) return '';
  const strVal = rawVal.toString().trim();

  // Excel Serial Number (e.g. 46223) - must be pure number
  if (/^\d+(\.\d+)?$/.test(strVal)) {
    const excelDateNum = parseFloat(strVal);
    // Sanity: Excel serial dates range approx 40000-50000 for 2009-2036
    if (excelDateNum > 40000 && excelDateNum < 60000) {
      const d = new Date((excelDateNum - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // YYYY-MM-DD format (including timestamp YYYY-MM-DD HH:mm:ss)
  const isoMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // DD/MM/YYYY or DD-MM-YYYY format
  const ddmmyyyyMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Standard Date fallback
  const d = new Date(strVal);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return '';
}

/**
 * Extract DDMMYYYY pattern from filename.
 * e.g. "Cash & Card Automation_00000726072026.xlsx" -> "26072026"
 * Pattern: 8 consecutive digits where last 4 are a plausible year (2020-2035)
 */
function extractDateFromFilename(filename: string): string {
  // Match 8 consecutive digits in filename
  const matches = filename.match(/\d{8}/g);
  if (!matches) return '';

  for (const match of matches) {
    const dd = match.substring(0, 2);
    const mm = match.substring(2, 4);
    const yyyy = match.substring(4, 8);

    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);

    if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Valid DDMMYYYY — return as YYYY-MM-DD for comparison
      return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    }
  }
  return '';
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

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN tidak dikonfigurasi.');
    }

    // 1. Get Google OAuth2 Access Token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      throw new Error(`Gagal mendapatkan Google Access Token: ${JSON.stringify(tokenData)}`);
    }

    const accessToken = tokenData.access_token;

    // 2. Compute today's date in WIB (Asia/Jakarta = UTC+7)
    const nowUtc = new Date();
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const nowWib = new Date(nowUtc.getTime() + wibOffsetMs);
    const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, '0')}-${String(nowWib.getUTCDate()).padStart(2, '0')}`;

    // Build today as DDMMYYYY string for filename matching
    const todayDD = String(nowWib.getUTCDate()).padStart(2, '0');
    const todayMM = String(nowWib.getUTCMonth() + 1).padStart(2, '0');
    const todayYYYY = String(nowWib.getUTCFullYear());
    const todayDDMMYYYY = `${todayDD}${todayMM}${todayYYYY}`; // e.g. "26072026"

    console.log(`[sync-pos-sales-from-drive] Today WIB: ${todayWibStr} | Filename date pattern: ${todayDDMMYYYY}`);

    // 3. Query Google Drive: list ALL files in the target folder (no modifiedTime filter)
    // Use only folder parent filter - no name filter to avoid & encoding issues
    const queryStr = `'${TARGET_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    const driveFields = 'files(id,name,modifiedTime,mimeType)';
    const driveSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&fields=${encodeURIComponent(driveFields)}&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&pageSize=50`;

    console.log(`[sync-pos-sales-from-drive] Drive query: ${queryStr}`);

    let listResp = await fetch(driveSearchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let listData = await listResp.json();

    if (!listResp.ok) {
      console.warn(`[sync-pos-sales-from-drive] Primary query failed (${listResp.status}): ${JSON.stringify(listData)}`);
      // Fallback: try without corpora restriction
      const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&fields=${encodeURIComponent(driveFields)}&orderBy=modifiedTime%20desc&pageSize=50`;
      listResp = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      listData = await listResp.json();
      if (!listResp.ok) {
        throw new Error(`Gagal query Google Drive: ${JSON.stringify(listData)}`);
      }
    }

    const allFiles: any[] = listData.files || [];
    console.log(`[sync-pos-sales-from-drive] Total files in folder: ${allFiles.length}`);

    if (allFiles.length === 0) {
      // Diagnostic: check which Google Account is authenticated
      try {
        const aboutResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const aboutData = await aboutResp.json();
        console.log(`[sync-pos-sales-from-drive] Authenticated as: ${JSON.stringify(aboutData.user)}`);
        console.log('[sync-pos-sales-from-drive] Folder might not be accessible by this account. Check folder sharing settings.');
      } catch (e) {
        console.error('[sync-pos-sales-from-drive] Could not fetch Google about info:', e);
      }
      return new Response(
        JSON.stringify({ success: true, message: 'Tidak ada berkas di folder Drive. Periksa sharing folder ke akun yang terkonfigurasi.', processedFiles: 0, totalUpserted: 0 }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // Log all found files for diagnostic
    allFiles.forEach(f => {
      const fileDate = extractDateFromFilename(f.name);
      console.log(`[sync-pos-sales-from-drive] Found: ${f.name} | modifiedTime: ${f.modifiedTime} | filenameDate: ${fileDate}`);
    });

    // 4. Select target files using FILENAME DATE MATCHING (primary strategy)
    //    Falls back to modifiedTime-based filter, then to latest file.
    let targetFiles: any[] = [];

    // Strategy A: Match by DDMMYYYY in filename = today
    const byFilenameDate = allFiles.filter(f => f.name.includes(todayDDMMYYYY));
    if (byFilenameDate.length > 0) {
      targetFiles = byFilenameDate;
      console.log(`[sync-pos-sales-from-drive] Strategy A (filename date match '${todayDDMMYYYY}'): ${targetFiles.length} file(s)`);
    }

    // Strategy B: Match by modifiedTime today in WIB
    if (targetFiles.length === 0) {
      const todayWibStartUtc = new Date(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), -7, 0, 0, 0).toISOString();
      const byModified = allFiles.filter(f => f.modifiedTime >= todayWibStartUtc);
      if (byModified.length > 0) {
        targetFiles = byModified;
        console.log(`[sync-pos-sales-from-drive] Strategy B (modifiedTime today): ${targetFiles.length} file(s)`);
      }
    }

    // Strategy C: Fallback to the latest file in folder
    if (targetFiles.length === 0 && allFiles.length > 0) {
      targetFiles = [allFiles[0]];
      console.log(`[sync-pos-sales-from-drive] Strategy C (latest file fallback): ${targetFiles[0].name}`);
    }

    if (targetFiles.length === 0) {
      console.log('[sync-pos-sales-from-drive] Tidak ada berkas Excel yang tersedia.');
      return new Response(
        JSON.stringify({ success: true, message: 'Tidak ada berkas Excel yang perlu diproses.', processedFiles: 0, totalUpserted: 0 }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Fetch profiles for store lookup
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('id, username, kode_toko')
      .eq('role', 'User');

    if (profErr) throw profErr;

    const storeMap: { [key: string]: string } = {};
    (profData || []).forEach((p) => {
      if (p.kode_toko) storeMap[p.kode_toko.toString().trim().toLowerCase()] = p.username;
      if (p.username) storeMap[p.username.toString().trim().toLowerCase()] = p.username;
    });

    let totalUpserted = 0;
    const processedReport: any[] = [];

    // 6. Process each target file
    for (const fileItem of targetFiles) {
      console.log(`[sync-pos-sales-from-drive] Downloading & parsing: ${fileItem.name} (id: ${fileItem.id})`);

      const fileDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media&supportsAllDrives=true`;
      const dlResp = await fetch(fileDownloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!dlResp.ok) {
        console.error(`Gagal download file ${fileItem.name}:`, dlResp.status, dlResp.statusText);
        continue;
      }

      const fileBuffer = await dlResp.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });

      if (workbook.SheetNames.length === 0) {
        console.warn(`File ${fileItem.name} tidak memiliki sheet.`);
        continue;
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      console.log(`[sync-pos-sales-from-drive] ${fileItem.name}: ${rawRows.length} rows total in sheet`);

      if (rawRows.length < 14) {
        console.warn(`File ${fileItem.name} tidak memiliki cukup baris data (minimum 14 baris, ditemukan ${rawRows.length}).`);
        continue;
      }

      // Detect header row at index 13 (row 14)
      const row14Str = (rawRows[13] || []).map((c) => (c || '').toString().toLowerCase()).join(' ');
      console.log(`[sync-pos-sales-from-drive] Row14 header sample: ${row14Str.substring(0, 120)}`);

      const isNewTemplate = row14Str.includes('date') && row14Str.includes('store') && row14Str.includes('cash amount');
      const startRowIndex = isNewTemplate ? 14 : 13;
      console.log(`[sync-pos-sales-from-drive] Template: ${isNewTemplate ? 'New (Cash & Card Automation)' : 'Legacy'}, data starts at row index ${startRowIndex}`);

      const rowsToUpsert: { kode_cabang: string; tanggal_jual: string; sales_pos: number }[] = [];

      for (let i = startRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const rawDateVal = (row[0] || '').toString().trim();
        const rawStoreVal = (row[1] || '').toString().trim();
        const rawColCVal = (row[2] || '').toString().trim();

        if (!rawDateVal || !rawStoreVal) continue;

        if (isNewTemplate) {
          const lowerA = rawDateVal.toLowerCase();
          const lowerB = rawStoreVal.toLowerCase();
          const lowerC = rawColCVal.toLowerCase();

          if (lowerA.includes('total') || lowerB.includes('total') || lowerC.includes('total')) continue;

          // Cash Amount from Col E (Index 4)
          const rawCashVal = (row[4] || '').toString().trim();
          const cleanSales = parseInt(rawCashVal.toString().replace(/[^0-9\-]/g, ''), 10) || 0;
          if (cleanSales === 0) continue;

          const matchedUsername = getMatchedUsername(rawStoreVal, storeMap);
          if (!matchedUsername) continue;

          const formattedDate = parseFormattedDate(rawDateVal);
          if (matchedUsername && formattedDate) {
            rowsToUpsert.push({ kode_cabang: matchedUsername, tanggal_jual: formattedDate, sales_pos: cleanSales });
          }
        } else {
          // Legacy Template
          const lowerDate = rawDateVal.toLowerCase();
          if (lowerDate.includes('total') || lowerDate.includes('grand total')) continue;

          const rawSalesVal = (row[2] || '').toString().trim();
          const matchedUsername = getMatchedUsername(rawStoreVal, storeMap);
          if (!matchedUsername) continue;

          const formattedDate = parseFormattedDate(rawDateVal);
          const cleanSales = parseInt(rawSalesVal.toString().replace(/[^0-9\-]/g, ''), 10) || 0;

          if (matchedUsername && formattedDate) {
            rowsToUpsert.push({ kode_cabang: matchedUsername, tanggal_jual: formattedDate, sales_pos: cleanSales });
          }
        }
      }

      console.log(`[sync-pos-sales-from-drive] ${fileItem.name}: ${rowsToUpsert.length} rows to upsert`);

      if (rowsToUpsert.length > 0) {
        const chunkSize = 500;
        for (let j = 0; j < rowsToUpsert.length; j += chunkSize) {
          const chunk = rowsToUpsert.slice(j, j + chunkSize);
          const { error: upsertErr } = await supabase
            .from('pos_sales_data')
            .upsert(chunk, { onConflict: 'kode_cabang, tanggal_jual' });

          if (upsertErr) {
            console.error(`[sync-pos-sales-from-drive] Error upserting chunk:`, upsertErr);
            throw upsertErr;
          }
        }

        totalUpserted += rowsToUpsert.length;
        processedReport.push({
          fileName: fileItem.name,
          modifiedTime: fileItem.modifiedTime,
          strategy: byFilenameDate.includes(fileItem) ? 'filename_date_match' : 'fallback',
          rowsCount: rowsToUpsert.length,
        });

        console.log(`[sync-pos-sales-from-drive] Upserted ${rowsToUpsert.length} rows from ${fileItem.name}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Berhasil memproses ${processedReport.length} berkas dan melakukan upsert ${totalUpserted} data sales ke pos_sales_data.`,
        processedFiles: targetFiles.length,
        totalUpserted,
        todayWib: todayWibStr,
        filenameDatePattern: todayDDMMYYYY,
        details: processedReport,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[sync-pos-sales-from-drive] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
