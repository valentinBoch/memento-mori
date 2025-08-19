// backend/server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===============================
//  CONFIG VAPID
// ===============================
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  console.warn("[WARN] Clés VAPID manquantes. Push désactivé.");
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:example@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ===============================
//  CONFIG FICHIERS / PERSISTANCE
// ===============================
// Dossier persistant, monté depuis l’hôte avec -v /home/ubuntu/memento/data:/data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const SUBS_FILE =
  process.env.SUBS_PATH || path.join(DATA_DIR, "subscriptions.json");

// Charger les abonnements
let subscriptions = [];
try {
  if (fs.existsSync(SUBS_FILE)) {
    const raw = fs.readFileSync(SUBS_FILE);
    subscriptions = JSON.parse(raw.toString());
  }
} catch (e) {
  console.error("[ERROR] Impossible de lire subscriptions.json :", e);
  subscriptions = [];
}

// Sauvegarde des abonnements
function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
  } catch (e) {
    console.error("[ERROR] Impossible d’écrire subscriptions.json :", e);
  }
}

// ===============================
//  ROUTES API
// ===============================
app.get("/api/push/public-key", (req, res) => {
  if (!vapidKeys.publicKey) {
    return res.status(500).json({ error: "VAPID public key missing" });
  }
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", (req, res) => {
  const { subscription, timezone } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid subscription" });
  }

  // Vérifie si déjà existant
  const exists = subscriptions.find(
    (s) => s.endpoint === subscription.endpoint
  );
  if (!exists) {
    subscriptions.push({ ...subscription, timezone: timezone || null });
    saveSubscriptions();
    console.log("[API] New subscription added:", subscription.endpoint);
  } else {
    console.log(
      "[API] Subscription already exists, updated:",
      subscription.endpoint
    );
  }

  res.status(201).json({ ok: true });
});

app.put("/api/push/prefs", (req, res) => {
  const { endpoint, dob, gender, customLifeExpectancy, timezone } = req.body;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

  const sub = subscriptions.find((s) => s.endpoint === endpoint);
  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  sub.prefs = { dob, gender, customLifeExpectancy, timezone };
  saveSubscriptions();
  res.json({ ok: true });
});

app.post("/api/push/test", async (req, res) => {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    return res.status(500).json({ error: "Push not configured" });
  }
  const payload = JSON.stringify({
    title: "Memento Mori",
    body: "Ceci est une notification de test 🚀",
    url: "/",
  });

  let success = 0,
    fail = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
      } catch (err) {
        console.warn("[WARN] Suppression abonnement invalide:", sub.endpoint);
        fail++;
        subscriptions = subscriptions.filter(
          (s) => s.endpoint !== sub.endpoint
        );
        saveSubscriptions();
      }
    })
  );
  res.json({ ok: true, success, fail });
});

// ===============================
//  SERVER
// ===============================
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`📁 Using subscriptions file: ${SUBS_FILE}`);
});
