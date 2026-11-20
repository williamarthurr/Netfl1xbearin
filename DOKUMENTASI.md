# Dokumentasi Proyek: Netfl1x micicow (repo NetflixArin)

Dokumen handover untuk melanjutkan, memelihara, atau mengembangkan website Netfl1x micicow. Proyek ini adalah website statis tanpa build step yang di-host di Cloudflare Pages, dengan Firebase Authentication dan Cloud Firestore untuk fitur rating customer, foto testimoni, pencatatan langganan, serta dashboard admin.

## Ringkasan

| Bagian | Teknologi / lokasi |
| --- | --- |
| Landing page customer | `index.html` |
| Dashboard admin | `admin.html` (URL production: `/admin.html`) |
| Styling | `css/style.css` (satu file, sekitar 1.050 baris) |
| Fitur landing page, order, review public | `js/main.js` |
| Fitur dashboard admin | `js/admin.js` |
| Konfigurasi Firebase dan daftar admin | `js/firebase-config.js` |
| Database | Cloud Firestore |
| Login admin | Firebase Authentication, Google Sign-In |
| Catatan keuangan harian | `admin.html` + `js/admin.js`, koleksi `transactions` |
| Notifikasi langganan habis | Cloudflare Worker + Cron Trigger (`worker/`), kirim ke Telegram |
| Hosting | Cloudflare Pages, deploy otomatis dari branch `main` GitHub |
| Library eksternal | Firebase JS SDK 10.14.1 (CDN gstatic, dynamic import), font Inter (Google Fonts), ikon Flaticon UIicons (CDN) |

Domain production yang saat ini tercantum di meta tag `index.html`: `https://www.micicow.my.id/`. URL worker notifikasi: `https://netflixarin-notify.ravgg2530.workers.dev`.

## Struktur folder

```text
NetflixArin/
├── index.html                # Landing page customer
├── admin.html                # UI dashboard admin
├── css/
│   └── style.css             # Seluruh CSS, termasuk UI review, admin, tema, modal
├── js/
│   ├── main.js               # Katalog, form order WA, FAQ, tema, carousel, review, testimoni
│   ├── admin.js              # Login admin, moderasi review, testimoni, langganan, catatan keuangan, Telegram
│   └── firebase-config.js    # Firebase Web config, email admin, URL worker notifikasi
├── worker/                   # Cloudflare Worker notifikasi Telegram (deploy terpisah, sekali)
│   ├── wrangler.toml         # Nama worker, cron tiap 1 menit, binding KV
│   ├── src/index.js          # Endpoint /sync, /status, /test + cron notif
│   ├── .dev.vars             # Secret lokal untuk wrangler dev (gitignored, jangan di-push)
│   └── .wrangler/            # Cache lokal wrangler (gitignored)
├── testimoni/                # 4 foto testimoni statis (testi1.jpeg sampai testi4.jpeg)
├── video/
│   ├── frame1arin-web.mp4    # Video hero yang dipakai index.html (sudah dikompres)
│   ├── frame1arin-poster.jpg # Poster video hero
│   ├── frame1arin.mp4        # File sumber asli, tidak direferensikan halaman
│   └── frame2arin.mp4        # File sumber asli, tidak direferensikan halaman
├── favicon.ico / favicon.svg / favicon-32.png / apple-touch-icon.png
├── og-image.jpg              # Gambar preview saat link dibagikan (1200x630)
├── FIREBASE_SETUP.md         # Panduan setup Firebase awal + Firestore Rules
├── DOKUMENTASI.md            # Dokumen ini
└── .gitignore
```

Folder `.tmp-check/`, `.tmp-ffmpeg/`, dan file `debug.log` adalah sisa proses kerja (kompresi video dan log crash browser), bukan bagian dari website, dan aman dihapus. Folder `.commandcode/` dan `.zcode/` adalah folder kerja tool AI, biarkan saja. File `debug.log` sebenarnya sudah ditutupi `.gitignore` (pola `*.log`).

## Fitur landing page

Semua fitur di bawah ada di `index.html` + `js/main.js` + `css/style.css`, tanpa framework.

### Katalog dan harga

Katalog dirender oleh `renderCatalog()` dari array `PACKAGES` di `js/main.js`. Mengubah harga atau menambah paket cukup mengedit array itu, tidak perlu menyentuh HTML.

| Paket | Ketentuan | Harga | Badge |
| --- | --- | --- | --- |
| 1 Hari | 1 profile, 1 user | Rp 4.000 | TERLARIS |
| 2 Hari | 1 profile, 1 user | Rp 7.000 | |
| 3 Hari | 1 profile, 1 user | Rp 9.000 | |
| 5 Hari | 1 profile, 1 user | Rp 11.000 | |
| 7 Hari | 1 profile, 1 user | Rp 15.000 | |
| 1 Bulan | 1 profile, 2 user | Rp 20.000 | TERLARIS |
| 1 Bulan | 1 device | Rp 40.000 | |
| 1 Bulan | 2 device | Rp 45.000 | |

Harga di array ditulis dalam ribuan (`price: "4"` berarti Rp 4.000) dan diformat oleh `formatPrice()`. Selama tidak ada paket `featured: true` yang berubah, badge TERLARIS mengikuti array.

### Form order via WhatsApp

Tombol "Order via WhatsApp" di setiap kartu membuka modal (bukan langsung ke WhatsApp). Customer mengisi:

1. Durasi: otomatis terisi dari paket yang dipilih (readonly).
2. Nama, Device + Seri, Lokasi: wajib diisi.
3. No. HP: wajib, minimal 9 digit angka.

Setelah submit, browser membuka `https://wa.me/<nomor>?text=<pesan terformat>` berisi detail order. Nomor WhatsApp admin ada di konstanta `WA_NUMBER` di baris pertama `js/main.js` (format internasional tanpa `+`). Tombol "Order Sekarang" di hero membuka WhatsApp langsung dengan pesan umum tanpa modal. Modal bisa ditutup dengan tombol close, klik overlay, atau tombol Escape.

### Rating dan ulasan

- Ringkasan rating: rata-rata, bintang, jumlah ulasan, dan distribusi per bintang dihitung lewat `getCountFromServer` per nilai rating, tanpa mengunduh semua ulasan.
- Ulasan tampil sebagai carousel horizontal dengan panah; panah hanya muncul kalau kontennya melebihi lebar kontainer.
- Ulasan diambil 12 per halaman memakai `startAfter` (cursor) dan diurutkan `createdAt desc`; butuh composite index (`approved` asc, `createdAt` desc) — lihat `FIREBASE_SETUP.md` §4.1. Kalau index belum ada, `main.js` fallback mengambil semua ulasan `approved: true` lalu mengurutkannya di browser.
- Form ulasan: rating 1-5 (wajib), nama panggilan opsional (default "Customer", maks 40 karakter), komentar 10 sampai 500 karakter. Ulasan terkirim dengan `approved: false` dan menunggu persetujuan admin.
- Firebase dimuat dengan dynamic import terpisah, jadi kalau CDN Firebase gagal, katalog dan fitur statis lain tetap jalan.

### Testimoni

- 4 foto statis dari `testimoni/testi1.jpeg` sampai `testi4.jpeg`, dideklarasikan langsung di `index.html`.
- Foto hasil unggahan admin dari dashboard (disimpan di koleksi `testimonials`) ditambahkan otomatis setelah foto statis oleh `loadTestimonialPhotos()`.
- Klik foto membuka lightbox layar penuh; tutup dengan tombol close, klik di luar gambar, atau Escape.

### Tema terang dan gelap

- Toggle di navbar bisa diklik, digeser (drag), dan dikendalikan keyboard (panah kiri/kanan, Enter, Space).
- Pilihan tersimpan di `localStorage` dengan kunci `theme`.
- Script kecil di `<head>` `index.html` menerapkan tema sebelum render supaya tidak ada kedipan (FOUC). Kalau `localStorage` kosong, tema mengikuti `prefers-color-scheme` sistem.
- Kedua tema harus tetap dipelihara; jangan menambah warna baru hanya di salah satu tema.

### Bagian lain

- Navbar: efek scroll (shadow muncul setelah 30px), menu mobile via hamburger.
- Video hero: `video/frame1arin-web.mp4`, autoplay, mute, loop, dengan poster. Atribut `width`/`height` terpasang supaya layout tidak lompat.
- Keunggulan, Cara Order (3 langkah), FAQ (5 item, accordion satu terbuka), CTA, Contact (Telegram `@rainoire`, X `@micicollect`), footer dengan tahun otomatis.

## Cara menjalankan lokal

Jangan membuka `index.html` langsung dengan `file:///` karena modul JS dan Firebase butuh HTTP. Jalankan lewat static server, misalnya VS Code Live Server atau:

```powershell
python -m http.server 4173
```

Buka:

```text
http://localhost:4173
http://localhost:4173/admin.html
```

Jika Firebase Authentication dipakai untuk tes lokal, pastikan `localhost` ada di **Firebase Authentication → Settings → Authorized domains**.

## Konfigurasi Firebase

File `js/firebase-config.js` memiliki tiga bagian:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."   // opsional, saat ini belum dipakai karena analytics tidak dimuat
};

// Semua email Google yang boleh memakai dashboard admin.
export const adminEmails = [
  "admin-pertama@gmail.com",
  "admin-kedua@gmail.com"
];

// URL worker notifikasi; kosong = modul Telegram tampil "belum dihubungkan",
// modul langganan tetap jalan.
export const notifyWorkerUrl = "";
```

`apiKey` Firebase untuk Web memang berada di frontend dan bukan private key. Yang melindungi data adalah **Firestore Security Rules**. Jangan pernah menyimpan service-account JSON, private key, OAuth client secret, atau token deploy di repository.

Setiap email pada `adminEmails` juga wajib dicantumkan pada fungsi `isAdmin()` di Firestore Rules. Daftar pada JavaScript hanya untuk UX; Rules adalah pengaman yang sebenarnya.

## Setup Firebase satu kali

Panduan lengkap beserta isi Firestore Rules ada di `FIREBASE_SETUP.md`. Ringkasannya:

1. Buat Firebase Web App dan isi `firebaseConfig`.
2. Aktifkan **Firestore Database** dalam mode production.
3. Aktifkan **Authentication → Sign-in method → Google**.
4. Tambahkan domain production Cloudflare di **Authentication → Settings → Authorized domains** (hostname tanpa `https://`, misalnya `namasitus.pages.dev` dan domain custom bila ada).
5. Pasang/publish Firestore Rules dari `FIREBASE_SETUP.md` setelah mengganti seluruh placeholder email admin.

## Model data Firestore

### `reviews/{autoId}`

ID document review dibuat acak oleh Firestore (`addDoc`), bukan ID order.

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `customerName` | string | Nama panggilan customer, 1 sampai 40 karakter, default "Customer" |
| `comment` | string | Isi ulasan, 10 sampai 500 karakter |
| `rating` | number | Nilai 1 sampai 5 |
| `approved` | boolean | `false` sebelum moderasi, `true` setelah disetujui |
| `createdAt` | timestamp | Waktu customer mengirim review |

Review lama (sebelum sistem tanpa token) masih memiliki field `orderId` dan `reviewToken`; field itu tidak lagi dipakai dan aman diabaikan. Menyetujui review lewat dashboard sekaligus menghapus sisa `reviewToken` dengan `deleteField()`. Hanya review dengan `approved: true` yang bisa dibaca publik. Koleksi `purchases` dari sistem lama sudah tidak dipakai dan boleh dihapus.

### `testimonials/{autoId}`

Foto testimoni hasil unggahan dari dashboard admin. Gambar dikompres di browser (maksimal sisi 1280px, JPEG, kualitas mulai 0.72 dan turun bila perlu) lalu disimpan sebagai data URL langsung di Firestore, tanpa Firebase Storage.

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `src` | string | Data URL gambar (`data:image/jpeg;base64,…`), maksimal sekitar 950.000 karakter |
| `fileName` | string | Nama file asli, maksimal 100 karakter, untuk referensi admin |
| `createdAt` | timestamp | Waktu unggah |

Foto dibaca publik untuk landing page. Menghapus dokumen sama dengan menghapus foto dari landing page. Koleksi ini hanya bisa ditulis admin sesuai Rules.

### `subscriptions/{autoId}`

Satu dokumen per pelanggan langganan. Hanya admin yang boleh membaca dan menulis.

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `customerName` | string | Nama pelanggan, maksimal 60 karakter |
| `packageName` | string | Label paket, misal `7 hari` atau `1 bulan (30 hari)` |
| `durationDays` | number | Total durasi hari, 0,01 sampai 3650 (desimal untuk tes singkat) |
| `startedAt` | timestamp | Waktu langganan dibuat |
| `expiresAt` | timestamp | `startedAt + durationDays`, dasar hitung mundur |
| `stopped` | boolean | Ada hanya jika langganan dihentikan manual lewat tombol Stop |
| `createdAt` | timestamp | Waktu dokumen dibuat |

Perilaku penting:

- **Perpanjang** menggeser `expiresAt` dari nilai lama (bukan dari hari ini) dan menambah `durationDays`. Konsekuensinya: memperpanjang langganan yang sudah lama habis bisa membuatnya langsung berstatus habis lagi, karena basisnya tanggal kadaluarsa lama. Untuk kasus itu, hapus lalu buat langganan baru, atau isi durasi yang cukup panjang.
- **Stop** menandai `stopped: true`: hitung mundur berhenti, langganan tidak ikut disinkronkan ke worker (jadi tidak dinotif), dan bisa dilanjutkan dengan **Lanjutkan**.
- Menghapus dokumen menghilangkan pelanggan dari daftar dan dari notifikasi.

### `settings/telegram`

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `syncSecret` | string | Secret pengaman endpoint worker (header `X-Sync-Secret`). Dibuat otomatis dashboard saat pertama dibuka, tampil di kartu **Notifikasi Telegram**. |
| `createdAt` | timestamp | Waktu dokumen dibuat |

### `transactions/{autoId}`

Satu dokumen per transaksi pemasukan/pengeluaran yang dicatat admin. Hanya admin yang boleh membaca dan menulis.

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `type` | string | `income` atau `outcome` |
| `amount` | number | Nominal dalam Rupiah (positif) |
| `note` | string | Catatan opsional, maksimal 100 karakter |
| `date` | string | Tanggal lokal `YYYY-MM-DD` dari date picker, dipakai untuk query equality |
| `createdAt` | timestamp | Waktu transaksi dicatat, untuk urutan tampilan |

Kartu **Catatan keuangan harian** di dashboard memakai date picker (default hari ini), lalu mengambil transaksi dengan `where("date", "==", tanggal)` — query single-field ini **tidak butuh composite index**. Ringkasan dihitung di browser: total income, total outcome, **Net Profit** (`income - outcome`, berwarna merah saat negatif), dan **Daily Transaction Count** (jumlah transaksi pada tanggal itu). Di bawah ringkasan ada grafik batang **Tren 7 hari terakhir** (income vs outcome) yang diambil dengan satu query rentang `date` dan diagregasi di browser — tanpa library chart dan tanpa composite index. `date` sengaja disimpan sebagai string, bukan Timestamp, supaya tidak bergeser karena timezone.

## Modul langganan dan notifikasi Telegram

Alur: admin menambah pelanggan (nama + paket 1/3/5/7 hari, 1 bulan, atau custom) → hitung mundur berjalan langsung di dashboard → saat `expiresAt` lewat, worker Cloudflare (cron tiap 1 menit sesuai `wrangler.toml`) mengirim pesan Telegram ke semua chat yang terdaftar → admin perpanjang atau hapus.

Cara kerja teknis:

1. Dashboard (satu-satunya yang boleh membaca `subscriptions` karena Rules) mendorong daftar `{id, name, packageLabel, expiresAtMs}` ke endpoint `POST /sync` worker setiap ada tambah/perpanjang/hapus/stop/lanjutkan dan setiap dashboard dibuka. Langganan berstatus `stopped` tidak ikut dikirim.
2. Worker menyimpan daftar di KV. Cron tiap 1 menit mengirim pesan Telegram untuk yang sudah lewat dan belum dinotif, lalu menandainya. Notif maksimal telat sekitar 1 menit setelah habis. Penanda memakai kunci `subId:expiresAtMs`, jadi langganan yang diperpanjang akan dinotif lagi saat masa baru habis.
3. Penulisan KV dihemat karena limit gratis 1.000 tulis/hari: daftar `notified` hanya ditulis saat isinya berubah, dan timestamp `lastCron` hanya ditulis maksimal sekali per 10 menit atau saat ada notif terkirim. Komentar "Cron tiap 10 menit" di kepala `worker/src/index.js` sudah tidak akurat; jadwal yang benar ada di `wrangler.toml`.
4. Telegram gagal kirim → langganan tidak ditandai → cron berikutnya mencoba lagi sampai berhasil.

### Endpoint worker

Semua endpoint memeriksa header `X-Sync-Secret` dan menolak dengan HTTP 401 bila secret salah. CORS terbuka (`*`) karena dashboard memanggil worker dari browser.

| Endpoint | Metode | Fungsi |
| --- | --- | --- |
| `/sync` | POST | Simpan daftar langganan terbaru ke KV, balas dengan peta `notified` |
| `/status` | GET | Status bot Telegram (`getMe`), jumlah langganan tersinkron, jumlah yang sudah habis, cron terakhir |
| `/test` | POST | Kirim pesan test ke Telegram |

Secret worker (dipasang dengan `npx wrangler secret put NAMA` di folder `worker/`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SYNC_SECRET`. `TELEGRAM_CHAT_ID` boleh berisi beberapa chat ID dipisah koma, semua akan menerima notif yang sama. Tidak ada secret di kode frontend.

### Deploy atau update worker

Worker tidak ikut deploy Pages; di-deploy terpisah sekali (ulangi hanya jika `worker/` diubah):

```powershell
cd worker
npx wrangler login          # klik Allow di browser
npx wrangler kv namespace create NOTIFY_KV   # salin id-nya ke wrangler.toml
npx wrangler deploy
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put SYNC_SECRET
```

Setelah deploy, salin URL `https://netflixarin-notify.<subdomain>.workers.dev` ke `notifyWorkerUrl` di `js/firebase-config.js`.

### Setup bot Telegram

1. Chat **@BotFather** → `/newbot` → ikuti langkahnya → salin token.
2. Kirim 1 pesan apa pun ke bot baru dari akun Telegram admin (agar chat ID bisa terdeteksi).
3. Pasang token + chat ID sebagai secret worker (lihat atas), atau minta AI melakukannya.
4. Buka dashboard → kartu **Notifikasi Telegram** harus menampilkan `Bot @... terhubung` → tekan **Kirim pesan test** dan pastikan pesan masuk.
5. Salin **sync secret** dari kartu itu dan pasang sebagai secret worker `SYNC_SECRET` (sekali saja).

### Menambah admin penerima notifikasi lain

Bot hanya mengirim ke chat ID yang terdaftar di secret `TELEGRAM_CHAT_ID`. Untuk admin kedua: minta dia kirim `/start` ke bot, ambil chat ID-nya lewat `getUpdates`, lalu update secret menjadi dua ID dipisah koma (misal `111111,222222`) dengan `npx wrangler secret put TELEGRAM_CHAT_ID` di folder `worker/`.

## Alur order customer

```text
Customer membuka landing page → klik "Order via WhatsApp" pada kartu paket
→ modal terbuka, isi nama, device, lokasi, no HP
→ submit → WhatsApp terbuka dengan pesan detail order ke nomor admin
→ admin konfirmasi + bayar di WhatsApp → akun dikirim via WhatsApp
```

Link yang dibagikan ke customer cukup satu: `https://DOMAIN-ANDA/`.

## Alur rating customer

```text
Customer membuka https://DOMAIN-ANDA/#ulasan → mengisi form ulasan
→ review masuk dengan approved: false
→ admin menekan Setujui di dashboard → approved: true
→ review tampil di index.html#ulasan
```

Tidak ada lagi link bertoken. Karena form terbuka untuk siapa pun, moderasi admin wajib dilakukan sebelum ulasan tampil publik; validasi field (rating 1-5, komentar 10 sampai 500 karakter) juga dipaksa di Firestore Rules.

## Operasi harian admin

1. Buka `https://DOMAIN-ANDA/admin.html`. (File `_redirects` tidak ada di repo, jadi `/admin` tanpa `.html` hanya berfungsi jika kamu menambahkan redirect di dashboard Cloudflare Pages.)
2. Login memakai Google account yang terdaftar sebagai admin.
3. **Ulasan masuk**: **Setujui** agar tampil publik, atau **Hapus** untuk menghapus permanen. Daftar dimuat seluruhnya dan diurutkan terbaru; tombol **Muat ulang** untuk refresh.
4. **Foto testimoni**: pilih satu atau beberapa foto, tekan **Unggah foto**. Foto otomatis dikompres dan langsung tampil di landing page; tombol × pada thumbnail menghapusnya.
5. **Langganan pelanggan**:
   - Tambah pelanggan: nama + paket (1/3/5/7 hari, 1 bulan, atau custom dalam hari desimal).
   - Pantau hitung mundur; status: **Aktif**, **Hampir habis** (sisa maksimal 1 hari), **Habis**, **Dihentikan**.
   - Filter di atas daftar: Semua, Aktif, Habis, Dihentikan. Catatan: status "Hampir habis" tidak punya tombol filter sendiri, jadi hanya terlihat lewat filter Semua.
   - **Perpanjang** saat customer bayar lagi (isi hari, boleh desimal), **Stop/Lanjutkan** untuk menjeda tanpa notif, **Hapus** bila sudah berhenti.
   - Badge di kartu yang habis menunjukkan apakah notif Telegram sudah terkirim atau masih menunggu worker.
6. **Notifikasi Telegram**: status koneksi worker, **Kirim pesan test**, dan sync secret yang bisa disalin.
7. Bagikan link `https://DOMAIN-ANDA/#ulasan` ke customer setelah pembayaran selesai.
8. **Catatan keuangan harian**: pilih tanggal, lalu tambah transaksi income/outcome lewat form. Kartu menampilkan total income, total outcome, **Net Profit** (`income - outcome`), dan **Daily Transaction Count** (jumlah transaksi hari itu). Tombol **Hapus** pada baris membatalkan transaksi.

## Deploy ke Cloudflare Pages

Cloudflare Pages mengambil perubahan dari branch `main` repository GitHub. Setelah push, Cloudflare membuat deployment baru otomatis.

```powershell
git status
git diff
git add js/admin.js
git commit -m "fix: deskripsi perubahan"
git push origin main
```

Setelah deployment, test minimal:

1. Halaman utama, katalog, dan video hero muncul.
2. `https://DOMAIN-ANDA/admin.html` bisa dibuka dan login admin berhasil.
3. Customer dapat mengirim review dari `https://DOMAIN-ANDA/#ulasan` dan admin dapat menyetujuinya.
4. Modal order membuka WhatsApp dengan detail yang benar.

## Menambah atau menghapus admin

Ubah dua tempat:

1. `js/firebase-config.js`:

```js
export const adminEmails = [
  "admin-pertama@gmail.com",
  "admin-baru@gmail.com"
];
```

2. Firestore Rules pada fungsi `isAdmin()`:

```javascript
function isAdmin() {
  return request.auth != null
    && (request.auth.token.email == 'admin-pertama@gmail.com'
      || request.auth.token.email == 'admin-baru@gmail.com');
}
```

Klik **Publish** Rules, lalu push perubahan JavaScript. Menghapus admin dilakukan dengan menghapus emailnya dari kedua tempat tersebut.

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| Katalog berhenti pada skeleton | File JavaScript atau import gagal | Buka lewat static server, lihat Console browser, pastikan `firebase-config.js` hanya berisi JavaScript `export`, bukan tag `<script>` |
| `auth/unauthorized-domain` | Domain production belum diizinkan Firebase Auth | Tambahkan hostname Pages/domain custom ke Authorized domains |
| Login berhasil tetapi dashboard menolak | Email tidak ada di `adminEmails` | Tambahkan email pada config dan `isAdmin()` Rules |
| Customer tidak dapat mengirim review (`permission-denied`) | Rules belum diperbarui ke versi tanpa token, atau validasi field ditolak | Publish Rules terbaru dari `FIREBASE_SETUP.md`; pastikan komentar 10 sampai 500 karakter dan rating 1-5 |
| Ulasan tidak tampil di landing page | Belum disetujui | Klik Setujui di dashboard; halaman publik hanya membaca `approved: true` |
| Langganan gagal dimuat (`permission-denied`) | Rules belum berisi koleksi `subscriptions`/`settings` | Publish Rules terbaru dari `FIREBASE_SETUP.md` |
| Unggah foto testimoni gagal | Data URL tetap di atas 950.000 karakter setelah kompresi, atau Rules `testimonials` belum dipasang | Cek Console untuk detail; pastikan Rules terbaru sudah publish |
| Kartu Telegram menampilkan "Worker tidak terjangkau" | URL worker salah, worker belum di-deploy, atau sync secret beda | Periksa `notifyWorkerUrl`, jalankan `npx wrangler deploy` di `worker/`, pastikan `SYNC_SECRET` sama dengan yang tampil di dashboard |
| Notif Telegram tidak masuk walau langganan sudah habis | Token/chat ID salah, sync secret beda (data tidak tersinkron), worker tidak ter-deploy, atau dashboard belum pernah dibuka setelah perubahan | Tekan **Kirim pesan test**; cek `npx wrangler tail` di folder `worker/`; buka dashboard untuk memicu sync |
| Notif terkirim dua kali / tidak pernah lagi setelah perpanjang | Normal | Penanda notif berdasarkan `expiresAt`: diperpanjang → dinotif lagi saat masa baru habis |
| Langganan diperpanjang tetap berstatus habis | Basis perpanjangan adalah `expiresAt` lama | Hapus dan buat ulang langganan, atau isi durasi yang cukup panjang |
| Video hero tidak jalan | File video hilang, atau autoplay diblokir | Pastikan `video/frame1arin-web.mp4` ada; atribut `muted` dan `playsinline` wajib dipertahankan untuk autoplay |
| Catatan keuangan gagal dimuat/ditambah | Rules belum memuat koleksi `transactions` | Publish Rules terbaru dari `FIREBASE_SETUP.md` (blok `match /transactions/{txId}`) |

## Batasan dan ide pengembangan

- Admin email masih terlihat pada JavaScript publik dan Firestore Rules. Ini bukan credential, namun bila butuh privasi atau role yang lebih kompleks, pindahkan otorisasi ke Firebase custom claims atau backend/Cloudflare Worker.
- Nomor WhatsApp (`WA_NUMBER`), kontak Telegram/X, dan harga paket di-hardcode di `js/main.js` dan `index.html`. Kalau sering berubah, pertimbangkan memindahkannya ke satu tempat (misal `firebase-config.js` atau Firestore).
- Domain produksi dan meta Open Graph: `https://www.micicow.my.id/`. Kalau domain berubah, perbarui `og:url`, `og:image`, `twitter:image`, `canonical` di `index.html`, serta `robots.txt` dan `sitemap.xml`.
- Filter langganan sudah ada di dashboard; yang belum ada: pencarian nama dan filter status ulasan di panel moderasi.
- Form ulasan terbuka untuk siapa pun; validasi mengandalkan moderasi admin dan Rules. Bila spam menjadi masalah, pertimbangkan CAPTCHA atau Cloudflare Turnstile.
- Untuk skala review sangat besar, pertimbangkan panel moderasi yang lebih lengkap (pencarian/filter status) — pagination 12 per halaman dan agregasi rating server-side sudah diterapkan.
- Jangan ubah Rules menjadi `allow read, write: if true`; itu membuka database ke publik.

## Keamanan repo

Umumnya aman dipush: HTML, CSS, JavaScript frontend, dokumentasi, aset gambar/video, dan Firebase Web config. Jangan push `.env`, service account (`firebase-adminsdk-*.json`), OAuth client secret, private key, token GitHub, atau Cloudflare API token.

`.gitignore` sudah menutupi file log/temp, `node_modules/`, serta `worker/.dev.vars` dan `worker/.wrangler/`. File `.dev.vars` berisi secret lokal untuk `wrangler dev`; pastikan tidak pernah dipaksa masuk commit dengan `git add -f`.
