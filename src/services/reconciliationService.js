import { supabase } from './supabaseClient';

const MASTER_CACHE_KEY = 'alpro_reconcile_master_mappings';

/**
 * Get or load all Store Master Mappings (Deposit Card, MID BRI, MID BCA, Cabang PKU)
 */
export function getStoredMasterMappings() {
    try {
        const raw = localStorage.getItem(MASTER_CACHE_KEY);
        return raw ? JSON.parse(raw) : { bri_mids: {}, bca_mids: {}, deposit_cards: {}, pku_cabang: {} };
    } catch (e) {
        return { bri_mids: {}, bca_mids: {}, deposit_cards: {}, pku_cabang: {} };
    }
}

export function saveMasterMappings(masters) {
    try {
        const current = getStoredMasterMappings();
        const updated = {
            bri_mids: { ...current.bri_mids, ...(masters.bri_mids || {}) },
            bca_mids: { ...current.bca_mids, ...(masters.bca_mids || {}) },
            deposit_cards: { ...current.deposit_cards, ...(masters.deposit_cards || {}) },
            pku_cabang: { ...current.pku_cabang, ...(masters.pku_cabang || {}) }
        };
        localStorage.setItem(MASTER_CACHE_KEY, JSON.stringify(updated));
        return updated;
    } catch (e) {
        console.error('Failed to save master mappings:', e);
        return masters;
    }
}

/**
 * Reconcile Xilnex Sales against Bank Mutations (BRI & BCA)
 * Option: toleranceH1 (boolean) - match sales on date T against bank mutation on T or T+1
 */
export function computeReconciliation({
    xilnexSales = [],
    bankMutations = [],
    storeProfiles = [],
    toleranceH1 = true
}) {
    const masters = getStoredMasterMappings();

    // Map outcode -> Store Info
    const storeMap = {};
    storeProfiles.forEach(p => {
        const outcode = (p.outcode || p.kode_toko || p.username || '').toString().trim().toUpperCase();
        if (outcode) {
            storeMap[outcode] = {
                username: p.username || outcode,
                kode_toko: p.kode_toko || outcode,
                email: p.email || '',
                cabang_pku: masters.pku_cabang[outcode] || ''
            };
        }
    });

    // Grouping Key: `${outcode}_${date}_${bank}`
    const grid = {};

    const getRow = (outcode, date, bank) => {
        const key = `${outcode}_${date}_${bank}`;
        if (!grid[key]) {
            const storeInfo = storeMap[outcode] || { username: outcode, kode_toko: outcode, cabang_pku: masters.pku_cabang[outcode] || '' };
            grid[key] = {
                key,
                outcode,
                storeName: storeInfo.username,
                cabang_pku: storeInfo.cabang_pku,
                date,
                bank, // 'BCA' | 'BRI'
                xilnexCardSales: 0,
                xilnexOtherSales: 0,
                xilnexTotal: 0,
                bankGross: 0,
                bankMdr: 0,
                bankNet: 0,
                xilnexRowsCount: 0,
                bankRowsCount: 0,
                rawXilnex: [],
                rawBank: [],
                unmappedCount: 0
            };
        }
        return grid[key];
    };

    // 1. Process Xilnex Sales
    xilnexSales.forEach(item => {
        const bank = item.merchant_bank.includes('BRI') ? 'BRI' : item.merchant_bank.includes('BCA') ? 'BCA' : item.merchant_bank || 'LAINNYA';
        const row = getRow(item.outcode, item.tanggal_jual, bank);
        row.xilnexCardSales += Number(item.card_amount || 0);
        row.xilnexOtherSales += Number(item.other_amount || 0);
        row.xilnexTotal += Number(item.total_xilnex || 0);
        row.xilnexRowsCount += 1;
        row.rawXilnex.push(item);
    });

    // 2. Process Bank Mutations (with H+1 tolerance support)
    bankMutations.forEach(bm => {
        let matchedOutcode = bm.outcode;

        // If outcode not found directly on mutation, try master maps
        if (!matchedOutcode) {
            if (bm.bank_name === 'BRI' && masters.bri_mids[bm.mid]) {
                matchedOutcode = masters.bri_mids[bm.mid];
            } else if (bm.bank_name === 'BCA' && masters.bca_mids[bm.mid]) {
                matchedOutcode = masters.bca_mids[bm.mid];
            }
        }

        const targetOutcode = matchedOutcode || 'UNMAPPED_' + bm.mid;

        // Determine target date for matching (with H+1 tolerance check)
        let targetDate = bm.tanggal_mutasi;

        if (toleranceH1 && matchedOutcode) {
            // Check if there is an existing Xilnex record on T-1 date
            const d = new Date(bm.tanggal_mutasi);
            d.setDate(d.getDate() - 1);
            const prevDate = d.toISOString().split('T')[0];

            const prevKey = `${matchedOutcode}_${prevDate}_${bm.bank_name}`;
            const sameKey = `${matchedOutcode}_${bm.tanggal_mutasi}_${bm.bank_name}`;

            if (grid[prevKey] && grid[prevKey].xilnexTotal > 0 && (!grid[sameKey] || grid[sameKey].xilnexTotal === 0)) {
                targetDate = prevDate;
            }
        }

        const row = getRow(targetOutcode, targetDate, bm.bank_name);
        row.bankGross += Number(bm.gross_amount || 0);
        row.bankMdr += Number(bm.mdr_amount || 0);
        row.bankNet += Number(bm.net_amount || 0);
        row.bankRowsCount += 1;
        row.rawBank.push(bm);
        if (!matchedOutcode) row.unmappedCount += 1;
    });

    // 3. Compute Differences & Status Badges
    const result = Object.values(grid).map(row => {
        const selisihNet = row.xilnexTotal - row.bankNet;
        const selisihGross = row.xilnexTotal - row.bankGross;

        let status = 'Cocok';
        let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        let statusLabel = 'Cocok (0)';

        if (row.outcode.startsWith('UNMAPPED_')) {
            status = 'Unmapped';
            badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
            statusLabel = 'MID Belum Terhubung';
        } else if (row.xilnexTotal > 0 && row.bankNet === 0) {
            status = 'BelumMutasi';
            badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
            statusLabel = 'Belum Ada Mutasi';
        } else if (Math.abs(selisihNet) > 100) { // Toleransi Rp 100 untuk pembulatan MDR
            if (selisihNet > 0) {
                status = 'SelisihXilnexTinggi';
                badgeColor = 'bg-red-50 text-red-700 border-red-200';
                statusLabel = `Xilnex > Bank (+${Math.round(selisihNet).toLocaleString('id-ID')})`;
            } else {
                status = 'SelisihBankTinggi';
                badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                statusLabel = `Bank > Xilnex (${Math.round(selisihNet).toLocaleString('id-ID')})`;
            }
        }

        return {
            ...row,
            selisihNet,
            selisihGross,
            status,
            badgeColor,
            statusLabel
        };
    });

    result.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return a.outcode.localeCompare(b.outcode);
    });

    return result;
}
