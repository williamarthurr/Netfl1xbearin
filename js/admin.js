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
      <img src="${photo.src}" alt="${escapeHtml(photo.fileName || "Foto testimoni")}" loading="lazy">
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

initFirebase();
