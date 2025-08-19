/* frontend/src/sw.js */
/* eslint-disable no-undef */
import { precacheAndRoute } from 'workbox-precaching';

// Precache assets injected at build time
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Memento Mori';
    const body = data.body || '';
    const url = data.url || '/';
    const options = {
      body,
      icon: '/favicon/web-app-manifest-192x192.png',
      badge: '/favicon/web-app-manifest-192x192.png',
      data: { url },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    // Fallback plain notification
    event.waitUntil(
      self.registration.showNotification('Memento Mori', {
        body: 'Notification',
        icon: '/favicon/web-app-manifest-192x192.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus if already open
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_URL', url });
          return;
        }
      }
      // Or open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    })
  );
});
