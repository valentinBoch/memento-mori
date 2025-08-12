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

// Middlewares
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

// Security headers (désactive CSP par défaut pour éviter de bloquer les bundles; à configurer si besoin)
app.use(helmet({ contentSecurityPolicy: false }));

// HTTP request logging (skip during tests)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// Gzip/deflate compression
app.use(compression());

// On sert le dossier 'dist' qui sera au même niveau que le dossier 'backend'
const buildPath = path.join(__dirname, "..", "frontend", "dist");

// Cache agressif pour les assets fingerprintés (ex: dist/assets/*)
app.use(
  "/assets",
  express.static(path.join(buildPath, "assets"), {
    maxAge: "1y",
    immutable: true,
    index: false,
    etag: true,
  })
);

// Cache plus court pour le reste du build (sauf index.html)
app.use(
  express.static(buildPath, {
    index: false,
    maxAge: "1h",
    etag: true,
  })
);

// Healthcheck pour orchestrateurs (Docker/K8s)
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 404 JSON par défaut pour les routes API inexistantes
// NB: pas de '/api/*' (casse en path-to-regexp). On utilise un prefix middleware.
app.use(/^\/api(\/|$)/, (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Catch-all SPA (toutes les routes NON /api doivent renvoyer index.html)
// ⚠️ Surtout pas '*' : utiliser une regex qui exclut /api
app.get(/^(?!\/api).*/, (req, res, next) => {
  const indexFile = path.join(buildPath, "index.html");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(indexFile, (err) => {
    if (err) return next(err);
  });
});

// Gestion d'erreurs express
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Écoute + arrêt propre
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
