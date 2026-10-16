// FC Arena VS - Advanced Background Notification Service Worker
// Unifies FCM, Firestore Background Listening, and PWA logic

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "gen-lang-client-0849074075",
  appId: "1:370274994500:web:3729c2ca722b8b9113af11",
  apiKey: "AIzaSyB81FoDkheH_XbmKUjK2s-LegUjkmCWDpE",
  authDomain: "gen-lang-client-0849074075.firebaseapp.com",
  messagingSenderId: "370274994500",
  storageBucket: "gen-lang-client-0849074075.firebasestorage.app"
};

// Initialize Firebase in Service Worker
firebase.initializeApp(firebaseConfig);
const db = firebase.app().firestore("ai-studio-fcarenavs-28e6bbbd-4e32-4faa-9b85-dd304ac5c618");
const messaging = firebase.messaging();

let currentUserId = null;
let notificationListener = null;

// Helper to show notification
const displayNotification = (data) => {
  const options = {
    body: data.message || data.body || 'New notification arrived!',
    icon: '/pwa-192x192.png',
    badge: '/fc_arena_icon.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.id || 'fc-arena-' + Date.now(),
    renotify: true,
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'View Match / Open' }
    ]
  };
  return self.registration.showNotification(data.title || 'FC Arena VS', options);
};

// Listen for messages from the foreground app to get current user ID
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_USER_ID') {
    currentUserId = event.data.userId;
    console.log('[SW] User ID set for background listening:', currentUserId);
    startBackgroundFirestoreListener();
  }
});

// Start listening to Firestore for new notifications for this user
function startBackgroundFirestoreListener() {
  if (!currentUserId || notificationListener) return;

  console.log('[SW] Starting background Firestore listener...');
  
  // We only care about unread notifications created after the SW started
  const startTime = firebase.firestore.Timestamp.now();

  notificationListener = db.collection('notifications')
    .where('recipientId', 'in', [currentUserId, 'all'])
    .where('read', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const docTime = data.createdAt;
          
          // Only show if it's genuinely new (created after SW listener started)
          if (docTime && docTime.toMillis() > startTime.toMillis() - 5000) {
            // Check if any client windows are already open/focused
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
              const isForeground = clientList.some(client => client.focused);
              if (!isForeground) {
                displayNotification({
                  id: change.doc.id,
                  title: data.title,
                  message: data.message,
                  url: '/'
                });
              }
            });
          }
        }
      });
    }, (err) => {
      console.warn('[SW] Firestore listener error:', err);
      notificationListener = null;
    });
}

// Background FCM Push Handler (standard)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background FCM message received:', payload);
  return displayNotification(payload.notification || payload.data);
});

// Generic Push Event (fallback)
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      event.waitUntil(displayNotification(data));
    } catch (e) {
      event.waitUntil(displayNotification({ body: event.data.text() }));
    }
  }
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.url && client.navigate) return client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
