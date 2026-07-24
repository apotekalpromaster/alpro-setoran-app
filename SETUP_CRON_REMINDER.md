# Panduan Setup Penjadwalan Otomatis (Cron Job) — Versi 2

Dokumen ini berisi panduan untuk mengaktifkan seluruh penjadwalan otomatis (reminder harian, selisih mingguan, dan pengingat anomali sore) di Supabase menggunakan ekstensi `pg_cron`.

---

## 1. Aktifkan Ekstensi pg_cron (Sekali Saja)

Buka halaman **SQL Editor** di *dashboard* Supabase Anda, lalu jalankan perintah ini:

```sql
create extension if not exists pg_net;
create extension if not exists pg_cron;
```

---

## 2. Hapus Penjadwalan Lama (Jika Ada)

Jika Anda sudah pernah menjadwalkan `weekly-pending-report` versi lama, hapus terlebih dahulu dengan menjalankan:

```sql
select cron.unschedule('weekly-pending-report');
```

---

## 3. Jadwalkan 3 Otomasi Email Baru

Jalankan kueri SQL di bawah ini pada SQL Editor Supabase Anda.
> [!IMPORTANT]
> Pastikan Anda mengubah `[PROJECT_REF]` menjadi Reference ID proyek Supabase Anda (contoh: `wbboykllebhnoyaugtpg`), dan sesuaikan `[SERVICE_ROLE_KEY]` dengan kunci service role/anon Anda.

### A. Daily Pending Report (Reminder Harian H-1)
* **Waktu:** Setiap hari pukul 08:00 WIB (01:00 UTC)
* **Fungsi Edge:** `send-reminder-emails`
```sql
select cron.schedule(
  'daily-pending-report',
  '0 1 * * *', -- 01:00 UTC = 08:00 WIB
  $$
    select net.http_post(
        url:='https://[PROJECT_REF].supabase.co/functions/v1/send-reminder-emails',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
    ) as request_id;
  $$
);
```

### B. Weekly Discrepancy Report (Laporan Selisih Setoran Mingguan >50k)
* **Waktu:** Setiap hari Senin pukul 08:30 WIB (01:30 UTC)
* **Fungsi Edge:** `send-weekly-discrepancy-report`
```sql
select cron.schedule(
  'weekly-discrepancy-report',
  '30 1 * * 1', -- 01:30 UTC pada hari Senin (1) = 08:30 WIB
  $$
    select net.http_post(
        url:='https://[PROJECT_REF].supabase.co/functions/v1/send-weekly-discrepancy-report',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
    ) as request_id;
  $$
);
```

### C. Daily Afternoon Anomaly Reminder (Pengingat Anomali Sore Hari)
* **Waktu:** Setiap hari pukul 17:00 WIB (10:00 UTC)
* **Fungsi Edge:** `send-afternoon-anomaly-reminder`
```sql
select cron.schedule(
  'daily-afternoon-anomaly-reminder',
  '0 10 * * *', -- 10:00 UTC = 17:00 WIB
  $$
    select net.http_post(
        url:='https://[PROJECT_REF].supabase.co/functions/v1/send-afternoon-anomaly-reminder',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
    ) as request_id;
  $$
);
```

---

## 4. Utilitas Pemantauan Cron
* Untuk melihat daftar tugas penjadwalan aktif saat ini:
  ```sql
  select * from cron.job;
  ```
* Untuk melihat riwayat eksekusi (apakah sukses atau gagal mengirim HTTP request):
  ```sql
  select * from cron.job_run_details order by runid desc limit 10;
  ```
* Untuk membatalkan salah satu tugas:
  ```sql
  select cron.unschedule('nama-tugas');
  ```
