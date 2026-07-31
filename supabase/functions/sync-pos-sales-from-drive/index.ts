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

/**
 * Resolve (Bank from Col D, Card Type from Col C) -> Supabase column name for Col F (Card/EDC Amount).
 * Handles all known bank name variations: BCA, bca, bCA, BC | BRI, bri, +BRI, LBRI, BR
 */
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

/**
 * Resolve Card Type from Col C -> Supabase column name for Col G (Online Amount).
 * ONLINE rows always have empty Col D.
 */
function resolveOnlineColumn(cardType: string): string | null {
  const c = (cardType || '').toUpperCase().trim();
  if (c === 'ONLINE (HALODOC)')   return 'online_halodoc';
  if (c === 'ONLINE (TIKTOK)')    return 'online_tiktok';
  if (c === 'ONLINE (TOKOPEDIA)') return 'online_tokopedia';
  return null;
}

/**
 * Create an empty aggregated sales row.
 *   1 column  : sales_pos           (Col E: Cash Tunai)
 *  20 columns : card_bca_* / card_bri_*  (Col F: EDC per bank x card type)
 *   3 columns : online_*            (Col G: Online channels)
 */
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
    console.log(`[sync-pos-sales-from-drive] Today WIB: ${todayWibStr} | Patterns: ${patternDDMMYYYY}, ${patternDDMMYY}, ${patternYYYYMMDD}`);

    // 3. Drive Search Queries prioritizing Xilnex title "Cash & Card Automation"
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
        if (excelOnly.length > 0) { fetchedFiles = excelOnly; matchedQuery = qStr; console.log(`[sync-pos-sales-from-drive] Found ${excelOnly.length} files via: ${qStr}`); break; }
      } else if (!resp.ok) {
        console.error(`[sync-pos-sales-from-drive] Search error for '${qStr}':`, resData.error || resData);
      }
    }

    if (fetchedFiles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Tidak ada berkas Excel data POS yang ditemukan di Drive.', processedFiles: 0, totalUpserted: 0, todayWib: todayWibStr, matchedQuery }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 4. Target File Selection (by filename date > modified today > latest)
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

    // 6. Process Target Excel Files
    for (const fileItem of targetFiles) {
      console.log(`[sync-pos-sales-from-drive] Downloading: ${fileItem.name} (${fileItem.id})`);
      const dlResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!dlResp.ok) { console.error(`Gagal download ${fileItem.name}:`, dlResp.statusText); continue; }

      const fileBuffer = await dlResp.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellStyles: false, cellText: false, cellDates: false });
      if (workbook.SheetNames.length === 0) continue;

      const rawRows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', blankrows: false });
      if (rawRows.length < 2) continue;

      // Auto-detect template: Xilnex Cash & Card Automation (header has "date"+"store"+"cash/card amount") vs legacy
      let isNewTemplate = false;
      let startRowIndex = 1;
      for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
        const rowStr = (rawRows[r] || []).map((c: any) => (c||'').toString().toLowerCase()).join(' ');
        if (rowStr.includes('date') && rowStr.includes('store') && (rowStr.includes('cash amount') || rowStr.includes('card amount'))) {
          isNewTemplate = true; startRowIndex = r + 1; break;
        }
      }

      // Aggregator keyed by `${kode_cabang}_${tanggal_jual}`
      const salesAgg: { [k: string]: ReturnType<typeof createEmptyAggRow> } = {};

      for (let i = startRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;
        const rawDate  = (row[0]||'').toString().trim();
        const rawStore = (row[1]||'').toString().trim();
        const rawColC  = (row[2]||'').toString().trim(); // Card Type
        const rawColD  = (row[3]||'').toString().trim(); // Merchant ID / Bank
        if (!rawDate || !rawStore) continue;
        // Skip total/summary rows
        const lC = rawColC.toLowerCase();
        if (rawDate.toLowerCase().includes('total') || rawStore.toLowerCase().includes('total') || lC.includes('total') || rawDate.toLowerCase().includes('grand total')) continue;

        const username = getMatchedUsername(rawStore, storeMap);
        if (!username) continue;
        const date = parseFormattedDate(rawDate);
        if (!date) continue;
        const key = `${username}_${date}`;

        if (isNewTemplate) {
          // Xilnex Cash & Card Automation:
          // Col C[2]=CardType, Col D[3]=Bank, Col E[4]=Cash, Col F[5]=Card/EDC, Col G[6]=Online
          const colE = parseNumberVal(row[4]);
          const colF = parseNumberVal(row[5]);
          const colG = parseNumberVal(row[6]);
          if (colE <= 0 && colF <= 0 && colG <= 0) continue;
          if (!salesAgg[key]) salesAgg[key] = createEmptyAggRow(username, date);
          if (colE > 0) salesAgg[key].sales_pos += colE;
          if (colF > 0) {
            const col = resolveCardColumn(rawColD, rawColC);
            if (col && col in salesAgg[key]) (salesAgg[key] as any)[col] += colF;
            else console.log(`[ColF unmapped] Bank="${rawColD}" CardType="${rawColC}" Amount=${colF}`);
          }
          if (colG > 0) {
            const col = resolveOnlineColumn(rawColC);
            if (col && col in salesAgg[key]) (salesAgg[key] as any)[col] += colG;
            else console.log(`[ColG unmapped] CardType="${rawColC}" Amount=${colG}`);
          }
        } else {
          // Legacy template: cash amount only in Col C or Col E
          const cash = parseNumberVal(row[2]) || parseNumberVal(row[4]);
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
        processedReport.push({ fileName: fileItem.name, modifiedTime: fileItem.modifiedTime, rowsCount: rows.length });
      } else {
        console.warn(`[sync-pos-sales-from-drive] 0 valid rows extracted from ${fileItem.name}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Berhasil memproses ${processedReport.length} berkas dan upsert ${totalUpserted} baris data ke pos_sales_data.`, processedFiles: targetFiles.length, totalUpserted, todayWib: todayWibStr, tokenScope, matchedQuery, sampleFileNames: targetFiles.slice(0,10).map(f => f.name), details: processedReport }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.';
    console.error('[sync-pos-sales-from-drive] Global Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
