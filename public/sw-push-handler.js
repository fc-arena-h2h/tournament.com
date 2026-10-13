// Service Worker Push & Notification Click Handler for FC Arena VS
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming background push events
self.addEventListener('push', (event) => {
  let data = {
    title: 'FC Arena VS',
    body: 'নতুন নোটিফিকেশন এসেছে!',
    icon: '/pwa-192x192.png',
    badge: '/fc_arena_icon.jpg',
    url: '/'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/fc_arena_icon.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'fc-arena-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

// When user taps on the phone notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.url && client.navigate) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle postMessage from foreground app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const finalOptions = {
      body: options?.body || '',
      icon: options?.icon || '/pwa-192x192.png',
      badge: options?.badge || '/fc_arena_icon.jpg',
      vibrate: [200, 100, 200, 100, 200],
      tag: options?.tag || 'fc-notif-' + Date.now(),
      renotify: true,
      data: {
        url: options?.url || '/'
      },
      ...options
    };
    self.registration.showNotification(title, finalOptions);
  }
});
