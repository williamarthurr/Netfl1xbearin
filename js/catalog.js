// Data paket & komponen katalog yang dipakai halaman utama (Netflix) dan halaman paket lain.
// Data di Firestore (catalogs + packages) adalah sumber utama; array bawaan di bawah
// dipakai sebagai fallback saat Firebase gagal dan sebagai sumber tombol Seed di admin.
import { escapeHtml } from "./html.js";

// Nomor WhatsApp reseller, format internasional tanpa +
export const WA_NUMBER = "6287782164717";

// Dokumen Firestore lama yang belum punya `order` diurutkan berdasarkan nama (bukan urutan acak dari query).
const withDefaultOrder = (items) => items.map((item) => ({ ...item, order: item.order ?? 9999 }));
const withSeedOrder = (items) => items.map((item, index) => ({ ...item, order: item.order ?? index + 1 }));

// Master katalog bawaan. `page: index` tampil di beranda, sisanya jadi section di paket-lain.html.
export const SEED_CATALOGS = withSeedOrder([
  { key: "netflix", name: "Netflix", subtitle: "Premium Sharing", description: "Harga per profile, bukan per akun. Kamu dapat profile sendiri, jadi riwayat tontonan tetap privat.", icon: "fi-br-film", page: "index", order: 1, active: true },
  { key: "viu", name: "Viu & Video", subtitle: "Paket sharing lainnya", description: "Semua paket tersedia di bawah ini. Pilih layanan & durasi yang paling pas buat kamu.", icon: "fi-br-play", page: "paket-lain", order: 2, active: true },
  { key: "disney", name: "Disney+ Sharing 6 User", subtitle: "Sharing 6 user", description: "Satu akun Disney+ dipakai bersama 6 user. Pilih durasi yang paling pas buat kamu.", icon: "fi-br-film", page: "paket-lain", order: 3, active: true },
]);

// Field `catalog` = key master katalog. Harga dalam ribuan Rupiah ("25" = Rp 25.000).
export const SEED_PACKAGES = withSeedOrder([
  { catalog: "netflix", service: "Netflix", duration: "1 Hari", device: "1 profile · 1 user", price: "4", per: "/ 1 hari", icon: "fi-br-film", featured: true },
  { catalog: "netflix", service: "Netflix", duration: "2 Hari", device: "1 profile · 1 user", price: "7", per: "/ 2 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "3 Hari", device: "1 profile · 1 user", price: "9", per: "/ 3 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "5 Hari", device: "1 profile · 1 user", price: "11", per: "/ 5 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "7 Hari", device: "1 profile · 1 user", price: "15", per: "/ 7 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "1 profile · 2 user", price: "20", per: "/ bulan", icon: "fi-br-users", featured: true },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "1 device", price: "40", per: "/ bulan", icon: "fi-br-laptop", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "2 device", price: "45", per: "/ bulan", icon: "fi-br-devices", featured: false },
  { catalog: "viu", group: "VIU", service: "Viu", duration: "1 Bulan", device: "", price: "5", per: "/ bulan", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PLATINUM", service: "Video Platinum", duration: "1 Bulan Sharing", device: "mobile only", price: "18", per: "/ bulan", icon: "fi-br-play" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Minggu", device: "all device", price: "25", per: "/ minggu", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Bulan", device: "mobile only", price: "30", per: "/ bulan", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Bulan", device: "all device", price: "50", per: "/ bulan", icon: "fi-br-laptop" },
  { catalog: "disney", group: "DISNEY+ SHARING 6 USER", service: "Disney+", duration: "1 Hari", device: "6 user sharing", price: "5", per: "/ hari", icon: "fi-br-film" },
  { catalog: "disney", group: "DISNEY+ SHARING 6 USER", service: "Disney+", duration: "7 Hari", device: "6 user sharing", price: "15", per: "/ 7 hari", icon: "fi-br-film" },
  { catalog: "disney", group: "DISNEY+ SHARING 6 USER", service: "Disney+", duration: "1 Bulan", device: "6 user sharing", price: "25", per: "/ bulan", icon: "fi-br-film" },
]);

const state = { catalogs: [], packages: [], source: "fallback" };
const packageById = new Map();

// Cache terakhir dipakai supaya dropdown & kartu langsung lengkap saat halaman dibuka,
// lalu diperbarui diam-diam setelah Firestore merespons.
const CACHE_KEY = "netflixarin_catalog_v1";

function readCachedData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return Array.isArray(parsed?.catalogs) && Array.isArray(parsed?.packages) ? parsed : null;
  } catch { return null; }
}

function saveCachedData() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ catalogs: state.catalogs, packages: state.packages }));
  } catch { /* localStorage tidak tersedia atau penuh: abaikan */ }
}

function byOrder(a, b) {
  const order = (Number(a.order) || 0) - (Number(b.order) || 0);
  return order || String(a.name || a.service || "").localeCompare(String(b.name || b.service || ""));
}

function applyCatalogData(catalogs, packages, persist = false) {
  const hasFirestoreCatalogs = Array.isArray(catalogs) && catalogs.length > 0;
  const hasFirestorePackages = Array.isArray(packages) && packages.length > 0;
  const firestoreCatalogs = hasFirestoreCatalogs ? catalogs : [];
  const firestorePackages = hasFirestorePackages ? packages : [];

  // Fallback per katalog: katalog yang sudah punya paket di Firestore memakai data Firestore
  // sepenuhnya, katalog yang belum punya paket tetap memakai paket bawaan. Dengan begitu
  // menambah satu paket baru tidak menghilangkan paket katalog lainnya.
  const covered = new Set(firestorePackages.map((pkg) => pkg.catalog));
  const fallbackPackages = SEED_PACKAGES
    .filter((pkg) => !covered.has(pkg.catalog))
    .map((pkg, index) => ({ ...pkg, id: `seed-pkg-${index}` }));
  const fallbackCatalogs = hasFirestoreCatalogs
    ? []
    : SEED_CATALOGS.map((item, index) => ({ ...item, id: `seed-cat-${index}` }));

  state.catalogs = withDefaultOrder([...firestoreCatalogs, ...fallbackCatalogs]).sort(byOrder);
  state.packages = withDefaultOrder([...firestorePackages, ...fallbackPackages]).sort(byOrder);
  packageById.clear();
  state.packages.forEach((pkg) => packageById.set(pkg.id, pkg));
  state.source = hasFirestoreCatalogs && hasFirestorePackages
    ? "firestore"
    : hasFirestoreCatalogs || hasFirestorePackages ? "mixed" : "fallback";
  if (persist) saveCachedData();
}

// Hidrasi dari cache secara sinkron, sebelum halaman merender dropdown/kartu.
const initialCache = readCachedData();
applyCatalogData(initialCache?.catalogs ?? null, initialCache?.packages ?? null);

export function getCatalogs() {
  return state.catalogs;
}

export function getPackages() {
  return state.packages;
}

export function getPackageById(id) {
  return packageById.get(id);
}

export function getCatalogSource() {
  return state.source;
}

// Firebase diinisialisasi sekali per halaman; dipakai bareng main.js dan paket-lain.js.
let publicFirestorePromise = null;
export function initPublicFirestore() {
  if (!publicFirestorePromise) {
    publicFirestorePromise = (async () => {
      try {
        const [appModule, firestoreModule, configModule] = await Promise.all([
          import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
          import("./firebase-config.js"),
        ]);
        const { firebaseConfig } = configModule;
        if (!firebaseConfig.projectId || firebaseConfig.projectId.startsWith("PASTE_")) return null;
        return { api: firestoreModule, db: firestoreModule.getFirestore(appModule.initializeApp(firebaseConfig)) };
      } catch (error) {
        console.error("Firebase gagal dimuat:", error);
        return null;
      }
    })();
  }
  return publicFirestorePromise;
}

// Ambil langsung lewat REST Firestore: tidak perlu mengunduh SDK dari CDN, jadi jauh lebih cepat
// dan popup tidak perlu menampilkan status loading. Query dibatasi active == true sesuai Rules.
function parseFirestoreValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(parseFirestoreValue);
  if ("mapValue" in value) return parseFields(value.mapValue.fields || {});
  return null;
}

function parseFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)]));
}

// Baris mentah dari documents:runQuery (dipakai baik oleh restQuery maupun preload).
function parseQueryRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.document)
    .map((row) => ({
      id: row.document.name.split("/").pop(),
      ...parseFields(row.document.fields || {}),
    }));
}

async function restQuery(projectId, apiKey, collectionId) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: "active" },
              op: "EQUAL",
              value: { booleanValue: true },
            },
          },
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`Firestore REST ${collectionId}: ${response.status}`);
  return parseQueryRows(await response.json());
}

export async function fetchCatalogFromRest() {
  try {
    const { firebaseConfig } = await import("./firebase-config.js");
    const { projectId, apiKey } = firebaseConfig;

    // Request sudah dimulai dari <head> (catalog-preload.js), tinggal tunggu hasilnya.
    // Preload menyimpan baris mentah; parsingnya tetap di sini supaya tidak dobel.
    const prefetched = typeof window !== "undefined" ? window.__catalogPrefetch : null;
    const prefetch = prefetched ? await prefetched : null;
    let data = null;
    if (prefetch && prefetch.projectId === projectId) {
      data = {
        catalogs: parseQueryRows(prefetch.catalogs),
        packages: parseQueryRows(prefetch.packages),
      };
    }
    if (!data) {
      if (!projectId || projectId.startsWith("PASTE_")) {
        applyCatalogData(null, null);
        return state;
      }
      const [catalogs, packages] = await Promise.all([
        restQuery(projectId, apiKey, "catalogs"),
        restQuery(projectId, apiKey, "packages"),
      ]);
      data = { catalogs, packages };
    }
    applyCatalogData(data.catalogs, data.packages, true);
  } catch (error) {
    console.error("Katalog REST gagal, coba lewat SDK:", error);
    const connection = await initPublicFirestore();
    if (connection) await loadCatalogData(connection.api, connection.db);
  }
  return state;
}

// Ambil master katalog + paket lewat SDK (fallback bila REST tidak bisa).
export async function loadCatalogData(api, db) {
  if (!api || !db) {
    applyCatalogData(null, null);
    return state;
  }
  try {
    const [catalogSnapshot, packageSnapshot] = await Promise.all([
      api.getDocs(api.query(api.collection(db, "catalogs"), api.where("active", "==", true))),
      api.getDocs(api.query(api.collection(db, "packages"), api.where("active", "==", true))),
    ]);
    const catalogs = catalogSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const packages = packageSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    applyCatalogData(catalogs, packages, true);
  } catch (error) {
    // Jangan timpa data cache/fallback yang sudah ada supaya katalog tidak ikut hilang.
    console.error("Katalog Firestore gagal dimuat, pakai data tersimpan:", error);
  }
  return state;
}

export function formatPrice(price) {
  return (Number(price) * 1000).toLocaleString("id-ID");
}

// Jaga Tab/Shift+Tab tetap berada di dalam dialog yang sedang terbuka.
export function trapFocus(container, event) {
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// Modal form order: user isi detail dulu, submit baru buka WhatsApp.
// Dipakai kedua halaman; kartu dirender setelah data katalog termuat, jadi listener pakai delegasi.
export function initOrderModal() {
  const modal = document.getElementById("orderModal");
  const form = document.getElementById("orderForm");
  const status = document.getElementById("orderStatus");
  const nameInput = document.getElementById("orderName");
  if (!modal || !form) return;
  let pkg = null;
  let lastFocused = null;

  const open = (selected) => {
    lastFocused = document.activeElement;
    pkg = selected;
    form.reset();
    status.textContent = "";
    status.className = "review-status";
    const detail = selected.device ? `${selected.duration} (${selected.device})` : selected.duration;
    document.getElementById("orderDuration").value = `${detail} — Rp ${formatPrice(selected.price)}`;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    nameInput.focus();
  };

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
    lastFocused?.focus?.({ preventScroll: true });
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-order-wa");
    if (!btn) return;
    const selected = getPackageById(btn.dataset.pkg);
    if (!selected) return;
    open(selected);
  });

  modal.querySelectorAll("[data-close-order]").forEach((el) => {
    el.addEventListener("click", close);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Tab") trapFocus(modal.querySelector(".order-modal-box"), e);
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
      `✦ ݁˖ 𝐎𝐑𝐃𝐄𝐑 𝐅𝐎𝐑𝐌 𝐌𝐈𝐂𝐈𝐂𝐎𝐖 .✦ ݁˖\n\n` +
      `Layanan : ${pkg.service}\n` +
      `Paket : ${getValue("orderDuration")}\n` +
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

// `id` diambil dari document ID Firestore (atau seed-xxx untuk fallback).
export function cardHtml(pkg, variant = "", groupLabel = "") {
  const badge = pkg.featured ? `<span class="card-badge">TERLARIS</span>` : "";
  const group = groupLabel ? `<span class="card-group">${groupLabel}</span>` : "";
  return `
    <article class="card ${pkg.featured ? "card-featured" : ""} ${pkg.device ? "" : "card-no-device"} ${variant}">
      ${badge}
      ${group}
      <div class="card-icon"><i class="fi ${escapeHtml(pkg.icon || "fi-br-film")}"></i></div>
      <h3 class="card-duration">${escapeHtml(pkg.duration)}</h3>
      ${pkg.device ? `<p class="card-device">${escapeHtml(pkg.device)}</p>` : ""}
      <div class="card-price">Rp ${formatPrice(pkg.price)}</div>
      <p class="card-per">${escapeHtml(pkg.per || "")}</p>
      <button type="button" class="btn btn-wa js-order-wa" data-pkg="${escapeHtml(pkg.id)}">Order via WhatsApp</button>
    </article>
  `;
}

// Kartu per grup (dipakai paket-lain.html). `root` boleh id element atau element itu sendiri.
export function renderAltCatalog(catalogKey, root) {
  const target = typeof root === "string" ? document.getElementById(root) : root;
  if (!target) return;
  const packages = state.packages.filter((pkg) => pkg.catalog === catalogKey);
  const groups = [...new Set(packages.map((pkg) => pkg.group || ""))];
  target.innerHTML = groups.map((group) => `
    <section class="catalog-group">
      <h3 class="group-title"><span>${escapeHtml(group || "Paket")}</span></h3>
      <div class="catalog-groups">
        ${packages.filter((pkg) => (pkg.group || "") === group).map((pkg) => cardHtml(pkg, "card-alt")).join("")}
      </div>
    </section>
  `).join("");
}

// Bangun semua section katalog non-beranda di paket-lain.html dari master katalog.
export function renderAltCatalogs() {
  const root = document.getElementById("altCatalogs");
  if (!root) return;
  const catalogs = state.catalogs.filter((catalog) => catalog.page !== "index");
  root.innerHTML = catalogs.map((catalog) => `
    <section class="section katalog katalog-alt" id="katalog-${escapeHtml(catalog.key)}">
      <div class="container">
        <div class="section-head">
          <p class="section-eyebrow">DAFTAR HARGA</p>
          <h2 class="section-title">${escapeHtml(catalog.name)}</h2>
          <p class="section-desc">${escapeHtml(catalog.description || catalog.subtitle || "Pilih paket yang paling pas buat kamu.")}</p>
        </div>
        <div class="catalog-group-list" data-alt-groups="${escapeHtml(catalog.key)}"></div>
      </div>
      <span class="decor decor-heart-1" aria-hidden="true">♥</span>
      <span class="decor decor-star-1" aria-hidden="true">✦</span>
    </section>
  `).join("");
  root.querySelectorAll("[data-alt-groups]").forEach((element) => {
    const catalog = catalogs.find((item) => item.key === element.dataset.altGroups);
    if (catalog) renderAltCatalog(catalog.key, element);
  });
}

// Dropdown "Lihat Katalog" di beranda: isinya mengikuti master katalog.
export function renderFinderOptions() {
  const root = document.getElementById("catalogMenuOptions");
  if (!root) return;
  root.innerHTML = state.catalogs.map((catalog) => {
    const href = catalog.page === "index"
      ? "#katalog"
      : `paket-lain.html#katalog-${encodeURIComponent(catalog.key)}`;
    return `<a href="${href}" class="finder-option" data-finder-link>
      <span class="finder-option-icon" aria-hidden="true"><i class="fi ${escapeHtml(catalog.icon || "fi-br-film")}"></i></span>
      <span class="finder-option-text"><strong>${escapeHtml(catalog.name)}</strong><small>${escapeHtml(catalog.subtitle || "")}</small></span>
      <span class="finder-option-arrow" aria-hidden="true">→</span>
    </a>`;
  }).join("");
}

// Carousel generik: panah hanya tampil bila konten melebihi lebar kontainer.
export const carouselSync = {};

export function initCarousel(listId, prevId, nextId) {
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
