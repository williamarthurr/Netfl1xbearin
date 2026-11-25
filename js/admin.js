import { firebaseConfig, adminEmails, notifyWorkerUrl } from "./firebase-config.js";
import { initThemeToggle } from "./theme.js";
import { SEED_CATALOGS, SEED_PACKAGES, formatPrice, trapFocus } from "./catalog.js";
import { escapeHtml } from "./html.js";
import { DAY_MS, addDays, renewExpiry, resumeExpiry, shiftDate, todayLocal } from "./dates.js";

let db;
let auth;
let api;

const $ = (selector) => document.querySelector(selector);
const configured = () => firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_") && Array.isArray(adminEmails) && adminEmails.some((email) => email && !email.startsWith("TAMBAHKAN_"));
const isAllowedAdmin = (email) => adminEmails.some((allowedEmail) => allowedEmail.toLowerCase() === (email || "").toLowerCase());

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
      initKatalog();
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

// Foto disimpan sebagai data URL di Firestore. Target maksimal 200.000 karakter
// (≈150 KB per foto) supaya total unduhan per kunjungan tetap kecil.
const TESTIMONI_MAX_CHARS = 200000;
const TESTIMONI_MAX_SIDE = 1000;

function drawJpeg(img, scale, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

// Turunkan kualitas dulu, lalu ukuran, sampai masuk batas. Foto yang sudah ada
// tidak disentuh — admin menghapus & mengunggah ulang manual lewat daftar foto.
async function fileToCompressedDataUrl(file) {
  const img = await readAsImage(file);
  let scale = Math.min(1, TESTIMONI_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  let dataUrl = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    let quality = 0.7;
    dataUrl = drawJpeg(img, scale, quality);
    while (dataUrl.length > TESTIMONI_MAX_CHARS && quality > 0.4) {
      quality -= 0.1;
      dataUrl = drawJpeg(img, scale, quality);
    }
    if (dataUrl.length <= TESTIMONI_MAX_CHARS) break;
    scale *= 0.8;
  }
  if (dataUrl.length > TESTIMONI_MAX_CHARS) throw new Error("foto tetap terlalu besar setelah dikompres");
  return dataUrl;
}

async function loadTestimonials() {
  const target = $("#adminTestimoniList");
  target.innerHTML = '<p class="review-empty">Memuat foto…</p>';
  try {
    const snapshot = await api.getDocs(api.collection(db, "testimonials"));
    const photos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    if (!photos.length) { target.innerHTML = '<p class="review-empty">Belum ada foto terunggah.</p>'; return; }
    target.innerHTML = photos.map((photo) => {
      const chars = typeof photo.src === "string" ? photo.src.length : 0;
      const sizeLabel = `${Math.round(chars / 1024)} KB${chars > TESTIMONI_MAX_CHARS ? " · besar, hapus & unggah ulang" : ""}`;
      return `<div class="admin-testimoni-card">
        <img src="${photo.src}" alt="${escapeHtml(photo.fileName || "Foto testimoni")}">
        <span class="testimoni-size">${escapeHtml(sizeLabel)}</span>
        <button class="btn btn-danger btn-sm" data-delete-photo="${photo.id}" aria-label="Hapus foto">×</button>
      </div>`;
    }).join("");
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
  let failures = [];
  for (const file of files) {
    try {
      status.textContent = `Mengompres & mengunggah ${ok + 1}/${files.length}…`;
      const dataUrl = await fileToCompressedDataUrl(file);
      await api.addDoc(api.collection(db, "testimonials"), { src: dataUrl, fileName: file.name.slice(0, 100), createdAt: api.serverTimestamp() });
      ok++;
    } catch (error) {
      console.error(error);
      failures.push(error?.code || error?.message || "kesalahan tak terduga");
    }
  }
  button.disabled = false;
  if (ok === files.length && ok > 0) {
    status.textContent = `Berhasil mengunggah ${ok} foto.`;
    status.className = "review-status success";
    event.target.reset();
  } else if (ok > 0) {
    status.textContent = `${ok} foto terunggah, ${failures.length} gagal (${failures[0]}).`;
    status.className = "review-status error";
  } else {
    const detail = failures[0] || "kesalahan tak terduga";
    status.textContent = `Gagal mengunggah (${detail}).${detail === "permission-denied" ? " Pastikan Rules Firestore sudah diperbarui." : ""}`;
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

let subscriptions = [];
let notifyState = {}; // map "subId:expiresAtMs" -> waktu notif terkirim (dari worker)
let langgananFilter = "semua";
let countdownTimer = null;
let telegramSettingsPromise = null;

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Dokumen settings/telegram menyimpan sync secret worker. Dibuat otomatis saat pertama dibuka.
// Promise-nya di-cache supaya tiga pemanggil pertama tidak membuat tiga secret berbeda.
function getTelegramSettings() {
  if (!telegramSettingsPromise) {
    telegramSettingsPromise = api.runTransaction(db, async (transaction) => {
      const ref = api.doc(db, "settings", "telegram");
      const snap = await transaction.get(ref);
      if (snap.exists()) return snap.data();
      const settings = { syncSecret: randomSecret(), createdAt: api.serverTimestamp() };
      transaction.set(ref, settings);
      return settings;
    }).catch((error) => {
      telegramSettingsPromise = null; // biar bisa dicoba lagi setelah gagal
      throw error;
    });
  }
  return telegramSettingsPromise;
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
        ? '<div class="langganan-countdown stopped-text">Dihentikan — hitungan dijeda & tidak dinotif</div>'
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
    return true;
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="review-empty">Langganan gagal dimuat. Pastikan Rules Firestore sudah berisi koleksi "subscriptions" dan "settings".</p>';
    return false;
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
  const loaded = await loadSubscriptions();
  showSyncSecret();
  if (loaded) syncToWorker();
  else setTelegramNote("Data langganan gagal dimuat — sync ke worker dilewati.", true);
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
      expiresAt: api.Timestamp.fromDate(addDays(startedAt, days)),
      createdAt: api.serverTimestamp(),
    });
    setLanggananStatus(`Langganan ${nama} ditambahkan. Hitung mundur langsung jalan.`, false);
    event.target.reset();
    $("#langgananCustomWrap").hidden = true;
    $("#paketWrap").hidden = false;
    const loadedOk = await loadSubscriptions();
    if (loadedOk) await syncToWorker();
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
    if (stopId) await api.updateDoc(api.doc(db, "subscriptions", stopId), { stopped: true, stoppedAt: api.Timestamp.now() });
    if (resumeId) {
      const sub = subscriptions.find((item) => item.id === resumeId);
      if (!sub) return;
      const now = Date.now();
      const nextExpiry = resumeExpiry(
        sub.expiresAt?.toMillis?.() || now,
        sub.stoppedAt?.toMillis?.() || null,
        now
      );
      await api.updateDoc(api.doc(db, "subscriptions", resumeId), {
        stopped: false,
        stoppedAt: api.deleteField(),
        expiresAt: api.Timestamp.fromMillis(nextExpiry),
      });
    }
    if (extendId) {
      const sub = subscriptions.find((item) => item.id === extendId);
      if (!sub) return;
      const input = prompt("Perpanjang berapa hari? (bisa desimal, misal 0.02)", "7");
      if (!input) return;
      const days = Number(input.replace(",", "."));
      if (!Number.isFinite(days) || days <= 0 || days > 3650) return alert("Durasi tidak valid.");
      const nextExpiry = renewExpiry(Date.now(), sub.expiresAt?.toMillis?.() || 0, days);
      const preview = formatDate(api.Timestamp.fromMillis(nextExpiry));
      if (!confirm(`Perpanjang ${days} hari?\nBerakhir menjadi: ${preview}`)) return;
      await api.updateDoc(api.doc(db, "subscriptions", extendId), {
        expiresAt: api.Timestamp.fromMillis(nextExpiry),
        durationDays: (sub.durationDays || 0) + days,
      });
    }
    if (deleteId && confirm("Hapus langganan ini?")) await api.deleteDoc(api.doc(db, "subscriptions", deleteId));
    const loadedOk = await loadSubscriptions();
    if (loadedOk) await syncToWorker();
  } catch (error) { alert(`Aksi gagal: ${error.code || error.message || "coba lagi"}`); }
});

// ---------- Catatan keuangan harian ----------

let keuanganTransactions = [];
let keuanganDate = "";
let keuanganRequestId = 0;

function rupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
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

// Grafik batang 7 hari terakhir: satu query rentang, agregasi di browser tanpa library chart.
function renderKeuanganChart(docs) {
  const target = $("#keuanganChart");
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shiftDate(keuanganDate, -i));
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
  const requestId = ++keuanganRequestId;
  target.innerHTML = '<p class="review-empty">Memuat transaksi…</p>';
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(shiftDate(keuanganDate, -i));
    const snapshot = await api.getDocs(api.query(
      api.collection(db, "transactions"),
      api.where("date", ">=", days[0]),
      api.where("date", "<=", days[days.length - 1])
    ));
    if (requestId !== keuanganRequestId) return;
    const all = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    keuanganTransactions = all.filter((tx) => tx.date === keuanganDate);
    renderKeuangan();
    renderKeuanganChart(all);
  } catch (error) {
    if (requestId !== keuanganRequestId) return;
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

// ---------- Master katalog & paket ----------

let katalogCache = { catalogs: [], packages: [] };

function byOrder(a, b) {
  return (Number(a.order) || 0) - (Number(b.order) || 0)
    || String(a.name || a.service || "").localeCompare(String(b.name || b.service || ""));
}

function setKatalogStatus(message, isError = false) {
  const status = $("#katalogStatus");
  status.textContent = message;
  status.className = `review-status ${isError ? "error" : ""}`;
}

let adminModalReturnFocus = null;

function openAdminModal(modalId, titleId, title, focusId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  adminModalReturnFocus = document.activeElement;
  document.getElementById(titleId).textContent = title;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById(focusId)?.focus();
}

function closeAdminModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
  adminModalReturnFocus?.focus?.({ preventScroll: true });
  adminModalReturnFocus = null;
}

function resetCatalogForm() {
  $("#catalogForm").reset();
  $("#catId").value = "";
  $("#catOrder").value = "99";
  $("#catActive").checked = true;
  $("#catSubmit").textContent = "Simpan katalog";
}

function resetPackageForm() {
  $("#packageForm").reset();
  $("#pkgId").value = "";
  $("#pkgOrder").value = "99";
  $("#pkgActive").checked = true;
  $("#pkgFeatured").checked = false;
  $("#pkgSubmit").textContent = "Simpan paket";
}

function fillCatalogSelect(catalogs) {
  const options = catalogs.map((catalog) =>
    `<option value="${escapeHtml(catalog.key)}">${escapeHtml(catalog.name)}</option>`).join("");

  const formSelect = $("#pkgCatalog");
  const formCurrent = formSelect.value;
  formSelect.innerHTML = options;
  if (formCurrent && [...formSelect.options].some((option) => option.value === formCurrent)) formSelect.value = formCurrent;

  const filterSelect = $("#pkgFilterCatalog");
  const filterCurrent = filterSelect.value;
  filterSelect.innerHTML = `<option value="">Semua katalog</option>${options}`;
  filterSelect.value = [...filterSelect.options].some((option) => option.value === filterCurrent) ? filterCurrent : "";
}

function statusBadge(item) {
  return item.active === false
    ? '<span class="status-pill stopped">Nonaktif</span>'
    : '<span class="status-pill approved">Aktif</span>';
}

function renderKatalogRows() {
  const { catalogs, packages } = katalogCache;
  const catalogByKey = new Map(catalogs.map((catalog) => [catalog.key, catalog]));

  $("#adminCatalogList tbody").innerHTML = catalogs.length
    ? catalogs.map((catalog) => `<tr>
        <td><strong>${escapeHtml(catalog.name)}</strong>${catalog.subtitle ? `<small class="table-sub">${escapeHtml(catalog.subtitle)}</small>` : ""}</td>
        <td><code>${escapeHtml(catalog.key)}</code></td>
        <td>${escapeHtml(catalog.page === "index" ? "Beranda (Netflix)" : "Paket lain")}</td>
        <td class="num">${Number(catalog.order) || 0}</td>
        <td>${statusBadge(catalog)}</td>
        <td class="table-actions">
          <button class="btn btn-outline btn-sm" type="button" data-cat-edit="${escapeHtml(catalog.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" type="button" data-cat-delete="${escapeHtml(catalog.id)}">Hapus</button>
        </td>
      </tr>`).join("")
    : '<tr class="table-empty"><td colspan="6">Belum ada katalog. Tambah baru atau klik Seed dari data bawaan.</td></tr>';

  const filterKey = $("#pkgFilterCatalog").value;
  const query = $("#pkgFilterSearch").value.trim().toLowerCase();
  const visible = packages.filter((pkg) => {
    if (filterKey && pkg.catalog !== filterKey) return false;
    if (!query) return true;
    return [pkg.service, pkg.duration, pkg.group, pkg.device, pkg.notes].some((value) =>
      String(value || "").toLowerCase().includes(query));
  });

  const grouped = new Map();
  visible.forEach((pkg) => {
    const key = pkg.catalog || "";
    if (!grouped.has(key)) grouped.set(key, new Map());
    const byGroup = grouped.get(key);
    const group = pkg.group || "";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(pkg);
  });

  const catalogOrder = new Map(catalogs.map((catalog, index) => [catalog.key, index]));
  const keys = [...grouped.keys()].sort((a, b) => {
    const ai = catalogOrder.has(a) ? catalogOrder.get(a) : catalogs.length;
    const bi = catalogOrder.has(b) ? catalogOrder.get(b) : catalogs.length;
    return ai - bi || a.localeCompare(b);
  });

  const rows = keys.map((key) => {
    const label = catalogByKey.get(key)?.name || (key === "" ? "Tanpa katalog" : key);
    const byGroup = grouped.get(key);
    const total = [...byGroup.values()].reduce((sum, items) => sum + items.length, 0);
    const body = [...byGroup.keys()].sort((a, b) => a.localeCompare(b)).map((group) => {
      const heading = group
        ? `<tr class="table-subgroup"><td colspan="6">${escapeHtml(group)}</td></tr>`
        : "";
      return heading + byGroup.get(group).sort(byOrder).map((pkg) => `<tr>
        <td><strong>${escapeHtml(pkg.service || "-")}</strong>${pkg.featured ? '<span class="table-badge">TERLARIS</span>' : ""}</td>
        <td>${escapeHtml(pkg.duration || "-")}</td>
        <td>${escapeHtml(pkg.device || "-")}${pkg.notes ? '<small class="table-sub">Ada keterangan</small>' : ""}</td>
        <td class="num"><strong>Rp ${formatPrice(pkg.price)}</strong>${pkg.per ? `<small class="table-sub">${escapeHtml(pkg.per)}</small>` : ""}</td>
        <td>${statusBadge(pkg)}</td>
        <td class="table-actions">
          <button class="btn btn-outline btn-sm" type="button" data-pkg-edit="${escapeHtml(pkg.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" type="button" data-pkg-delete="${escapeHtml(pkg.id)}">Hapus</button>
        </td>
      </tr>`).join("");
    }).join("");
    return `<tr class="table-group"><td colspan="6"><strong>${escapeHtml(label)}</strong><span class="table-group-count">${total} paket</span></td></tr>${body}`;
  }).join("");

  $("#adminPackageList tbody").innerHTML = rows || '<tr class="table-empty"><td colspan="6">Tidak ada paket yang cocok.</td></tr>';
}

async function loadKatalog() {
  if (!db || !api) { setKatalogStatus("Firebase belum terhubung.", true); return; }
  try {
    const [catalogSnapshot, packageSnapshot] = await Promise.all([
      api.getDocs(api.collection(db, "catalogs")),
      api.getDocs(api.collection(db, "packages")),
    ]);
    katalogCache = {
      catalogs: catalogSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byOrder),
      packages: packageSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byOrder),
    };
    fillCatalogSelect(katalogCache.catalogs);
    renderKatalogRows();
  } catch (error) {
    console.error(error);
    setKatalogStatus("Katalog gagal dimuat. Periksa Rules Firestore untuk koleksi catalogs & packages.", true);
  }
}

function initKatalog() {
  loadKatalog();
}

$("#refreshKatalog").addEventListener("click", loadKatalog);
$("#pkgFilterCatalog").addEventListener("change", renderKatalogRows);
$("#pkgFilterSearch").addEventListener("input", renderKatalogRows);

$("#catalogForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !api) { setKatalogStatus("Firebase belum terhubung.", true); return; }
  const id = $("#catId").value;
  const data = {
    key: $("#catKey").value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    name: $("#catName").value.trim(),
    subtitle: $("#catSubtitle").value.trim(),
    description: $("#catDescription").value.trim(),
    icon: $("#catIcon").value,
    page: $("#catPage").value,
    order: Number($("#catOrder").value) || 0,
    active: $("#catActive").checked,
  };
  if (!data.key || !data.name) { setKatalogStatus("Nama dan key wajib diisi.", true); return; }
  if (katalogCache.catalogs.some((catalog) => catalog.key === data.key && catalog.id !== id)) {
    setKatalogStatus("Key sudah dipakai katalog lain.", true);
    return;
  }
  try {
    if (id) await api.updateDoc(api.doc(db, "catalogs", id), data);
    else await api.addDoc(api.collection(db, "catalogs"), data);
    resetCatalogForm();
    closeAdminModal($("#catalogModal"));
    setKatalogStatus(id ? "Katalog diperbarui." : "Katalog ditambahkan.");
    loadKatalog();
  } catch (error) {
    console.error(error);
    setKatalogStatus(`Gagal menyimpan katalog (${error.code || "kesalahan koneksi"}).`, true);
  }
});

$("#packageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !api) { setKatalogStatus("Firebase belum terhubung.", true); return; }
  const id = $("#pkgId").value;
  const data = {
    catalog: $("#pkgCatalog").value,
    group: $("#pkgGroup").value.trim(),
    service: $("#pkgService").value.trim(),
    duration: $("#pkgDuration").value.trim(),
    device: $("#pkgDevice").value.trim(),
    notes: $("#pkgNotes").value.trim(),
    price: Number($("#pkgPrice").value),
    per: $("#pkgPer").value.trim(),
    icon: $("#pkgIcon").value,
    featured: $("#pkgFeatured").checked,
    order: Number($("#pkgOrder").value) || 0,
    active: $("#pkgActive").checked,
  };
  if (!data.catalog || !data.service || !data.duration) {
    setKatalogStatus("Katalog, layanan, dan durasi wajib diisi.", true);
    return;
  }
  try {
    if (id) await api.updateDoc(api.doc(db, "packages", id), data);
    else await api.addDoc(api.collection(db, "packages"), data);
    resetPackageForm();
    closeAdminModal($("#packageModal"));
    setKatalogStatus(id ? "Paket diperbarui." : "Paket ditambahkan.");
    loadKatalog();
  } catch (error) {
    console.error(error);
    setKatalogStatus(`Gagal menyimpan paket (${error.code || "kesalahan koneksi"}).`, true);
  }
});

$("#addCatalog").addEventListener("click", () => {
  resetCatalogForm();
  openAdminModal("catalogModal", "catalogModalTitle", "Tambah katalog", "catName");
});

$("#addPackage").addEventListener("click", () => {
  resetPackageForm();
  openAdminModal("packageModal", "packageModalTitle", "Tambah paket", "pkgService");
});

document.querySelectorAll("[data-admin-modal-close]").forEach((el) => {
  el.addEventListener("click", () => closeAdminModal(el.closest(".admin-modal")));
});

document.addEventListener("keydown", (e) => {
  const modal = document.querySelector(".admin-modal:not([hidden])");
  if (!modal) return;
  if (e.key === "Escape") closeAdminModal(modal);
  if (e.key === "Tab") trapFocus(modal.querySelector(".admin-modal-box"), e);
});

$("#adminCatalogList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-cat-edit]");
  const remove = event.target.closest("[data-cat-delete]");
  if (edit) {
    const catalog = katalogCache.catalogs.find((item) => item.id === edit.dataset.catEdit);
    if (!catalog) return;
    $("#catId").value = catalog.id;
    $("#catName").value = catalog.name || "";
    $("#catKey").value = catalog.key || "";
    $("#catSubtitle").value = catalog.subtitle || "";
    $("#catDescription").value = catalog.description || "";
    $("#catIcon").value = catalog.icon || "fi-br-film";
    $("#catPage").value = catalog.page || "paket-lain";
    $("#catOrder").value = Number(catalog.order) || 0;
    $("#catActive").checked = catalog.active !== false;
    $("#catSubmit").textContent = "Simpan perubahan";
    openAdminModal("catalogModal", "catalogModalTitle", "Edit katalog", "catName");
  }
  if (remove && confirm("Hapus katalog ini? Paket di dalamnya tidak ikut terhapus.")) {
    try {
      await api.deleteDoc(api.doc(db, "catalogs", remove.dataset.catDelete));
      setKatalogStatus("Katalog dihapus.");
      loadKatalog();
    } catch (error) { setKatalogStatus("Gagal menghapus katalog.", true); }
  }
});

$("#adminPackageList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-pkg-edit]");
  const remove = event.target.closest("[data-pkg-delete]");
  if (edit) {
    const pkg = katalogCache.packages.find((item) => item.id === edit.dataset.pkgEdit);
    if (!pkg) return;
    $("#pkgId").value = pkg.id;
    $("#pkgCatalog").value = pkg.catalog || "";
    $("#pkgGroup").value = pkg.group || "";
    $("#pkgService").value = pkg.service || "";
    $("#pkgDuration").value = pkg.duration || "";
    $("#pkgDevice").value = pkg.device || "";
    $("#pkgNotes").value = pkg.notes || "";
    $("#pkgPrice").value = Number(pkg.price) || 0;
    $("#pkgPer").value = pkg.per || "";
    $("#pkgIcon").value = pkg.icon || "fi-br-film";
    $("#pkgFeatured").checked = Boolean(pkg.featured);
    $("#pkgOrder").value = Number(pkg.order) || 0;
    $("#pkgActive").checked = pkg.active !== false;
    $("#pkgSubmit").textContent = "Simpan perubahan";
    openAdminModal("packageModal", "packageModalTitle", "Edit paket", "pkgService");
  }
  if (remove && confirm("Hapus paket ini?")) {
    try {
      await api.deleteDoc(api.doc(db, "packages", remove.dataset.pkgDelete));
      setKatalogStatus("Paket dihapus.");
      loadKatalog();
    } catch (error) { setKatalogStatus("Gagal menghapus paket.", true); }
  }
});

$("#seedKatalog").addEventListener("click", async () => {
  if (!db || !api) { setKatalogStatus("Firebase belum terhubung.", true); return; }
  const missingCatalogs = katalogCache.catalogs.length === 0;
  const missingPackages = katalogCache.packages.length === 0;
  if (!missingCatalogs && !missingPackages) {
    setKatalogStatus("Katalog & paket sudah ada. Seed dilewati.", true);
    return;
  }
  const parts = [missingCatalogs && "katalog", missingPackages && "paket"].filter(Boolean);
  if (!confirm(`Isi ${parts.join(" & ")} dari data bawaan sekarang?`)) return;
  try {
    const jobs = [];
    if (missingCatalogs) jobs.push(...SEED_CATALOGS.map((item) => api.addDoc(api.collection(db, "catalogs"), item)));
    if (missingPackages) jobs.push(...SEED_PACKAGES.map((item) => api.addDoc(api.collection(db, "packages"), item)));
    await Promise.all(jobs);
    setKatalogStatus(`Seed berhasil: ${parts.join(" & ")} sudah masuk Firestore.`);
    loadKatalog();
  } catch (error) {
    console.error(error);
    setKatalogStatus(`Seed gagal (${error.code || "kesalahan koneksi"}).`, true);
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
