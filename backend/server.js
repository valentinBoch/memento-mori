// backend/server.js
const express = require("express");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

// Sécurité HTTP
app.use(
  helmet({
    contentSecurityPolicy: false, // désactivé si tu sers React en statique
  })
);

// Compression gzip/brotli
app.use(compression());

// Logs HTTP
app.use(morgan("combined"));

// Middleware JSON
app.use(express.json());

// Servir le frontend buildé
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// --- Routes API ---
// Exemple: GET /api/hello
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from API!" });
});

// Catch-all pour API inexistantes (compatible path-to-regexp v6+)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Catch-all pour le frontend (React Router)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// Lancement serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
