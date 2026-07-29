import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as XLSX from 'npm:xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_FOLDER_ID = '1lreZQGF8F-3sFdPkQ1jzcQpVanz8ovY0';

/**
 * Helper to match store string from Excel (e.g., "0001-JKJSTT1" or "JKJSTT1") to DB profile username
 */
function getMatchedUsername(rawStoreStr: string, storeMap: { [key: string]: string }): string {
  if (!rawStoreStr) return '';
  const clean = rawStoreStr.trim().toLowerCase();

  // 1. Direct match
  if (storeMap[clean]) return storeMap[clean];

  // 2. Split by hyphen e.g. "0001-JKJSTT1" -> part 0: "0001", part 1: "jkjstt1"
  if (clean.includes('-')) {
    const parts = clean.split('-');
    const part0 = parts[0].trim();
    const part1 = parts[1].trim();
    if (storeMap[part0]) return storeMap[part0];
    if (storeMap[part1]) return storeMap[part1];
  }

  // 3. Stripped alphanumeric match
  const stripped = clean.replace(/[^a-z0-9]/g, '');
  if (storeMap[stripped]) return storeMap[stripped];

  return '';
}

/**
 * Helper to parse various Excel date formats into YYYY-MM-DD
 */
function parseFormattedDate(rawVal: any): string {
  if (!rawVal) return '';
  const strVal = rawVal.toString().trim();

  // Excel Serial Number
  if (/^\d+(\.\d+)?$/.test(strVal)) {
    const excelDateNum = parseFloat(strVal);
    if (excelDateNum > 40000 && excelDateNum < 60000) {
      const d = new Date((excelDateNum - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // YYYY-MM-DD
  const isoMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD/MM/YY or DD-MM-YY
  const ddmmyyMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (ddmmyyMatch) {
    const day = ddmmyyMatch[1].padStart(2, '0');
    const month = ddmmyyMatch[2].padStart(2, '0');
    const year = `20${ddmmyyMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  const d = new Date(strVal);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return '';
}

/**
 * Helper to check if a file is an Excel file based on extension and MIME type
 */
function isExcelFile(file: any): boolean {
  if (!file || !file.name) return false;
  const lowerName = file.name.toLowerCase();

  // Exclude non-excel formats explicitly
  if (lowerName.endsWith('.jpeg') || lowerName.endsWith('.jpg') || lowerName.endsWith('.png') || lowerName.endsWith('.pdf') || lowerName.endsWith('.webp')) {
    return false;
  }

  // Include excel extensions & spreadsheet mimeTypes
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
    return true;
  }

  if (file.mimeType && (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv'))) {
    return true;
  }

  return false;
}

function parseNumberVal(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const str = raw.toString().trim();
  if (!str) return 0;
  // Remove thousand separators and replace comma with dot if formatted
  const clean = str.replace(/[^0-9\.\-\,]/g, '');
  if (clean.includes(',') && !clean.includes('.')) {
    return parseFloat(clean.replace(',', '.')) || 0;
  }
  return parseFloat(clean.replace(/,/g, '')) || 0;
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

    // 1. Get Google Access Token
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

    // 2. Compute date patterns in WIB (UTC+7)
    const nowUtc = new Date();
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const nowWib = new Date(nowUtc.getTime() + wibOffsetMs);
    const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, '0')}-${String(nowWib.getUTCDate()).padStart(2, '0')}`;

    const todayDD = String(nowWib.getUTCDate()).padStart(2, '0');
    const todayMM = String(nowWib.getUTCMonth() + 1).padStart(2, '0');
    const todayYYYY = String(nowWib.getUTCFullYear());
    const todayYY = todayYYYY.substring(2, 4);

    const patternDDMMYYYY = `${todayDD}${todayMM}${todayYYYY}`; // 29072026
    const patternDDMMYY = `${todayDD}${todayMM}${todayYY}`;     // 290726
    const patternYYYYMMDD = `${todayYYYY}${todayMM}${todayDD}`; // 20260729

    console.log(`[sync-pos-sales-from-drive] Today WIB: ${todayWibStr} | Patterns: ${patternDDMMYYYY}, ${patternDDMMYY}, ${patternYYYYMMDD}`);

    // 3. Drive Search Queries (Strictly filtering out non-excel files)
    const driveFields = 'files(id,name,modifiedTime,mimeType,parents)';
    const queryCandidates = [
      `('${TARGET_FOLDER_ID}' in parents or name contains 'Cash' or name contains 'Automation') and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      `trashed = false and (name contains 'xlsx' or name contains 'xls' or mimeType contains 'spreadsheet')`
    ];

    let fetchedFiles: any[] = [];

    for (const qStr of queryCandidates) {
      const driveSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qStr)}&fields=${encodeURIComponent(driveFields)}&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&pageSize=100`;
      const resp = await fetch(driveSearchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const resData = await resp.json();

      if (resp.ok && resData.files && resData.files.length > 0) {
        fetchedFiles = resData.files;
        console.log(`[sync-pos-sales-from-drive] Found ${fetchedFiles.length} files using query: ${qStr}`);
        break;
      }
    }

    // Filter strictly for Excel files only
    const allFiles = fetchedFiles.filter(isExcelFile);
    console.log(`[sync-pos-sales-from-drive] Total valid Excel files retrieved from Drive: ${allFiles.length}`);

    if (allFiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Tidak ada berkas Excel data POS yang ditemukan di Drive.', processedFiles: 0, totalUpserted: 0 }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Target File Selection Strategy
    let targetFiles: any[] = [];

    // Strategy A: Filename Date Pattern Match (DDMMYYYY, DDMMYY, YYYYMMDD, YYYY-MM-DD)
    const byFilenameDate = allFiles.filter(f => 
      f.name.includes(patternDDMMYYYY) || 
      f.name.includes(patternDDMMYY) || 
      f.name.includes(patternYYYYMMDD) ||
      f.name.includes(todayWibStr)
    );

    if (byFilenameDate.length > 0) {
      targetFiles = byFilenameDate;
      console.log(`[sync-pos-sales-from-drive] Selected by filename date pattern: ${targetFiles.map(f => f.name).join(', ')}`);
    }

    // Strategy B: Files modified today in WIB
    if (targetFiles.length === 0) {
      const todayWibStartUtc = new Date(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), -7, 0, 0, 0).toISOString();
      const byModified = allFiles.filter(f => f.modifiedTime >= todayWibStartUtc);
      if (byModified.length > 0) {
        targetFiles = byModified;
        console.log(`[sync-pos-sales-from-drive] Selected by modifiedTime today: ${targetFiles.map(f => f.name).join(', ')}`);
      }
    }

    // Strategy C: Fallback to latest valid Excel file
    if (targetFiles.length === 0 && allFiles.length > 0) {
      targetFiles = [allFiles[0]];
      console.log(`[sync-pos-sales-from-drive] Fallback to latest valid Excel file: ${targetFiles[0].name}`);
    }

    // 5. Fetch Store Profiles for Code Mapping
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('id, username, kode_toko')
      .eq('role', 'User');

    if (profErr) throw profErr;

    const storeMap: { [key: string]: string } = {};
    (profData || []).forEach((p) => {
      if (p.kode_toko) {
        const kt = p.kode_toko.toString().trim().toLowerCase();
        storeMap[kt] = p.username;
        storeMap[kt.replace(/[^a-z0-9]/g, '')] = p.username;
      }
      if (p.username) {
        const un = p.username.toString().trim().toLowerCase();
        storeMap[un] = p.username;
        storeMap[un.replace(/[^a-z0-9]/g, '')] = p.username;
      }
    });

    let totalUpserted = 0;
    const processedReport: any[] = [];

    // 6. Process Target Excel Files
    for (const fileItem of targetFiles) {
      console.log(`[sync-pos-sales-from-drive] Downloading & parsing file: ${fileItem.name} (${fileItem.id})`);

      const fileDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media&supportsAllDrives=true`;
      const dlResp = await fetch(fileDownloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!dlResp.ok) {
        console.error(`Gagal download ${fileItem.name}:`, dlResp.statusText);
        continue;
      }

      const fileBuffer = await dlResp.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });

      if (workbook.SheetNames.length === 0) continue;

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rawRows.length < 2) continue;

      // Auto-detect template structure:
      // Template Ref 1 (Xilnex Cash & Card Automation): Header at Row 14 (index 13)
      // Template Simple Setoran POS: Header at Row 1 or 2
      let isNewTemplate = false;
      let startRowIndex = 1;

      for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
        const rowStr = (rawRows[r] || []).map((c) => (c || '').toString().toLowerCase()).join(' ');
        if (rowStr.includes('date') && rowStr.includes('store') && (rowStr.includes('cash amount') || rowStr.includes('card amount'))) {
          isNewTemplate = true;
          startRowIndex = r + 1;
          break;
        }
      }

      // Store aggregated sales per (kode_cabang, tanggal_jual)
      const salesAggregator: { [key: string]: { kode_cabang: string; tanggal_jual: string; sales_pos: number } } = {};

      for (let i = startRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const rawDateVal = (row[0] || '').toString().trim();
        const rawStoreVal = (row[1] || '').toString().trim();
        const rawColCVal = (row[2] || '').toString().trim();

        if (!rawDateVal || !rawStoreVal) continue;

        const lowerA = rawDateVal.toLowerCase();
        const lowerB = rawStoreVal.toLowerCase();
        const lowerC = rawColCVal.toLowerCase();

        // Skip header/summary/total rows
        if (lowerA.includes('total') || lowerB.includes('total') || lowerC.includes('total') || lowerA.includes('grand total')) {
          continue;
        }

        const matchedUsername = getMatchedUsername(rawStoreVal, storeMap);
        if (!matchedUsername) continue;

        const formattedDate = parseFormattedDate(rawDateVal);
        if (!formattedDate) continue;

        let cashAmount = 0;

        if (isNewTemplate) {
          // In Xilnex Cash & Card Automation template:
          // Col 4 (E): Cash Amount
          // If Cash Amount > 0, take Cash Amount
          const rawCashVal = row[4];
          cashAmount = parseNumberVal(rawCashVal);

          // If Col 2 (Card Type) is "CASH" or "SETORAN TUNAI" and Col 4 is 0, check Col 5/6
          if (cashAmount === 0 && (lowerC.includes('cash') || lowerC.includes('tunai') || lowerC.includes('setoran'))) {
            cashAmount = parseNumberVal(row[5]) || parseNumberVal(row[6]);
          }
        } else {
          // Simple Setoran POS template (Date, Store, Sales Amount)
          cashAmount = parseNumberVal(row[2]) || parseNumberVal(row[4]);
        }

        if (cashAmount <= 0) continue;

        const aggKey = `${matchedUsername}_${formattedDate}`;
        if (!salesAggregator[aggKey]) {
          salesAggregator[aggKey] = {
            kode_cabang: matchedUsername,
            tanggal_jual: formattedDate,
            sales_pos: 0
          };
        }
        salesAggregator[aggKey].sales_pos += cashAmount;
      }

      const rowsToUpsert = Object.values(salesAggregator);

      if (rowsToUpsert.length > 0) {
        const chunkSize = 500;
        for (let j = 0; j < rowsToUpsert.length; j += chunkSize) {
          const chunk = rowsToUpsert.slice(j, j + chunkSize);
          const { error: upsertErr } = await supabase
            .from('pos_sales_data')
            .upsert(chunk, { onConflict: 'kode_cabang, tanggal_jual' });

          if (upsertErr) throw upsertErr;
        }

        totalUpserted += rowsToUpsert.length;
        processedReport.push({
          fileName: fileItem.name,
          modifiedTime: fileItem.modifiedTime,
          rowsCount: rowsToUpsert.length,
        });
      } else {
        console.warn(`[sync-pos-sales-from-drive] File ${fileItem.name} processed but 0 valid sales rows extracted.`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Berhasil memproses ${processedReport.length} berkas dan upsert ${totalUpserted} baris data ke pos_sales_data.`,
        processedFiles: targetFiles.length,
        totalUpserted,
        todayWib: todayWibStr,
        patterns: [patternDDMMYYYY, patternDDMMYY, patternYYYYMMDD],
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
