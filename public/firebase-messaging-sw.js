// Firebase Cloud Messaging (FCM) & Web Push Background Service Worker
// FC Arena VS Background Notification Handler

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Background Push Event Handler
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'FC Arena VS',
    body: 'নতুন নোটিফিকেশন এসেছে!',
    icon: '/pwa-192x192.png',
    badge: '/fc_arena_icon.jpg',
    url: '/'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      // FCM standard payload structure
      if (payload.notification) {
        notificationData.title = payload.notification.title || notificationData.title;
        notificationData.body = payload.notification.body || notificationData.body;
        notificationData.icon = payload.notification.icon || notificationData.icon;
      }
      if (payload.data) {
        notificationData = { ...notificationData, ...payload.data };
      }
    }
  } catch (e) {
    if (event.data) {
      try {
        notificationData.body = event.data.text();
      } catch (_) {}
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/pwa-192x192.png',
    badge: notificationData.badge || '/fc_arena_icon.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: notificationData.tag || 'fc-arena-push-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    data: {
      url: notificationData.url || '/'
    },
    actions: [
      { action: 'open', title: 'ম্যাচ দেখুন / Open' },
      { action: 'close', title: 'বাতিল' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// User Click on Background Notification Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.url && client.navigate) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
