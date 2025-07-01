// backend/server.js
const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// On sert le dossier 'dist' qui sera au même niveau que le dossier 'backend'
// C'est la structure finale dans notre container Docker.
const buildPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(buildPath));

// Pour toute autre requête, on renvoie l'index.html pour que React puisse gérer le routage.
// La syntaxe la plus sûre est d'utiliser une expression régulière.
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
