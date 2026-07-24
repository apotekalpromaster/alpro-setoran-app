-- =============================================================================
-- MIGRATION: create_improvement_v2_tables_and_rpcs.sql
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. TABEL DATA PENJUALAN POS
create table if not exists public.pos_sales_data (
  id uuid primary key default uuid_generate_v4(),
  kode_cabang text not null,
  tanggal_jual date not null,
  sales_pos bigint default 0,
  uploaded_at timestamptz default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);

-- Indexing untuk rekonsiliasi cepat
create index if not exists idx_pos_sales_lookup on public.pos_sales_data(kode_cabang, tanggal_jual);

-- Enable RLS
alter table public.pos_sales_data enable row level security;

-- Policies untuk pos_sales_data
drop policy if exists "Finance and Admin can do all on pos_sales_data" on public.pos_sales_data;
create policy "Finance and Admin can do all on pos_sales_data"
  on public.pos_sales_data
  for all
  using ( public.get_auth_role() in ('Admin', 'Finance') );


-- 2. TABEL PERMOHONAN KOREKSI LAPORAN
create table if not exists public.koreksi_requests (
  id uuid primary key default uuid_generate_v4(),
  laporan_id uuid references public.laporan(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete cascade,
  nominal_jual_baru bigint not null,
  nominal_setoran_baru bigint not null,
  potongan_baru bigint not null,
  penjelasan_koreksi text not null,
  status text default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  approved_by uuid references public.profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.koreksi_requests enable row level security;

-- Policies untuk koreksi_requests
drop policy if exists "User can view own koreksi_requests" on public.koreksi_requests;
create policy "User can view own koreksi_requests"
  on public.koreksi_requests
  for select
  using (auth.uid() = requested_by);

drop policy if exists "User can insert own koreksi_requests" on public.koreksi_requests;
create policy "User can insert own koreksi_requests"
  on public.koreksi_requests
  for insert
  with check (auth.uid() = requested_by);

drop policy if exists "Finance and Admin can view all koreksi_requests" on public.koreksi_requests;
create policy "Finance and Admin can view all koreksi_requests"
  on public.koreksi_requests
  for select
  using ( public.get_auth_role() in ('Admin', 'Finance') );

drop policy if exists "Finance and Admin can update all koreksi_requests" on public.koreksi_requests;
create policy "Finance and Admin can update all koreksi_requests"
  on public.koreksi_requests
  for update
  using ( public.get_auth_role() in ('Admin', 'Finance') );


-- 3. RPC UNTUK DETEKSI FRAUD (TANGGAL PENJUALAN TANPA LAPORAN UTAMA)
create or replace function public.detect_missing_primary_sales()
returns table (
  username text,
  tanggal_jual date,
  laporan_ada_count bigint
) 
language plpgsql 
security definer 
stable 
as $$
begin
  return query
  select p.username, l.tanggal_jual, count(l.id)
  from public.laporan l
  join public.profiles p on l.user_id = p.id
  where not exists (
    select 1 from public.laporan l2
    where l2.user_id = l.user_id
      and l2.tanggal_jual = l.tanggal_jual
      and l2.jenis_pelaporan in (
        'Setoran Harian', 
        'Setoran 3x Seminggu', 
        'Setoran Sales Dengan Potongan Penjualan'
      )
  )
  group by p.username, l.tanggal_jual;
end;
$$;

-- Grant access to RPC
grant execute on function public.detect_missing_primary_sales() to authenticated;
grant execute on function public.detect_missing_primary_sales() to anon;


-- 4. RPC UNTUK FINANCE MEMVERIFIKASI & MENYETUJUI KOREKSI LAPORAN
create or replace function public.approve_koreksi_request(p_request_id uuid, p_admin_id uuid)
returns boolean 
language plpgsql 
security definer 
as $$
declare
  v_lap_id uuid;
  v_jual bigint;
  v_setor bigint;
  v_potong bigint;
begin
  -- Cek kecocokan permohonan yang berstatus Pending
  select laporan_id, nominal_jual_baru, nominal_setoran_baru, potongan_baru
  into v_lap_id, v_jual, v_setor, v_potong
  from public.koreksi_requests
  where id = p_request_id and status = 'Pending';

  if v_lap_id is null then
    return false;
  end if;

  -- 1. Update data Laporan Asli (Bypass RLS karena dijalankan sebagai SECURITY DEFINER)
  update public.laporan
  set nominal_jual = v_jual,
      nominal_setoran = v_setor,
      potongan = v_potong
  where id = v_lap_id;

  -- 2. Update status permohonan koreksi menjadi Approved
  update public.koreksi_requests
  set status = 'Approved',
      approved_by = p_admin_id,
      processed_at = now()
  where id = p_request_id;

  return true;
end;
$$;

-- Grant access to RPC
grant execute on function public.approve_koreksi_request(uuid, uuid) to authenticated;
grant execute on function public.approve_koreksi_request(uuid, uuid) to anon;
