# Panduan Mendapatkan Credential Google Drive OAuth2

Karena kebijakan *storage quota* baru dari Google, akun Google biasa (bukan Workspace/Shared Drives) tidak dapat menerima unggahan file via identitas *Service Account*. Oleh karena itu, kita harus menggunakan OAuth2 Refresh Token agar file dapat diunggah "atas nama" akun Google Utama Anda sendiri, melewati batas *storage quota*.

Ikuti petunjuk di bawah ini untuk mendapatkan **Client ID**, **Client Secret**, dan **Refresh Token** Anda.

## Langkah 1: Buat OAuth Client ID di Google Cloud Console

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Di sebelah kiri atas, pastikan Anda berada di Project yang sama dengan yang Anda gunakan sebelumnya (misal: "Apotek Alpro Setoran").
3. Buka menu navigasi kiri -> **APIs & Services** -> **Credentials**.
4. Klik tombol kuning/biru bertuliskan **+ CREATE CREDENTIALS** di bagian atas, pilih **OAuth client ID**.
5. Di layar "Create OAuth client ID":
   - **Application type**: Pilih `Web application`.
   - **Name**: Isi bebas, misalnya `Web Alpro OAuth Drive`.
   - **Authorized redirect URIs**: Tambahkan url berikut (wajib untuk langkah ke-2):
     `https://developers.google.com/oauthplayground`
6. Klik **CREATE**.
7. Akan muncul popup yang menampilkan **Client ID** dan **Client Secret** Anda. *Copy* (salin) dan amankan kedua nilai rahasia ini. 

### Penting: Hindari Error 403: access_denied (Test Users)

Jika Anda melihat error `403: access_denied` saat login di OAuth Playground, itu artinya Google memblokir akses karena aplikasi Anda masih dalam status "Testing" dan email Anda belum terdaftar sebagai tester.

**Cara Memperbaikinya:**
1. Di Google Cloud Console, buka menu **APIs & Services** -> **OAuth consent screen**.
2. Pastikan **Publishing status** adalah `Testing`.
3. Scroll ke bawah ke bagian **Test users**.
4. Klik **+ ADD USERS**.
5. Masukkan alamat email Google yang akan Anda gunakan untuk login di OAuth Playground.
6. Klik **SAVE**.
7. Sekarang, ulangi Langkah 2 di bawah ini.

## Langkah 2: Dapatkan Refresh Token via OAuth 2.0 Playground

1. Buka halaman [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Klik ikon *gear* (Pengaturan/Settings) yang berada di sudut kanan atas layar Playgorund.
3. Centang opsi kotak bertuliskan **"Use your own OAuth credentials"**.
4. Masukkan parameter **OAuth Client ID** dan **OAuth Client secret** yang sudah Anda dapatkan sebelumnya dari Langkah 1.
5. Tutup panel parameter dengan mengklik ikon gear tersebut kembali, atau klik area luar.
6. Masuk ke panel **Step 1: Select & authorize APIs** di sebelah kiri layar:
   - Ketikkan URL *scope* secara manual ke dalam kotak teks 'Input your own scopes' paling bawah, yaitu: `https://www.googleapis.com/auth/drive.file`
   - Klik tombol biru **Authorize APIs**.
   - Sistem akan mengalihkan Anda ke halaman login Google. *Login* menggunakan akun Google Utama Anda (Akun yang bertindak seolah sebagai pengelola folder penyimpanan laporan Alpro), lalu klik semacam "Lanjutkan" untuk memberi akses.
   - Anda akan dikembalikan otomatis ke halaman OAuth Playground.
7. Masuk ke panel **Step 2: Exchange authorization code for tokens**:
   - Klik tombol biru bertuliskan **Exchange authorization code for tokens**.
   - Panel di layar sebelah kanan akan berubah dan menyemburkan JSON respons. Di bagian tengah kiri panel akan muncul bidang teks **Refresh token** dan Access token.
   - *Copy* (salin) persis semua deretan teks **Refresh token** Anda (biasanya diawali huruf angka misalnya `1//...`).

## Langkah 3: Perbarui Secret Supabase Anda

Tinggalkan cara otentikasi lama Anda yang memakai file JSON. Buka *dashboard* proyek Supabase Anda (Settings -> Edge Functions -> Secrets) atas hapus rahasia lama jika Anda menggunakan Supabase CLI, dan tambahkan tiga kunci baru ini:

```bash
# Contoh menyimpan secrets lewat Supabase CLI proyek Anda:
npx supabase secrets set GOOGLE_CLIENT_ID="KODE_CLIENT_ID_ANDA.apps.googleusercontent.com"
npx supabase secrets set GOOGLE_CLIENT_SECRET="KODE_SECRET_ANDA"
npx supabase secrets set GOOGLE_REFRESH_TOKEN="1//KODE_REFRESH_TOKEN_ANDA_PANJANG"

# Catatan: Tetap pertahankan folder ID
# npx supabase secrets set GOOGLE_DRIVE_FOLDER_ID="..."

# Anda dapat menghapus otentikasi rute lawas
npx supabase secrets unset GOOGLE_SERVICE_ACCOUNT_JSON
```

Setelah Anda mmenyimpan kumpulan Edge Function secrets ini, Anda bebas meminta Edge Function Anda di perbarui di *cloud*:
`npx supabase functions deploy upload-to-drive`

Sistem *upload-to-drive* di Belakang Layar Supabase sekarang akan mengunggah gambar sebagai akun Anda setiap kali, sepenuhnya mengatasi hambatan error *storage quota*.
