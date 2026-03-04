-- ==============================================================================
-- SCHMEA DEFINITION: PELAPORAN SETORAN HARIAN (SUPABASE)
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 2. TABLES
-- ==============================================================================

-- Tabel Profiles (Ekstenstion dari auth.users)
-- Menggantikan sheet 'users'
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  role text not null default 'User',
  frekuensi_setoran text not null default 'SETIAP HARI',
  email text,
  deposit_card text,
  kcp_terdekat text,
  created_at timestamptz default now()
);

-- Trigger untuk membuat auth user baru menjadi public.profiles
-- Jika ingin handle register, tapi untuk internal app biasanya di create manual oleh Admin
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Tabel Laporan
-- Menggantikan sheet 'Laporan'
create table public.laporan (
  id uuid primary key default uuid_generate_v4(),
  timestamp timestamptz default now(),
  user_id uuid references public.profiles(id) on delete restrict,
  tanggal_jual date,
  tanggal_setor date,
  jenis_pelaporan text not null,
  metode_setoran text,
  nominal_jual bigint default 0,
  nominal_setoran bigint default 0,
  potongan bigint default 0,
  penjelasan text,
  nomor_deposit_card text,
  nomor_mesin_atm text,
  lokasi_mesin_atm text,
  waktu_kejadian time,
  bukti_urls jsonb default '[]'::jsonb,
  kcp_terdekat text
);

-- Indexing untuk optimasi query berdasarkan tanggal & user
create index idx_laporan_user_id on public.laporan(user_id);
create index idx_laporan_tanggal_setor on public.laporan(tanggal_setor);
create index idx_laporan_timestamp on public.laporan(timestamp desc);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Aktifkan RLS
alter table public.profiles enable row level security;
alter table public.laporan enable row level security;

-- --- Policies untuk Profiles ---
-- User biasa hanya bisa melihat dan merubah profilnya sendiri
-- Admin (role='Admin' | 'Finance') bisa melihat semua profil

create policy "User can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "User can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "Admin can view all profiles"
  on public.profiles
  for select
  using ( (select role from public.profiles where id = auth.uid()) in ('Admin', 'Finance') );

create policy "Admin can update all profiles"
  on public.profiles
  for update
  using ( (select role from public.profiles where id = auth.uid()) in ('Admin', 'Finance') );


-- --- Policies untuk Laporan ---
-- User hanya bisa melihat dan menambah laporannya sendiri (tidak bisa hapus/edit)
-- Admin bisa melihat semua laporan, tapi tidak bisa hapus/edit

create policy "User can view own reports"
  on public.laporan
  for select
  using (auth.uid() = user_id);

create policy "User can insert own reports"
  on public.laporan
  for insert
  with check (auth.uid() = user_id);

create policy "Admin can view all reports"
  on public.laporan
  for select
  using ( (select role from public.profiles where id = auth.uid()) in ('Admin', 'Finance') );

-- ==============================================================================
-- 4. STORAGE SETUP (Optional: Jika pindah ke Supabase Storage nanti, namun saat ini Google Drive)
-- ==============================================================================
-- Jika pakai Drive, table laporan kolom bukti_urls cukup menyimpan public URL dari Drive.
