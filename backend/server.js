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

const app = express();

// ---------- Base middlewares ----------
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors()); // same-origin conseillé côté front (URLs relatives)
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

// ---------- Persistence (Option B: dossier monté) ----------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const SUBS_FILE =
  process.env.SUBS_PATH || path.join(DATA_DIR, "subscriptions.json");

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

// ---------- Healthcheck ----------
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// ---------- API: Web Push ----------
app.get("/api/push/public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/api/push/subscribe", (req, res) => {
  const subscription = req.body?.subscription || req.body;
  const timezone = req.body?.timezone || null;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid subscription" });
  }
  upsertSubscription({
    endpoint: subscription.endpoint,
    subscription,
    timezone,
    createdAt: new Date().toISOString(),
  });
  return res.status(201).json({ ok: true });
});

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
    customLifeExpectancy: Number.isFinite(parseInt(customLifeExpectancy, 10))
      ? parseInt(customLifeExpectancy, 10)
      : list[idx].prefs?.customLifeExpectancy || 80,
  };
  if (typeof timezone === "string") list[idx].timezone = timezone;
  writeSubscriptions(list);
  return res.json({ ok: true });
});

app.delete("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  removeSubscription(endpoint);
  return res.json({ ok: true });
});

app.post("/api/push/test", async (_req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(400).json({ error: "VAPID keys not configured" });
  }
  const list = readSubscriptions();
  if (!list.length)
    return res.status(404).json({ error: "No subscription found" });

  const payload = JSON.stringify({
    title: "Memento Mori",
    body: "Ceci est une notification de test 🚀",
    url: "/",
  });

  let sent = 0;
  for (const s of list) {
    try {
      await webPush.sendNotification(s.subscription, payload);
      sent++;
    } catch (e) {
      const code = e?.statusCode || e?.code;
      console.warn("Send failed, removing subscription:", code);
      removeSubscription(s.endpoint);
    }
  }
  return res.json({ ok: true, sent });
});

// ---------- API 404 guard (avant le statique) ----------
app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not Found" });
  }
  next();
});

// ---------- Static frontend (Vite build) ----------
const buildPath = path.join(__dirname, "..", "frontend", "dist");
const assetsPath = path.join(buildPath, "assets");

// /assets -> cache long
app.use(
  "/assets",
  express.static(assetsPath, {
    maxAge: "1y",
    immutable: true,
    index: false,
    etag: true,
  })
);

// reste du build -> cache court
app.use(
  express.static(buildPath, {
    index: false,
    maxAge: "1h",
    etag: true,
  })
);

// Fallback SPA: servir index.html pour toute requête GET non-API qui accepte du HTML
app.use((req, res, next) => {
  const isGet = req.method === "GET";
  const isApi = req.path && req.path.startsWith("/api/");
  const acceptsHtml = req.headers?.accept?.includes("text/html");
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

// ---------- Start ----------
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
// ---------- Scheduler: envoi quotidien à 09:00 local par abonnement ----------
/**
 * Règle de fonctionnement :
 * - Le job s’exécute chaque minute.
 * - Pour chaque subscription, on calcule l’heure locale (son fuseau s.timezone, défaut "Europe/Paris").
 * - Si c’est 09:00 et qu’on n’a pas encore envoyé aujourd’hui (s.lastSentDate !== "JJ/MM/AAAA"), on envoie.
 * - On mémorise la date du dernier envoi dans le fichier de persistance.
 */
cron.schedule("* * * * *", async () => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return; // pas de clés -> pas d’envoi

    const list = readSubscriptions();
    if (!list.length) return;

    const nowUtc = new Date();
    let updated = false;

    for (const s of list) {
      const tz = s.timezone || "Europe/Paris";

      // Chaine du style "19/08/2025, 09:00:00"
      const localStr = nowUtc.toLocaleString("fr-FR", {
        timeZone: tz,
        hour12: false,
      });
      const [datePart, timePart] = localStr.split(", ");
      const [hh, mm] = timePart.split(":");

      // Clé de jour locale (JJ/MM/AAAA)
      const todayKey = datePart;

      // Envoi à 09:00 uniquement si pas encore envoyé pour ce "jour local"
      if (hh === "09" && mm === "00" && s.lastSentDate !== todayKey) {
        const payload = JSON.stringify({
          title: "Memento Mori",
          body: "Rappelle-toi. Chaque jour compte.",
          url: "/",
        });

        try {
          await webPush.sendNotification(s.subscription, payload);
          s.lastSentDate = todayKey;
          updated = true;
        } catch (err) {
          // Si l’abonnement est invalide (410 Gone, etc.) on le supprime
          console.warn(
            "Push send failed, removing subscription:",
            err?.statusCode || err?.code
          );
          const idx = list.findIndex((x) => x.endpoint === s.endpoint);
          if (idx >= 0) {
            list.splice(idx, 1);
            updated = true;
          }
        }
      }
    }

    if (updated) writeSubscriptions(list);
  } catch (e) {
    console.error("cron error:", e);
  }
});
app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`📁 Subscriptions file: ${SUBS_FILE}`);
});
