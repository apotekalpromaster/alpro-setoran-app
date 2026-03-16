-- ==========================================================
-- RPC: get_email_by_username
-- Tujuan: Bypass RLS untuk mencari email berdasarkan username
--         agar saat login user tidak terkena "Database error
--         querying schema" akibat RLS yang ketat di tabel profiles.
-- Cara Pakai: Jalankan script ini sekali di Supabase SQL Editor.
-- ==========================================================

create or replace function get_email_by_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  -- Cari email berdasarkan username, case-insensitive
  select email into v_email
  from profiles
  where lower(username) = lower(p_username)
  limit 1;

  return v_email; -- Mengembalikan null jika tidak ditemukan
end;
$$;

-- Berikan permission ke role 'anon' agar bisa dipanggil sebelum login
grant execute on function get_email_by_username(text) to anon;
grant execute on function get_email_by_username(text) to authenticated;
