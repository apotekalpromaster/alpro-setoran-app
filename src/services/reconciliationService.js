export const SUB_GROUPS = [
    'BCA_DEBIT',
    'BCA_QRIS',
    'BCA_CREDIT',
    'BRI_OFFUS',
    'BRI_ONUS',
    'BRI_QRIS'
];

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

export function computeReconciliation({
    xilnexSales = [],
    bankMutations = [],
    storeProfiles = [],
    masterMappings = getStoredMasterMappings()
}) {
    const profileMap = {};
    (storeProfiles || []).forEach(p => {
        if (p.kode_toko) profileMap[p.kode_toko.toUpperCase()] = p.username || p.kode_toko;
    });

    const masters = {
        deposit_cards: masterMappings.deposit_cards || {},
        bri_mids: masterMappings.bri_mids || {},
        bca_mids: masterMappings.bca_mids || {},
        pku_cabang: masterMappings.pku_cabang || {}
    };

    const outcodePool = {};

    const initOutcode = (code) => {
        if (!outcodePool[code]) {
            outcodePool[code] = {
                subGroups: {}
            };
            SUB_GROUPS.forEach(sg => {
                outcodePool[code].subGroups[sg] = {
                    sales: [],
                    mutations: [],
                    salesTotal: 0
                };
            });
        }
    };

    // 1. Map Xilnex Sales by outcode & sub_group
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

    // 2. Map Candidate Bank Mutations (without summing bankGross upfront)
    (bankMutations || []).forEach(b => {
        const outcode = (b.outcode || 'UNMAPPED').toUpperCase();
        initOutcode(outcode);
        const sg = b.sub_group || 'OTHER';
        if (outcodePool[outcode].subGroups[sg]) {
            outcodePool[outcode].subGroups[sg].mutations.push({
                ...b,
                consumed: false
            });
        }
    });

    const results = [];

    // 3. Match per Outcode & Sub-Group
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

            let sgBankGross = 0;
            let sgBankMdr = 0;
            let sgBankNet = 0;

            mutations.forEach(m => {
                const mDate = m.tanggal_mutasi;
                const mGross = m.gross_amount || 0;

                // Candidate sales within H+0 to H+7 window (respecting explicit_sales_date if available)
                const candidates = sales.filter(s => {
                    if (s.consumed) return false;
                    if (m.explicit_sales_date) {
                        return s.tanggal_jual === m.explicit_sales_date;
                    }
                    if (!s.tanggal_jual || !mDate) return true;
                    const sTime = new Date(s.tanggal_jual).getTime();
                    const mTime = new Date(mDate).getTime();
                    const diffDays = (mTime - sTime) / (1000 * 3600 * 24);
                    return diffDays >= 0 && diffDays <= 7;
                });

                // A. Exact match check (1:1)
                const exactMatch = candidates.find(s => Math.abs(s.amount - mGross) < 0.01);
                if (exactMatch) {
                    exactMatch.consumed = true;
                    m.consumed = true;
                    sgBankGross += mGross;
                    sgBankMdr += (m.mdr_amount || 0);
                    sgBankNet += (m.net_amount || 0);
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
                    sgBankGross += mGross;
                    sgBankMdr += (m.mdr_amount || 0);
                    sgBankNet += (m.net_amount || 0);
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

                // C. Unmatched Mutation Handling
                // Unmatched mutations from H+1..H+7 or other dates are NOT added to Bank Gross of this sales period.
                // They are tracked as Orphan Mutations only if sales is empty or explicit sales date matches.
                const isSameDate = sales.some(s => s.tanggal_jual === mDate || (m.explicit_sales_date && s.tanggal_jual === m.explicit_sales_date));
                if (isSameDate || sales.length === 0) {
                    orphanMutations.push({
                        subGroup: sg,
                        ...m
                    });
                }
            });

            // C2. Reverse Accumulated Match Check (1 Sales = N Mutations, e.g. OffUs 1 + OffUs 2 or QRISOffUs + QRISOnUs)
            sales.forEach(s => {
                if (s.consumed) return;
                
                const sameDateMutations = mutations.filter(m => {
                    if (m.consumed) return false;
                    if (m.explicit_sales_date) {
                        return m.explicit_sales_date === s.tanggal_jual;
                    }
                    const sTime = new Date(s.tanggal_jual).getTime();
                    const mTime = new Date(m.tanggal_mutasi).getTime();
                    const diffDays = (mTime - sTime) / (1000 * 3600 * 24);
                    return diffDays >= 0 && diffDays <= 7;
                });

                let sumMutGross = 0;
                sameDateMutations.forEach(m => { sumMutGross += (m.gross_amount || 0); });

                if (sameDateMutations.length > 0 && Math.abs(sumMutGross - s.amount) < 0.01) {
                    s.consumed = true;
                    let mutMdrTotal = 0;
                    let mutNetTotal = 0;
                    sameDateMutations.forEach(m => {
                        m.consumed = true;
                        mutMdrTotal += (m.mdr_amount || 0);
                        mutNetTotal += (m.net_amount || 0);
                    });

                    sgBankGross += sumMutGross;
                    sgBankMdr += mutMdrTotal;
                    sgBankNet += mutNetTotal;

                    matchedPairs.push({
                        subGroup: sg,
                        bankName: sameDateMutations[0].bank_name,
                        mutationDate: sameDateMutations[0].tanggal_mutasi,
                        mutationGross: sumMutGross,
                        mutationMdr: mutMdrTotal,
                        mutationNet: mutNetTotal,
                        tag: sameDateMutations.map(m => m.category_tag).join(' + '),
                        matchStatus: 'Accumulated (1 Sales : N Mutations)',
                        linkedSales: [s],
                        rawBank: sameDateMutations[0]
                    });
                }
            });

            // D. Collect unconsumed sales as Orphan Sales
            sales.forEach(s => {
                if (!s.consumed) {
                    orphanSales.push({
                        subGroup: sg,
                        ...s
                    });
                }
            });

            totalCashless += sgData.salesTotal;
            totalBankGross += sgBankGross;
            totalBankMdr += sgBankMdr;
            totalBankNet += sgBankNet;

            const selisihSg = sgData.salesTotal - sgBankGross;

            subGroupSummaries[sg] = {
                salesTotal: sgData.salesTotal,
                bankGross: sgBankGross,
                bankMdr: sgBankMdr,
                bankNet: sgBankNet,
                selisih: selisihSg,
                status: selisihSg === 0 ? 'Cocok' : 'Selisih'
            };
        });

        const totalSelisihNet = totalCashless - totalBankGross;

        let status = 'Cocok';
        let statusLabel = 'Cocok (Rp 0)';
        let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';

        if (outcode === 'UNMAPPED') {
            status = 'Unmapped';
            statusLabel = 'MID Belum Terhubung';
            badgeColor = 'bg-gray-100 text-gray-800 border-gray-300';
        } else if (totalSelisihNet !== 0) {
            status = 'Selisih';
            statusLabel = `Selisih Rp ${totalSelisihNet.toLocaleString('id-ID')}`;
            badgeColor = 'bg-red-100 text-red-800 border-red-300';
        } else if (totalBankGross === 0 && totalCashless > 0) {
            status = 'BelumMutasi';
            statusLabel = 'Belum Ada Mutasi Bank';
            badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
        }

        results.push({
            outcode,
            storeName,
            cabang_pku: cabangPku,
            cashlessXilnex: totalCashless,
            totalBankGross,
            totalBankMdr,
            totalBankNet,
            selisihNet: totalSelisihNet,
            status,
            statusLabel,
            badgeColor,
            subGroups: subGroupSummaries,
            matchedPairs,
            orphanSales,
            orphanMutations
        });
    });

    return results;
}
