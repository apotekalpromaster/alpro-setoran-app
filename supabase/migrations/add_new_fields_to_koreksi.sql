ALTER TABLE public.koreksi_requests 
ADD COLUMN IF NOT EXISTS tanggal_jual_baru date,
ADD COLUMN IF NOT EXISTS tanggal_setor_baru date,
ADD COLUMN IF NOT EXISTS jenis_pelaporan_baru text,
ADD COLUMN IF NOT EXISTS bukti_urls_baru text[];
