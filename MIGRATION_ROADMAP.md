# Roadmap Migrasi: Legacy Apps Script ke React + Supabase

## 1. Analisis Gap & Pemetaan Database

Pemindahan dari Google Sheets (App Script) ke Supabase (PostgreSQL) mengharuskan perubahan paradigma dari *sheet rows* menjadi struktur relasional dan *client-side fetching*. 

### Pemetaan Tabel (Database Mapping)
Berdasarkan arsitektur *Supabase/SQL Dev*, pemetaan tabel inti adalah sebagai berikut:
*   `master_products`: Menyimpan katalog produk (mapping dari kolom *product_code*, *item_description*, *barcode*, *uom*, dan struktur harga).
*   `master_outlets`: Data referensi apotek/outlet yang memiliki akses pelaporan. Akses dibatasi berdasarkan nama outlet/ID.
*   `master_am` (Area Manager): Tabel otorisasi untuk *role* Area Manager.
*   `stocks_ed`: Tabel operasional utama (transaksional) yang mencatat entri barang dengan *Expired Date* pendek (Short ED), menggantikan *sheet* operasional.
*   `log_procurement`: Tabel rekam jejak (*append-only log*) untuk proses penarikan atau mutasi stok, menggantikan *sheet* log/histori.
*   `procode_exclude`: Tabel filter (daftar hitam/pengecualian produk) yang sebelumnya di-*hardcode* atau disimpan di *sheet* terpisah.

### Solusi Gap Logika
*   **Limitasi & Performa:** Iterasi *batch* 1000 baris dari App Script (mengakali *limit execution time* Google) dihapuskan. Supabase menggunakan paginasi limit/offset yang dikelola langsung di kapabilitas *fetching* React, secara eksponensial lebih cepat.
*   **Keamanan & Otorisasi:** Perpindahan dari *hardcoded password* di script ke Supabase RLS (Row Level Security) berdasarkan peran akses (AM, Procurement, Outlet).

---

## 2. Arsitektur React (Frontend)

Menerapkan prinsip **Bottom-Up & Anti-Overengineering**, dipadukan dengan desain *minimalist & premium*.

*   **Framework:** Vite + React (SPA yang sangat cepat)
*   **State Management:** Menggunakan **Zustand** untuk *global state* (ringan, tanpa *boilerplate* Redux) dan **Context API** murni untuk *Auth Session*. Pengambilan data menggunakan Supabase Client Native.
*   **Styling & UI/UX:**
    *   **Vanilla CSS / CSS Modules**: TIDAK menggunakan Tailwind atau *library* komponen berat (Material UI) demi kebebasan kustomisasi 100%.
    *   **Tipografi**: Menggunakan [**Plus Jakarta Sans**](https://fonts.google.com/specimen/Plus+Jakarta+Sans) sebagai pondasi elegan dan modern.
    *   **Estetika**: Pendekatan desain dengan CSS Variables (`--surface`, `--surface-hover`, `--text-primary`), *soft layering* (misal: `box-shadow: 0 4px 20px rgba(0,0,0,0.05)`), border dengan opasitas rendah (`1px solid rgba(0,0,0,0.08)`), dan *micro-animations* (`transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1)`).

---

## 3. Breakdown Fase Pengembangan & Milestone

### Fase 1: Setup Lingkungan & Fundamental CSS
*   [x] Inisialisasi Vite + React.
*   [x] Setup Supabase Client (`/services/supabaseClient.js`) dengan `.env`.
*   [x] Import **Plus Jakarta Sans** dan definisikan hierarki tipografi murni CSS.
*   [x] Setup `globals.css`: Deklarasikan *CSS Variables* untuk palet warna, bayangan (shadows), dan transisi (micro-interactions).
*   [x] Bangun komponen fundamental UI (Input, Button, Card, Loading Spinner).

### Fase 2: Sistem Autentikasi & Routing
*   [x] Bangun halaman **Login** yang estetik dan minimalis.
*   [x] Hubungkan logika Login dengan tabel `master_outlets` atau `master_am`.
*   [x] Setup React Router dengan sistem *Protected Routes*.
*   [x] Konfigurasi `AuthContext`/Zustand untuk menjaga *session persistence*.

### Fase 3: Pembuatan Layouting & Dashboard Inti
*   [x] Buat Layout *Wrapper* untuk aplikasi (Sidebar/Navigation minimalis yang bisa di-*collapse* ke format Drawer di HP).
*   [x] Buat halaman *shell* untuk entitas utama: `DashboardAM.jsx`, `DashboardProcurement.jsx`, dan `Outlet.jsx`.
*   [x] Pastikan responsivitas optimal dengan *media queries*.

### Fase 4: Integrasi Data & CRUD (Logika Bisnis Inti)
*   [x] **Sinkronisasi Katalog:** Integrasi GET `master_products`, lengkapi fitur pencarian pintar berdiktekan *debounce*.
*   [x] **Modul Operasional Outlet:** Bangun *form* input barang "Short ED". Push data POST ke `stocks_ed` di Supabase. Implementasikan Pengecekan produk `procode_exclude`.
*   [x] **Manajemen Supabase Pagination:** Implementasikan fitur *fetching* limit/offset.

### Fase 5: Modul Procurement & Multi-aksi (Batching)
*   [ ] Bangun UI dasbor *Procurement*: Tabel kompleks namun bersih untuk melihat semua status produk *Short ED*.
*   [ ] Buat fitur Checklist/Mutasi Multi-Row (Tarik banyak *item* sekaligus).
*   [ ] Simpan catatan log tindakan ke dalam tabel `log_procurement`.

### Fase 6: UI/UX Refinement & Quality Assurance
*   [ ] Audit konsistensi UI (periksa mobile responsivness).
*   [ ] Tambahkan *Skeleton Loaders* sebelum data *fetch* selesai.
*   [ ] Tambahkan *Toast Notifications* minimalis.
*   [ ] Uji coba transaksional end-to-end.
