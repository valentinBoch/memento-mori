# Dockerfile

# ---- Étape 1: Build du Frontend (React) ----
# On utilise une image Node.js 24 basée sur Alpine Linux (légère)
# L'alias 'builder' nous permettra de réutiliser ses fichiers plus tard
FROM node:24-alpine AS builder

# On définit le répertoire de travail dans le container
WORKDIR /app

# On copie d'abord les package.json pour profiter du cache Docker
# Si ces fichiers ne changent pas, Docker n'exécutera pas le `npm install`
COPY frontend/package*.json ./frontend/
RUN npm install --prefix frontend

# On copie le reste du code source du frontend
COPY frontend/ ./frontend/

# On lance le build de l'application React
# Le résultat sera dans /app/frontend/dist
RUN npm run build --prefix frontend

# ---- Étape 2: Création de l'image finale de production ----
# On repart d'une base Node.js légère et propre
FROM node:24-alpine

WORKDIR /app

# On copie les package.json du backend
COPY backend/package*.json ./backend/
# On installe UNIQUEMENT les dépendances de production
RUN npm install --prefix backend --omit=dev

# On copie le code source du backend
COPY backend/ ./backend/

# La magie opère ici : on copie le dossier 'dist' de l'étape 'builder'
# dans le bon répertoire pour que le serveur Express puisse le trouver.
COPY --from=builder /app/frontend/dist ./frontend/dist

# On expose le port sur lequel notre serveur Express écoute
EXPOSE 3001

# La commande qui sera exécutée au démarrage du container
CMD ["node", "backend/server.js"]