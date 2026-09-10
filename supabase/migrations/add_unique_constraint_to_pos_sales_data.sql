-- =============================================================================
-- MIGRATION: add_unique_constraint_to_pos_sales_data.sql
-- Fix for PostgreSQL error 42P10 on pos_sales_data ON CONFLICT (kode_cabang, tanggal_jual)
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Bersihkan baris duplikat jika pernah ada sebelumnya (pertahankan 1 record dengan ID terbaru)
DELETE FROM public.pos_sales_data a
USING public.pos_sales_data b
WHERE a.id < b.id
  AND a.kode_cabang = b.kode_cabang
  AND a.tanggal_jual = b.tanggal_jual;

-- 2. Pastikan semua kolom sales non-tunai granular & online tersedia (idempotent)
ALTER TABLE public.pos_sales_data
  ADD COLUMN IF NOT EXISTS card_bca_amex bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_bca_card bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_debit_lain bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_debit_sama bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_jcb bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_master bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_others bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_qris bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_unionpay bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bca_visa bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_amex bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_bca_card bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_debit_lain bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_debit_sama bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_jcb bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_master bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_others bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_qris bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_unionpay bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_bri_visa bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_halodoc bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_tiktok bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_tokopedia bigint DEFAULT 0;

-- 3. Hapus index non-unique lama jika ada, buat UNIQUE INDEX
DROP INDEX IF EXISTS public.idx_pos_sales_lookup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_lookup 
  ON public.pos_sales_data(kode_cabang, tanggal_jual);

-- 4. Tambahkan UNIQUE CONSTRAINT eksplisit pada (kode_cabang, tanggal_jual)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_sales_data_kode_cabang_tanggal_jual_key'
  ) THEN
    ALTER TABLE public.pos_sales_data
      ADD CONSTRAINT pos_sales_data_kode_cabang_tanggal_jual_key 
      UNIQUE (kode_cabang, tanggal_jual);
  END IF;
END $$;
