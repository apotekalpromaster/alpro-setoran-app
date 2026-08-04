import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as fflate from 'https://esm.sh/fflate@0.8.2';

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
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (storeMap[parts[0].trim()]) return storeMap[parts[0].trim()];
    if (parts[1] && storeMap[parts[1].trim()]) return storeMap[parts[1].trim()];
  }
  const stripped = clean.replace(/[^a-z0-9]/g, '');
  if (storeMap[stripped]) return storeMap[stripped];
  return '';
}

function parseFormattedDate(rawVal: any): string {
  if (!rawVal) return '';
  const strVal = rawVal.toString().trim();
  if (/^\d+(\.\d+)?$/.test(strVal)) {
    const n = parseFloat(strVal);
    if (n > 40000 && n < 60000) {
      const d = new Date((n - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }
  const iso = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const dmyy = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyy) return `20${dmyy[3]}-${dmyy[2].padStart(2,'0')}-${dmyy[1].padStart(2,'0')}`;
  const d = new Date(strVal);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

function isExcelFile(file: any): boolean {
  if (!file || !file.name) return false;
  const n = file.name.toLowerCase();
  if (['.jpeg','.jpg','.png','.pdf','.webp'].some(e => n.endsWith(e))) return false;
  if (['.xlsx','.xls','.csv'].some(e => n.endsWith(e)) || n.includes('.xlsx') || n.includes('.xls')) return true;
  if (file.mimeType && (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('officedocument'))) return true;
  return false;
}

function parseNumberVal(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const str = raw.toString().trim();
  if (!str) return 0;
  const clean = str.replace(/[^0-9\.\-\,]/g, '');
  if (clean.includes(',') && !clean.includes('.')) return parseFloat(clean.replace(',', '.')) || 0;
  return parseFloat(clean.replace(/,/g, '')) || 0;
}

function resolveCardColumn(bank: string, cardType: string): string | null {
  const b = (bank || '').toUpperCase().trim();
  const c = (cardType || '').toUpperCase().trim();
  const isBca = b.includes('BCA') || b === 'BC';
  const isBri = b.includes('BRI') || b === 'BR' || b === 'LBRI' || b === '+BRI';
  if (!isBca && !isBri) return null;
  const prefix = isBca ? 'card_bca_' : 'card_bri_';
  const cardMap: { [k: string]: string } = {
    'AMEX': 'amex', 'BCA CARD': 'bca_card',
    'DEBIT BANK LAIN': 'debit_lain', 'DEBIT BANK SAMA': 'debit_sama',
    'JCB': 'jcb', 'MASTER': 'master', 'OTHERS': 'others',
    'QRIS': 'qris', 'UNIONPAY': 'unionpay', 'VISA': 'visa',
  };
  return cardMap[c] ? prefix + cardMap[c] : null;
}

function resolveOnlineColumn(cardType: string): string | null {
  const c = (cardType || '').toUpperCase().trim();
  if (c === 'ONLINE (HALODOC)')   return 'online_halodoc';
  if (c === 'ONLINE (TIKTOK)')    return 'online_tiktok';
  if (c === 'ONLINE (TOKOPEDIA)') return 'online_tokopedia';
  return null;
}

function createEmptyAggRow(kode_cabang: string, tanggal_jual: string) {
  return {
    kode_cabang, tanggal_jual,
    sales_pos: 0,
    card_bca_amex: 0, card_bca_bca_card: 0, card_bca_debit_lain: 0,
    card_bca_debit_sama: 0, card_bca_jcb: 0, card_bca_master: 0,
    card_bca_others: 0, card_bca_qris: 0, card_bca_unionpay: 0, card_bca_visa: 0,
    card_bri_amex: 0, card_bri_bca_card: 0, card_bri_debit_lain: 0,
    card_bri_debit_sama: 0, card_bri_jcb: 0, card_bri_master: 0,
    card_bri_others: 0, card_bri_qris: 0, card_bri_unionpay: 0, card_bri_visa: 0,
    online_halodoc: 0, online_tiktok: 0, online_tokopedia: 0,
  };
}

/**
 * Ultra-fast zero-overhead XLSX XML parser using fflate.
 * Unzips only sheet1.xml and sharedStrings.xml, skipping heavy pivot tables and charts.
 */
function parseXlsxFast(buffer: Uint8Array): { [colLetter: string]: string }[] {
  const unzipped = fflate.unzipSync(buffer);
  
  // 1. Shared Strings
  const sharedKey = Object.keys(unzipped).find(k => k.toLowerCase().endsWith('sharedstrings.xml'));
  const sharedStrings: string[] = [];
  if (sharedKey) {
    const xmlStr = new TextDecoder().decode(unzipped[sharedKey]);
    const siMatches = [...xmlStr.matchAll(/<si[\s\S]*?<\/si>/g)];
    for (const m of siMatches) {
      const tMatches = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
      sharedStrings.push(tMatches.map(tm => tm[1]).join(''));
    }
  }

  // 2. Sheet 1 XML
  const sheetKey = Object.keys(unzipped).find(k => k.toLowerCase().endsWith('sheet1.xml'));
  if (!sheetKey) return [];
  const sheetXml = new TextDecoder().decode(unzipped[sheetKey]);
  const rowParts = sheetXml.split('</row>');

  const rows: { [colLetter: string]: string }[] = [];
  for (let r = 0; r < rowParts.length - 1; r++) {
    const rowXml = rowParts[r];
    const cMatches = [...rowXml.matchAll(/<c\s+[\s\S]*?(?:<\/c>|\/>)/g)];
    const rowObj: { [colLetter: string]: string } = {};
    for (const m of cMatches) {
      const cXml = m[0];
      const colMatch = cXml.match(/r="([A-Z]+)\d+"/);
      if (!colMatch) continue;
      const col = colMatch[1];
      const isString = /t="s"/.test(cXml);
      const vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/);
      const val = vMatch ? vMatch[1] : '';
      
      if (isString) {
        const idx = parseInt(val, 10);
        rowObj[col] = sharedStrings[idx] || '';
      } else {
        rowObj[col] = val;
      }
    }
    if (Object.keys(rowObj).length > 0) rows.push(rowObj);
  }
  return rows;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase URL / Service Key tidak dikonfigurasi.');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN tidak dikonfigurasi.');

    // 1. Get Google Access Token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) throw new Error(`Gagal mendapatkan Google Access Token: ${JSON.stringify(tokenData)}`);
    const accessToken = tokenData.access_token;
    const tokenScope = tokenData.scope || 'unknown';

    // 2. Compute date patterns in WIB (UTC+7)
    const nowUtc = new Date();
    const nowWib = new Date(nowUtc.getTime() + 7 * 3600 * 1000);
    const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth()+1).padStart(2,'0')}-${String(nowWib.getUTCDate()).padStart(2,'0')}`;
    const todayDD = String(nowWib.getUTCDate()).padStart(2,'0');
    const todayMM = String(nowWib.getUTCMonth()+1).padStart(2,'0');
    const todayYYYY = String(nowWib.getUTCFullYear());
    const todayYY = todayYYYY.substring(2,4);
    const patternDDMMYYYY = `${todayDD}${todayMM}${todayYYYY}`;
    const patternDDMMYY   = `${todayDD}${todayMM}${todayYY}`;
    const patternYYYYMMDD = `${todayYYYY}${todayMM}${todayDD}`;

    // 3. Drive Search Queries
    const driveFields = 'files(id,name,modifiedTime,mimeType,parents)';
    const queryCandidates = [
      `name contains 'Cash & Card Automation' and trashed = false`,
      `name contains 'Automation' and trashed = false`,
      `'${TARGET_FOLDER_ID}' in parents and trashed = false`,
    ];
    let fetchedFiles: any[] = [];
    let matchedQuery = '';
    for (const qStr of queryCandidates) {
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qStr)}&fields=${encodeURIComponent(driveFields)}&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc&pageSize=500`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const resData = await resp.json();
      if (resp.ok && resData.files?.length > 0) {
        const excelOnly = resData.files.filter(isExcelFile);
        if (excelOnly.length > 0) { fetchedFiles = excelOnly; matchedQuery = qStr; break; }
      }
    }

    if (fetchedFiles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Tidak ada berkas Excel data POS yang ditemukan di Drive.', processedFiles: 0, totalUpserted: 0, todayWib: todayWibStr, matchedQuery }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 4. Target File Selection
    let targetFiles: any[] = [];
    const byDate = fetchedFiles.filter(f => f.name.includes(patternDDMMYYYY) || f.name.includes(patternDDMMYY) || f.name.includes(patternYYYYMMDD) || f.name.includes(todayWibStr));
    if (byDate.length > 0) { targetFiles = byDate; }
    if (targetFiles.length === 0) {
      const wibStart = new Date(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), -7, 0, 0, 0).toISOString();
      const byMod = fetchedFiles.filter(f => f.modifiedTime >= wibStart);
      if (byMod.length > 0) targetFiles = byMod;
    }
    if (targetFiles.length === 0) targetFiles = [fetchedFiles[0]];

    // 5. Fetch Store Profiles
    const { data: profData, error: profErr } = await supabase.from('profiles').select('id, username, kode_toko').eq('role', 'User');
    if (profErr) throw profErr;
    const storeMap: { [key: string]: string } = {};
    (profData || []).forEach((p) => {
      if (p.kode_toko) { const kt = p.kode_toko.toString().trim().toLowerCase(); storeMap[kt] = p.username; storeMap[kt.replace(/[^a-z0-9]/g,'')] = p.username; }
      if (p.username)  { const un = p.username.toString().trim().toLowerCase();  storeMap[un] = p.username; storeMap[un.replace(/[^a-z0-9]/g,'')] = p.username; }
    });

    let totalUpserted = 0;
    const processedReport: any[] = [];

    // 6. Process Target Excel Files using ultra-fast fflate XML parser
    for (const fileItem of targetFiles) {
      console.log(`[sync-pos-sales-from-drive] Downloading: ${fileItem.name} (${fileItem.id})`);
      const dlResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!dlResp.ok) { console.error(`Gagal download ${fileItem.name}:`, dlResp.statusText); continue; }

      const fileBuffer = new Uint8Array(await dlResp.arrayBuffer());
      const parsedRows = parseXlsxFast(fileBuffer);
      if (parsedRows.length === 0) continue;

      // Auto-detect template: Xilnex Cash & Card Automation (header has "Date" + "Store")
      let isNewTemplate = false;
      let startRowIndex = 0;
      for (let r = 0; r < Math.min(parsedRows.length, 25); r++) {
        const rowStr = Object.values(parsedRows[r]).join(' ').toLowerCase();
        if (rowStr.includes('date') && rowStr.includes('store') && (rowStr.includes('cash amount') || rowStr.includes('card amount'))) {
          isNewTemplate = true; startRowIndex = r + 1; break;
        }
      }

      // Aggregator keyed by `${kode_cabang}_${tanggal_jual}`
      const salesAgg: { [k: string]: ReturnType<typeof createEmptyAggRow> } = {};

      for (let i = startRowIndex; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const rawDate  = (row['A'] || '').toString().trim();
        const rawStore = (row['B'] || '').toString().trim();
        const rawColC  = (row['C'] || '').toString().trim(); // Card Type
        const rawColD  = (row['D'] || '').toString().trim(); // Merchant ID / Bank
        if (!rawDate || !rawStore) continue;

        const lC = rawColC.toLowerCase();
        if (rawDate.toLowerCase().includes('total') || rawStore.toLowerCase().includes('total') || lC.includes('total') || rawDate.toLowerCase().includes('grand total')) continue;

        const username = getMatchedUsername(rawStore, storeMap);
        if (!username) continue;
        const date = parseFormattedDate(rawDate);
        if (!date) continue;
        const key = `${username}_${date}`;

        if (isNewTemplate) {
          // Col A[0]=Date, Col B[1]=Store, Col C[2]=CardType, Col D[3]=Bank, Col E[4]=Cash, Col F[5]=Card/EDC, Col G[6]=Online
          const colE = parseNumberVal(row['E']);
          const colF = parseNumberVal(row['F']);
          const colG = parseNumberVal(row['G']);
          if (colE <= 0 && colF <= 0 && colG <= 0) continue;
          if (!salesAgg[key]) salesAgg[key] = createEmptyAggRow(username, date);

          if (colE > 0) salesAgg[key].sales_pos += colE;
          if (colF > 0) {
            const col = resolveCardColumn(rawColD, rawColC);
            if (col && col in salesAgg[key]) (salesAgg[key] as any)[col] += colF;
          }
          if (colG > 0) {
            const col = resolveOnlineColumn(rawColC);
            if (col && col in salesAgg[key]) (salesAgg[key] as any)[col] += colG;
          }
        } else {
          // Legacy template: cash amount only in Col C or Col E
          const cash = parseNumberVal(row['C']) || parseNumberVal(row['E']);
          if (cash <= 0) continue;
          if (!salesAgg[key]) salesAgg[key] = createEmptyAggRow(username, date);
          salesAgg[key].sales_pos += cash;
        }
      }

      const rows = Object.values(salesAgg);
      if (rows.length > 0) {
        for (let j = 0; j < rows.length; j += 500) {
          const { error: upsertErr } = await supabase.from('pos_sales_data').upsert(rows.slice(j, j+500), { onConflict: 'kode_cabang, tanggal_jual' });
          if (upsertErr) throw upsertErr;
        }
        totalUpserted += rows.length;
        processedReport.push({ fileName: fileItem.name, rowsCount: rows.length });
      } else {
        console.warn(`[sync-pos-sales-from-drive] 0 valid rows extracted from ${fileItem.name}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Berhasil memproses ${processedReport.length} berkas dan upsert ${totalUpserted} baris data ke pos_sales_data.`, processedFiles: targetFiles.length, totalUpserted, todayWib: todayWibStr, matchedQuery, sampleFileNames: targetFiles.slice(0,10).map(f => f.name), details: processedReport }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const errorDetails = typeof err === 'object' && err !== null ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : String(err);
    console.error('[sync-pos-sales-from-drive] Global Error:', errorDetails);
    return new Response(JSON.stringify({ error: errorDetails }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
