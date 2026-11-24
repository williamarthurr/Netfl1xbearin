// Semua nilai Firebase diambil dari js/client-config.js, yang dimuat lebih dulu
// dari <head>. Untuk klien baru cukup mengubah file config tersebut.
const client = window.CLIENT_CONFIG || {};

// API key web memang publik; keamanan ada di Firestore Security Rules.
export const firebaseConfig = {
  apiKey: client.apiKey || "",
  authDomain: client.projectId ? `${client.projectId}.firebaseapp.com` : "",
  projectId: client.projectId || "",
  storageBucket: client.projectId ? `${client.projectId}.firebasestorage.app` : "",
  messagingSenderId: client.messagingSenderId || "",
  appId: client.appId || "",
  measurementId: client.measurementId || "",
};

// Daftar ini hanya untuk UX dashboard; akses sebenarnya ada di aturan Firestore.
export const adminEmails = Array.isArray(client.adminEmails) ? client.adminEmails : [];

// Kosong = modul Telegram menampilkan "worker belum dihubungkan".
export const notifyWorkerUrl = client.workerUrl || "";
