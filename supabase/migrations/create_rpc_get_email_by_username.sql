-- ==========================================================
-- SKRIP SQL LENGKAP — JALANKAN SEKALI DI SUPABASE SQL EDITOR
-- Berisi:
--   1. RPC get_email_by_username  (login lookup, bypass RLS)
--   2. RPC search_usernames       (autocomplete dropdown login)
--   3. Mass password reset        (semua User → Alpro123)
-- ==========================================================

-- ── 1. get_email_by_username ─────────────────────────────
-- Fungsi SECURITY DEFINER agar anon role bisa lookup email
-- tanpa kena RLS. Mencari berdasarkan username ATAU email
-- (untuk menangani data yang diinjeksi dengan format email).
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Coba cari berdasarkan kolom username (case-insensitive)
  SELECT email INTO v_email
  FROM public.profiles
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  -- Fallback: jika tidak ditemukan via username,
  -- coba cocokkan langsung dengan kolom email
  -- (berguna jika username diisi dengan format email)
  IF v_email IS NULL THEN
    SELECT email INTO v_email
    FROM public.profiles
    WHERE lower(email) = lower(p_username)
    LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO authenticated;


-- ── 2. search_usernames ───────────────────────────────────
-- Fungsi untuk autocomplete/dropdown saat user mengetik username.
-- Mencari di kolom username (dan email sebagai alias).
CREATE OR REPLACE FUNCTION public.search_usernames(search_term TEXT)
RETURNS TABLE (username TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.username
  FROM public.profiles p
  WHERE p.username ILIKE '%' || search_term || '%'
  ORDER BY p.username
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_usernames(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_usernames(TEXT) TO authenticated;


-- ── 3. Reset Password Massal → Alpro123 (Role: User) ─────
-- Menggunakan ekstensi pgcrypto yang sudah ada di Supabase.
UPDATE auth.users
SET
  encrypted_password = crypt('Alpro123', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmed_at       = COALESCE(confirmed_at, now()),
  updated_at         = now()
WHERE id IN (
  SELECT id FROM public.profiles WHERE role = 'User'
);

-- Opsional: Reset juga untuk Finance dan Admin jika perlu
-- UPDATE auth.users
-- SET encrypted_password = crypt('Alpro123', gen_salt('bf'))
-- WHERE id IN (SELECT id FROM public.profiles WHERE role IN ('Admin','Finance'));
