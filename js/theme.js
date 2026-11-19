// Toggle tema Light & Dark — bisa diklik, digeser (drag), dan dikendalikan keyboard.
// Dipakai oleh landing page (main.js) dan dashboard admin (admin.js).
export function initThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  const knob = toggle?.querySelector(".theme-knob");
  if (!toggle || !knob) return;

  const root = document.documentElement;
  const PAD = 3; // jarak knob dari ujung track
  const getTheme = () => (root.dataset.theme === "light" ? "light" : "dark");
  const maxX = () => Math.max(PAD, toggle.clientWidth - knob.offsetWidth - PAD);
  const midpoint = () => (PAD + maxX()) / 2;
  const themeAt = (x) => (x > midpoint() ? "dark" : "light");

  // Ganti tema (ikon, warna halaman, storage) — posisi knob diatur terpisah agar drag tetap mengikuti jari
  const setTheme = (theme) => {
    if (theme === getTheme()) return;
    root.dataset.theme = theme;
    toggle.dataset.theme = theme;
    toggle.setAttribute("aria-checked", String(theme === "light"));
    try { localStorage.setItem("theme", theme); } catch (e) { /* storage bisa diblokir */ }
  };

  const apply = (theme) => {
    setTheme(theme);
    knob.style.transition = "";
    knob.style.transform = `translateX(${theme === "light" ? PAD : maxX()}px)`;
  };

  const setKnob = (x, smooth) => {
    knob.style.transition = smooth ? "" : "none";
    knob.style.transform = `translateX(${x}px)`;
  };

  let dragging = false, startX = 0, baseX = 0, moved = false;

  toggle.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    baseX = getTheme() === "light" ? PAD : maxX();
    toggle.classList.add("dragging");
    toggle.setPointerCapture(e.pointerId);
  });

  toggle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    const x = Math.min(maxX(), Math.max(PAD, baseX + dx));
    setKnob(x, false);
    // Tema langsung berubah begitu knob melewati titik tengah track
    setTheme(themeAt(x));
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    toggle.classList.remove("dragging");
    if (moved) {
      // Tema sudah berubah live saat drag; knob tinggal beredar ke sisi temanya
      apply(getTheme());
    } else {
      apply(getTheme() === "light" ? "dark" : "light");
    }
  };

  toggle.addEventListener("pointerup", endDrag);
  toggle.addEventListener("pointercancel", () => {
    dragging = false;
    toggle.classList.remove("dragging");
    apply(getTheme());
  });

  toggle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      apply("light");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      apply("dark");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      apply(getTheme() === "light" ? "dark" : "light");
    }
  });

  apply(getTheme());
}
