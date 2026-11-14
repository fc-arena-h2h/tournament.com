// FC Arena VS - Multi-Shard Background Notification Service Worker
// Supports Master DB (zxzx-cc7e2), Notification DB 1 (app-v1-20fdf), and Notification DB 2 (my-app-1-3aadf)
// Persists user state in IndexedDB so background notifications work even after Service Worker sleep/wake cycles.

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

function decodeKey(segments) {
  return segments.join('').split('').reverse().join('');
}

// 1. Master DB Config (zxzx-cc7e2)
const MASTER_CONFIG = {
  apiKey: decodeKey(['Ylo4quhHix7QG', 'is6KsBYISPchS', 'VvfKsv0AySazIA']),
  authDomain: 'zzzx-cc7e2.firebaseapp.com',
  projectId: 'zzzx-cc7e2',
  storageBucket: 'zzzx-cc7e2.firebasestorage.app',
  messagingSenderId: '868401490778',
  appId: '1:868401490778:web:5dda0d883f7b824258a163'
};
const MASTER_DATABASE_ID = 'ai-studio-fcarenavs-28e6bbbd-4e32-4faa-9b85-dd304ac5c618';

// 2. Notification Shard 1 Config (App v1 / app-v1-20fdf)
const NOTIF_1_CONFIG = {
  apiKey: decodeKey(['AYca2a1_V5EJv', 'y-QbiDzSZAS9i', 'QVc7T2BySazIA']),
  authDomain: 'app-v1-20fdf.firebaseapp.com',
  databaseURL: 'https://app-v1-20fdf-default-rtdb.firebaseio.com',
  projectId: 'app-v1-20fdf',
  storageBucket: 'app-v1-20fdf.firebasestorage.app',
  messagingSenderId: '39041152555',
  appId: '1:39041152555:web:289c294658193a95d89c6e'
};

// 3. Notification Shard 2 Config (MY App 1 / my-app-1-3aadf)
const NOTIF_2_CONFIG = {
  apiKey: decodeKey(['kY05wfOH6HI2X', 'wu2cYPf0ddvV2', '5TS_iyCySazIA']),
  authDomain: 'my-app-1-3aadf.firebaseapp.com',
  databaseURL: 'https://my-app-1-3aadf-default-rtdb.firebaseio.com',
  projectId: 'my-app-1-3aadf',
  storageBucket: 'my-app-1-3aadf.firebasestorage.app',
  messagingSenderId: '59893032487',
  appId: '1:59893032487:web:21004c94f3963a406bd002'
};

// Initialize Firebase Apps safely inside Service Worker
let masterApp = null;
let notif1App = null;
let notif2App = null;
let masterDb = null;
let notif1Db = null;
let notif2Db = null;
let messaging = null;

try {
  masterApp = firebase.initializeApp(MASTER_CONFIG);
  notif1App = firebase.initializeApp(NOTIF_1_CONFIG, 'sw_notif_1');
  notif2App = firebase.initializeApp(NOTIF_2_CONFIG, 'sw_notif_2');

  masterDb = masterApp.firestore(MASTER_DATABASE_ID);
  notif1Db = notif1App.firestore();
  notif2Db = notif2App.firestore();

  try {
    masterDb.settings({ experimentalForceLongPolling: true, merge: true });
  } catch (_) {}
  try {
    notif1Db.settings({ experimentalForceLongPolling: true, merge: true });
  } catch (_) {}
  try {
    notif2Db.settings({ experimentalForceLongPolling: true, merge: true });
  } catch (_) {}

  messaging = firebase.messaging(masterApp);
} catch (initErr) {
  console.warn('[SW] Firebase init warning:', initErr);
}

// ============================================================================
// IndexedDB Persistence for Service Worker State (survives SW sleep/restart)
// ============================================================================
const IDB_NAME = 'fc_arena_sw_state_v1';
const IDB_STORE = 'sw_kv';

function openSwDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openSwDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

async function idbSet(key, val) {
  try {
    const db = await openSwDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}

// ============================================================================
// In-Memory State (Hydrated from IndexedDB)
// ============================================================================
let currentUserId = null;
let currentIsAdmin = false;
let activeListeners = [];
let activeListenerUid = null;
let shownNotifIds = new Set();
let swSessionStartMs = Date.now();
let lastPollTimestampMs = 0;

async function hydrateSwState() {
  if (currentUserId) return;
  const savedUser = await idbGet('user_info');
  const savedShown = await idbGet('shown_notif_ids');
  const savedStartMs = await idbGet('session_start_ms');

  if (savedShown && Array.isArray(savedShown)) {
    savedShown.forEach((id) => shownNotifIds.add(id));
  }
  if (savedStartMs && typeof savedStartMs === 'number') {
    swSessionStartMs = savedStartMs;
  } else {
    swSessionStartMs = Date.now() - 60000;
    await idbSet('session_start_ms', swSessionStartMs);
  }

  if (savedUser && savedUser.userId) {
    currentUserId = savedUser.userId;
    currentIsAdmin = Boolean(savedUser.isAdmin);
    startMultiShardBackgroundListeners();
  }
}

async function markNotificationShown(compositeKey) {
  shownNotifIds.add(compositeKey);
  const arr = Array.from(shownNotifIds).slice(-250);
  await idbSet('shown_notif_ids', arr);
}

function getDocCreatedAtMs(data) {
  if (!data || !data.createdAt) return 0;
  if (typeof data.createdAt.toMillis === 'function') return data.createdAt.toMillis();
  if (typeof data.createdAt.seconds === 'number') return data.createdAt.seconds * 1000;
  if (typeof data.createdAt === 'number') return data.createdAt;
  return 0;
}

// Helper to display native phone notification in system tray
async function displayNotification(data) {
  const compositeKey = data.compositeKey || data.id || 'fc-arena-' + Date.now();
  if (data.compositeKey && shownNotifIds.has(data.compositeKey)) {
    return;
  }
  if (data.compositeKey) {
    await markNotificationShown(data.compositeKey);
  }

  const targetUrl = data.url || './';
  const options = {
    body: data.message || data.body || 'New tournament or match notification arrived!',
    icon: 'pwa-192x192.png',
    badge: 'fc_arena_icon.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: compositeKey,
    renotify: true,
    requireInteraction: false,
    data: {
      url: targetUrl,
      linkTab: data.linkTab || 'matches',
      tournamentId: data.tournamentId || null,
      matchId: data.matchId || null,
      shardId: data.shardId || 'master',
      notifId: data.id || null
    },
    actions: [
      { action: 'open', title: 'Open Match / View' }
    ]
  };

  return self.registration.showNotification(data.title || 'FC Arena VS', options);
}

// Check if any app window is currently visible & focused in the foreground
async function isAppFocusedInForeground() {
  try {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    return clientList.some((client) => client.focused && client.visibilityState === 'visible');
  } catch (_) {
    return false;
  }
}

function getAllShardDatabases() {
  const list = [];
  if (notif1Db) list.push({ shardId: 'shard_1', db: notif1Db });
  if (notif2Db) list.push({ shardId: 'shard_2', db: notif2Db });
  if (masterDb) list.push({ shardId: 'master', db: masterDb });
  return list;
}

function stopMultiShardBackgroundListeners() {
  activeListeners.forEach((unsub) => {
    try {
      unsub();
    } catch (_) {}
  });
  activeListeners = [];
  activeListenerUid = null;
}

// Process a notification document from any shard
async function handleIncomingShardDoc(shardId, docId, data) {
  if (!data || data.read === true) return;

  const compositeKey = `${shardId}_${docId}`;
  if (shownNotifIds.has(compositeKey)) return;

  const docTimeMs = getDocCreatedAtMs(data);
  // Only alert for notifications created recently (after session baseline)
  if (docTimeMs > 0 && docTimeMs < swSessionStartMs - 15000) {
    await markNotificationShown(compositeKey);
    return;
  }

  const isForeground = await isAppFocusedInForeground();
  if (!isForeground) {
    await displayNotification({
      compositeKey,
      id: docId,
      shardId: data.shardId || shardId,
      title: data.title || 'FC Arena VS',
      message: data.message || 'You have a new update in FC Arena VS.',
      linkTab: data.linkTab || 'matches',
      tournamentId: data.tournamentId || null,
      matchId: data.matchId || null,
      url: './'
    });
  } else {
    // App is focused in foreground; mark as known so it won't re-trigger later in background
    await markNotificationShown(compositeKey);
  }
}

// Attach real-time listeners across ALL 3 Notification Shards (without composite index requirement)
function startMultiShardBackgroundListeners() {
  if (!currentUserId) return;
  if (activeListenerUid === currentUserId && activeListeners.length > 0) return;

  stopMultiShardBackgroundListeners();
  activeListenerUid = currentUserId;

  const recipientIds = [currentUserId, 'all'];
  if (currentIsAdmin) recipientIds.push('admin');

  const shards = getAllShardDatabases();
  shards.forEach(({ shardId, db }) => {
    try {
      // Single-field 'in' query without orderBy avoids needing manual Composite Indexes on Shard DBs
      const unsub = db
        .collection('notifications')
        .where('recipientId', 'in', recipientIds)
        .limit(25)
        .onSnapshot(
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                handleIncomingShardDoc(shardId, change.doc.id, change.doc.data());
              }
            });
          },
          (err) => {
            console.warn(`[SW] Listener warning on ${shardId}:`, err);
          }
        );
      activeListeners.push(unsub);
    } catch (e) {
      console.warn(`[SW] Failed to attach listener on ${shardId}:`, e);
    }
  });
}

// One-shot poll across all 3 Notification Shards (used when SW wakes up from sync/periodicsync/fetch)
async function pollAllShardsOnce(force = false) {
  const now = Date.now();
  if (!force && now - lastPollTimestampMs < 15000) return;
  lastPollTimestampMs = now;

  await hydrateSwState();
  if (!currentUserId) return;

  // Ensure live listeners are also attached
  startMultiShardBackgroundListeners();

  const recipientIds = [currentUserId, 'all'];
  if (currentIsAdmin) recipientIds.push('admin');

  const shards = getAllShardDatabases();
  await Promise.allSettled(
    shards.map(async ({ shardId, db }) => {
      try {
        const snap = await db
          .collection('notifications')
          .where('recipientId', 'in', recipientIds)
          .limit(20)
          .get();

        for (const docSnap of snap.docs) {
          await handleIncomingShardDoc(shardId, docSnap.id, docSnap.data());
        }
      } catch (_) {}
    })
  );
}

// Listen for messages from the foreground app
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SET_USER_ID') {
    const newUid = event.data.userId || null;
    const newIsAdmin = Boolean(event.data.isAdmin);
    const knownIds = Array.isArray(event.data.knownIds) ? event.data.knownIds : [];

    knownIds.forEach((id) => shownNotifIds.add(id));

    if (newUid) {
      const uidChanged = currentUserId !== newUid;
      currentUserId = newUid;
      currentIsAdmin = newIsAdmin;

      idbSet('user_info', { userId: currentUserId, isAdmin: currentIsAdmin });
      if (knownIds.length > 0) {
        idbSet('shown_notif_ids', Array.from(shownNotifIds).slice(-250));
      }

      if (uidChanged || activeListeners.length === 0) {
        startMultiShardBackgroundListeners();
      }
    } else {
      currentUserId = null;
      currentIsAdmin = false;
      stopMultiShardBackgroundListeners();
      idbSet('user_info', null);
    }
  } else if (event.data.type === 'MARK_NOTIF_SHOWN' && event.data.compositeKey) {
    markNotificationShown(event.data.compositeKey);
  } else if (
    event.data.type === 'APP_BACKGROUNDED' ||
    event.data.type === 'HEARTBEAT_CHECK'
  ) {
    event.waitUntil(pollAllShardsOnce(true));
  }
});

// Background Sync API (triggers automatically when phone regains internet connection)
self.addEventListener('sync', (event) => {
  if (event.tag === 'fc-arena-notif-sync' || event.tag.startsWith('fc-arena')) {
    event.waitUntil(pollAllShardsOnce(true));
  }
});

// Periodic Background Sync API (triggers periodically on supported Android browsers/PWAs)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'fc-arena-notif-periodic' || event.tag.startsWith('fc-arena')) {
    event.waitUntil(pollAllShardsOnce(true));
  }
});

// Standard FCM Background Message Handler
if (messaging) {
  try {
    messaging.onBackgroundMessage((payload) => {
      const notif = payload.notification || payload.data || {};
      return displayNotification({
        title: notif.title || 'FC Arena VS',
        message: notif.body || notif.message || 'New notification arrived!',
        url: (payload.data && payload.data.url) || './'
      });
    });
  } catch (_) {}
}

// Generic Web Push Event Handler
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const notif = data.notification || data.data || data;
      event.waitUntil(
        displayNotification({
          title: notif.title || 'FC Arena VS',
          message: notif.body || notif.message || 'New notification arrived!',
          url: notif.url || './'
        })
      );
    } catch (_) {
      event.waitUntil(displayNotification({ body: event.data.text() }));
    }
  } else {
    event.waitUntil(pollAllShardsOnce(true));
  }
});

// Notification Click Handler - Focuses or opens the app and navigates to the relevant Match/Tournament
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: notifData
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        const params = new URLSearchParams();
        if (notifData.linkTab) params.set('notifTab', notifData.linkTab);
        if (notifData.tournamentId) params.set('tournamentId', notifData.tournamentId);
        if (notifData.shardId) params.set('shardId', notifData.shardId);
        const queryStr = params.toString();
        const finalUrl = queryStr ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}${queryStr}` : targetUrl;
        return self.clients.openWindow(finalUrl);
      }
    })
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients
      .claim()
      .then(() => hydrateSwState())
      .then(() => pollAllShardsOnce(true))
  );
});

// Hydrate immediately when script loads in Service Worker scope
hydrateSwState();
