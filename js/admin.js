import { firebaseConfig, adminEmails, notifyWorkerUrl } from "./firebase-config.js";
import { initThemeToggle } from "./theme.js";

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
    const snapshot = await api.getDocs(api.collection(db, "reviews"));
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
      initKeuangan();
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

// ---------- Catatan keuangan harian ----------

let keuanganTransactions = [];
let keuanganDate = "";

function rupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

// Tanggal lokal (bukan UTC) supaya sama dengan nilai input type="date".
function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function setKeuanganStatus(message, isError = false) {
  const status = $("#keuanganStatus");
  status.textContent = message;
  status.className = `review-status ${isError ? "error" : ""}`;
}

function renderKeuangan() {
  let income = 0;
  let outcome = 0;
  for (const tx of keuanganTransactions) {
    if (tx.type === "income") income += Number(tx.amount) || 0;
    else if (tx.type === "outcome") outcome += Number(tx.amount) || 0;
  }
  const net = income - outcome;
  $("#keuanganIncome").textContent = rupiah(income);
  $("#keuanganOutcome").textContent = rupiah(outcome);
  $("#keuanganTotal").textContent = rupiah(net);
  $("#keuanganTotal").classList.toggle("negative", net < 0);
  $("#keuanganCount").textContent = String(keuanganTransactions.length);

  const target = $("#keuanganList");
  if (!keuanganTransactions.length) {
    target.innerHTML = '<p class="review-empty">Belum ada transaksi pada tanggal ini.</p>';
    return;
  }
  const sorted = [...keuanganTransactions].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  target.innerHTML = sorted.map((tx) => {
    const isIncome = tx.type === "income";
    return `<article class="admin-review-card keuangan-row">
      <div>
        <strong>${escapeHtml(tx.note || (isIncome ? "Pemasukan" : "Pengeluaran"))}</strong>
        <span class="admin-meta">${isIncome ? "Income" : "Outcome"} · ${formatDate(tx.createdAt)}</span>
      </div>
      <div class="keuangan-row-actions">
        <strong class="keuangan-amount ${isIncome ? "income" : "outcome"}">${isIncome ? "+" : "−"}${rupiah(tx.amount)}</strong>
        <button class="btn btn-danger btn-sm" data-delete-keuangan="${tx.id}">Hapus</button>
      </div>
    </article>`;
  }).join("");
}

function shiftKeuanganDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Grafik batang 7 hari terakhir: satu query rentang, agregasi di browser tanpa library chart.
function renderKeuanganChart(docs) {
  const target = $("#keuanganChart");
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shiftKeuanganDate(keuanganDate, -i));
  const buckets = days.map((date) => ({ date, income: 0, outcome: 0 }));
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  for (const tx of docs) {
    const bucket = byDate[tx.date];
    if (!bucket) continue;
    if (tx.type === "income") bucket.income += Number(tx.amount) || 0;
    else if (tx.type === "outcome") bucket.outcome += Number(tx.amount) || 0;
  }
  if (!buckets.some((b) => b.income || b.outcome)) {
    target.innerHTML = '<div class="grafik-head"><strong>Tren 7 hari terakhir</strong></div><p class="grafik-empty">Belum ada transaksi pada 7 hari terakhir.</p>';
    return;
  }
  const max = Math.max(...buckets.flatMap((b) => [b.income, b.outcome]), 1);
  target.innerHTML = `<div class="grafik-head">
    <strong>Tren 7 hari terakhir</strong>
    <div class="grafik-legend"><span><i></i>Income</span><span><i class="outcome"></i>Outcome</span></div>
  </div>
  <div class="grafik-chart">${buckets.map((b) => {
    const label = new Date(`${b.date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short" });
    return `<div class="grafik-day">
      <div class="grafik-bars">
        <div class="grafik-bar" style="height:${(b.income / max) * 100}%" title="${escapeHtml(b.date)} · income ${rupiah(b.income)}"></div>
        <div class="grafik-bar outcome" style="height:${(b.outcome / max) * 100}%" title="${escapeHtml(b.date)} · outcome ${rupiah(b.outcome)}"></div>
      </div>
      <span class="grafik-label">${escapeHtml(label)}</span>
    </div>`;
  }).join("")}</div>`;
}

async function loadKeuangan() {
  const target = $("#keuanganList");
  target.innerHTML = '<p class="review-empty">Memuat transaksi…</p>';
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(shiftKeuanganDate(keuanganDate, -i));
    const snapshot = await api.getDocs(api.query(
      api.collection(db, "transactions"),
      api.where("date", ">=", days[0]),
      api.where("date", "<=", days[days.length - 1])
    ));
    const all = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    keuanganTransactions = all.filter((tx) => tx.date === keuanganDate);
    renderKeuangan();
    renderKeuanganChart(all);
  } catch (error) {
    console.error(error);
    keuanganTransactions = [];
    renderKeuangan();
    $("#keuanganChart").innerHTML = '<div class="grafik-head"><strong>Tren 7 hari terakhir</strong></div><p class="grafik-empty">Grafik gagal dimuat. Pastikan Rules Firestore sudah diperbarui.</p>';
    target.innerHTML = '<p class="review-empty">Transaksi gagal dimuat. Pastikan Rules Firestore sudah berisi koleksi "transactions".</p>';
  }
}

async function initKeuangan() {
  const input = $("#keuanganTanggal");
  keuanganDate = input.value || todayLocal();
  input.value = keuanganDate;
  await loadKeuangan();
}

$("#keuanganTanggal").addEventListener("change", (event) => {
  keuanganDate = event.target.value || todayLocal();
  loadKeuangan();
});

// Di HP, ketuk area teks juga harus membuka picker — bukan hanya ikon kalender.
$("#keuanganTanggal").addEventListener("click", (event) => {
  const input = event.currentTarget;
  if (typeof input.showPicker !== "function") return;
  const rect = input.getBoundingClientRect();
  if (event.clientX > rect.right - 36) return; // klik di ikon: biarkan perilaku native
  try { input.showPicker(); } catch (e) { /* picker sudah terbuka atau diblokir browser */ }
});

$("#keuanganTambahToggle").addEventListener("click", () => {
  const form = $("#keuanganForm");
  const toggle = $("#keuanganTambahToggle");
  const open = form.hidden;
  form.hidden = !open;
  toggle.textContent = open ? "Tutup form" : "+ Tambah transaksi";
  toggle.setAttribute("aria-expanded", String(open));
  if (open) $("#keuanganJenis").focus();
});

$("#keuanganForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#tambahKeuanganButton");
  const type = $("#keuanganJenis").value;
  const amount = Number($("#keuanganJumlah").value);
  const note = $("#keuanganCatatan").value.trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    setKeuanganStatus("Jumlah harus angka lebih dari 0.", true);
    return;
  }
  button.disabled = true;
  setKeuanganStatus("Menyimpan…");
  try {
    await api.addDoc(api.collection(db, "transactions"), {
      type,
      amount,
      note: note.slice(0, 100),
      date: keuanganDate,
      createdAt: api.serverTimestamp(),
    });
    setKeuanganStatus("Transaksi ditambahkan.", false);
    event.target.reset();
    $("#keuanganForm").hidden = true;
    $("#keuanganTambahToggle").textContent = "+ Tambah transaksi";
    $("#keuanganTambahToggle").setAttribute("aria-expanded", "false");
    await loadKeuangan();
  } catch (error) {
    console.error(error);
    setKeuanganStatus(`Gagal menambah transaksi (${error.code || "kesalahan tak terduga"}).${error.code === "permission-denied" ? " Pastikan Rules Firestore sudah diperbarui." : ""}`, true);
  }
  button.disabled = false;
});

$("#keuanganList").addEventListener("click", async (event) => {
  const id = event.target.dataset.deleteKeuangan;
  if (!id || !confirm("Hapus transaksi ini?")) return;
  try {
    await api.deleteDoc(api.doc(db, "transactions", id));
    await loadKeuangan();
  } catch (error) {
    console.error(error);
    alert(`Aksi gagal: ${error.code || error.message || "coba lagi"}`);
  }
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

// ---------- Navigasi menu dashboard ----------

function setAdminSection(sectionId) {
  document.querySelectorAll(".admin-section").forEach((section) => {
    section.hidden = section.id !== sectionId;
  });
  document.querySelectorAll(".admin-nav-item").forEach((button) => {
    const active = button.dataset.adminSection === sectionId;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

const adminSidebar = $("#adminSidebar");
const adminOverlay = $("#adminSidebarOverlay");
const adminSidebarToggle = $("#adminSidebarToggle");

function closeAdminSidebar() {
  adminSidebar.classList.remove("open");
  adminOverlay.hidden = true;
  adminSidebarToggle.setAttribute("aria-expanded", "false");
}

adminSidebarToggle.setAttribute("aria-expanded", "false");

adminSidebarToggle.addEventListener("click", () => {
  const open = !adminSidebar.classList.contains("open");
  adminSidebar.classList.toggle("open", open);
  adminOverlay.hidden = !open;
  adminSidebarToggle.setAttribute("aria-expanded", String(open));
});

adminOverlay.addEventListener("click", closeAdminSidebar);
$("#adminSidebarClose").addEventListener("click", closeAdminSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminSidebar.classList.contains("open")) closeAdminSidebar();
});

$("#adminNav").addEventListener("click", (event) => {
  const sectionId = event.target.dataset.adminSection;
  if (!sectionId) return;
  setAdminSection(sectionId);
  closeAdminSidebar();
});

setAdminSection("adminReviews");
initThemeToggle();
initFirebase();
