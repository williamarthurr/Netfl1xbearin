// Matematika tanggal yang dipakai dashboard admin. Fungsi murni supaya bisa
// dites dengan `node --test` tanpa browser dan tanpa dependency.

export const DAY_MS = 86400000;

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Perpanjangan mulai dari titik paling akhir antara sekarang dan expiry lama.
// Langganan yang sudah habis tidak "memakan" hari yang baru dibayar.
export function renewExpiry(nowMs, expiresAtMs, days) {
  return Math.max(Number(nowMs) || 0, Number(expiresAtMs) || 0) + Number(days) * DAY_MS;
}

// Saat langganan dihentikan, waktunya berhenti. Saat dilanjutkan, durasi selama
// berhenti ditambahkan kembali ke expiry.
export function resumeExpiry(expiresAtMs, stoppedAtMs, nowMs) {
  const now = Number(nowMs) || 0;
  const base = Number(expiresAtMs) || now;
  const paused = stoppedAtMs ? Math.max(0, now - Number(stoppedAtMs)) : 0;
  return base + paused;
}

// Tanggal lokal (bukan UTC) supaya sama dengan nilai input type="date".
export function todayLocal(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
