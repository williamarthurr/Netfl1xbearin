// Konfigurasi nomor WhatsApp — ganti dengan nomor reseller (format internasional tanpa +)
const WA_NUMBER = "6287782164717";

// Katalog paket
const PACKAGES = [
  { duration: "1 Hari", device: "1 profile · 1 user", price: "4", per: "/ 1 hari", icon: "fi-br-film", featured: false },
  { duration: "3 Hari", device: "1 profile · 1 user", price: "9", per: "/ 3 hari", icon: "fi-br-film", featured: false },
  { duration: "5 Hari", device: "1 profile · 1 user", price: "11", per: "/ 5 hari", icon: "fi-br-film", featured: false },
  { duration: "7 Hari", device: "1 profile · 1 user", price: "15", per: "/ 7 hari", icon: "fi-br-film", featured: false },
  { duration: "1 Bulan", device: "1 device", price: "40", per: "/ bulan", icon: "fi-br-laptop", featured: true },
  { duration: "1 Bulan", device: "2 device", price: "45", per: "/ bulan", icon: "fi-br-devices", featured: false },
];

// Format harga jadi "4k" style
function formatPrice(price) {
  return `${price}k`;
}

function waLink(pkg) {
  const text = encodeURIComponent(
    `Halo Kak, saya mau order *NETFL1X PREMIUM SHARING*\n\n` +
    `• Paket: ${pkg.duration}\n` +
    `• Device: ${pkg.device}\n` +
    `• Harga: Rp ${pkg.price}.000\n\n` +
    `Mohon info cara pembayarannya ya. Terima kasih!`
  );
  return `https://wa.me/${WA_NUMBER}?text=${text}`;
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = PACKAGES.map((pkg) => {
    const badge = pkg.featured ? `<span class="card-badge">TERLARIS</span>` : "";
    return `
      <article class="card ${pkg.featured ? "card-featured" : ""}">
        ${badge}
        <div class="card-icon"><i class="fi ${pkg.icon}"></i></div>
        <h3 class="card-duration">${pkg.duration}</h3>
        <p class="card-device">${pkg.device}</p>
        <div class="card-price">${formatPrice(pkg.price)} <small>Rp ${pkg.price}.000</small></div>
        <p class="card-per">${pkg.per}</p>
        <a href="${waLink(pkg)}" target="_blank" rel="noopener" class="btn btn-wa">Order via WhatsApp</a>
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

// Lightbox testimoni
function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  const close = document.getElementById("lightboxClose");

  document.querySelectorAll(".testimoni-card").forEach((card) => {
    card.addEventListener("click", () => {
      img.src = card.dataset.src;
      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    });
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
function initLazyImages() {
  const images = document.querySelectorAll(".testimoni-card img");

  const onLoad = (img) => {
    const card = img.closest(".testimoni-card");
    if (card) card.classList.add("loaded");
  };

  images.forEach((img) => {
    img.addEventListener("load", () => onLoad(img), { once: true });
    img.addEventListener("error", () => {
      // kalau gagal dimuat, tetap sembunyikan skeleton agar layout tidak kosong
      const card = img.closest(".testimoni-card");
      if (card) card.classList.add("loaded");
    }, { once: true });
    // jika sudah termuat (dari cache), langsung tandai
    if (img.complete && img.naturalWidth > 0) onLoad(img);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderCatalog();
  initGenericOrder();
  initFaq();
  initNavbar();
  initMobileNav();
  initYear();
  initLightbox();
  initLazyImages();
});
