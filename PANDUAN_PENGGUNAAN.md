# 📚 Panduan Penggunaan Aplikasi Setoran Harian Apotek Alpro

Selamat datang di panduan resmi penggunaan Aplikasi Pelaporan Setoran Harian. Dokumen ini dirancang khusus untuk memandu Anda (baik staf cabang maupun tim Finance) dalam menggunakan aplikasi secara efektif, lancar, dan tanpa kendala teknis.

---

## 🚀 1. Pendahuluan Sistem
Aplikasi ini adalah pusat pencatatan arus kas harian untuk seluruh jaringan Apotek Alpro. Sistem ini diciptakan untuk menggantikan pencatatan manual berbasis kertas atau chat, menjamin uang yang disetorkan oleh cabang benar-benar sesuai dengan catatan penjualan (sales), serta mempermudah tim Finance pusat dalam melakukan audit dan analisis keuangan secara otomatis.

---

## 👩‍⚕️ 2. Panduan Cabang (Staf Apotek / User)

Bagian ini khusus untuk Anda yang bertugas di apotek (KCP) untuk melaporkan setoran harian.

### A. Cara Masuk (Login) ke Aplikasi
*   **Gunakan Username:** Anda tidak perlu menggunakan alamat email yang panjang. Cukup masukkan **Username** rahasia cabang Anda (contoh: `alpro-sudirman`) beserta **Kata Sandi** yang telah diberikan oleh tim Admin/IT.
*   Jika Anda lupa kata sandi, segera hubungi tim Finance atau Admin pusat untuk meminta reset sandi.

### B. Membaca Dashboard (Beranda Utama)
Saat pertama kali masuk, Anda akan disambut oleh halaman Beranda. Ada beberapa hal penting di sini:
*   **Angka 'Hari Belum Lapor':** Ini adalah indikator kesehatan kedisiplinan Anda. Angka ini menghitung berapa hari kerja yang sudah berlalu di mana Anda *belum* menyetorkan laporan.
    *   *Catatan Penting:* Sistem mulai menghitung sejak tanggal **1 Maret 2026**.
    *   *Hari Libur:* Sistem cukup pintar untuk **mengecualikan hari Minggu**. Jadi, jika Anda tidak menyetor di hari Minggu, angka tunggakan ini tidak akan bertambah.
*   **Kotak Peringatan Merah:** Jika indikator 'Hari Belum Lapor' Anda lebih dari 0, sebuah peringatan warna merah mencolok akan muncul. Ini adalah pengingat ramah agar Anda segera melunasi setoran yang tertunda agar tidak ditegur oleh pusat.
*   **Aktivitas Terkini:** Di bagian bawah, Anda bisa melihat rekam jejak 10 laporan terakhir yang sukses Anda kirimkan.

### C. Cara Mengisi Laporan Setoran
1.  Klik menu **Lapor Setoran** (atau tombol *Buat Laporan Baru* di Beranda).
2.  **Pilih Tanggal Sales:** Pilih tanggal hasil penjualan yang uangnya ingin Anda setor. Anda hanya bisa memilih tanggal dari **1 Maret 2026** hingga hari ini (tidak bisa memilih tanggal di masa depan atau sebelum Maret 2026).
3.  Pilih jenis transaksi (Setoran Harian, Tukar Uang Kecil, dll) dan masukkan rincian nominal penjualan, potongan uang (jika ada), serta nominal setoran aslinya.
4.  **Unggah Bukti Transaksi:** Foto struk mesin EDC, kertas resi transfer bank, atau bukti CDM Anda. Jangan khawatir soal ukuran kamera yang terlalu besar! Sistem kami **tidak membatasi ukuran atau format file** gambar Anda. Langsung foto dan unggah saja.
5.  Klik tombol kirim dan tunggu hingga muncul centang hijau sukses.

### D. Menggunakan Asisten AI (Alpro Assistant)
Punya pertanyaan mendadak saat bertugas? Di pojok kanan bawah layar Anda terdapat tombol robot berwarna ungu.
*   Klik ikon tersebut untuk membuka jendela obrolan dengan **Asisten AI Apotek Alpro**.
*   Anda bisa bertanya dengan bahasa sehari-hari, contoh: *"Gimana ya caranya kalau mesin ATM menelan kartu deposit saya?"* atau *"Hari minggu wajib setor nggak?"*.
*   Asisten ini sudah hafal seluruh aturan SOP aplikasi ini dan siap membantu Anda 24 jam.

---

## 💼 3. Panduan Finance (Tim Admin)

Bagian ini khusus untuk tim manajemen, auditor, dan Finance di kantor pusat.

### A. Membaca Kesehatan Cabang (Dashboard Admin)
Beranda Admin didesain sebagai "Pusat Kendali".
*   Di bagian atas, Anda langsung disajikan angka raksasa: Total Penjualan Nasional, Total Uang yang Disetor, dan Total Potongan.
*   Terdapat kartu analisis warna-warni yang menunjukkan grafik **Tren Setoran Mingguan** dan grafik donat yang membedah metode pembayaran apa yang paling sering dipakai oleh apotek-apotek di bawah naungan Anda.

### B. Mencari & Memfilter Laporan (Manajemen Laporan)
Jika Anda sedang melakukan proses *Reconciliation* (pencocokan mutasi bank dengan laporan cabang), masuklah ke menu **Manajemen Laporan**.
*   **Pencarian Cerdas:** Ketik nama apotek di kolom pencarian.
*   **Filter Tanggal Sales:** Ingat, filter tanggal di kiri atas layar adalah berfokus pada **'Tanggal Sales' (Tanggal Penjualan)**, *bukan* kapan cabang itu menekan tombol lapor. Ini sangat krusial agar pencocokan pembukuan (closing) per tanggal kalender Anda presisi, tak peduli apakah cabang tersebut baru melapor keesokan paginya.
*   Gunakan tombol hijau **Export CSV** untuk mendownload data laporan ke Excel jika tabelnya sudah sesuai dengan yang Anda cari.

### C. Menggunakan Tombol 'Analisis AI' (Laporan Analitik)
Terkadang, melihat deretan angka yang ribuan baris panjangnya bisa sangat melelahkan. Kami telah menyematkan teknologi kecerdasan buatan untuk membantu Anda.
1.  Buka menu **Laporan Analitik**.
2.  Gunakan filter di bagian atas untuk mengerucutkan data (misal: "30 Hari Terakhir" atau pilih hanya apotek tertentu).
3.  Klik tombol ungu **Analisis AI**.
4.  Dalam hitungan detik, Asisten AI Groq (yang bertindak sebagai Senior Financial Analyst virtual Anda) akan membaca semua angka di tabel tersebut dan menuliskan sebuah rangkuman naratif di layar.
5.  AI akan membeberkan: Siapa toko dengan performa terbaik, di mana letak **anomali (selisih uang yang mencurigakan)**, dan memberikan **Saran Strategis** singkat berbahasa formal yang bisa Anda jadikan bahan laporan langsung ke pimpinan.

---
*Panduan Aplikasi Pelaporan Setoran Harian V1.0*
