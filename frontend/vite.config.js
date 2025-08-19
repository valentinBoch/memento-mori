import { precacheAndRoute, matchPrecache } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// ... (other existing code)

// Register navigation route
registerRoute(navRoute);

// Cache runtime des fichiers de traduction i18n pour l'offline
registerRoute(
  ({ request, url }) =>
    request.destination === "document"
      ? false
      : url.pathname.startsWith("/locales/") && url.pathname.endsWith(".json"),
  new CacheFirst({
    cacheName: "i18n-locales",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }), // 30 jours
    ],
  })
);

// ... (other existing code)

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // on garde le manifest public existant
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: [
        "favicon/favicon.ico",
        "favicon/apple-touch-icon.png",
        "favicon/favicon.svg",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
});
