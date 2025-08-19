// frontend/src/notifications.js
export async function activateNotifications() {
    if (!isSecureContext) throw new Error('HTTPS requis');
    if (!('Notification' in window)) throw new Error('Notifications non supportées');
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supporté');
  
    // Demande permission si besoin
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') throw new Error(`Permission refusée: ${p}`);
    } else if (Notification.permission !== 'granted') {
      throw new Error(`Permission refusée: ${Notification.permission}`);
    }
  
    const reg = await navigator.serviceWorker.ready;
  
    // Récupère clé publique
    const r = await fetch('/api/push/public-key', { cache: 'no-store' });
    if (!r.ok) throw new Error('public-key HTTP ' + r.status);
    const { publicKey } = await r.json();
    if (!publicKey) throw new Error('Clé publique VAPID absente');
  
    // Convertit la clé en Uint8Array
    const toU8 = (s) => {
      const pad = '='.repeat((4 - (s.length % 4)) % 4);
      const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(b64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    };
    const appServerKey = toU8(publicKey);
  
    // Crée ou récupère la subscription
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }
  
    // Envoie au backend en POST
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, timezone: tz }),
    });
    if (!res.ok) throw new Error('subscribe HTTP ' + res.status);
  
    return true;
  }