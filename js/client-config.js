// Satu-satunya file yang perlu diubah kalau proyek ini dipakai untuk klien lain.
// Dimuat sebagai script biasa dari <head> supaya bisa dibaca oleh
// catalog-preload.js (script biasa) dan oleh modul ES seperti firebase-config.js.
window.CLIENT_CONFIG = {
  projectId: "netfl1xmicicow",
  apiKey: "AIzaSyBdAPAs5qGXsCCs2YsPhouqDhrmW-nOBmQ",
  messagingSenderId: "1046532679081",
  appId: "1:1046532679081:web:e639e5f3512c5e4f5250b8",
  measurementId: "G-V4387P32ST",

  // Nomor WhatsApp reseller, format internasional tanpa +
  waNumber: "6287782164717",

  // URL worker notifikasi Telegram. Kosongkan bila worker belum dipasang.
  workerUrl: "https://netflixarin-notify.ravgg2530.workers.dev",

  // Email Google yang boleh masuk dashboard. Samakan juga dengan rules di Firebase Console.
  adminEmails: [
    "ocravf@gmail.com",
    "itspjmgf@gmail.com",
    "arinjualan1@gmail.com",
  ],
};
