# Setup rating customer dengan Firebase Firestore

Fitur ini memakai satu link statis: `https://DOMAIN-ANDA/#ulasan`. Siapa pun bisa membuka halaman tersebut dan mengisi form ulasan tanpa perlu link khusus dari admin. Setiap ulasan masuk dengan status **menunggu persetujuan** (`approved: false`) dan hanya tampil publik setelah admin menekan **Setujui** di dashboard — inilah tamengnya terhadap ulasan palsu.

## 1. Hubungkan website ke Firebase

1. Buat project di [Firebase Console](https://console.firebase.google.com/), lalu tambahkan **Web app**.
2. Aktifkan **Firestore Database** dalam mode production.
3. Salin nilai konfigurasi Web app ke `js/firebase-config.js`.
4. Deploy ulang website. Jangan memasukkan service-account/private key ke file frontend.

## 2. Aktifkan dashboard admin

1. Isi `adminEmails` di `js/firebase-config.js` dengan alamat Gmail yang akan menjadi admin. Anda dapat menambah lebih dari satu email.
2. Firebase Console → **Authentication** → **Sign-in method** → aktifkan provider **Google**.
3. Firebase Console → Authentication → **Settings** → **Authorized domains**: tambahkan domain Cloudflare Pages Anda sebelum deploy. `localhost` dapat dipakai untuk pengujian lokal.

## 3. Pasang Firestore Security Rules

Di **Firestore Database → Rules**, ganti rules dengan berikut lalu publish.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Masukkan semua email admin, sama persis dengan daftar adminEmails di firebase-config.js.
    function isAdmin() {
      return request.auth != null
        && (request.auth.token.email == 'EMAIL_ADMIN_PERTAMA'
          || request.auth.token.email == 'EMAIL_ADMIN_KEDUA');
    }

    match /reviews/{reviewId} {
      // Pengunjung hanya boleh melihat ulasan yang sudah disetujui; admin dapat melihat semuanya.
      allow read: if resource.data.approved == true || isAdmin();

      // Siapa pun boleh mengirim ulasan, tetapi selalu berstatus menunggu persetujuan
      // dan hanya boleh mengisi field yang diizinkan.
      allow create: if request.resource.data.keys().hasOnly(['customerName', 'comment', 'rating', 'approved', 'createdAt'])
        && request.resource.data.approved == false
        && request.resource.data.rating is int
        && request.resource.data.rating >= 1 && request.resource.data.rating <= 5
        && request.resource.data.customerName is string && request.resource.data.customerName.size() >= 1 && request.resource.data.customerName.size() <= 40
        && request.resource.data.comment is string && request.resource.data.comment.size() >= 10 && request.resource.data.comment.size() <= 500;

      // Admin dapat menyetujui atau menghapus ulasan.
      allow update, delete: if isAdmin();
    }
    match /testimonials/{photoId} {
      // Foto testimoni hasil unggahan admin (data URL) boleh dibaca siapa pun.
      allow read: if true;

      // Hanya admin yang boleh mengunggah atau menghapus foto.
      allow create: if isAdmin()
        && request.resource.data.keys().hasOnly(['src', 'fileName', 'createdAt'])
        && request.resource.data.src is string
        && request.resource.data.src.size() > 0 && request.resource.data.src.size() <= 950000
        && request.resource.data.fileName is string && request.resource.data.fileName.size() <= 100;
      allow delete: if isAdmin();
      allow update: if false;
    }

    match /subscriptions/{subId} {
      // Data pelanggan langganan bersifat privat: hanya admin yang boleh lihat/ubah.
      allow read, write: if isAdmin();
    }

    match /settings/{docId} {
      // Dokumen settings/telegram menyimpan sync secret worker notifikasi. Hanya admin.
      allow read, write: if isAdmin();
    }

    match /transactions/{txId} {
      // Catatan keuangan harian (income/outcome). Hanya admin yang boleh baca/tulis.
      allow read, write: if isAdmin();
    }
  }
}
```

> Catatan: `apiKey` Firebase web memang berada di browser dan bukan rahasia. Perlindungan akses berasal dari Firestore Security Rules di atas. Jangan pernah memakai mode test atau rules `allow read, write: if true` di website production.

## 4. Alur ulasan harian

1. Bagikan link `https://DOMAIN-ANDA/#ulasan` ke customer (misal lewat WhatsApp setelah pembayaran).
2. Customer mengisi rating, nama panggilan (opsional), dan cerita pengalaman, lalu mengirim.
3. Ulasan masuk ke Firestore dengan `approved: false`.
4. Buka `admin.html`, login dengan akun Google yang emailnya ada di `adminEmails`.
5. Pada bagian **Ulasan masuk**:
   - **Setujui**: review tampil publik di landing page.
   - **Hapus**: review dihapus permanen.

> Koleksi `purchases` dari sistem lama (link token per order) sudah tidak dipakai lagi; datanya boleh dibiarkan atau dihapus di Firebase Console.

### 4.1 Index pagination ulasan (wajib, cukup sekali)

Sejak ulasan diambil per halaman (12 ulasan per klik "Muat ulasan lainnya"), Firestore butuh **satu composite index**. Kalau index belum dibuat, halaman utama otomatis memakai mode darurat (ambil semua ulasan sekaligus — tetap jalan, tapi lebih boros).

Cara paling cepat: buka link ini di browser yang sudah login ke akun Firebase, lalu klik **Create index**:

```
https://console.firebase.google.com/v1/r/project/netfl1xmicicow/firestore/indexes?create_composite=Ck5wcm9qZWN0cy9uZXRmbDF4bWljaWNvdy9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvcmV2aWV3cy9pbmRleGVzL18QARoMCghhcHByb3ZlZBABGg0KCWNyZWF0ZWRBdBACGgwKCF9fbmFtZV9fEAI
```

Cara manual (kalau linknya tidak jalan):

1. Buka **Firebase Console → Firestore Database → Indexes → tab Composite → Add index**.
2. Isi:
   - Collection ID: `reviews`
   - Field 1: `approved` — Ascending
   - Field 2: `createdAt` — Descending
3. Klik **Create index**, tunggu statusnya jadi **Enabled** (biasanya 1–2 menit).

## 5. Modul langganan + notifikasi Telegram

Koleksi baru yang hanya bisa diakses admin (sudah tercakup di Rules atas):

| Koleksi | Field | Keterangan |
| --- | --- | --- |
| `subscriptions/{autoId}` | `customerName` (string ≤60), `packageName` (string ≤60), `durationDays` (number 0,01–3650), `startedAt` (Timestamp), `expiresAt` (Timestamp), `createdAt` | Satu dokumen per pelanggan. `expiresAt = startedAt + durationDays`. Diperpanjang lewat tombol **Perpanjang** di dashboard. |
| `settings/telegram` | `syncSecret` (string), `createdAt` | Secret pengaman API worker notifikasi. Dibuat otomatis dashboard saat pertama dibuka. |
| `transactions/{autoId}` | `type` (`income`/`outcome`), `amount` (number, Rp), `note` (string), `date` (string `YYYY-MM-DD`), `createdAt` (Timestamp) | Catatan keuangan harian. Dashboard filter berdasarkan `date` (query equality, tanpa composite index), menjumlahkan tiap jenis, lalu menampilkan **Net Profit** (`income − outcome`) dan **Daily Transaction Count** (jumlah transaksi). |

Worker Cloudflare (`worker/` di repo, cron tiap 1 menit) mengirim notif Telegram saat ada langganan yang habis (maksimal telat ~1 menit). Secret worker: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SYNC_SECRET` — dipasang lewat `npx wrangler secret put`, tidak pernah ada di kode frontend.
