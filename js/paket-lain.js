import { initThemeToggle } from "./theme.js";
import { renderAltCatalog, initOrderModal } from "./catalog.js";

function initNavbar() {
  const navbar = document.getElementById("navbar");
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll);
  onScroll();
}

function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    links.classList.toggle("open");
    toggle.setAttribute("aria-label", links.classList.contains("open") ? "Tutup menu" : "Buka menu");
  });
  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("open"));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initNavbar();
  initMobileNav();
  renderAltCatalog("viu", "viuGroups");
  renderAltCatalog("disney", "disneyGroups");
  initOrderModal();
  document.getElementById("year").textContent = new Date().getFullYear();
});
