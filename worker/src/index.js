// Worker notifikasi langganan NetflixArin.
// Cron tiap 10 menit: baca daftar langganan dari KV, kirim pesan Telegram
// untuk yang masa berlakunya sudah habis, lalu tandai agar tidak dikirim dua kali.
// Dashboard admin yang mendorong daftar langganan ke endpoint /sync (dilindungi secret).

const KV_SUBS = "subs";
const KV_NOTIFIED = "notified";
const KV_LASTCRON = "lastCron";
const TZ = "Asia/Jakarta";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDateTime(ms) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(ms));
}

async function readKvJson(env, key, fallback) {
  try {
    const value = await env.NOTIFY_KV.get(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`KV baca ${key} gagal: ${error.message}`);
    return fallback;
  }
}

// TELEGRAM_CHAT_ID bisa berisi lebih dari satu chat dipisah koma — contoh: "111111,222222".
// Semua chat terdaftar menerima notif (misal dua admin yang sama-sama chat bot).
async function tgSend(env, text) {
  const chatIds = String(env.TELEGRAM_CHAT_ID || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!chatIds.length) throw new Error("TELEGRAM_CHAT_ID belum diisi.");
  const errors = [];
  for (const chatId of chatIds) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) errors.push(`${chatId}: ${data.description || `HTTP ${res.status}`}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
}

function expiryMessage(sub) {
  return [
    "🔴 <b>Langganan habis!</b>",
    "",
    `👤 Nama: ${escapeHtml(sub.name)}`,
    `📅 Paket: ${escapeHtml(sub.packageLabel)}`,
    `⏰ Berakhir: ${fmtDateTime(sub.expiresAtMs)}`,
    "",
    "Buka dashboard admin untuk perpanjang atau hapus.",
  ].join("\n");
}

// Bersihkan entri "notified" untuk langganan yang sudah tidak ada di daftar
// (dihapus admin) atau yang baru diperpanjang (expiresAt berganti).
function pruneNotified(notified, subs) {
  const liveKeys = new Set(subs.map((sub) => `${sub.id}:${sub.expiresAtMs}`));
  for (const key of Object.keys(notified)) {
    if (!liveKeys.has(key)) delete notified[key];
  }
  return notified;
}

async function checkExpiries(env) {
  const subs = await readKvJson(env, KV_SUBS, []);
  const notified = await readKvJson(env, KV_NOTIFIED, {});
  const now = Date.now();
  let sent = 0;
  for (const sub of subs) {
    if (!sub?.id || typeof sub.expiresAtMs !== "number") continue;
    const key = `${sub.id}:${sub.expiresAtMs}`;
    if (sub.expiresAtMs > now || notified[key]) continue;
    try {
      await tgSend(env, expiryMessage(sub));
      notified[key] = now;
      sent++;
    } catch (error) {
      // Jangan ditandai — cron berikutnya mencoba lagi sampai berhasil.
      console.error(`Kirim notif ${key} gagal: ${error.message}`);
    }
  }
  // Hemat penulisan KV (limit gratis 1.000 tulis/hari; cron berjalan tiap menit):
  // tulis daftar "notified" hanya bila isinya berubah, dan "lastCron" maksimal sekali per 10 menit.
  const before = JSON.stringify(notified);
  const pruned = pruneNotified(notified, subs);
  if (JSON.stringify(pruned) !== before) await env.NOTIFY_KV.put(KV_NOTIFIED, JSON.stringify(pruned));
  const lastCronRaw = await env.NOTIFY_KV.get(KV_LASTCRON);
  const lastMs = lastCronRaw ? Date.parse(lastCronRaw) || 0 : 0;
  if (!lastCronRaw || sent > 0 || now - lastMs >= 600000) {
    await env.NOTIFY_KV.put(KV_LASTCRON, new Date().toISOString());
  }
  return sent;
}

async function authorize(request, env) {
  const secret = request.headers.get("X-Sync-Secret") || "";
  return Boolean(secret) && secret === env.SYNC_SECRET;
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(checkExpiries(env));
  },

  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    const url = new URL(request.url);
    if (!(await authorize(request, env))) return json({ ok: false, error: "Sync secret salah atau belum diisi." }, 401);

    try {
      if (url.pathname === "/sync" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!Array.isArray(body?.subs)) return json({ ok: false, error: "Body harus { subs: [...] }." }, 400);
        const subs = body.subs
          .filter((sub) => sub && typeof sub.id === "string" && sub.id && typeof sub.expiresAtMs === "number" && sub.expiresAtMs > 0)
          .map((sub) => ({
            id: sub.id.slice(0, 100),
            name: String(sub.name || "Pelanggan").slice(0, 100),
            packageLabel: String(sub.packageLabel || "").slice(0, 100),
            expiresAtMs: sub.expiresAtMs,
          }));
        await env.NOTIFY_KV.put(KV_SUBS, JSON.stringify(subs));
        const notified = pruneNotified(await readKvJson(env, KV_NOTIFIED, {}), subs);
        await env.NOTIFY_KV.put(KV_NOTIFIED, JSON.stringify(notified));
        return json({ ok: true, notified, lastCronAt: (await env.NOTIFY_KV.get(KV_LASTCRON)) || null });
      }

      if (url.pathname === "/status" && request.method === "GET") {
        const subs = await readKvJson(env, KV_SUBS, []);
        const now = Date.now();
        const pending = subs.filter((sub) => typeof sub.expiresAtMs === "number" && sub.expiresAtMs <= now).length;
        let bot = { ok: false, username: null };
        try {
          const me = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`).then((r) => r.json());
          bot = { ok: Boolean(me.ok), username: me.result?.username || null };
        } catch (error) {
          console.error(`getMe gagal: ${error.message}`);
        }
        return json({
          ok: true,
          bot,
          chatIdSet: Boolean(env.TELEGRAM_CHAT_ID),
          lastCronAt: (await env.NOTIFY_KV.get(KV_LASTCRON)) || null,
          subsCount: subs.length,
          expiredCount: pending,
        });
      }

      if (url.pathname === "/test" && request.method === "POST") {
        await tgSend(env, "✅ <b>Test notifikasi</b>\n\nKoneksi dashboard → worker → Telegram berjalan. Saat ada langganan yang habis, pemberitahuannya akan masuk ke chat ini.");
        return json({ ok: true });
      }

      return json({ ok: false, error: "Endpoint tidak dikenal." }, 404);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: error.message || "Kesalahan worker." }, 500);
    }
  },
};
