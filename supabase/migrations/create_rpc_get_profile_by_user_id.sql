-- ================================================================
-- Migration: create_rpc_get_profile_by_user_id.sql
-- Tujuan: Buat fungsi RPC SECURITY DEFINER agar frontend dapat
-- mengambil profil user tanpa terhambat oleh RLS policy.
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. Fungsi utama: ambil profil (role) berdasarkan user_id
--    SECURITY DEFINER = fungsi berjalan dengan hak superuser postgres,
--    sehingga dapat bypass RLS --- aman karena kita validasi p_user_id
CREATE OR REPLACE FUNCTION public.get_profile_by_user_id(p_user_id uuid)
RETURNS TABLE (
    id   uuid,
    role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.role
    FROM public.profiles p
    WHERE p.id = p_user_id
    LIMIT 1;
END;
$$;

-- 2. Pastikan hanya role 'authenticated' dan 'anon' yang bisa memanggil fungsi ini
--    (anon perlu akses agar bisa dipanggil saat proses login sebelum sesi terbentuk)
REVOKE ALL ON FUNCTION public.get_profile_by_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_by_user_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_user_id(uuid) TO anon;

-- ================================================================
-- (OPSIONAL) Fungsi bonus: search email untuk AutocompleteInput login
-- Jika sudah ada fungsi search_emails, tidak perlu jalankan ini.
-- ================================================================
-- CREATE OR REPLACE FUNCTION public.search_emails(search_term text)
-- RETURNS TABLE (email text)
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--     RETURN QUERY
--     SELECT p.email
--     FROM public.profiles p
--     WHERE p.email ILIKE '%' || search_term || '%'
--     ORDER BY p.email
--     LIMIT 10;
-- END;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.search_emails(text) TO anon, authenticated;
