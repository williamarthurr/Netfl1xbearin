import { firebaseConfig, adminEmails, notifyWorkerUrl } from "./firebase-config.js";

let db;
let auth;
let api;

const $ = (selector) => document.querySelector(selector);
const configured = () => firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_") && Array.isArray(adminEmails) && adminEmails.some((email) => email && !email.startsWith("TAMBAHKAN_"));
const isAllowedAdmin = (email) => adminEmails.some((allowedEmail) => allowedEmail.toLowerCase() === (email || "").toLowerCase());

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value || "—";
  return node.innerHTML;
}

function formatDate(timestamp) {
  return timestamp?.toDate ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp.toDate()) : "Baru saja";
}

function setLoginStatus(message, isError = false) {
  const status = $("#loginStatus");
  status.textContent = message;
  status.className = `review-status ${isError ? "error" : ""}`;
}

async function loadReviews() {
  const target = $("#adminReviewList");
  target.innerHTML = '<p class="review-empty">Memuat ulasan…</p>';
  try {
    const snapshot = await api.getDocs(api.query(api.collection(db, "reviews"), api.limit(50)));
    const reviews = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (!reviews.length) { target.innerHTML = '<p class="review-empty">Belum ada ulasan masuk.</p>'; return; }
    target.innerHTML = reviews.map((review) => `<article class="admin-review-card">
      <div><strong>${escapeHtml(review.customerName)}</strong><span class="admin-meta">${review.orderId ? `${escapeHtml(review.orderId)} · ` : ""}${formatDate(review.createdAt)}</span></div>
      <div class="review-stars">${"★".repeat(review.rating || 0)}${"☆".repeat(5 - (review.rating || 0))}</div>
      <p>${escapeHtml(review.comment)}</p>
      <div class="admin-actions"><span class="status-pill ${review.approved ? "approved" : "pending"}">${review.approved ? "Tampil publik" : "Menunggu persetujuan"}</span>${review.approved ? "" : `<button class="btn btn-primary btn-sm" data-approve="${review.id}">Setujui</button>`}<button class="btn btn-danger btn-sm" data-delete="${review.id}">Hapus</button></div>
    </article>`).join("");
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="review-empty">Ulasan gagal dimuat. Periksa Rules dan akun admin.</p>';
  }
}

async function initFirebase() {
  if (!configured()) { setLoginStatus("Isi adminEmails di js/firebase-config.js terlebih dahulu.", true); return; }
  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    api = firestoreModule;
    const app = appModule.initializeApp(firebaseConfig);
    db = api.getFirestore(app);
    auth = authModule.getAuth(app);
    const provider = new authModule.GoogleAuthProvider();
    $("#loginButton").addEventListener("click", async () => {
      try { await authModule.signInWithPopup(auth, provider); }
      catch (error) { setLoginStatus(`Login gagal: ${error.code || "coba lagi"}`, true); }
    });
    $("#logoutButton").addEventListener("click", () => authModule.signOut(auth));
    authModule.onAuthStateChanged(auth, async (user) => {
      const isAdmin = isAllowedAdmin(user?.email);
      $("#loginPanel").hidden = Boolean(isAdmin);
      $("#dashboard").hidden = !isAdmin;
      $("#adminAccount").hidden = !isAdmin;
      if (!user) return;
      if (!isAdmin) { setLoginStatus("Akun ini bukan admin yang diizinkan.", true); await authModule.signOut(auth); return; }
      $("#adminEmailLabel").textContent = user.email;
      loadReviews();
      loadTestimonials();
      initLangganan();
    });
  } catch (error) { console.error(error); setLoginStatus("Dashboard gagal dimuat. Periksa koneksi Firebase.", true); }
}

$("#refreshReviews").addEventListener("click", loadReviews);

// ---------- Foto testimoni ----------

// Baca file jadi <img> (lebih kompatibel daripada createImageBitmap, termasuk HEIC di Safari).
function readAsImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gambar tidak dapat dibaca")); };
    img.src = url;
  });
}

// Kompres ke JPEG maks sisi 1280px agar hasil base64 tetap di bawah batas dokumen Firestore (1 MB).
async function fileToCompressedDataUrl(file) {
  const img = await readAsImage(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 950000 && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

async function loadTestimonials() {
  const target = $("#adminTestimoniList");
  target.innerHTML = '<p class="review-empty">Memuat foto…</p>';
  try {
    const snapshot = await api.getDocs(api.collection(db, "testimonials"));
    const photos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    if (!photos.length) { target.innerHTML = '<p class="review-empty">Belum ada foto terunggah.</p>'; return; }
    target.innerHTML = photos.map((photo) => `<div class="admin-testimoni-card">
      <img src="${photo.src}" alt="${escapeHtml(photo.fileName || "Foto testimoni")}">
      <button class="btn btn-danger btn-sm" data-delete-photo="${photo.id}" aria-label="Hapus foto">×</button>
    </div>`).join("");
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="review-empty">Foto gagal dimuat. Periksa Rules dan akun admin.</p>';
  }
}

$("#testimoniUploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#testimoniStatus");
  const button = $("#uploadTestimoniButton");
  const files = Array.from($("#testimoniFiles").files || []);
  if (!files.length) {
    status.textContent = "Pilih foto dulu ya.";
    status.className = "review-status error";
    return;
  }
  button.disabled = true;
  status.className = "review-status";
  let ok = 0;
  let failureCode = "";
  for (const file of files) {
    try {
      status.textContent = `Mengompres & mengunggah ${ok + 1}/${files.length}…`;
      const dataUrl = await fileToCompressedDataUrl(file);
      if (dataUrl.length > 950000) { console.error(`${file.name} terlalu besar setelah kompresi`); continue; }
      await api.addDoc(api.collection(db, "testimonials"), { src: dataUrl, fileName: file.name.slice(0, 100), createdAt: api.serverTimestamp() });
      ok++;
    } catch (error) { console.error(error); failureCode = error?.code || "kesalahan tak terduga"; }
  }
  button.disabled = false;
  if (ok === files.length && ok > 0) {
    status.textContent = `Berhasil mengunggah ${ok} foto.`;
    status.className = "review-status success";
    event.target.reset();
  } else if (ok > 0) {
    status.textContent = `${ok} foto terunggah, ${files.length - ok} gagal.`;
    status.className = "review-status error";
  } else {
    status.textContent = `Gagal mengunggah (${failureCode}).${failureCode === "permission-denied" ? " Pastikan Rules Firestore sudah diperbarui." : ""}`;
    status.className = "review-status error";
  }
  loadTestimonials();
});

$("#adminTestimoniList").addEventListener("click", async (event) => {
  const photoId = event.target.dataset.deletePhoto;
  if (!photoId) return;
  try {
    if (confirm("Hapus foto ini?")) {
      await api.deleteDoc(api.doc(db, "testimonials", photoId));
      loadTestimonials();
    }
  } catch (error) { alert(`Aksi gagal: ${error.code || "coba lagi"}`); }
});
$("#adminReviewList").addEventListener("click", async (event) => {
  const approveId = event.target.dataset.approve;
  const deleteId = event.target.dataset.delete;
  try {
    if (approveId) await api.updateDoc(api.doc(db, "reviews", approveId), { approved: true, reviewToken: api.deleteField() });
    if (deleteId && confirm("Hapus ulasan ini?")) await api.deleteDoc(api.doc(db, "reviews", deleteId));
    if (approveId || deleteId) loadReviews();
  } catch (error) { alert(`Aksi gagal: ${error.code || "coba lagi"}`); }
});

// ---------- Langganan pelanggan ----------

const DAY_MS = 86400000;
let subscriptions = [];
let notifyState = {}; // map "subId:expiresAtMs" -> waktu notif terkirim (dari worker)
let langgananFilter = "semua";
let countdownTimer = null;
let telegramSettings = null;

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Dokumen settings/telegram menyimpan sync secret untuk worker. Dibuat otomatis saat pertama dibuka.
async function getTelegramSettings() {
  if (telegramSettings) return telegramSettings;
  const snap = await api.getDoc(api.doc(db, "settings", "telegram"));
  if (snap.exists()) {
    telegramSettings = snap.data();
    return telegramSettings;
  }
  telegramSettings = { syncSecret: randomSecret(), createdAt: api.serverTimestamp() };
  await api.setDoc(api.doc(db, "settings", "telegram"), telegramSettings);
  return telegramSettings;
}

async function workerFetch(path, options = {}) {
  const settings = await getTelegramSettings();
  const res = await fetch(`${notifyWorkerUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Sync-Secret": settings.syncSecret || "", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function subStatus(sub) {
  if (sub.stopped) return "dihentikan";
  const ms = sub.expiresAt?.toMillis?.() ?? 0;
  const left = ms - Date.now();
  if (left <= 0) return "habis";
  if (left <= DAY_MS) return "hampir";
  return "aktif";
}

function formatDuration(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (d) parts.push(`${d}h`);
  if (d || h) parts.push(`${h}j`);
  parts.push(`${String(m).padStart(2, "0")}m`, `${String(s).padStart(2, "0")}s`);
  return parts.join(" ");
}

function updateCountdowns() {
  const now = Date.now();
  let statusChanged = false;
  for (const sub of subscriptions) {
    const countdown = document.querySelector(`[data-countdown="${sub.id}"]`);
    if (!countdown || sub.stopped) continue;
    const ms = sub.expiresAt?.toMillis?.() ?? 0;
    const left = ms - now;
    if (left > 0) {
      countdown.textContent = formatDuration(Math.floor(left / 1000));
      countdown.classList.remove("expired-text");
    } else {
      countdown.textContent = `Habis ${formatDuration(Math.floor((now - ms) / 1000))} lalu`;
      countdown.classList.add("expired-text");
    }
    const card = countdown.closest("[data-sub]");
    if (card && card.dataset.status && card.dataset.status !== subStatus(sub)) statusChanged = true;
  }
  // Ada langganan yang baru berubah status (aktif → habis)? Render ulang supaya pill & badge ikut berganti.
  if (statusChanged) renderSubscriptions();
}

function startCountdown() {
  updateCountdowns();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdowns, 1000);
}

function renderSubscriptions() {
  const target = $("#langgananList");
  if (!subscriptions.length) { target.innerHTML = '<p class="review-empty">Belum ada langganan. Tambah pelanggan pertama lewat form di atas.</p>'; return; }
  const filtered = subscriptions.filter((sub) => langgananFilter === "semua" || subStatus(sub) === langgananFilter);
  if (!filtered.length) { target.innerHTML = '<p class="review-empty">Tidak ada langganan di kategori ini.</p>'; return; }
  target.innerHTML = filtered.map((sub) => {
    const status = subStatus(sub);
    const pill = status === "dihentikan"
      ? '<span class="status-pill stopped">Dihentikan</span>'
      : status === "habis"
        ? '<span class="status-pill expired">Habis</span>'
        : status === "hampir"
          ? '<span class="status-pill pending">Hampir habis</span>'
          : '<span class="status-pill approved">Aktif</span>';
    const toggleButton = status === "dihentikan"
      ? `<button class="btn btn-outline btn-sm" data-resume="${sub.id}">Lanjutkan</button>`
      : `<button class="btn btn-outline btn-sm" data-stop="${sub.id}">Stop</button>`;
    const notifBadge = status === "habis"
      ? (notifyState[`${sub.id}:${sub.expiresAt?.toMillis?.() || 0}`]
        ? '<span class="notif-badge ok">✓ Notif terkirim ke Telegram</span>'
        : '<span class="notif-badge wait">⏳ Notif menunggu dikirim worker</span>')
      : "";
    return `<article class="admin-review-card langganan-card" data-sub="${sub.id}" data-status="${status}">
      <div>
        <strong>${escapeHtml(sub.customerName)}</strong>
        <span class="admin-meta">${escapeHtml(sub.packageName || "Paket custom")} · Berakhir ${formatDate(sub.expiresAt)}</span>
      </div>
      ${sub.stopped
        ? '<div class="langganan-countdown stopped-text">Dihentikan — tidak dihitung & tidak dinotif</div>'
        : `<div class="langganan-countdown" data-countdown="${sub.id}">…</div>`}
      <div class="admin-actions">${pill}${notifBadge}
        ${toggleButton}
        <button class="btn btn-outline btn-sm" data-extend="${sub.id}">Perpanjang</button>
        <button class="btn btn-danger btn-sm" data-delete-sub="${sub.id}">Hapus</button>
      </div>
    </article>`;
  }).join("");
  updateCountdowns();
}

async function loadSubscriptions() {
  const target = $("#langgananList");
  try {
    const snapshot = await api.getDocs(api.collection(db, "subscriptions"));
    subscriptions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (a.expiresAt?.toMillis?.() || 0) - (b.expiresAt?.toMillis?.() || 0));
    renderSubscriptions();
    startCountdown();
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="review-empty">Langganan gagal dimuat. Pastikan Rules Firestore sudah berisi koleksi "subscriptions" dan "settings".</p>';
  }
}

// Kirim daftar langganan terbaru ke worker supaya cron notifikasinya selalu update.
async function syncToWorker() {
  if (!notifyWorkerUrl) { setTelegramNote("Worker belum dihubungkan — isi notifyWorkerUrl di js/firebase-config.js.", true); return; }
  try {
    const payload = {
      subs: subscriptions
        .filter((sub) => sub.expiresAt?.toMillis() && !sub.stopped)
        .map((sub) => ({ id: sub.id, name: sub.customerName, packageLabel: sub.packageName, expiresAtMs: sub.expiresAt.toMillis() })),
    };
    const data = await workerFetch("/sync", { method: "POST", body: JSON.stringify(payload) });
    notifyState = data.notified || {};
    renderSubscriptions();
    $("#telegramStatusNote").textContent = "";
    renderTelegramStatus(await workerFetch("/status"));
  } catch (error) {
    console.error(error);
    setTelegramNote(`Sync ke worker gagal: ${error.message}`, true);
  }
}

function setTelegramNote(message, isError = false) {
  const note = $("#telegramStatusNote");
  note.textContent = message;
  note.className = `review-status ${isError ? "error" : ""}`;
}

function renderTelegramStatus(data) {
  const box = $("#telegramStatus");
  if (!data) { box.innerHTML = '<span class="status-pill expired">Worker tidak terjangkau</span>'; return; }
  const cron = data.lastCronAt ? new Date(data.lastCronAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "belum pernah jalan";
  if (data.bot?.ok) {
    box.innerHTML = `<span class="status-pill approved">Bot @${escapeHtml(data.bot.username || "?")} terhubung</span>`
      + `<span class="admin-meta">Cron terakhir: ${cron} · ${data.subsCount} langganan tersinkron${data.expiredCount ? ` · ${data.expiredCount} sudah habis` : ""}</span>`;
  } else {
    box.innerHTML = '<span class="status-pill expired">Token bot bermasalah</span><span class="admin-meta">Periksa secret TELEGRAM_BOT_TOKEN di worker.</span>';
  }
}

async function refreshTelegramCard() {
  if (!notifyWorkerUrl) {
    $("#telegramStatus").innerHTML = '<span class="status-pill pending">Worker belum dihubungkan</span>';
    return;
  }
  try {
    renderTelegramStatus(await workerFetch("/status"));
    setTelegramNote("");
  } catch (error) {
    console.error(error);
    renderTelegramStatus(null);
    setTelegramNote(error.message, true);
  }
}

async function showSyncSecret() {
  try {
    const settings = await getTelegramSettings();
    $("#syncSecretValue").textContent = settings.syncSecret || "(gagal dibuat)";
  } catch (error) {
    console.error(error);
    $("#syncSecretValue").textContent = "(butuh Rules settings)";
  }
}

async function initLangganan() {
  await loadSubscriptions();
  showSyncSecret();
  syncToWorker();
  refreshTelegramCard();
}

$("#langgananPaket").addEventListener("change", () => {
  const custom = $("#langgananPaket").value === "custom";
  $("#langgananCustomWrap").hidden = !custom;
  $("#paketWrap").hidden = custom;
});

$("#langgananForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#langgananStatus");
  const button = $("#tambahLanggananButton");
  const nama = $("#langgananNama").value.trim();
  const paket = $("#langgananPaket").value;
  const days = Number(paket === "custom" ? $("#langgananCustom").value : paket);
  if (!nama) return setLanggananStatus("Isi nama pelanggan dulu ya.", true);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return setLanggananStatus("Durasi harus angka hari antara 0,01–3650.", true);
  button.disabled = true;
  const packageName = paket === "30" ? "1 bulan (30 hari)" : `${days} hari`;
  const startedAt = new Date();
  try {
    await api.addDoc(api.collection(db, "subscriptions"), {
      customerName: nama,
      packageName,
      durationDays: days,
      startedAt: api.Timestamp.fromDate(startedAt),
      expiresAt: api.Timestamp.fromDate(new Date(startedAt.getTime() + days * DAY_MS)),
      createdAt: api.serverTimestamp(),
    });
    setLanggananStatus(`Langganan ${nama} ditambahkan. Hitung mundur langsung jalan.`, false);
    event.target.reset();
    $("#langgananCustomWrap").hidden = true;
    $("#paketWrap").hidden = false;
    await loadSubscriptions();
    await syncToWorker();
  } catch (error) {
    console.error(error);
    setLanggananStatus(`Gagal menambah langganan (${error.code || "kesalahan tak terduga"}).${error.code === "permission-denied" ? " Pastikan Rules Firestore sudah diperbarui." : ""}`, true);
  }
  button.disabled = false;
});

function setLanggananStatus(message, isError = false) {
  const status = $("#langgananStatus");
  status.textContent = message;
  status.className = `review-status ${isError ? "error" : ""}`;
}

$("#langgananFilter").addEventListener("click", (event) => {
  const filter = event.target.dataset.filter;
  if (!filter) return;
  langgananFilter = filter;
  for (const button of $("#langgananFilter").querySelectorAll("button")) button.classList.toggle("active", button.dataset.filter === filter);
  renderSubscriptions();
});

$("#langgananList").addEventListener("click", async (event) => {
  const extendId = event.target.dataset.extend;
  const deleteId = event.target.dataset.deleteSub;
  const stopId = event.target.dataset.stop;
  const resumeId = event.target.dataset.resume;
  if (!extendId && !deleteId && !stopId && !resumeId) return;
  try {
    if (stopId) await api.updateDoc(api.doc(db, "subscriptions", stopId), { stopped: true });
    if (resumeId) await api.updateDoc(api.doc(db, "subscriptions", resumeId), { stopped: false });
    if (extendId) {
      const sub = subscriptions.find((item) => item.id === extendId);
      if (!sub) return;
      const input = prompt("Perpanjang berapa hari? (bisa desimal, misal 0.02)", "7");
      if (!input) return;
      const days = Number(input.replace(",", "."));
      if (!Number.isFinite(days) || days <= 0 || days > 3650) return alert("Durasi tidak valid.");
      const base = sub.expiresAt?.toMillis?.() || Date.now();
      await api.updateDoc(api.doc(db, "subscriptions", extendId), {
        expiresAt: api.Timestamp.fromMillis(base + days * DAY_MS),
        durationDays: (sub.durationDays || 0) + days,
      });
    }
    if (deleteId && confirm("Hapus langganan ini?")) await api.deleteDoc(api.doc(db, "subscriptions", deleteId));
    await loadSubscriptions();
    await syncToWorker();
  } catch (error) { alert(`Aksi gagal: ${error.code || error.message || "coba lagi"}`); }
});

$("#telegramTestButton").addEventListener("click", async () => {
  setTelegramNote("Mengirim…");
  try {
    await workerFetch("/test", { method: "POST", body: JSON.stringify({}) });
    setTelegramNote("Pesan test terkirim! Cek Telegram-mu.");
  } catch (error) {
    setTelegramNote(`Gagal: ${error.message}`, true);
  }
});

$("#copySecretButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#syncSecretValue").textContent);
    setTelegramNote("Sync secret disalin ke clipboard.");
  } catch (error) {
    setTelegramNote("Gagal menyalin — salin manual dari kotak di atas.", true);
  }
});

initFirebase();
