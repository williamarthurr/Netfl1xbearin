import { initThemeToggle } from "./theme.js";

// Konfigurasi nomor WhatsApp — ganti dengan nomor reseller (format internasional tanpa +)
const WA_NUMBER = "6287782164717";
let db = null;
let firestoreApi = null;

async function initFirebase() {
  try {
    // Firebase dimuat terpisah agar kegagalan koneksi CDN tidak menghentikan katalog.
    const [appModule, firestoreModule, configModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
      import("./firebase-config.js")
    ]);
    const { firebaseConfig } = configModule;
    if (!firebaseConfig.projectId || firebaseConfig.projectId.startsWith("PASTE_")) return;
    firestoreApi = firestoreModule;
    db = firestoreApi.getFirestore(appModule.initializeApp(firebaseConfig));
    await loadReviews();
    loadTestimonialPhotos();
  } catch (error) {
    console.error("Firebase gagal dimuat:", error);
  }
}

// Katalog paket
const PACKAGES = [
  { duration: "1 Hari", device: "1 profile · 1 user", price: "4", per: "/ 1 hari", icon: "fi-br-film", featured: true },
  { duration: "2 Hari", device: "1 profile · 1 user", price: "7", per: "/ 2 hari", icon: "fi-br-film", featured: false },
  { duration: "3 Hari", device: "1 profile · 1 user", price: "9", per: "/ 3 hari", icon: "fi-br-film", featured: false },
  { duration: "5 Hari", device: "1 profile · 1 user", price: "11", per: "/ 5 hari", icon: "fi-br-film", featured: false },
  { duration: "7 Hari", device: "1 profile · 1 user", price: "15", per: "/ 7 hari", icon: "fi-br-film", featured: false },
  { duration: "1 Bulan", device: "1 profile · 2 user", price: "20", per: "/ bulan", icon: "fi-br-users", featured: true },
  { duration: "1 Bulan", device: "1 device", price: "40", per: "/ bulan", icon: "fi-br-laptop", featured: false },
  { duration: "1 Bulan", device: "2 device", price: "45", per: "/ bulan", icon: "fi-br-devices", featured: false },
];

// Format harga jadi "4.000"
function formatPrice(price) {
  return (Number(price) * 1000).toLocaleString('id-ID');
}

// Modal form order: user isi detail dulu, submit baru buka WhatsApp
function initOrderModal() {
  const modal = document.getElementById("orderModal");
  const form = document.getElementById("orderForm");
  const status = document.getElementById("orderStatus");
  const nameInput = document.getElementById("orderName");
  let pkg = null;

  const open = (selected) => {
    pkg = selected;
    form.reset();
    status.textContent = "";
    status.className = "review-status";
    document.getElementById("orderDuration").value =
      `${selected.duration} (${selected.device}) — Rp ${formatPrice(selected.price)}`;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    nameInput.focus();
  };

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };

  document.querySelectorAll(".js-order-wa").forEach((btn) => {
    btn.addEventListener("click", () => open(PACKAGES[Number(btn.dataset.pkg)]));
  });

  modal.querySelectorAll("[data-close-order]").forEach((el) => {
    el.addEventListener("click", close);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pkg) return;
    const getValue = (id) => document.getElementById(id).value.trim();
    const digits = getValue("orderPhone").replace(/\D/g, "");
    if (digits.length < 9) {
      status.textContent = "No. HP-nya kelihatan kurang lengkap. Cek lagi ya.";
      status.className = "review-status error";
      return;
    }
    const text = encodeURIComponent(
      `✦ ݁˖ 𝐎𝐑𝐃𝐄𝐑 𝐅𝐎𝐑𝐌 𝐍𝐄𝐓𝐅𝐋𝐈𝐗 .✦ ݁˖\n\n` +
      `Durasi : ${getValue("orderDuration")}\n` +
      `Nama : ${getValue("orderName")}\n` +
      `Device + Seri : ${getValue("orderDevice")}\n` +
      `Lokasi : ${getValue("orderLocation")}\n` +
      `No. HP : ${getValue("orderPhone")}\n\n` +
      `𝘵𝘩𝘢𝘯𝘬 𝘺𝘰𝘶 𝘧𝘰𝘳 𝘰𝘳𝘥𝘦𝘳𝘪𝘯𝘨 𓂃 𓈒⋆.`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, "_blank");
    close();
  });
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = PACKAGES.map((pkg, i) => {
    const badge = pkg.featured ? `<span class="card-badge">TERLARIS</span>` : "";
    return `
      <article class="card ${pkg.featured ? "card-featured" : ""}">
        ${badge}
        <div class="card-icon"><i class="fi ${pkg.icon}"></i></div>
        <h3 class="card-duration">${pkg.duration}</h3>
        <p class="card-device">${pkg.device}</p>
        <div class="card-price">Rp ${formatPrice(pkg.price)}</div>
        <p class="card-per">${pkg.per}</p>
        <button type="button" class="btn btn-wa js-order-wa" data-pkg="${i}">Order via WhatsApp</button>
      </article>
    `;
  }).join("");
}

// Tombol "Order Sekarang" umum (tanpa paket spesifik)
function initGenericOrder() {
  document.querySelectorAll(".js-order").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const text = encodeURIComponent(
        `Halo Kak, saya mau order *NETFL1X PREMIUM SHARING*\n\n` +
        `Mohon info harga & cara ordernya ya. Terima kasih!`
      );
      window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, "_blank");
    });
  });
}

// FAQ accordion
function initFaq() {
  document.querySelectorAll(".faq-item").forEach((item) => {
    const btn = item.querySelector(".faq-q");
    btn.addEventListener("click", () => {
      const answer = item.querySelector(".faq-a");
      const isOpen = item.classList.contains("active");
      // tutup semua
      document.querySelectorAll(".faq-item").forEach((i) => {
        i.classList.remove("active");
        i.querySelector(".faq-a").style.maxHeight = null;
      });
      // buka yang diklik
      if (!isOpen) {
        item.classList.add("active");
        answer.style.maxHeight = answer.scrollHeight + "px";
      }
    });
  });
}

// Navbar scroll effect
function initNavbar() {
  const navbar = document.getElementById("navbar");
  const onScroll = () => {
    if (window.scrollY > 30) navbar.classList.add("scrolled");
    else navbar.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll);
  onScroll();
}

// Mobile nav toggle
function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const links = document.querySelector(".nav-links");
  toggle.addEventListener("click", () => {
    links.classList.toggle("open");
    const open = links.classList.contains("open");
    toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  });
  // tutup saat klik link
  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("open"));
  });
}

// Tahun footer
function initYear() {
  document.getElementById("year").textContent = new Date().getFullYear();
}

// Lightbox testimoni — delegasi di kontainer agar kartu dinamis (hasil upload admin) ikut berfungsi
function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  const close = document.getElementById("lightboxClose");
  const grid = document.getElementById("testimoniList");

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".testimoni-card");
    if (!card) return;
    img.src = card.dataset.src;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  const closeLightbox = () => {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    img.src = "";
  };

  close.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
  });
}

// Lazy-load + hilangkan skeleton saat gambar testimoni termuat
function watchLazyImage(img) {
  const onLoad = () => img.closest(".testimoni-card")?.classList.add("loaded");
  img.addEventListener("load", onLoad, { once: true });
  img.addEventListener("error", () => {
    // kalau gagal dimuat, tetap sembunyikan skeleton agar layout tidak kosong
    onLoad();
  }, { once: true });
  // jika sudah termuat (dari cache), langsung tandai
  if (img.complete && img.naturalWidth > 0) onLoad();
}

function initLazyImages() {
  document.querySelectorAll(".testimoni-card img").forEach(watchLazyImage);
}

// Foto testimoni hasil upload admin (data URL di Firestore) ditambahkan setelah foto statis.
async function loadTestimonialPhotos() {
  if (!db) return;
  try {
    const snapshot = await firestoreApi.getDocs(firestoreApi.collection(db, "testimonials"));
    const photos = snapshot.docs.map((doc) => doc.data())
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    if (!photos.length) return;
    // Dekode dulu semua gambar sebelum kartu dirender agar tidak ada kedipan skeleton.
    // loading="lazy" sengaja tidak dipakai: data URL tidak perlu hemat download,
    // dan lazy justru menunda load untuk kartu yang di luar layar (efek kedip di carousel).
    await Promise.all(photos.map((photo) => new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = photo.src;
    })));
    const list = document.getElementById("testimoniList");
    list.insertAdjacentHTML("beforeend", photos.map((photo) => `<figure class="testimoni-card" data-src="${photo.src}">
      <div class="skeleton-media"></div>
      <img src="${photo.src}" alt="${escapeHtml(photo.fileName || "Testimoni pelanggan")}" decoding="async" />
    </figure>`).join(""));
    list.querySelectorAll(".testimoni-card img").forEach(watchLazyImage);
    carouselSync.testimoni?.();
  } catch (error) {
    console.error("Foto testimoni tidak dapat dimuat:", error);
  }
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "Customer";
  return element.innerHTML;
}

function formatReviewDate(timestamp) {
  if (!timestamp?.toDate) return "Baru saja";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(timestamp.toDate());
}

// Ringkasan rating dihitung terpisah dari kartu supaya tetap akurat saat kartu dimuat per halaman.
function renderReviewSummary({ count, ratingSum, starCounts }) {
  const average = count ? ratingSum / count : 0;
  document.getElementById("ratingAverage").textContent = count ? average.toFixed(1) : "—";
  const stars = document.getElementById("ratingAverageStars");
  stars.textContent = "★".repeat(Math.round(average)) + "☆".repeat(5 - Math.round(average));
  stars.setAttribute("aria-label", count ? `${average.toFixed(1)} dari 5 bintang` : "Belum ada rating");
  document.getElementById("ratingCount").textContent = count ? `${count} ulasan terverifikasi` : "Belum ada ulasan";
  document.getElementById("ratingBars").innerHTML = [5, 4, 3, 2, 1].map((star) => {
    const starTotal = starCounts[star] || 0;
    const percentage = count ? (starTotal / count) * 100 : 0;
    return `<div class="rating-bar-row"><span>${star} ★</span><div class="rating-bar"><i style="width:${percentage}%"></i></div><b>${starTotal}</b></div>`;
  }).join("");
}

function summarizeReviews(reviews) {
  const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const review of reviews) {
    if (review.rating >= 1 && review.rating <= 5) {
      ratingSum += review.rating;
      starCounts[review.rating] += 1;
    }
  }
  return { count: reviews.length, ratingSum, starCounts };
}

function reviewCardHtml(review) {
  return `<article class="review-card">
    <div class="review-card-top"><div><strong>${escapeHtml(review.customerName)}</strong></div><time>${formatReviewDate(review.createdAt)}</time></div>
    <div class="review-stars" aria-label="${review.rating} dari 5 bintang">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
    <p>${escapeHtml(review.comment)}</p>
  </article>`;
}

function renderReviews(reviews, stats) {
  const list = document.getElementById("reviewList");
  renderReviewSummary(stats || summarizeReviews(reviews));
  if (!reviews.length) {
    list.innerHTML = '<p class="review-empty">Belum ada ulasan, jadilah yang pertama!</p>';
    carouselSync.review?.();
    return;
  }
  list.innerHTML = reviews.map(reviewCardHtml).join("");
  list.scrollLeft = 0; // render ulang selalu mulai dari kartu pertama
  // Chrome bisa re-snap scroll-snap setelah layout berikutnya; tawar ulang di frame itu.
  requestAnimationFrame(() => { list.scrollLeft = 0; carouselSync.review?.(); });
  carouselSync.review?.();
}

// Carousel generik (ulasan & testimoni): panah hanya tampil bila konten melebihi lebar kontainer.
const carouselSync = {};

function initCarousel(listId, prevId, nextId) {
  const list = document.getElementById(listId);
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (!list || !prev || !next) return;
  const step = () => {
    const card = list.querySelector(":scope > *");
    const gap = parseFloat(getComputedStyle(list).columnGap) || 18;
    return card ? card.getBoundingClientRect().width + gap : list.clientWidth * 0.8;
  };
  const sync = () => {
    const hasOverflow = list.scrollWidth > list.clientWidth + 1;
    prev.hidden = next.hidden = !hasOverflow;
    prev.disabled = list.scrollLeft <= 2;
    next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
  };
  prev.addEventListener("click", () => list.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => list.scrollBy({ left: step(), behavior: "smooth" }));
  list.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  sync();
  return sync;
}

function initCarousels() {
  carouselSync.review = initCarousel("reviewList", "reviewPrev", "reviewNext");
  carouselSync.testimoni = initCarousel("testimoniList", "testimoniPrev", "testimoniNext");
}

// Pagination ulasan: kartu diambil 12 per halaman lewat cursor Firestore (startAfter),
// jadi jumlah baca Firestore tetap kecil walau ulasan makin banyak.
const REVIEW_PAGE_SIZE = 12;
const reviewState = { lastDoc: null, hasMore: false, loadingMore: false };

function reviewPageQuery(afterDoc) {
  const parts = [
    firestoreApi.collection(db, "reviews"),
    firestoreApi.where("approved", "==", true),
    firestoreApi.orderBy("createdAt", "desc"),
    firestoreApi.limit(REVIEW_PAGE_SIZE),
  ];
  if (afterDoc) parts.push(firestoreApi.startAfter(afterDoc));
  return firestoreApi.query(...parts);
}

// Statistik ringkasan (total, rata-rata, distribusi bintang) dihitung di server via count aggregation,
// jadi tetap akurat tanpa perlu mengunduh semua ulasan. Rata-rata dihitung dari distribusi bintang
// agar tidak butuh query sum yang menuntut composite index tambahan.
async function fetchReviewStats() {
  const counts = await Promise.all([5, 4, 3, 2, 1].map((star) =>
    firestoreApi.getCountFromServer(firestoreApi.query(
      firestoreApi.collection(db, "reviews"),
      firestoreApi.where("approved", "==", true),
      firestoreApi.where("rating", "==", star)
    )).then((snapshot) => snapshot.data().count)
  ));
  const starCounts = { 5: counts[0], 4: counts[1], 3: counts[2], 2: counts[3], 1: counts[4] };
  const count = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  const ratingSum = starCounts[5] * 5 + starCounts[4] * 4 + starCounts[3] * 3 + starCounts[2] * 2 + starCounts[1];
  return { count, ratingSum, starCounts };
}

function updateReviewMoreButton() {
  const button = document.getElementById("reviewMore");
  if (!button) return;
  button.hidden = !reviewState.hasMore;
  button.disabled = reviewState.loadingMore;
  button.textContent = reviewState.loadingMore ? "Memuat…" : "Muat ulasan lainnya";
}

async function loadReviews() {
  if (!db) { renderReviews([]); return; }
  try {
    const [snapshot, stats] = await Promise.all([firestoreApi.getDocs(reviewPageQuery()), fetchReviewStats()]);
    reviewState.lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    reviewState.hasMore = snapshot.docs.length === REVIEW_PAGE_SIZE;
    renderReviews(snapshot.docs.map((doc) => doc.data()), stats);
    updateReviewMoreButton();
  } catch (error) {
    // Gagal (mis. composite index Firestore belum dibuat) -> pakai perilaku lama supaya ulasan tetap tampil.
    console.error("Query pagination ulasan gagal, pakai mode ambil semua:", error);
    await loadReviewsFallback();
  }
}

async function loadMoreReviews() {
  if (!db || !reviewState.hasMore || reviewState.loadingMore || !reviewState.lastDoc) return;
  reviewState.loadingMore = true;
  updateReviewMoreButton();
  try {
    const snapshot = await firestoreApi.getDocs(reviewPageQuery(reviewState.lastDoc));
    reviewState.lastDoc = snapshot.docs[snapshot.docs.length - 1] || reviewState.lastDoc;
    reviewState.hasMore = snapshot.docs.length === REVIEW_PAGE_SIZE;
    document.getElementById("reviewList").insertAdjacentHTML("beforeend", snapshot.docs.map((doc) => reviewCardHtml(doc.data())).join(""));
    carouselSync.review?.();
    reviewState.loadingMore = false;
    updateReviewMoreButton();
  } catch (error) {
    console.error("Ulasan berikutnya gagal dimuat:", error);
    reviewState.loadingMore = false;
    updateReviewMoreButton();
  }
}

// Mode darurat: ambil semua ulasan sekali lalu urutkan di browser (perilaku lama, baca Firestore jauh lebih banyak).
async function loadReviewsFallback() {
  try {
    const snapshot = await firestoreApi.getDocs(
      firestoreApi.query(firestoreApi.collection(db, "reviews"), firestoreApi.where("approved", "==", true))
    );
    const reviews = snapshot.docs.map((doc) => doc.data()).sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    reviewState.hasMore = false;
    reviewState.lastDoc = null;
    renderReviews(reviews);
    updateReviewMoreButton();
  } catch (error) {
    console.error("Ulasan tidak dapat dimuat:", error);
    document.getElementById("reviewList").innerHTML = '<p class="review-empty">Ulasan belum dapat dimuat. Coba lagi nanti.</p>';
    updateReviewMoreButton();
  }
}

function initReviewForm() {
  const form = document.getElementById("reviewForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("reviewStatus");
    const submit = document.getElementById("reviewSubmit");
    const rating = Number(new FormData(form).get("rating"));
    const customerName = document.getElementById("reviewName").value.trim() || "Customer";
    const comment = document.getElementById("reviewText").value.trim();
    if (!db) {
      status.textContent = "Form belum aktif. Admin perlu menyelesaikan konfigurasi Firebase.";
      status.className = "review-status error";
      return;
    }
    submit.disabled = true;
    status.textContent = "Mengirim ulasan…";
    status.className = "review-status";
    try {
      // ID dokumen acak; ulasan tetap butuh persetujuan admin sebelum tampil publik.
      await firestoreApi.addDoc(firestoreApi.collection(db, "reviews"), { customerName, comment, rating, approved: false, createdAt: firestoreApi.serverTimestamp() });
      form.reset();
      form.querySelectorAll("input, textarea, button").forEach((field) => { field.disabled = true; });
      status.textContent = "Terima kasih! Ulasannya udah kekirim kok, nanti muncul :p";
      status.className = "review-status success";
    } catch (error) {
      console.error("Ulasan gagal dikirim:", error);
      submit.disabled = false;
      const isPermissionError = error?.code === "permission-denied";
      status.textContent = isPermissionError
        ? "gagal kirim ulasan, hubungi kakak penjualnya yaa ~."
        : `Ulasan tidak dapat dikirim (${error?.code || "kesalahan koneksi"}). Coba lagi.`;
      status.className = "review-status error";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initFirebase();
  renderCatalog();
  initOrderModal();
  initGenericOrder();
  initFaq();
  initNavbar();
  initMobileNav();
  initThemeToggle();
  initYear();
  initLightbox();
  initLazyImages();
  initCarousels();
  initReviewForm();
  document.getElementById("reviewMore").addEventListener("click", loadMoreReviews);
  loadReviews();
});
