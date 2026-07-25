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

  // Excel Serial Number (e.g. 46223)
  if (/^d+(.d+)?$/.test(strVal)) {
    const excelDateNum = parseFloat(strVal);
    const d = new Date((excelDateNum - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // YYYY-MM-DD format (including timestamp YYYY-MM-DD HH:mm:ss)
  const isoMatch = strVal.match(/^(d{4}-d{2}-d{2})/);
  if (isoMatch) return isoMatch[1];

  // DD/MM/YYYY or DD-MM-YYYY format
  const ddmmyyyyMatch = strVal.match(/^(d{1,2})[/-](d{1,2})[/-](d{4})/);
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

    // 2. Compute today 00:00:00 WIB timestamp (Asia/Jakarta = UTC+7)
    const nowUtc = new Date();
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const nowWib = new Date(nowUtc.getTime() + wibOffsetMs);
    const todayWibStart = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 0, 0, 0));
    // Convert back to UTC for Drive API query comparison
    const searchCutoffIso = new Date(todayWibStart.getTime() - wibOffsetMs).toISOString();

    console.log(`[sync-pos-sales-from-drive] Search cutoff (Modified >=): ${searchCutoffIso}`);

    // 3. Query Google Drive API for files in folder 1lreZQGF8F-3sFdPkQ1jzcQpVanz8ovY0
    const queryStr = `('${TARGET_FOLDER_ID}' in parents or name contains 'Cash & Card Automation') and trashed = false`;
    const driveSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc`;

    let listResp = await fetch(driveSearchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let listData = await listResp.json();
    if (!listResp.ok) {
      console.warn(`[sync-pos-sales-from-drive] Warning: Initial search with corpora=allDrives returned status ${listResp.status}: ${JSON.stringify(listData)}`);
      // Fallback query without corpora=allDrives if corpora=allDrives is rejected by API scope
      const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc`;
      listResp = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      listData = await listResp.json();
    }

    let allFiles: any[] = listData.files || [];
    console.log(`[sync-pos-sales-from-drive] Total files found in primary query: ${allFiles.length}`);

    // If 0 files found, perform fallback search and diagnostic user info lookup
    if (allFiles.length === 0) {
      console.log('[sync-pos-sales-from-drive] Initial query returned 0 files. Running broad diagnostic search for Cash & Card Automation files...');
      const broadQuery = `name contains 'Cash & Card Automation' and trashed = false`;
      const broadUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(broadQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc`;
      const broadResp = await fetch(broadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const broadData = await broadResp.json();
      const broadFiles = broadData.files || [];
      console.log(`[sync-pos-sales-from-drive] Broad search files count: ${broadFiles.length}`);
      if (broadFiles.length > 0) {
        allFiles = broadFiles;
      }

      // Check authenticated Google Account info
      try {
        const aboutResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const aboutData = await aboutResp.json();
        console.log(`[sync-pos-sales-from-drive] Authenticated Google Account: ${JSON.stringify(aboutData.user)}`);
      } catch (e) {
        console.error('[sync-pos-sales-from-drive] Could not fetch Google about info:', e);
      }
    }

    // Filter files modified on same day (or fallback to top 1 latest file if today's check is empty)
    let targetFiles = allFiles.filter((f) => new Date(f.modifiedTime) >= new Date(searchCutoffIso));
    if (targetFiles.length === 0 && allFiles.length > 0) {
      console.log('[sync-pos-sales-from-drive] No files modified today found, processing latest modified file as fallback...');
      targetFiles = [allFiles[0]];
    }

    if (targetFiles.length === 0) {
      console.log('[sync-pos-sales-from-drive] Tidak ada berkas Excel yang tersedia.');
      return new Response(
        JSON.stringify({ success: true, message: 'Tidak ada berkas Excel yang perlu diproses.', processedFiles: 0, totalUpserted: 0 }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Fetch profiles for store lookup
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

    // 5. Process each target file
    for (const fileItem of targetFiles) {
      console.log(`[sync-pos-sales-from-drive] Downloading & parsing file: ${fileItem.name} (${fileItem.id})`);

      const fileDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media&supportsAllDrives=true`;
      const dlResp = await fetch(fileDownloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!dlResp.ok) {
        console.error(`Gagal download file ${fileItem.name}:`, dlResp.statusText);
        continue;
      }

      const fileBuffer = await dlResp.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });

      if (workbook.SheetNames.length === 0) continue;

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rawRows.length < 14) {
        console.warn(`File ${fileItem.name} tidak memiliki cukup baris data (minimum 14 baris).`);
        continue;
      }

      // Detect header row 14 (Index 13)
      const row14Str = (rawRows[13] || []).map((c) => (c || '').toString().toLowerCase()).join(' ');
      const isNewTemplate = row14Str.includes('date') && row14Str.includes('store') && row14Str.includes('cash amount');
      const startRowIndex = isNewTemplate ? 14 : 13;

      const rowsToUpsert: { kode_cabang: string; tanggal_jual: string; sales_pos: number }[] = [];

      for (let i = startRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const rawDateVal = (row[0] || '').toString().trim();
        const rawStoreVal = (row[1] || '').toString().trim();
        const rawColCVal = (row[2] || '').toString().trim();

        if (!rawDateVal || !rawStoreVal) continue;

        if (isNewTemplate) {
          // New Template "Cash & Card Automation"
          const lowerA = rawDateVal.toLowerCase();
          const lowerB = rawStoreVal.toLowerCase();
          const lowerC = rawColCVal.toLowerCase();

          // Filter out rows with "total" in Col A, B, or C
          if (lowerA.includes('total') || lowerB.includes('total') || lowerC.includes('total')) {
            continue;
          }

          // Cash Amount from Col E (Index 4)
          const rawCashVal = (row[4] || '').toString().trim();
          const cleanSales = parseInt(rawCashVal.toString().replace(/[^0-9-]/g, ''), 10) || 0;
          if (cleanSales === 0) continue;

          const matchedUsername = getMatchedUsername(rawStoreVal, storeMap);
          if (!matchedUsername) continue;

          const formattedDate = parseFormattedDate(rawDateVal);

          if (matchedUsername && formattedDate) {
            rowsToUpsert.push({
              kode_cabang: matchedUsername,
              tanggal_jual: formattedDate,
              sales_pos: cleanSales,
            });
          }
        } else {
          // Legacy Template
          const lowerDate = rawDateVal.toLowerCase();
          if (lowerDate.includes('total') || lowerDate.includes('grand total')) continue;

          const rawSalesVal = (row[2] || '').toString().trim();
          const matchedUsername = getMatchedUsername(rawStoreVal, storeMap);
          if (!matchedUsername) continue;

          const formattedDate = parseFormattedDate(rawDateVal);
          const cleanSales = parseInt(rawSalesVal.toString().replace(/[^0-9-]/g, ''), 10) || 0;

          if (matchedUsername && formattedDate) {
            rowsToUpsert.push({
              kode_cabang: matchedUsername,
              tanggal_jual: formattedDate,
              sales_pos: cleanSales,
            });
          }
        }
      }

      if (rowsToUpsert.length > 0) {
        // Batch Upsert to pos_sales_data with onConflict resolution
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
          rowsCount: rowsToUpsert.length,
        });

        console.log(`[sync-pos-sales-from-drive] Successfully upserted ${rowsToUpsert.length} rows from file ${fileItem.name}.`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Berhasil memproses ${targetFiles.length} berkas dan melakukan upsert ${totalUpserted} data sales ke pos_sales_data.`,
        processedFiles: targetFiles.length,
        totalUpserted,
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
