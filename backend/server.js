// backend/server.js
require('dotenv').config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const webPush = require("web-push");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Hardening de base
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Middlewares généraux
app.use(cors());
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));
if (process.env.NODE_ENV !== "test") app.use(morgan("combined"));
app.use(compression());

// ---------- Web Push setup ----------
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[web-push] VAPID keys missing. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push sending.");
}

const DATA_DIR = path.join(__dirname);
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");

function readSubscriptions() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    const buf = fs.readFileSync(SUBS_FILE, "utf8");
    return JSON.parse(buf);
  } catch (e) {
    console.error("Failed to read subscriptions:", e);
    return [];
  }
}
function writeSubscriptions(list) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Failed to write subscriptions:", e);
  }
}

function upsertSubscription(sub) {
  const list = readSubscriptions();
  const idx = list.findIndex((x) => x.endpoint === sub.endpoint);
  if (idx >= 0) list[idx] = { ...list[idx], ...sub };
  else list.push(sub);
  writeSubscriptions(list);
  return sub;
}
function removeSubscription(endpoint) {
  const list = readSubscriptions();
  const next = list.filter((x) => x.endpoint !== endpoint);
  writeSubscriptions(next);
}

// ---------- Domain helpers ----------
const DEFAULT_LIFE_EXPECTANCY = { homme: 80, femme: 85 };
function safeInt(n, def) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : def;
}
function yearsBetween(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const birth = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  const diffMs = now - birth;
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  return diffMs / yearMs;
}
function computeLifePercentageRemaining({ dob, gender, customLifeExpectancy }) {
  const livedYears = yearsBetween(dob);
  if (livedYears == null) return null;
  let expectancy = DEFAULT_LIFE_EXPECTANCY.homme;
  if (gender === 'femme') expectancy = DEFAULT_LIFE_EXPECTANCY.femme;
  if (gender === 'custom') expectancy = safeInt(customLifeExpectancy, DEFAULT_LIFE_EXPECTANCY.homme);
  expectancy = Math.max(1, Math.min(120, expectancy));
  const remaining = Math.max(0, expectancy - livedYears);
  const pct = Math.max(0, Math.min(100, (remaining / expectancy) * 100));
  return Math.round(pct * 10) / 10; // one decimal
}

const QUOTES = [
  "Chaque jour compte.",
  "Fais aujourd'hui ce que les autres ne veulent pas, tu vivras demain comme les autres ne peuvent pas.",
  "La constance bat le talent.",
  "Petits pas, grands effets.",
  "Décide, puis avance.",
  "Tu es plus près que tu ne le crois.",
  "Le meilleur moment, c'est maintenant.",
];
function pickQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

// Paths
const buildPath = path.join(__dirname, "..", "frontend", "dist");
const assetsPath = path.join(buildPath, "assets");

// Statique: assets fingerprintés (cache long)
app.use(
  "/assets",
  express.static(assetsPath, {
    maxAge: "1y",
    immutable: true,
    index: false,
    etag: true,
  })
);

// Statique: reste du build (cache court)
app.use(
  express.static(buildPath, {
    index: false,
    maxAge: "1h",
    etag: true,
  })
);

// Healthcheck
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });

// Accept any method (incl. OPTIONS) for CORS/preflight robustness
app.all('/api/push/prefs', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});
});

// Send a personalized notification immediately (for verification)
app.post('/api/push/now', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    const list = readSubscriptions();
    const targets = endpoint ? list.filter((s) => s.endpoint === endpoint) : list;
    if (!targets.length) return res.status(404).json({ error: 'No subscription found' });
    let sent = 0;
    for (const s of targets) {
      const pct = s.prefs ? computeLifePercentageRemaining(s.prefs) : null;
      const quote = pickQuote();
      const body = (pct != null)
        ? `Vie restante: ${pct}% — ${quote}`
        : `Rappelle-toi: ${quote}`;
      const payload = JSON.stringify({ title: 'Memento Mori', body, url: '/' });
      try {
        await webPush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e) {
        console.warn('push/now failed:', e?.statusCode);
      }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    console.error('/api/push/now error:', e);
    return res.status(500).json({ error: 'Internal' });
  }
});

// Compatibility: also allow POST for prefs update
app.post('/api/push/prefs', async (req, res) => {
  try {
    const { endpoint, dob, gender, customLifeExpectancy, timezone } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    const list = readSubscriptions();
    const idx = list.findIndex((x) => x.endpoint === endpoint);
    if (idx < 0) return res.status(404).json({ error: 'subscription not found' });
    list[idx].prefs = {
      dob: typeof dob === 'string' ? dob : (list[idx].prefs?.dob || null),
      gender: ['homme','femme','custom'].includes(gender) ? gender : (list[idx].prefs?.gender || 'homme'),
      customLifeExpectancy: safeInt(customLifeExpectancy, list[idx].prefs?.customLifeExpectancy || DEFAULT_LIFE_EXPECTANCY.homme),
    };
    if (typeof timezone === 'string') list[idx].timezone = timezone;
    writeSubscriptions(list);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('POST /api/push/prefs error:', e);
    return res.status(500).json({ error: 'Internal' });
  }
});

app.get('/api/push/now', async (req, res) => {
  try {
    const endpoint = req.query.endpoint;
    const list = readSubscriptions();
    const targets = endpoint ? list.filter((s) => s.endpoint === endpoint) : list;
    if (!targets.length) return res.status(404).json({ error: 'No subscription found' });
    let sent = 0;
    for (const s of targets) {
      const pct = s.prefs ? computeLifePercentageRemaining(s.prefs) : null;
      const quote = pickQuote();
      const body = (pct != null)
        ? `Vie restante: ${pct}% — ${quote}`
        : `Rappelle-toi: ${quote}`;
      const payload = JSON.stringify({ title: 'Memento Mori', body, url: '/' });
      try {
        await webPush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e) {
        console.warn('push/now failed:', e?.statusCode);
      }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    console.error('GET /api/push/now error:', e);
    return res.status(500).json({ error: 'Internal' });
  }
});

// ---------- Push API ----------
// Subscribe
app.post("/api/push/subscribe", async (req, res) => {
  try {
    const { subscription, timezone, user } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription" });
    }
    const doc = {
      endpoint: subscription.endpoint,
      subscription,
      timezone: typeof timezone === "string" ? timezone : null,
      user: user || null,
      createdAt: new Date().toISOString(),
      lastSentDate: null, // track last date we sent at 09:00 in user's TZ
    };
    upsertSubscription(doc);
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error("/api/push/subscribe error:", e);
    return res.status(500).json({ error: "Internal" });
  }
});

// Update user preferences attached to a subscription
app.put('/api/push/prefs', async (req, res) => {
  try {
    const { endpoint, dob, gender, customLifeExpectancy, timezone } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    const list = readSubscriptions();
    const idx = list.findIndex((x) => x.endpoint === endpoint);
    if (idx < 0) return res.status(404).json({ error: 'subscription not found' });
    list[idx].prefs = {
      dob: typeof dob === 'string' ? dob : (list[idx].prefs?.dob || null),
      gender: ['homme','femme','custom'].includes(gender) ? gender : (list[idx].prefs?.gender || 'homme'),
      customLifeExpectancy: safeInt(customLifeExpectancy, list[idx].prefs?.customLifeExpectancy || DEFAULT_LIFE_EXPECTANCY.homme),
    };
    if (typeof timezone === 'string') list[idx].timezone = timezone;
    writeSubscriptions(list);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('/api/push/prefs error:', e);
    return res.status(500).json({ error: 'Internal' });
  }
});

// Unsubscribe
app.delete("/api/push/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    removeSubscription(endpoint);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("/api/push/unsubscribe error:", e);
    return res.status(500).json({ error: "Internal" });
  }
});

// Send a test notification
app.post("/api/push/test", async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
      return res.status(400).json({ error: "VAPID keys not configured" });

    const { endpoint, title, body, url } = req.body || {};
    const list = readSubscriptions();
    const targets = endpoint ? list.filter((s) => s.endpoint === endpoint) : list;
    if (targets.length === 0) return res.status(404).json({ error: "No subscription found" });

    let sent = 0;
    for (const s of targets) {
      // If caller did not provide body/title, compute a personalized one
      const computedPct = s.prefs ? computeLifePercentageRemaining(s.prefs) : null;
      const computedQuote = pickQuote();
      const finalTitle = title || "Memento Mori";
      const finalBody = body || (computedPct != null
        ? `Vie restante: ${computedPct}% — ${computedQuote}`
        : `Rappelle-toi: ${computedQuote}`);
      const finalUrl = url || "/";
      const payload = JSON.stringify({ title: finalTitle, body: finalBody, url: finalUrl });
      try {
        await webPush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e) {
        console.warn('/api/push/test send failed:', e?.statusCode);
      }
    }
    return res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error("/api/push/test error:", e);
    return res.status(500).json({ error: "Internal" });
  }
});

// ---------- IMPORTANT ----------
// À partir d’ici, on n’utilise PLUS AUCUN pattern de route.
// On gère tout via des middlewares sans chemin + conditions sur req.path.

// 404 JSON pour toutes routes /api non gérées en amont
app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not Found" });
  }
  return next();
});

// Fallback SPA : servir index.html pour les requêtes GET non-API qui acceptent du HTML
app.use((req, res, next) => {
  // On cible les GET non-API, et on vérifie l'en-tête Accept pour éviter d’interférer avec des appels XHR
  const isGet = req.method === "GET";
  const isApi = req.path && req.path.startsWith("/api");
  const acceptsHtml =
    req.headers.accept && req.headers.accept.includes("text/html");

  if (isGet && !isApi && acceptsHtml) {
    const indexFile = path.join(buildPath, "index.html");
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(indexFile, (err) => (err ? next(err) : undefined));
  }
  return next();
});

// Dernière barrière: 404 générique pour tout le reste
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Gestion d'erreurs express
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ---------- Scheduler (MVP placeholder) ----------
// Every minute: if user's local time is 09:00 and not already sent today, send notification
cron.schedule("* * * * *", async () => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    const list = readSubscriptions();
    const nowUtc = new Date();
    const updates = [];
    for (const s of list) {
      const tz = s.timezone || "Europe/Paris";
      const localStr = nowUtc.toLocaleString("en-GB", { timeZone: tz, hour12: false });
      // format is like "19/08/2025, 10:15:00"
      const [datePart, timePart] = localStr.split(", ");
      const [hh, mm] = timePart.split(":");
      const todayKey = `${datePart}`; // per-TZ day key
      if (hh === "09" && mm === "00" && s.lastSentDate !== todayKey) {
        // Build personalized content
        const pct = s.prefs ? computeLifePercentageRemaining(s.prefs) : null;
        const quote = pickQuote();
        const body = (pct != null)
          ? `Vie restante: ${pct}% — ${quote}`
          : `Rappelle-toi: ${quote}`;
        const payload = JSON.stringify({
          title: "Memento Mori",
          body,
          url: "/",
        });
        try {
          await webPush.sendNotification(s.subscription, payload);
          s.lastSentDate = todayKey;
          updates.push(true);
        } catch (err) {
          console.warn("Push send failed, removing subscription:", err?.statusCode);
        }
      }
    }
    if (updates.length) writeSubscriptions(list);
  } catch (e) {
    console.error("cron error:", e);
  }
});

// Démarrage + arrêt propre
const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down...`);
  server.close((err) => {
    if (err) {
      console.error("Error during server shutdown:", err);
      process.exit(1);
    }
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
