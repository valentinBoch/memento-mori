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

// Security headers (disable CSP by default to avoid blocking your bundled scripts; configure if needed)
app.use(helmet({ contentSecurityPolicy: false }));

// HTTP request logging (skip during tests)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// Gzip/deflate compression for faster static delivery
app.use(compression());

// On sert le dossier 'dist' qui sera au même niveau que le dossier 'backend'
// C'est la structure finale dans notre container Docker.
const buildPath = path.join(__dirname, "..", "frontend", "dist");

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
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

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

const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});

// Arrêt propre (SIGTERM/SIGINT)
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
