// backend/server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const webPush = require("web-push");
const cron = require("node-cron");

const app = express();

// ---------- Middlewares ----------
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet({ contentSecurityPolicy: false }));
if (process.env.NODE_ENV !== "test") app.use(morgan("combined"));
app.use(compression());

// ---------- VAPID ----------
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:example@example.com";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("VAPID configured ✅");
} else {
  console.warn("[web-push] VAPID keys missing. Push sending will fail.");
}

// ---------- Persistance (Option B : dossier monté) ----------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn(
    "⚠️ Impossible de créer DATA_DIR, on compte sur le volume monté :",
    DATA_DIR
  );
}
const SUBS_FILE =
  process.env.SUBS_PATH || path.join(DATA_DIR, "subscriptions.json");

// Lecture/écriture synchrone (simple et robuste ici)
function readSubscriptions() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8") || "[]");
  } catch (e) {
    console.error("Failed to read subscriptions.json:", e);
    return [];
  }
}
function writeSubscriptions(list) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Failed to write subscriptions.json:", e);
  }
}
function upsertSubscription(doc) {
  const list = readSubscriptions();
  const idx = list.findIndex((s) => s.endpoint === doc.endpoint);
  if (idx >= 0) list[idx] = { ...list[idx], ...doc };
  else list.push(doc);
  writeSubscriptions(list);
}
function removeSubscription(endpoint) {
  const list = readSubscriptions();
  writeSubscriptions(list.filter((s) => s.endpoint !== endpoint));
}

// ---------- Helpers domaine (pourcentage de vie, citations) ----------
const DEFAULT_LIFE_EXPECTANCY = { homme: 80, femme: 85 };
function safeInt(n, def) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : def;
}
function yearsBetween(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob)
    .split("-")
    .map((x) => parseInt(x, 10));
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
  if (gender === "femme") expectancy = DEFAULT_LIFE_EXPECTANCY.femme;
  if (gender === "custom")
    expectancy = safeInt(customLifeExpectancy, DEFAULT_LIFE_EXPECTANCY.homme);
  expectancy = Math.max(1, Math.min(120, expectancy));
  const remaining = Math.max(0, expectancy - livedYears);
  const pct = Math.max(0, Math.min(100, (remaining / expectancy) * 100));
  return Math.round(pct * 10) / 10; // une décimale
}
const QUOTES = [
  "Chaque jour compte.",
  "La constance bat le talent.",
  "Petits pas, grands effets.",
  "Décide, puis avance.",
  "Le meilleur moment, c'est maintenant.",
  "Tu es plus près que tu ne le crois.",
];
function pickQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function buildPersonalizedPayload(sub) {
  const pct = sub.prefs ? computeLifePercentageRemaining(sub.prefs) : null;
  const quote = pickQuote();
  const body =
    pct != null ? `Vie restante: ${pct}% — ${quote}` : `Rappelle-toi: ${quote}`;
  return JSON.stringify({ title: "Memento Mori", body, url: "/" });
}

// ---------- Logging des notifications envoyées ----------
function logNotification(endpoint, payload, source = "unknown") {
  try {
    const logPath = path.join(DATA_DIR, "notifications.log");
    const shortEndpoint =
      (endpoint || "").slice(0, 60) +
      (endpoint && endpoint.length > 60 ? "…" : "");
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = { raw: String(payload) };
    }
    const entry = {
      ts: new Date().toISOString(),
      endpoint: shortEndpoint,
      source, // "test", "now", "cron"
      payload: parsed,
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("⚠️ Failed to log notification:", e);
  }
}

// ---------- Healthcheck ----------
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// ---------- API Push ----------
app.get("/api/push/public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || "" });
});

// Subscribe (POST JSON: { subscription, timezone, user? })
app.post("/api/push/subscribe", (req, res) => {
  const { subscription, timezone, user } = req.body || {};
  const sub = subscription || req.body; // compat "brute" si on envoie directement l'objet subscription
  if (!sub || !sub.endpoint)
    return res.status(400).json({ error: "Invalid subscription" });

  upsertSubscription({
    endpoint: sub.endpoint,
    subscription: sub,
    timezone: typeof timezone === "string" ? timezone : null,
    user: user || null,
    prefs: {}, // sera rempli via /api/push/prefs
    createdAt: new Date().toISOString(),
    lastSentDate: null, // clé jour "fr-FR" (JJ/MM/AAAA) pour dédup
  });

  return res.status(201).json({ ok: true });
});

// Update prefs (PUT JSON: { endpoint, dob, gender, customLifeExpectancy, timezone? })
app.put("/api/push/prefs", (req, res) => {
  const { endpoint, dob, gender, customLifeExpectancy, timezone } =
    req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });

  const list = readSubscriptions();
  const idx = list.findIndex((s) => s.endpoint === endpoint);
  if (idx < 0) return res.status(404).json({ error: "subscription not found" });

  list[idx].prefs = {
    dob: typeof dob === "string" ? dob : list[idx].prefs?.dob || null,
    gender: ["homme", "femme", "custom"].includes(gender)
      ? gender
      : list[idx].prefs?.gender || "homme",
    customLifeExpectancy: safeInt(
      customLifeExpectancy,
      list[idx].prefs?.customLifeExpectancy || DEFAULT_LIFE_EXPECTANCY.homme
    ),
  };
  if (typeof timezone === "string") list[idx].timezone = timezone;

  writeSubscriptions(list);
  return res.json({ ok: true });
});

// Compat: POST /api/push/prefs -> redirige vers PUT handler
app.post("/api/push/prefs", (req, res) => {
  req.method = "PUT";
  return app._router.handle(req, res);
});

// Unsubscribe
app.delete("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  removeSubscription(endpoint);
  return res.json({ ok: true });
});

// Test (all or targeted). Body: { endpoint?, title?, body?, url? }
app.post("/api/push/test", async (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(400).json({ error: "VAPID keys not configured" });
  }
  const { endpoint, title, body, url } = req.body || {};
  const list = readSubscriptions();
  const targets = endpoint ? list.filter((s) => s.endpoint === endpoint) : list;
  if (!targets.length)
    return res.status(404).json({ error: "No subscription found" });

  let sent = 0;
  for (const s of targets) {
    const payload =
      title || body || url
        ? JSON.stringify({
            title: title || "Memento Mori",
            body: body || "Test",
            url: url || "/",
          })
        : buildPersonalizedPayload(s);
    try {
      await webPush.sendNotification(s.subscription, payload);
      logNotification(s.endpoint, payload, "test");
      sent++;
    } catch (e) {
      console.warn(
        "test send failed -> removing sub:",
        e?.statusCode || e?.code
      );
      removeSubscription(s.endpoint);
    }
  }
  return res.json({ ok: true, sent });
});

// Send now (immediate, personalized). GET ?endpoint=... or POST { endpoint }
app.get("/api/push/now", async (req, res) => {
  try {
    const endpoint = req.query.endpoint;
    const list = readSubscriptions();
    const targets = endpoint
      ? list.filter((s) => s.endpoint === endpoint)
      : list;
    if (!targets.length)
      return res.status(404).json({ error: "No subscription found" });

    let sent = 0;
    for (const s of targets) {
      const payload = buildPersonalizedPayload(s);
      try {
        await webPush.sendNotification(s.subscription, payload);
        logNotification(s.endpoint, payload, "now");
        sent++;
      } catch (e) {
        console.warn(
          "push/now failed -> removing sub:",
          e?.statusCode || e?.code
        );
        removeSubscription(s.endpoint);
      }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    console.error("/api/push/now error:", e);
    return res.status(500).json({ error: "Internal" });
  }
});
app.post("/api/push/now", async (req, res) => {
  req.query = req.query || {};
  if (req.body?.endpoint) req.query.endpoint = req.body.endpoint;
  return app._router.handle(req, res);
});

// ---------- API 404 guard ----------
app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not Found" });
  }
  next();
});

// ---------- Statique frontend (Vite build) ----------
const buildPath = path.join(__dirname, "..", "frontend", "dist");
const assetsPath = path.join(buildPath, "assets");

app.use(
  "/assets",
  express.static(assetsPath, {
    maxAge: "1y",
    immutable: true,
    index: false,
    etag: true,
  })
);
app.use(
  express.static(buildPath, {
    index: false,
    maxAge: "1h",
    etag: true,
  })
);

// Fallback SPA : index.html pour toute requête GET non-API qui accepte du HTML
app.use((req, res, next) => {
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

// Dernière barrière
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

// ---------- Error handler ----------
/* eslint-disable no-unused-vars */
app.use((err, _req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error" });
});
/* eslint-enable no-unused-vars */

// ---------- Scheduler (09:00 locales par abonné, 1 fois/jour) ----------
/**
 * - Tâche chaque minute.
 * - Pour chaque abonné : on calcule son heure locale (tz stockée, défaut Europe/Paris).
 * - Si 09:00 et pas encore envoyé aujourd'hui (clé "fr-FR" JJ/MM/AAAA) -> envoi.
 */
cron.schedule("* * * * *", async () => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    const list = readSubscriptions();
    if (!list.length) return;

    const nowUtc = new Date();
    let changed = false;

    for (const s of list) {
      const tz = s.timezone || "Europe/Paris";
      const datePart = nowUtc.toLocaleDateString("fr-FR", { timeZone: tz }); // "19/08/2025"
      const timePart = nowUtc.toLocaleTimeString("fr-FR", {
        timeZone: tz,
        hour12: false,
      }); // "09:00:00"
      const [hh, mm] = timePart.split(":");
      const todayKey = datePart;

      if (hh === "09" && mm === "00" && s.lastSentDate !== todayKey) {
        try {
          const payload = buildPersonalizedPayload(s);
          await webPush.sendNotification(s.subscription, payload);
          logNotification(s.endpoint, payload, "cron");
          s.lastSentDate = todayKey;
          changed = true;
        } catch (err) {
          console.warn(
            "cron send failed -> removing sub:",
            err?.statusCode || err?.code
          );
          const idx = list.findIndex((x) => x.endpoint === s.endpoint);
          if (idx >= 0) {
            list.splice(idx, 1);
            changed = true;
          }
        }
      }
    }
    if (changed) writeSubscriptions(list);
  } catch (e) {
    console.error("cron error:", e);
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`📁 Subscriptions file: ${SUBS_FILE}`);
  console.log(`📂 Data dir: ${DATA_DIR}`);
});
