import { firebaseConfig, adminEmails } from "./firebase-config.js";

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

function createOrderId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `ORD-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function reviewUrl(orderId, token) {
  // Cloudflare Pages dapat menyajikan admin.html sebagai /admin atau /admin.html.
  const basePath = window.location.pathname.replace(/\/admin(?:\.html)?$/, "/");
  return `${window.location.origin}${basePath}?review=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}#ulasan`;
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
      <div><strong>${escapeHtml(review.customerName)}</strong><span class="admin-meta">${escapeHtml(review.orderId)} · ${formatDate(review.createdAt)}</span></div>
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
    });
  } catch (error) { console.error(error); setLoginStatus("Dashboard gagal dimuat. Periksa koneksi Firebase.", true); }
}

$("#purchaseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#purchaseStatus");
  const button = $("#generateButton");
  const orderId = createOrderId();
  const token = createToken();
  button.disabled = true;
  status.textContent = "Membuat link…";
  try {
    await api.setDoc(api.doc(db, "purchases", orderId), { status: "paid", reviewToken: token, customerName: $("#customerName").value.trim(), packageName: $("#packageName").value.trim(), createdAt: api.serverTimestamp() });
    const url = reviewUrl(orderId, token);
    $("#reviewLinkOutput").textContent = url;
    $("#whatsappLink").href = `https://wa.me/?text=${encodeURIComponent(`Halo! Terima kasih sudah order. Boleh bantu isi rating pengalamanmu di sini ya:\n${url}`)}`;
    $("#generatedLink").hidden = false;
    status.textContent = "Link berhasil dibuat.";
    status.className = "review-status success";
    event.target.reset();
  } catch (error) { console.error(error); status.textContent = `Gagal membuat link: ${error.code || "coba lagi"}`; status.className = "review-status error"; }
  button.disabled = false;
});

$("#copyLinkButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#reviewLinkOutput").textContent);
  $("#copyLinkButton").textContent = "Tersalin!";
  setTimeout(() => { $("#copyLinkButton").textContent = "Salin link"; }, 1800);
});

$("#refreshReviews").addEventListener("click", loadReviews);
$("#adminReviewList").addEventListener("click", async (event) => {
  const approveId = event.target.dataset.approve;
  const deleteId = event.target.dataset.delete;
  try {
    if (approveId) await api.updateDoc(api.doc(db, "reviews", approveId), { approved: true, reviewToken: api.deleteField() });
    if (deleteId && confirm("Hapus ulasan ini?")) await api.deleteDoc(api.doc(db, "reviews", deleteId));
    if (approveId || deleteId) loadReviews();
  } catch (error) { alert(`Aksi gagal: ${error.code || "coba lagi"}`); }
});

initFirebase();
