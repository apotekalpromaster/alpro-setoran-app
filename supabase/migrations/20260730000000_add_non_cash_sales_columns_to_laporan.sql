-- Migration: Add non-cash sales breakdown columns to public.laporan table
-- Added in Stage 3 Improvement v2

ALTER TABLE public.laporan
ADD COLUMN IF NOT EXISTS bca_debit bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bca_kredit bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bca_qris bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bri_debit bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bri_kredit bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bri_qris bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_transfer bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_non_tunai bigint DEFAULT 0;

COMMENT ON COLUMN public.laporan.bca_debit IS 'Grand Total Debit EDC BCA';
COMMENT ON COLUMN public.laporan.bca_kredit IS 'Grand Total Kredit EDC BCA';
COMMENT ON COLUMN public.laporan.bca_qris IS 'Grand Total QRIS EDC BCA';
COMMENT ON COLUMN public.laporan.bri_debit IS 'Grand Total Debit EDC BRI';
COMMENT ON COLUMN public.laporan.bri_kredit IS 'Grand Total Kredit EDC BRI';
COMMENT ON COLUMN public.laporan.bri_qris IS 'Grand Total QRIS EDC BRI';
COMMENT ON COLUMN public.laporan.bank_transfer IS 'Direct Bank Transfer';
COMMENT ON COLUMN public.laporan.total_non_tunai IS 'Total Keseluruhan Non-Tunai (BCA + BRI + Transfer)';
