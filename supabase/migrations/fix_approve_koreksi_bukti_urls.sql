-- Redefine public.approve_koreksi_request to support DELETION requests and BUKTI_URLS updates
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
  v_tanggal_jual date;
  v_tanggal_setor date;
  v_jenis text;
  v_bukti_urls text[];
begin
  -- Cek permohonan berstatus Pending
  select 
    laporan_id, 
    nominal_jual_baru, 
    nominal_setoran_baru, 
    potongan_baru,
    tanggal_jual_baru,
    tanggal_setor_baru,
    jenis_pelaporan_baru,
    bukti_urls_baru
  into 
    v_lap_id, 
    v_jual, 
    v_setor, 
    v_potong,
    v_tanggal_jual,
    v_tanggal_setor,
    v_jenis,
    v_bukti_urls
  from public.koreksi_requests
  where id = p_request_id and status = 'Pending';

  if v_lap_id is null then
    return false;
  end if;

  -- JIKA JENIS_PELAPORAN_BARU = 'HAPUS_DATA', MAKA HAPUS DATA LAPORAN
  if v_jenis = 'HAPUS_DATA' then
    delete from public.laporan
    where id = v_lap_id;
  else
    -- Update data Laporan Asli (Bypass RLS karena security definer)
    update public.laporan
    set nominal_jual = v_jual,
        nominal_setoran = v_setor,
        potongan = v_potong,
        tanggal_jual = coalesce(v_tanggal_jual, tanggal_jual),
        tanggal_setor = coalesce(v_tanggal_setor, tanggal_setor),
        jenis_pelaporan = coalesce(v_jenis, jenis_pelaporan),
        bukti_urls = case 
            when v_bukti_urls is not null and array_length(v_bukti_urls, 1) > 0 then v_bukti_urls 
            else bukti_urls 
        end
    where id = v_lap_id;
  end if;

  -- Update status permohonan koreksi menjadi Approved
  update public.koreksi_requests
  set status = 'Approved',
      approved_by = p_admin_id,
      processed_at = now()
  where id = p_request_id;

  return true;
end;
$$;
