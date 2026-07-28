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

export function computeReconciliation({ xilnexSales, bankMutations, storeProfiles }) {
    const masters = getStoredMasterMappings();
    const profileMap = {};
    (storeProfiles || []).forEach(p => {
        if (p.kode_toko) {
            profileMap[p.kode_toko.toUpperCase()] = p.username || p.kode_toko;
        }
    });

    const SUB_GROUPS = ['BCA_DEBIT', 'BCA_QRIS', 'BCA_CREDIT', 'BRI_OFFUS', 'BRI_ONUS', 'BRI_QRIS'];

    const outcodePool = {};

    function initOutcode(outcode) {
        if (!outcodePool[outcode]) {
            outcodePool[outcode] = {
                outcode,
                subGroups: {}
            };
            SUB_GROUPS.forEach(sg => {
                outcodePool[outcode].subGroups[sg] = {
                    sales: [],
                    mutations: [],
                    salesTotal: 0,
                    bankGross: 0,
                    bankMdr: 0,
                    bankNet: 0
                };
            });
        }
    }

    // 1. Map Xilnex Cashless Sales
    (xilnexSales || []).forEach(item => {
        const outcode = (item.outcode || '').toUpperCase();
        if (!outcode) return;
        initOutcode(outcode);
        const sg = item.sub_group || 'OTHER';
        if (outcodePool[outcode].subGroups[sg]) {
            const amount = item.card_amount || item.amount || 0;
            outcodePool[outcode].subGroups[sg].sales.push({
                ...item,
                amount,
                consumed: false
            });
            outcodePool[outcode].subGroups[sg].salesTotal += amount;
        }
    });

    // 2. Map Bank Mutations
    (bankMutations || []).forEach(b => {
        const outcode = (b.outcode || 'UNMAPPED').toUpperCase();
        initOutcode(outcode);
        const sg = b.sub_group || 'OTHER';
        if (outcodePool[outcode].subGroups[sg]) {
            outcodePool[outcode].subGroups[sg].mutations.push({
                ...b,
                consumed: false
            });
            outcodePool[outcode].subGroups[sg].bankGross += (b.gross_amount || 0);
            outcodePool[outcode].subGroups[sg].bankMdr += (b.mdr_amount || 0);
            outcodePool[outcode].subGroups[sg].bankNet += (b.net_amount || 0);
        }
    });

    const results = [];

    // 3. Perform Smart Greedy Matching per Outcode & Sub-Group
    Object.keys(outcodePool).forEach(outcode => {
        const storeData = outcodePool[outcode];
        const cabangPku = masters.pku_cabang[outcode] || '';
        const storeName = profileMap[outcode] || outcode;

        let totalCashless = 0;
        let totalBankGross = 0;
        let totalBankMdr = 0;
        let totalBankNet = 0;

        const subGroupSummaries = {};
        const matchedPairs = [];
        const orphanSales = [];
        const orphanMutations = [];

        SUB_GROUPS.forEach(sg => {
            const sgData = storeData.subGroups[sg];
            const sales = sgData.sales.sort((a, b) => (a.tanggal_jual || '').localeCompare(b.tanggal_jual || ''));
            const mutations = sgData.mutations.sort((a, b) => (a.tanggal_mutasi || '').localeCompare(b.tanggal_mutasi || ''));

            totalCashless += sgData.salesTotal;
            totalBankGross += sgData.bankGross;
            totalBankMdr += sgData.bankMdr;
            totalBankNet += sgData.bankNet;

            const selisihSg = sgData.salesTotal - sgData.bankGross;

            subGroupSummaries[sg] = {
                salesTotal: sgData.salesTotal,
                bankGross: sgData.bankGross,
                bankMdr: sgData.bankMdr,
                bankNet: sgData.bankNet,
                selisih: selisihSg,
                status: selisihSg === 0 ? 'Cocok' : 'Selisih'
            };

            // Smart Greedy Match Algorithm per sub_group
            mutations.forEach(m => {
                const mDate = m.tanggal_mutasi;
                const mGross = m.gross_amount || 0;

                const candidates = sales.filter(s => {
                    if (s.consumed) return false;
                    if (!s.tanggal_jual || !mDate) return true;
                    const sTime = new Date(s.tanggal_jual).getTime();
                    const mTime = new Date(mDate).getTime();
                    const diffDays = (mTime - sTime) / (1000 * 3600 * 24);
                    return diffDays >= 0 && diffDays <= 7;
                });

                // A. Exact match check
                const exactMatch = candidates.find(s => Math.abs(s.amount - mGross) < 0.01);
                if (exactMatch) {
                    exactMatch.consumed = true;
                    m.consumed = true;
                    matchedPairs.push({
                        subGroup: sg,
                        bankName: m.bank_name,
                        mutationDate: mDate,
                        mutationGross: mGross,
                        mutationMdr: m.mdr_amount,
                        mutationNet: m.net_amount,
                        tag: m.category_tag,
                        matchStatus: 'Exact',
                        linkedSales: [exactMatch],
                        rawBank: m
                    });
                    return;
                }

                // B. Accumulated match check (N sales = 1 mutation)
                let accumulated = 0;
                const accumulatedSales = [];
                for (const c of candidates) {
                    if (accumulated + c.amount <= mGross + 0.01) {
                        accumulated += c.amount;
                        accumulatedSales.push(c);
                        if (Math.abs(accumulated - mGross) < 0.01) {
                            break;
                        }
                    }
                }

                if (Math.abs(accumulated - mGross) < 0.01 && accumulatedSales.length > 0) {
                    accumulatedSales.forEach(s => { s.consumed = true; });
                    m.consumed = true;
                    matchedPairs.push({
                        subGroup: sg,
                        bankName: m.bank_name,
                        mutationDate: mDate,
                        mutationGross: mGross,
                        mutationMdr: m.mdr_amount,
                        mutationNet: m.net_amount,
                        tag: m.category_tag,
                        matchStatus: 'Accumulated',
                        linkedSales: accumulatedSales,
                        rawBank: m
                    });
                    return;
                }

                // C. Partial match check
                if (accumulatedSales.length > 0) {
                    accumulatedSales.forEach(s => { s.consumed = true; });
                    m.consumed = true;
                    matchedPairs.push({
                        subGroup: sg,
                        bankName: m.bank_name,
                        mutationDate: mDate,
                        mutationGross: mGross,
                        mutationMdr: m.mdr_amount,
                        mutationNet: m.net_amount,
                        tag: m.category_tag,
                        matchStatus: 'Partial',
                        linkedSales: accumulatedSales,
                        gap: mGross - accumulated,
                        rawBank: m
                    });
                    return;
                }

                // D. Orphan Mutation
                orphanMutations.push({
                    subGroup: sg,
                    ...m
                });
            });

            // E. Collect unconsumed sales as Orphan Sales
            sales.forEach(s => {
                if (!s.consumed) {
                    orphanSales.push({
                        subGroup: sg,
                        ...s
                    });
                }
            });
        });

        const totalSelisihNet = totalCashless - totalBankGross;

        let status = 'Cocok';
        let statusLabel = 'Cocok (Rp 0)';
        let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';

        if (outcode === 'UNMAPPED') {
            status = 'Unmapped';
            statusLabel = 'MID Belum Terhubung';
            badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
        } else if (totalCashless > 0 && totalBankGross === 0) {
            status = 'BelumMutasi';
            statusLabel = 'Belum Ada Mutasi Bank';
            badgeColor = 'bg-orange-100 text-orange-800 border-orange-300';
        } else if (totalSelisihNet !== 0) {
            status = 'Selisih';
            statusLabel = "Selisih Rp " + totalSelisihNet.toLocaleString('id-ID');
            badgeColor = 'bg-red-100 text-red-800 border-red-300';
        }

        results.push({
            outcode,
            storeName,
            cabang_pku: cabangPku,
            subGroups: subGroupSummaries,
            cashlessXilnex: totalCashless,
            totalBankGross,
            totalBankMdr,
            totalBankNet,
            selisihNet: totalSelisihNet,
            status,
            statusLabel,
            badgeColor,
            matchedPairs,
            orphanSales,
            orphanMutations
        });
    });

    results.sort((a, b) => a.outcode.localeCompare(b.outcode));

    syncSummariesToSupabase(results).catch(() => {});

    return results;
}

export async function syncSummariesToSupabase(reconGrid) {
    try {
        if (!reconGrid || reconGrid.length === 0) return;
        const rows = reconGrid.map(r => ({
            recon_date: new Date().toISOString().split('T')[0],
            outcode: r.outcode,
            xilnex_cashless: r.cashlessXilnex,
            bca_gross: (r.subGroups.BCA_DEBIT?.bankGross || 0) + (r.subGroups.BCA_QRIS?.bankGross || 0) + (r.subGroups.BCA_CREDIT?.bankGross || 0),
            bca_mdr: (r.subGroups.BCA_DEBIT?.bankMdr || 0) + (r.subGroups.BCA_QRIS?.bankMdr || 0) + (r.subGroups.BCA_CREDIT?.bankMdr || 0),
            bca_net: (r.subGroups.BCA_DEBIT?.bankNet || 0) + (r.subGroups.BCA_QRIS?.bankNet || 0) + (r.subGroups.BCA_CREDIT?.bankNet || 0),
            bri_gross: (r.subGroups.BRI_OFFUS?.bankGross || 0) + (r.subGroups.BRI_ONUS?.bankGross || 0) + (r.subGroups.BRI_QRIS?.bankGross || 0),
            bri_mdr: (r.subGroups.BRI_OFFUS?.bankMdr || 0) + (r.subGroups.BRI_ONUS?.bankMdr || 0) + (r.subGroups.BRI_QRIS?.bankMdr || 0),
            bri_net: (r.subGroups.BRI_OFFUS?.bankNet || 0) + (r.subGroups.BRI_ONUS?.bankNet || 0) + (r.subGroups.BRI_QRIS?.bankNet || 0),
            total_bank_gross: r.totalBankGross,
            selisih_net: r.selisihNet,
            status_matching: r.status
        }));
        await supabase.from('recon_daily_summaries').upsert(rows, { onConflict: 'recon_date,outcode' });
    } catch (e) {
        // Silent fallback
    }
}
