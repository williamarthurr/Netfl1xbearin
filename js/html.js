// Escape untuk teks sekaligus nilai atribut. Kutip ikut di-escape supaya nilai
// tidak bisa keluar dari alt="..." atau data-*="..." (stored XSS).
const REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => REPLACEMENTS[char]);
}
