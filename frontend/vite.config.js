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
