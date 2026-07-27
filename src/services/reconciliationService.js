import { supabase } from './supabaseClient';

const MASTER_STORAGE_KEY = 'alpro_recon_master_mappings_v1';

const defaultMasterMappings = {
    deposit_cards: {}, // bca_deposit_card -> outcode
    bri_mids: {},      // mid_bri (cleaned) -> outcode
    bca_mids: {},      // mid_bca (7 digit) -> outcode
    pku_cabang: {}     // outcode -> cabang_pku
};

export function getStoredMasterMappings() {
    try {
        const raw = localStorage.getItem(MASTER_STORAGE_KEY);
        if (!raw) return defaultMasterMappings;
        const parsed = JSON.parse(raw);
        return {
            deposit_cards: parsed.deposit_cards || {},
            bri_mids: parsed.bri_mids || {},
            bca_mids: parsed.bca_mids || {},
            pku_cabang: parsed.pku_cabang || {}
        };
    } catch (e) {
        console.error('Gagal membaca master mappings dari LocalStorage:', e);
        return defaultMasterMappings;
    }
}

export function saveMasterMappings(newPartial) {
    const current = getStoredMasterMappings();
    const updated = {
        deposit_cards: { ...current.deposit_cards, ...(newPartial.deposit_cards || {}) },
        bri_mids: { ...current.bri_mids, ...(newPartial.bri_mids || {}) },
        bca_mids: { ...current.bca_mids, ...(newPartial.bca_mids || {}) },
        pku_cabang: { ...current.pku_cabang, ...(newPartial.pku_cabang || {}) }
    };
    try {
        localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.error('Gagal menyimpan master mappings ke LocalStorage:', e);
    }

    return updated;
}

export async function syncMasterMappingsToSupabase(newPartial) {
    try {
        const rowsToUpsert = [];
        if (newPartial.deposit_cards) {
            Object.entries(newPartial.deposit_cards).forEach(([card, outcode]) => {
                if (card && outcode) {
                    rowsToUpsert.push({
                        mapping_type: 'deposit_card',
                        key_code: card.toString().trim(),
                        outcode_target: outcode.toString().trim().toUpperCase()
                    });
                }
            });
        }
        if (newPartial.bri_mids) {
            Object.entries(newPartial.bri_mids).forEach(([mid, outcode]) => {
                if (mid && outcode) {
                    rowsToUpsert.push({
                        mapping_type: 'bri_mid',
                        key_code: mid.toString().trim(),
                        outcode_target: outcode.toString().trim().toUpperCase()
                    });
                }
            });
        }
        if (newPartial.bca_mids) {
            Object.entries(newPartial.bca_mids).forEach(([mid, outcode]) => {
                if (mid && outcode) {
                    rowsToUpsert.push({
                        mapping_type: 'bca_mid',
                        key_code: mid.toString().trim(),
                        outcode_target: outcode.toString().trim().toUpperCase()
                    });
                }
            });
        }
        if (newPartial.pku_cabang) {
            Object.entries(newPartial.pku_cabang).forEach(([outcode, cabang]) => {
                if (outcode && cabang) {
                    rowsToUpsert.push({
                        mapping_type: 'pku_cabang',
                        key_code: outcode.toString().trim().toUpperCase(),
                        outcode_target: cabang.toString().trim()
                    });
                }
            });
        }

        if (rowsToUpsert.length > 0) {
            const chunkSize = 500;
            for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                const chunk = rowsToUpsert.slice(i, i + chunkSize);
                const { error } = await supabase
                    .from('recon_master_mids')
                    .upsert(chunk, { onConflict: 'mapping_type,key_code' });
                if (error) {
                    console.warn('Supabase upsert error:', error.message);
                    return { success: false, count: rowsToUpsert.length, error: error.message };
                }
            }
            return { success: true, count: rowsToUpsert.length };
        }
        return { success: true, count: 0 };
    } catch (e) {
        console.warn('Supabase sync warning:', e.message);
        return { success: false, count: 0, error: e.message };
    }
}

export async function fetchMasterMappingsFromSupabase() {
    try {
        const { data, error } = await supabase.from('recon_master_mids').select('*');
        if (error || !data || data.length === 0) return null;

        const mappings = { deposit_cards: {}, bri_mids: {}, bca_mids: {}, pku_cabang: {} };
        data.forEach(item => {
            if (item.mapping_type === 'deposit_card') mappings.deposit_cards[item.key_code] = item.outcode_target;
            else if (item.mapping_type === 'bri_mid') mappings.bri_mids[item.key_code] = item.outcode_target;
            else if (item.mapping_type === 'bca_mid') mappings.bca_mids[item.key_code] = item.outcode_target;
            else if (item.mapping_type === 'pku_cabang') mappings.pku_cabang[item.key_code] = item.outcode_target;
        });

        saveMasterMappings(mappings);
        return mappings;
    } catch (e) {
        return null;
    }
}

export function computeReconciliation({ xilnexSales, bankMutations, storeProfiles, toleranceH1 = true }) {
    const masters = getStoredMasterMappings();
    const profileMap = {};
    (storeProfiles || []).forEach(p => {
        if (p.kode_toko) {
            profileMap[p.kode_toko.toUpperCase()] = p.username || p.kode_toko;
        }
    });

    // 1. Map Xilnex Cashless Sales (Ref 1 Column F: card_amount) by (date, outcode)
    const xilnexMap = {};
    (xilnexSales || []).forEach(item => {
        const outcode = (item.outcode || '').toUpperCase();
        const date = item.tanggal_jual || item.tanggal;
        if (!date || !outcode) return;
        const key = date + "__" + outcode;

        if (!xilnexMap[key]) {
            xilnexMap[key] = {
                date,
                outcode,
                cashlessXilnex: 0,
                items: []
            };
        }
        // Column F (card_amount) represents Cashless Xilnex
        xilnexMap[key].cashlessXilnex += (item.card_amount || item.amount || 0);
        xilnexMap[key].items.push(item);
    });

    // 2. Map Bank Mutations (BCA & BRI) by (date, outcode)
    const bankMap = {};
    (bankMutations || []).forEach(b => {
        const date = b.tanggal_mutasi;
        const outcode = (b.outcode || 'UNMAPPED').toUpperCase();
        if (!date) return;
        const key = date + "__" + outcode;

        if (!bankMap[key]) {
            bankMap[key] = {
                date,
                outcode,
                bcaGross: 0,
                bcaMdr: 0,
                bcaNet: 0,
                briGross: 0,
                briMdr: 0,
                briNet: 0,
                items: []
            };
        }

        const isBca = (b.bank_name || '').toUpperCase() === 'BCA';
        if (isBca) {
            bankMap[key].bcaGross += b.gross_amount || 0;
            bankMap[key].bcaMdr += b.mdr_amount || 0;
            bankMap[key].bcaNet += b.net_amount || 0;
        } else {
            bankMap[key].briGross += b.gross_amount || 0;
            bankMap[key].briMdr += b.mdr_amount || 0;
            bankMap[key].briNet += b.net_amount || 0;
        }
        bankMap[key].items.push(b);
    });

    const allKeys = new Set([...Object.keys(xilnexMap), ...Object.keys(bankMap)]);
    const results = [];

    allKeys.forEach(key => {
        const [date, outcode] = key.split('__');
        const xRecord = xilnexMap[key] || { cashlessXilnex: 0, items: [] };
        let bRecord = bankMap[key] || {
            bcaGross: 0, bcaMdr: 0, bcaNet: 0,
            briGross: 0, briMdr: 0, briNet: 0,
            items: []
        };

        const currentBankGross = bRecord.bcaGross + bRecord.briGross;

        // Tolerance H+1 (T+1 settlement check)
        if (xRecord.cashlessXilnex > 0 && currentBankGross === 0 && toleranceH1) {
            const dateObj = new Date(date);
            dateObj.setDate(dateObj.getDate() + 1);
            const h1Date = dateObj.toLocaleDateString('sv-SE');
            const h1Key = h1Date + "__" + outcode;

            if (bankMap[h1Key] && (bankMap[h1Key].bcaGross + bankMap[h1Key].briGross) > 0) {
                bRecord = bankMap[h1Key];
            }
        }

        const cashlessXilnex = xRecord.cashlessXilnex;
        const bcaGross = bRecord.bcaGross;
        const bcaMdr = bRecord.bcaMdr;
        const bcaNet = bRecord.bcaNet;

        const briGross = bRecord.briGross;
        const briMdr = bRecord.briMdr;
        const briNet = bRecord.briNet;

        const totalBankGross = bcaGross + briGross;
        const totalBankMdr = bcaMdr + briMdr;
        const totalBankNet = bcaNet + briNet;

        // Selisih Net = Cashless Xilnex - sum(MDR Gross BCA + BRI)
        const selisihNet = cashlessXilnex - totalBankGross;

        let status = 'Cocok';
        let statusLabel = 'Cocok (Rp 0)';
        let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';

        if (outcode === 'UNMAPPED') {
            status = 'Unmapped';
            statusLabel = 'MID Belum Terhubung';
            badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
        } else if (cashlessXilnex > 0 && totalBankGross === 0) {
            status = 'BelumMutasi';
            statusLabel = 'Belum Ada Mutasi Bank';
            badgeColor = 'bg-orange-100 text-orange-800 border-orange-300';
        } else if (selisihNet !== 0) {
            status = 'Selisih';
            statusLabel = "Selisih Rp " + selisihNet;
            badgeColor = 'bg-red-100 text-red-800 border-red-300';
        }

        const cabangPku = masters.pku_cabang[outcode] || '';
        const storeName = profileMap[outcode] || outcode;

        results.push({
            date,
            outcode,
            storeName,
            cabang_pku: cabangPku,
            cashlessXilnex,
            bcaGross,
            bcaMdr,
            bcaNet,
            briGross,
            briMdr,
            briNet,
            totalBankGross,
            totalBankMdr,
            totalBankNet,
            selisihNet,
            status,
            statusLabel,
            badgeColor,
            rawXilnex: xRecord.items,
            rawBank: bRecord.items
        });
    });

    results.sort((a, b) => b.date.localeCompare(a.date) || a.outcode.localeCompare(b.outcode));

    syncSummariesToSupabase(results).catch(() => {});

    return results;
}

export async function syncSummariesToSupabase(reconGrid) {
    try {
        if (!reconGrid || reconGrid.length === 0) return;
        const rows = reconGrid.map(r => ({
            recon_date: r.date,
            outcode: r.outcode,
            xilnex_cashless: r.cashlessXilnex,
            bca_gross: r.bcaGross,
            bca_mdr: r.bcaMdr,
            bca_net: r.bcaNet,
            bri_gross: r.briGross,
            bri_mdr: r.briMdr,
            bri_net: r.briNet,
            total_bank_gross: r.totalBankGross,
            selisih_net: r.selisihNet,
            status_matching: r.status
        }));
        await supabase.from('recon_daily_summaries').upsert(rows, { onConflict: 'recon_date,outcode' });
    } catch (e) {
        // Silent fallback
    }
}
