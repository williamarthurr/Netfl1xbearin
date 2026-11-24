import { initThemeToggle } from "./theme.js";
import { escapeHtml } from "./html.js";
import {
  WA_NUMBER, trapFocus, initOrderModal, cardHtml, carouselSync, initCarousel,
  fetchCatalogFromRest, initPublicFirestore, getPackages, renderFinderOptions as renderFinderOptionsNow,
} from "./catalog.js";

// Fetch dimulai sejak modul dimuat (lebih awal dari DOMContentLoaded) agar data sudah ada saat diklik.
const catalogLoad = fetchCatalogFromRest();

function renderFinderOptions() {
  renderFinderOptionsNow();
}

let db = null;
let firestoreApi = null;

async function initFirebase() {
  // Firebase dimuat terpisah agar kegagalan koneksi CDN tidak menghentikan katalog.
  const connection = await initPublicFirestore();
  if (connection) {
    firestoreApi = connection.api;
    db = connection.db;
  }
  return connection;
}

// SDK Firebase baru diunduh saat bagian ulasan/testimoni hampir terlihat.
let firebaseReadyPromise = null;
function ensureFirebase() {
  if (!firebaseReadyPromise) firebaseReadyPromise = initFirebase();
  return firebaseReadyPromise;
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = getPackages()
    .filter((pkg) => pkg.catalog === "netflix")
    .map((pkg) => cardHtml(pkg))
    .join("");
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

// Tombol "Lihat Katalog" membuka popup pilihan katalog
function initFinder() {
  const toggle = document.getElementById("catalogMenuBtn");
  const modal = document.getElementById("catalogModal");
  if (!toggle || !modal) return;
  let lastFocused = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
    lastFocused?.focus?.({ preventScroll: true });
  };

  const open = () => {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    renderFinderOptionsNow(); // data dari cache langsung tampil, tanpa status loading
    modal.querySelector(".catalog-modal-close")?.focus();
  };

  toggle.addEventListener("click", open);
  modal.querySelectorAll("[data-catalog-modal-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-finder-link]")) close(); // link menavigasi seperti biasa
  });
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "Tab") trapFocus(modal.querySelector(".catalog-modal-box"), e);
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
  let lastFocused = null;

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".testimoni-card");
    if (!card) return;
    lastFocused = card;
    card.setAttribute("tabindex", "-1");
    const cardImg = card.querySelector("img");
    img.src = (cardImg?.dataset?.upgraded ? cardImg.currentSrc : null) || card.dataset.src;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    close.focus();
  });

  const closeLightbox = () => {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    img.removeAttribute("src");
    lastFocused?.focus?.({ preventScroll: true });
  };

  close.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lightbox.addEventListener("keydown", (e) => {
    if (e.key === "Tab") trapFocus(lightbox, e);
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

// Foto statis memakai placeholder inline (langsung tampil tanpa jaringan), lalu
// ditukar ke file WebP penuh begitu kartunya hampir terlihat.
function upgradeTestimonialImage(img) {
  const full = img.dataset.full;
  if (!full || img.dataset.upgraded) return;
  img.dataset.upgraded = "1";
  const loader = new Image();
  loader.onload = () => { img.src = full; };
  loader.src = full;
}

function initTestimonialImageUpgrade() {
  const images = document.querySelectorAll(".testimoni-card img[data-full]");
  if (!images.length) return;
  if (!("IntersectionObserver" in window)) {
    images.forEach(upgradeTestimonialImage);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      upgradeTestimonialImage(entry.target);
    }
  }, { rootMargin: "300px 0px" });
  images.forEach((img) => observer.observe(img));
}

// Foto testimoni hasil upload admin (data URL di Firestore) ditambahkan setelah
// foto statis. Diambil per halaman supaya unduhan awal tidak membawa semua foto.
const TESTIMONI_PAGE_SIZE = 2;
const testimonialState = { lastDoc: null, hasMore: false, loading: false };

function testimonialPageQuery(afterDoc) {
  const parts = [
    firestoreApi.collection(db, "testimonials"),
    firestoreApi.orderBy("createdAt", "asc"),
    firestoreApi.limit(TESTIMONI_PAGE_SIZE),
  ];
  if (afterDoc) parts.push(firestoreApi.startAfter(afterDoc));
  return firestoreApi.query(...parts);
}

function updateTestimonialMoreButton() {
  const button = document.getElementById("testimoniMore");
  if (!button) return;
  button.hidden = !testimonialState.hasMore;
  button.disabled = testimonialState.loading;
  button.textContent = testimonialState.loading ? "Memuat…" : "Muat testimoni lainnya";
}

async function loadTestimonialPhotos(afterDoc = null) {
  if (!db || testimonialState.loading) return;
  testimonialState.loading = true;
  updateTestimonialMoreButton();
  try {
    const snapshot = await firestoreApi.getDocs(testimonialPageQuery(afterDoc));
    testimonialState.lastDoc = snapshot.docs[snapshot.docs.length - 1] || testimonialState.lastDoc;
    testimonialState.hasMore = snapshot.docs.length === TESTIMONI_PAGE_SIZE;
    const photos = snapshot.docs.map((doc) => doc.data());
    if (photos.length) {
      // Dekode dulu gambar halaman ini sebelum dirender agar tidak ada kedipan skeleton.
      // loading="lazy" sengaja tidak dipakai: data URL tidak perlu hemat download.
      await Promise.all(photos.map((photo) => new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = resolve;
        img.src = photo.src;
      })));
      const list = document.getElementById("testimoniList");
      list.insertAdjacentHTML("beforeend", photos.map((photo) => `<figure class="testimoni-card" data-src="${escapeHtml(photo.src)}">
        <div class="skeleton-media"></div>
        <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.fileName || "Testimoni pelanggan")}" decoding="async" />
      </figure>`).join(""));
      list.querySelectorAll(".testimoni-card img").forEach(watchLazyImage);
      carouselSync.testimoni?.();
    }
  } catch (error) {
    console.error("Foto testimoni tidak dapat dimuat:", error);
  } finally {
    testimonialState.loading = false;
    updateTestimonialMoreButton();
  }
}

// Tunda unduhan SDK Firebase sampai pengunjung hampir sampai ke bagian ulasan
// atau testimoni. Katalog tetap tampil dari REST/cache, jadi first paint cepat.
function initDeferredFirebase() {
  const targets = [
    { element: document.getElementById("ulasan"), load: () => loadReviews() },
    { element: document.getElementById("testimoni"), load: () => loadTestimonialPhotos() },
  ].filter((item) => item.element);

  if (!targets.length || !("IntersectionObserver" in window)) {
    ensureFirebase().finally(() => {
      loadReviews();
      loadTestimonialPhotos();
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = targets.find((item) => item.element === entry.target);
      observer.unobserve(entry.target);
      if (target) ensureFirebase().finally(target.load);
    }
  }, { rootMargin: "600px 0px" });
  targets.forEach((item) => observer.observe(item.element));
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
      status.textContent = "Menyiapkan koneksi…";
      await ensureFirebase().catch(() => {});
      if (!db) {
        status.textContent = "Form belum aktif. Admin perlu menyelesaikan konfigurasi Firebase.";
        status.className = "review-status error";
        return;
      }
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
  renderCatalog(); // data bawaan dulu supaya grid tidak kosong saat Firebase masih dimuat
  renderFinderOptions();
  initOrderModal();
  initGenericOrder();
  initFinder();
  initFaq();
  initNavbar();
  initMobileNav();
  initThemeToggle();
  initYear();
  initLightbox();
  initLazyImages();
  initTestimonialImageUpgrade();
  initCarousels();
  initReviewForm();
  document.getElementById("reviewMore").addEventListener("click", loadMoreReviews);
  document.getElementById("testimoniMore")?.addEventListener("click", () => loadTestimonialPhotos(testimonialState.lastDoc));

  // Katalog diambil lewat REST (cepat, tanpa SDK), reviews/testimoni menyusul lewat SDK.
  catalogLoad
    .then(() => {
      renderCatalog();
      renderFinderOptions();
    })
    .catch((error) => console.error("Data katalog gagal dimuat:", error));

  initDeferredFirebase();
});
