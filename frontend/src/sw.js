/* frontend/src/sw.js */
/* eslint-disable no-undef */
import { precacheAndRoute, matchPrecache } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

// Précache (injecté par vite-plugin-pwa en mode injectManifest)
precacheAndRoute(self.__WB_MANIFEST || []);

// Prise de contrôle immédiate du SW
self.addEventListener("install", () => self.skipWaiting && self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fallback de navigation : sert index.html depuis le precache quand offline
const navigationHandler = async () => {
  return await matchPrecache("/index.html");
};
const navRoute = new NavigationRoute(navigationHandler, {
  denylist: [/^\/api\//, /\/assets\//], // ne pas intercepter API et assets fingerprintés
});
registerRoute(navRoute);

// ----- PUSH NOTIFICATIONS -----
self.addEventListener("push", (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Memento Mori";
    const body = data.body || "";
    const url = data.url || "/";
    const options = {
      body,
      icon: "/favicon/web-app-manifest-192x192.png",
      badge: "/favicon/web-app-manifest-192x192.png",
      data: { url },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification("Memento Mori", {
        body: "Notification",
        icon: "/favicon/web-app-manifest-192x192.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (
            client.url.includes(self.registration.scope) &&
            "focus" in client
          ) {
            client.focus();
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
        return undefined;
      })
  );
});
