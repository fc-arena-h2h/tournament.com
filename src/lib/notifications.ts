import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Unsubscribe,
  Firestore
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import {
  getNotificationDbByTournamentId,
  getNotificationDbForShard,
  getAllTournamentDbs
} from '@/src/lib/shardManager';
import { ShardId } from '@/src/lib/localDbManager';

export type NotificationType =
  | 'match_scheduled'
  | 'match_result'
  | 'chat_message'
  | 'payment_request'
  | 'payment_status'
  | 'challenge'
  | 'announcement'
  | 'system';

export interface AppNotification {
  id: string;
  recipientId: string; // userId or 'admin' or 'all'
  title: string;
  message: string;
  type: NotificationType;
  linkTab?: string; // 'arena' | 'matches' | 'league' | 'tournament' | 'profile'
  tournamentId?: string;
  matchId?: string;
  shardId?: ShardId;
  read: boolean;
  createdAt: any;
  extra?: Record<string, any>;
}

/**
 * Send message reliably to the active Service Worker (even if controller isn't claimed yet)
 */
export function postMessageToServiceWorker(message: Record<string, any>) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg && reg.active && reg.active !== navigator.serviceWorker.controller) {
          reg.active.postMessage(message);
        }
      })
      .catch(() => {});
  } catch {
    // Ignore SW postMessage errors
  }
}

/**
 * Sync the current logged-in user and known notification IDs with the Service Worker's IndexedDB
 * and register Background Sync / Periodic Sync for continuous background delivery.
 */
export async function syncUserWithServiceWorker(
  userId: string | null,
  isAdmin: boolean = false,
  knownIds: string[] = []
) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  postMessageToServiceWorker({
    type: 'SET_USER_ID',
    userId,
    isAdmin,
    knownIds
  });

  if (!userId) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg?.active) {
      reg.active.postMessage({
        type: 'SET_USER_ID',
        userId,
        isAdmin,
        knownIds
      });
    }

    // Register One-Shot Background Sync (triggers automatically on network reconnect)
    if ('sync' in reg && (reg as any).sync?.register) {
      try {
        await (reg as any).sync.register('fc-arena-notif-sync');
      } catch {}
    }

    // Register Periodic Background Sync (triggers periodically in background on Android PWA/WebView)
    if ('periodicSync' in reg && (reg as any).periodicSync?.register) {
      try {
        await (reg as any).periodicSync.register('fc-arena-notif-periodic', {
          minInterval: 60 * 1000
        });
      } catch {}
    }
  } catch {
    // Ignore if unsupported
  }
}

/**
 * Play a gentle, crisp audio chime via Web Audio API.
 * Works natively on all modern mobile and desktop browsers without asset downloads.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // First tone (pleasant high pluck)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain1.gain.setValueAtTime(0.18, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Second harmonic bell
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.08); // C6
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // AudioContext might be restricted until user gesture; ignore gracefully
  }
}

/**
 * Request system/phone notification permission from user's browser or device.
 */
export async function requestPhoneNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Could not request notification permission:', err);
    return 'denied';
  }
}

/**
 * Update the app icon unread badge count on home screen / device dock
 */
export function updateAppBadge(count: number) {
  try {
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count).catch(() => {});
      } else {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    }
  } catch {
    // unsupported platform, ignore
  }
}

/**
 * Show a native system/phone push notification with vibration support.
 * Uses ServiceWorker registration so it shows in the Android/mobile notification tray.
 */
export function showSystemNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    url?: string;
    linkTab?: string;
    tournamentId?: string;
    matchId?: string;
    shardId?: ShardId;
    compositeKey?: string;
  }
) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const effectiveTag = options?.compositeKey || options?.tag || 'fc-arena-' + Date.now();

  if (options?.compositeKey) {
    postMessageToServiceWorker({
      type: 'MARK_NOTIF_SHOWN',
      compositeKey: options.compositeKey
    });
  }

  const notificationOptions: NotificationOptions = {
    body: options?.body || '',
    icon: options?.icon || 'pwa-192x192.png',
    badge: 'fc_arena_icon.jpg',
    tag: effectiveTag,
    renotify: true,
    requireInteraction: false,
    ...({
      vibrate: [200, 100, 200, 100, 200],
      data: {
        url: options?.url || './',
        linkTab: options?.linkTab || 'matches',
        tournamentId: options?.tournamentId || null,
        matchId: options?.matchId || null,
        shardId: options?.shardId || 'master'
      },
      actions: [{ action: 'open', title: 'Open Match / View' }]
    } as any)
  };

  try {
    const userAgent =
      typeof window !== 'undefined' && window.navigator ? window.navigator.userAgent : '';
    const isAndroid = /Android/i.test(userAgent);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          if (registration && registration.showNotification) {
            return registration.showNotification(title, notificationOptions);
          }
        })
        .catch((swErr) => {
          console.warn('Service worker notification failed:', swErr);
          if (!isAndroid && typeof Notification !== 'undefined') {
            try {
              new Notification(title, notificationOptions);
            } catch {}
          }
        });
      return;
    }

    if (!isAndroid && typeof Notification !== 'undefined') {
      new Notification(title, notificationOptions);
    }
  } catch (e) {
    console.warn('Native notification dispatch error:', e);
  }
}

/**
 * Dispatch an immediate test phone notification to confirm it shows in the device notification shade.
 */
export async function sendTestPhoneNotification(): Promise<{ success: boolean; message: string }> {
  try {
    const perm = await requestPhoneNotificationPermission();
    if (perm !== 'granted') {
      return {
        success: false,
        message:
          'Notification permission not granted. Please allow notifications in browser settings.'
      };
    }

    playNotificationSound();
    showSystemNotification('FC Arena VS – Background Service Active 🏆', {
      body: 'Phone notifications are active! You will receive match & tournament updates whenever your phone has internet.',
      tag: 'test-phone-' + Date.now()
    });

    postMessageToServiceWorker({ type: 'HEARTBEAT_CHECK' });

    return {
      success: true,
      message: 'Test notification sent! Background notification service is active.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to send notification.'
    };
  }
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Timestamp || obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = sanitizeForFirestore(value);
  }
  return cleaned;
}

/**
 * Create and send a notification record into the appropriate Notification Shard Database:
 * - Shard 1 Tournament (`Gariena1`) -> Notification DB 1 (`App v1`)
 * - Shard 2 Tournament (`FC Tournament`) -> Notification DB 2 (`MY App 1`)
 * - Global / Admin / System -> Master DB (`zxzx`)
 */
export async function sendAppNotification({
  recipientId,
  title,
  message,
  type,
  linkTab,
  tournamentId,
  matchId,
  shardId,
  extra
}: {
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  linkTab?: string;
  tournamentId?: string;
  matchId?: string;
  shardId?: ShardId;
  extra?: Record<string, any>;
}) {
  if (!recipientId) return;

  const target =
    recipientId === 'admin' && !tournamentId
      ? { db, shardId: 'master' as ShardId }
      : getNotificationDbByTournamentId(tournamentId, shardId);

  const payload = sanitizeForFirestore({
    recipientId,
    title,
    message,
    type,
    linkTab: linkTab || 'matches',
    tournamentId: tournamentId || null,
    matchId: matchId || null,
    shardId: target.shardId,
    extra: extra || null,
    read: false,
    createdAt: Timestamp.now()
  });

  try {
    await addDoc(collection(target.db, 'notifications'), payload);
  } catch (error) {
    // Fallback to master DB if external notification shard rules are not yet published
    if (target.db !== db) {
      try {
        await addDoc(collection(db, 'notifications'), {
          ...payload,
          shardId: 'master'
        });
        return;
      } catch (fallbackErr) {
        console.error('Failed to create notification document in fallback DB:', fallbackErr);
      }
    } else {
      console.error('Failed to create notification document:', error);
    }
  }
}

/**
 * Convenience helper to notify both participants of a match via the tournament's Notification DB
 */
export async function notifyMatchParticipants({
  homePlayerId,
  awayPlayerId,
  title,
  message,
  type = 'match_scheduled',
  tournamentId,
  matchId,
  shardId
}: {
  homePlayerId: string;
  awayPlayerId: string;
  title: string;
  message: string;
  type?: NotificationType;
  tournamentId?: string;
  matchId?: string;
  shardId?: ShardId;
}) {
  const promises = [];
  if (homePlayerId) {
    promises.push(
      sendAppNotification({
        recipientId: homePlayerId,
        title,
        message,
        type,
        linkTab: tournamentId ? 'arena' : 'matches',
        tournamentId,
        matchId,
        shardId
      })
    );
  }
  if (awayPlayerId && awayPlayerId !== homePlayerId) {
    promises.push(
      sendAppNotification({
        recipientId: awayPlayerId,
        title,
        message,
        type,
        linkTab: tournamentId ? 'arena' : 'matches',
        tournamentId,
        matchId,
        shardId
      })
    );
  }
  await Promise.allSettled(promises);
}

/**
 * Notify admins about a payment request (deposit / withdrawal)
 */
export async function notifyAdminPaymentRequest({
  type,
  userName,
  amount,
  method,
  trxId,
  recipientAccount
}: {
  type: 'deposit' | 'withdraw';
  userName: string;
  amount: number;
  method: string;
  trxId?: string;
  recipientAccount?: string;
}) {
  const isDeposit = type === 'deposit';
  const title = isDeposit
    ? `💳 New Deposit Request (BDT${amount})`
    : `💸 New Withdrawal Request (BDT${amount})`;

  const message = isDeposit
    ? `${userName} requested to deposit BDT${amount} via ${method.toUpperCase()} (TrxID: ${
        trxId || 'N/A'
      }). Please verify and approve.`
    : `${userName} requested to withdraw BDT${amount} to ${method.toUpperCase()} account (${
        recipientAccount || 'N/A'
      }).`;

  await sendAppNotification({
    recipientId: 'admin',
    title,
    message,
    type: 'payment_request',
    linkTab: 'matches',
    shardId: 'master',
    extra: { amount, type, method, userName, trxId, recipientAccount }
  });
}

/**
 * Mark notification as read in its respective Notification Shard DB
 */
export async function markNotificationAsRead(id: string, shardId?: ShardId) {
  const targetDb = getNotificationDbForShard(shardId);
  try {
    await updateDoc(doc(targetDb, 'notifications', id), {
      read: true
    });
  } catch (error) {
    if (targetDb !== db) {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch {}
    } else {
      console.error('Failed to mark notification read:', error);
    }
  }
}

/**
 * Mark all notifications as read for current user across all Notification Shards
 */
export async function markAllNotificationsAsRead(
  notifications: AppNotification[],
  userId: string,
  isAdmin: boolean = false
) {
  try {
    const targets = notifications.filter(
      (n) => !n.read && (n.recipientId === userId || (isAdmin && n.recipientId === 'admin'))
    );
    if (targets.length === 0) return;

    const byShard = new Map<Firestore, AppNotification[]>();
    for (const n of targets) {
      const targetDb = getNotificationDbForShard(n.shardId);
      const list = byShard.get(targetDb) || [];
      list.push(n);
      byShard.set(targetDb, list);
    }

    const batchPromises: Promise<void>[] = [];
    for (const [shardDb, list] of byShard.entries()) {
      const batch = writeBatch(shardDb);
      list.forEach((n) => {
        batch.update(doc(shardDb, 'notifications', n.id), { read: true });
      });
      batchPromises.push(batch.commit());
    }
    await Promise.allSettled(batchPromises);
  } catch (error) {
    console.error('Failed to mark all read:', error);
  }
}

/**
 * Delete a notification from its respective Notification Shard DB
 */
export async function deleteNotification(id: string, shardId?: ShardId) {
  const targetDb = getNotificationDbForShard(shardId);
  try {
    await deleteDoc(doc(targetDb, 'notifications', id));
  } catch (error) {
    if (targetDb !== db) {
      try {
        await deleteDoc(doc(db, 'notifications', id));
      } catch {}
    } else {
      console.error('Failed to delete notification:', error);
    }
  }
}

/**
 * Clear all notifications for current user across all Notification Shards
 */
export async function clearAllNotifications(
  notifications: AppNotification[],
  userId: string,
  isAdmin: boolean = false
) {
  try {
    const targets = notifications.filter(
      (n) => n.recipientId === userId || (isAdmin && n.recipientId === 'admin')
    );
    if (targets.length === 0) return;

    const byShard = new Map<Firestore, AppNotification[]>();
    for (const n of targets) {
      const targetDb = getNotificationDbForShard(n.shardId);
      const list = byShard.get(targetDb) || [];
      list.push(n);
      byShard.set(targetDb, list);
    }

    const batchPromises: Promise<void>[] = [];
    for (const [shardDb, list] of byShard.entries()) {
      const batch = writeBatch(shardDb);
      list.forEach((n) => {
        batch.delete(doc(shardDb, 'notifications', n.id));
      });
      batchPromises.push(batch.commit());
    }
    await Promise.allSettled(batchPromises);
  } catch (error) {
    console.error('Failed to clear notifications:', error);
  }
}

function getCreatedAtMillis(item: any): number {
  if (!item?.createdAt) return 0;
  if (typeof item.createdAt.toMillis === 'function') return item.createdAt.toMillis();
  if (typeof item.createdAt.seconds === 'number') return item.createdAt.seconds * 1000;
  if (typeof item.createdAt === 'number') return item.createdAt;
  return 0;
}

/**
 * One-time active fetch of unread notifications across all shards (used on network reconnect / wake-up)
 */
export async function fetchLatestNotificationsAcrossShards(
  userId: string,
  isAdmin: boolean
): Promise<AppNotification[]> {
  const recipientIds = [userId, 'all'];
  if (isAdmin) recipientIds.push('admin');

  const allTargets = getAllTournamentDbs(true);
  const merged: AppNotification[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    allTargets.map(async (target) => {
      try {
        const q = query(
          collection(target.notifDb, 'notifications'),
          where('recipientId', 'in', recipientIds),
          limit(25)
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data();
          const shardId = data.shardId || target.shardId;
          const compositeKey = `${shardId}_${d.id}`;
          if (!seen.has(compositeKey)) {
            seen.add(compositeKey);
            merged.push({
              id: d.id,
              ...data,
              shardId
            } as AppNotification);
          }
        });
      } catch {}
    })
  );

  merged.sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a));
  return merged.slice(0, 40);
}

/**
 * Subscribe to user notifications across all Notification Databases:
 * - Notification DB 1 (`App v1` / `app-v1-20fdf`)
 * - Notification DB 2 (`MY App 1` / `my-app-1-3aadf`)
 * - Master DB (`zxzx` / `zxzx-cc7e2`)
 */
export function subscribeToUserNotificationsAcrossShards(
  userId: string,
  isAdmin: boolean,
  onUpdate: (notifications: AppNotification[]) => void
): Unsubscribe {
  const recipientIds = [userId, 'all'];
  if (isAdmin) recipientIds.push('admin');

  const allTargets = getAllTournamentDbs(true);
  const shardNotifsMap = new Map<ShardId, AppNotification[]>();
  const unsubscribes: Unsubscribe[] = [];

  const emitMerged = () => {
    const merged: AppNotification[] = [];
    const seen = new Set<string>();

    for (const [shardId, list] of shardNotifsMap.entries()) {
      for (const n of list) {
        const compositeKey = `${shardId}_${n.id}`;
        if (!seen.has(compositeKey)) {
          seen.add(compositeKey);
          merged.push(n);
        }
      }
    }

    merged.sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a));
    onUpdate(merged.slice(0, 40));
  };

  for (const target of allTargets) {
    // Use index-free query across all shards and sort in memory so it never fails due to missing Composite Index
    const q = query(
      collection(target.notifDb, 'notifications'),
      where('recipientId', 'in', recipientIds),
      limit(30)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppNotification[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            shardId: data.shardId || target.shardId
          } as AppNotification;
        });
        shardNotifsMap.set(target.shardId, list);
        emitMerged();
      },
      () => {
        if (!shardNotifsMap.has(target.shardId)) {
          shardNotifsMap.set(target.shardId, []);
          emitMerged();
        }
      }
    );
    unsubscribes.push(unsub);
  }

  return () => {
    unsubscribes.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}

/**
 * Background Keep-Alive & Reconnect Engine for Mobile WebView / PWA:
 * Ensures that when the app goes into background or when the phone reconnects to the internet,
 * the Service Worker and foreground catch-up engine immediately check all 3 Notification Shards.
 */
export function startBackgroundNotificationEngine(
  userId: string,
  isAdmin: boolean,
  onCatchUpNotifications: (notifications: AppNotification[]) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const triggerCheck = async () => {
    if (!navigator.onLine) return;
    postMessageToServiceWorker({ type: 'HEARTBEAT_CHECK' });
    try {
      const latest = await fetchLatestNotificationsAcrossShards(userId, isAdmin);
      if (latest.length > 0) {
        onCatchUpNotifications(latest);
      }
    } catch {}
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      postMessageToServiceWorker({ type: 'APP_BACKGROUNDED' });
      syncUserWithServiceWorker(userId, isAdmin);
    } else if (document.visibilityState === 'visible') {
      triggerCheck();
    }
  };

  const handleOnline = () => {
    syncUserWithServiceWorker(userId, isAdmin);
    triggerCheck();
  };

  const handleFocus = () => {
    triggerCheck();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);

  // Heartbeat every 25 seconds to keep Service Worker & WebView listener responsive
  const heartbeatInterval = window.setInterval(() => {
    if (navigator.onLine) {
      postMessageToServiceWorker({ type: 'HEARTBEAT_CHECK' });
      if (document.visibilityState === 'hidden') {
        triggerCheck();
      }
    }
  }, 25000);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    window.clearInterval(heartbeatInterval);
  };
}
