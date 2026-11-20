// Data paket & komponen katalog yang dipakai halaman utama (Netflix) dan halaman paket lain.

// Nomor WhatsApp reseller, format internasional tanpa +
export const WA_NUMBER = "6287782164717";

// `catalog` dipakai untuk memisahkan render; index array sengaja dipertahankan
// karena modal order mencari paket lewat data-pkg = index.
export const PACKAGES = [
  // Netflix
  { catalog: "netflix", service: "Netflix", duration: "1 Hari", device: "1 profile · 1 user", price: "4", per: "/ 1 hari", icon: "fi-br-film", featured: true },
  { catalog: "netflix", service: "Netflix", duration: "2 Hari", device: "1 profile · 1 user", price: "7", per: "/ 2 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "3 Hari", device: "1 profile · 1 user", price: "9", per: "/ 3 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "5 Hari", device: "1 profile · 1 user", price: "11", per: "/ 5 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "7 Hari", device: "1 profile · 1 user", price: "15", per: "/ 7 hari", icon: "fi-br-film", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "1 profile · 2 user", price: "20", per: "/ bulan", icon: "fi-br-users", featured: true },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "1 device", price: "40", per: "/ bulan", icon: "fi-br-laptop", featured: false },
  { catalog: "netflix", service: "Netflix", duration: "1 Bulan", device: "2 device", price: "45", per: "/ bulan", icon: "fi-br-devices", featured: false },
  // Viu & Video
  { catalog: "viu", group: "VIU", service: "Viu", duration: "1 Bulan", device: "", price: "5", per: "/ bulan", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PLATINUM", service: "Video Platinum", duration: "1 Bulan Sharing", device: "mobile only", price: "18", per: "/ bulan", icon: "fi-br-play" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Minggu", device: "all device", price: "25", per: "/ minggu", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Bulan", device: "mobile only", price: "30", per: "/ bulan", icon: "fi-br-film" },
  { catalog: "viu", group: "VIDEO PRIVATE", service: "Video Private", duration: "1 Bulan", device: "all device", price: "50", per: "/ bulan", icon: "fi-br-laptop" },
];

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
// Dipakai kedua halaman; elemen DOM-nya harus ada sebelum init dipanggil.
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

  document.querySelectorAll(".js-order-wa").forEach((btn) => {
    btn.addEventListener("click", () => open(PACKAGES[Number(btn.dataset.pkg)]));
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

// `index` adalah index di PACKAGES (bukan index hasil filter) supaya data-pkg
// tetap cocok dengan lookup di modal order.
export function cardHtml(pkg, index, variant = "", groupLabel = "") {
  const badge = pkg.featured ? `<span class="card-badge">TERLARIS</span>` : "";
  const group = groupLabel ? `<span class="card-group">${groupLabel}</span>` : "";
  return `
    <article class="card ${pkg.featured ? "card-featured" : ""} ${pkg.device ? "" : "card-no-device"} ${variant}">
      ${badge}
      ${group}
      <div class="card-icon"><i class="fi ${pkg.icon}"></i></div>
      <h3 class="card-duration">${pkg.duration}</h3>
      ${pkg.device ? `<p class="card-device">${pkg.device}</p>` : ""}
      <div class="card-price">Rp ${formatPrice(pkg.price)}</div>
      <p class="card-per">${pkg.per}</p>
      <button type="button" class="btn btn-wa js-order-wa" data-pkg="${index}">Order via WhatsApp</button>
    </article>
  `;
}

// Katalog Viu & Video dikelompokkan per klasifikasi layanan.
export function renderAltCatalog() {
  const root = document.getElementById("viuGroups");
  if (!root) return;
  const groups = [...new Set(PACKAGES.filter((pkg) => pkg.catalog === "viu").map((pkg) => pkg.group))];
  root.innerHTML = groups.map((group) => `
    <section class="catalog-group">
      <h3 class="group-title"><span>${group}</span></h3>
      <div class="catalog-groups">
        ${PACKAGES.map((pkg, index) => ({ pkg, index }))
          .filter(({ pkg }) => pkg.catalog === "viu" && pkg.group === group)
          .map(({ pkg, index }) => cardHtml(pkg, index, "card-alt"))
          .join("")}
      </div>
    </section>
  `).join("");
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
