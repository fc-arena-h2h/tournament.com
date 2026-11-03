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
  options?: { body?: string; icon?: string; tag?: string; url?: string }
) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const notificationOptions: NotificationOptions = {
    body: options?.body || '',
    icon: options?.icon || 'pwa-192x192.png',
    badge: 'fc_arena_icon.jpg',
    tag: options?.tag || 'fc-arena-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    ...({
      vibrate: [200, 100, 200, 100, 200],
      data: { url: options?.url || './' }
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
    showSystemNotification('FC Arena VS – Test Notification 🏆', {
      body: 'Background notifications are successfully active on your device! Tournament & match updates will arrive directly.',
      tag: 'test-phone-' + Date.now()
    });

    return {
      success: true,
      message: 'Test notification successfully sent to device notification bar!'
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

    // Group notifications by their shard DB instance
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
    // Wait: on new Notification DBs (App v1, MY App 1), composite index (recipientId + createdAt desc)
    // might not be created manually by the user yet!
    // If we query `where('recipientId', 'in', recipientIds)` WITHOUT `orderBy('createdAt', 'desc')` on external shards
    // and sort in memory, it NEVER requires a manual composite index in Firebase Console!
    const q =
      target.shardId === 'master'
        ? query(
            collection(target.notifDb, 'notifications'),
            where('recipientId', 'in', recipientIds),
            orderBy('createdAt', 'desc'),
            limit(30)
          )
        : query(
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
