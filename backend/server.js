// backend/server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");

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
