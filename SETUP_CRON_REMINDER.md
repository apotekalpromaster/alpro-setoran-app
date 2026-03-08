# Panduan Setup Penjadwalan Otomatis (Cron Job)

Dokumen ini berisi panduan untuk mengaktifkan **Weekly Pending Report** secara otomatis setiap hari Senin jam 08:00 WIB menggunakan ekstensi `pg_cron` dari Supabase.

Edge Function tujuan: `send-reminder-emails`

## 1. Aktifkan Ekstensi pg_cron (Sekali Saja)

Buka halaman **SQL Editor** di *dashboard* Supabase Anda, lalu jalankan perintah ini:

```sql
create extension if not exists pg_net;
create extension if not exists pg_cron;
```

## 2. Jadwalkan Pengiriman Laporan Mingguan

Jalankan kueri SQL di bawah ini pada SQL Editor. 
Pastikan Anda mengubah `[PROJECT_REF]` menjadi Reference ID proyek Supabase Anda (contoh: `wbboykllebhnoyaugtpg`), dan sesuaikan `[SERVICE_ROLE_KEY]` dengan kunci anon Anda.

```sql
select cron.schedule(
  'weekly-pending-report',
  '0 1 * * 1', -- Berarti Jam 01:00 UTC = Jam 08:00 WIB, Setiap hari Senin (1)
  $$
    select net.http_post(
        url:='https://[PROJECT_REF].supabase.co/functions/v1/send-reminder-emails',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
    ) as request_id;
  $$
);
```

### Penjelasan Waktu (Cron Syntax)
Format sintaks: `Menit Jam Tanggal Bulan Hari-Dalam-Seminggu`
Karena server Supabase menggunakan zona waktu **UTC**, dan WIB adalah **UTC+7**, maka:
`0 1 * * 1` = Menit ke-0, Jam ke-1 UTC = Jam 08:00 WIB. Hari-1 artinya Senin.

## Info Tambahan
- Untuk melihat daftar tugas terjadwal Anda saat ini:
  ```sql
  select * from cron.job;
  ```
- Untuk membatalkan/menghapus penjadwalan ini sewaktu-waktu:
  ```sql
  select cron.unschedule('weekly-pending-report');
  ```
