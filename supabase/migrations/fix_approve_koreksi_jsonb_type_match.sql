-- =============================================================================
-- MIGRATION: fix_approve_koreksi_jsonb_type_match.sql
-- Description: Fixes PostgreSQL error "CASE types jsonb and text[] cannot be matched"
--              by wrapping v_bukti_urls with to_jsonb(v_bukti_urls)
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_koreksi_request(p_request_id uuid, p_admin_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  v_lap_id uuid;
  v_jual bigint;
  v_setor bigint;
  v_potong bigint;
  v_bca_db bigint;
  v_bca_kr bigint;
  v_bca_qr bigint;
  v_bri_db bigint;
  v_bri_kr bigint;
  v_bri_qr bigint;
  v_trf bigint;
  v_on_halo bigint;
  v_on_tiktok bigint;
  v_on_tokped bigint;
  v_voucher bigint;
  v_points bigint;
  v_total_lain bigint;
  v_tanggal_jual date;
  v_tanggal_setor date;
  v_jenis text;
  v_bukti_urls text[];
BEGIN
  SELECT 
    laporan_id, nominal_jual_baru, nominal_setoran_baru, potongan_baru,
    bca_debit_baru, bca_kredit_baru, bca_qris_baru, bri_debit_baru, bri_kredit_baru, bri_qris_baru, bank_transfer_baru,
    online_halodoc_baru, online_tiktok_baru, online_tokopedia_baru,
    voucher_amount_baru, points_amount_baru, total_lain_lain_baru,
    tanggal_jual_baru, tanggal_setor_baru, jenis_pelaporan_baru, bukti_urls_baru
  INTO 
    v_lap_id, v_jual, v_setor, v_potong,
    v_bca_db, v_bca_kr, v_bca_qr, v_bri_db, v_bri_kr, v_bri_qr, v_trf,
    v_on_halo, v_on_tiktok, v_on_tokped,
    v_voucher, v_points, v_total_lain,
    v_tanggal_jual, v_tanggal_setor, v_jenis, v_bukti_urls
  FROM public.koreksi_requests
  WHERE id = p_request_id AND status = 'Pending';

  IF v_lap_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_jenis = 'HAPUS_DATA' THEN
    DELETE FROM public.laporan WHERE id = v_lap_id;
  ELSE
    UPDATE public.laporan
    SET nominal_jual = v_jual,
        nominal_setoran = v_setor,
        potongan = v_potong,
        bca_debit = COALESCE(v_bca_db, bca_debit),
        bca_kredit = COALESCE(v_bca_kr, bca_kredit),
        bca_qris = COALESCE(v_bca_qr, bca_qris),
        bri_debit = COALESCE(v_bri_db, bri_debit),
        bri_kredit = COALESCE(v_bri_kr, bri_kredit),
        bri_qris = COALESCE(v_bri_qr, bri_qris),
        bank_transfer = COALESCE(v_trf, bank_transfer),
        online_halodoc = COALESCE(v_on_halo, online_halodoc),
        online_tiktok = COALESCE(v_on_tiktok, online_tiktok),
        online_tokopedia = COALESCE(v_on_tokped, online_tokopedia),
        voucher_amount = COALESCE(v_voucher, voucher_amount),
        points_amount = COALESCE(v_points, points_amount),
        total_lain_lain = COALESCE(v_total_lain, total_lain_lain),
        tanggal_jual = COALESCE(v_tanggal_jual, tanggal_jual),
        tanggal_setor = COALESCE(v_tanggal_setor, tanggal_setor),
        jenis_pelaporan = COALESCE(v_jenis, jenis_pelaporan),
        bukti_urls = CASE 
            WHEN v_bukti_urls IS NOT NULL AND array_length(v_bukti_urls, 1) > 0 THEN to_jsonb(v_bukti_urls) 
            ELSE bukti_urls 
        END
    WHERE id = v_lap_id;
  END IF;

  UPDATE public.koreksi_requests
  SET status = 'Approved', approved_by = p_admin_id, processed_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;
