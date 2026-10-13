import { collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

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
  if (!('Notification' in window)) {
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
 * Show a native system/phone push notification with vibration support.
 */
export function showSystemNotification(title: string, options?: { body?: string; icon?: string; tag?: string }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notificationOptions: NotificationOptions = {
    body: options?.body || '',
    icon: options?.icon || '/fc_arena_icon.jpg',
    badge: '/fc_arena_icon.jpg',
    tag: options?.tag || String(Date.now()),
    ...({
      vibrate: [200, 100, 200]
    } as any)
  };

  try {
    // If ServiceWorker registration is available (PWA / Android), prefer registration.showNotification
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, notificationOptions).catch(() => {
          new Notification(title, notificationOptions);
        });
      }).catch(() => {
        new Notification(title, notificationOptions);
      });
    } else {
      new Notification(title, notificationOptions);
    }
  } catch (e) {
    console.warn('Native notification dispatch error:', e);
  }
}

/**
 * Create and send a notification record into Firestore,
 * and dispatch sound/system notification if recipient is self.
 */
export async function sendAppNotification({
  recipientId,
  title,
  message,
  type,
  linkTab,
  tournamentId,
  matchId,
  extra
}: {
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  linkTab?: string;
  tournamentId?: string;
  matchId?: string;
  extra?: Record<string, any>;
}) {
  if (!recipientId) return;

  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId,
      title,
      message,
      type,
      linkTab: linkTab || 'matches',
      tournamentId: tournamentId || null,
      matchId: matchId || null,
      extra: extra || null,
      read: false,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Failed to create notification document:', error);
  }
}

/**
 * Convenience helper to notify both participants of a match
 */
export async function notifyMatchParticipants({
  homePlayerId,
  awayPlayerId,
  title,
  message,
  type = 'match_scheduled',
  tournamentId,
  matchId
}: {
  homePlayerId: string;
  awayPlayerId: string;
  title: string;
  message: string;
  type?: NotificationType;
  tournamentId?: string;
  matchId?: string;
}) {
  const promises = [];
  if (homePlayerId) {
    promises.push(sendAppNotification({
      recipientId: homePlayerId,
      title,
      message,
      type,
      linkTab: tournamentId ? 'arena' : 'matches',
      tournamentId,
      matchId
    }));
  }
  if (awayPlayerId && awayPlayerId !== homePlayerId) {
    promises.push(sendAppNotification({
      recipientId: awayPlayerId,
      title,
      message,
      type,
      linkTab: tournamentId ? 'arena' : 'matches',
      tournamentId,
      matchId
    }));
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
    ? `💳 নতুন ডিপোজিট রিকোয়েস্ট (৳${amount})` 
    : `💸 নতুন উইথড্র রিকোয়েস্ট (৳${amount})`;

  const message = isDeposit
    ? `${userName} ৳${amount} টাকা যোগ করার জন্য ${method.toUpperCase()} এ রিকোয়েস্ট করেছেন (TrxID: ${trxId || 'N/A'})। অনুমোদন বা যাচাই করুন।`
    : `${userName} ৳${amount} টাকা উত্তোলনের জন্য ${method.toUpperCase()} একাউন্টে (${recipientAccount || 'N/A'}) রিকোয়েস্ট করেছেন।`;

  await sendAppNotification({
    recipientId: 'admin',
    title,
    message,
    type: 'payment_request',
    linkTab: 'matches', // Navigates admin to command center or wallet
    extra: { amount, type, method, userName, trxId, recipientAccount }
  });
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(id: string) {
  try {
    await updateDoc(doc(db, 'notifications', id), {
      read: true
    });
  } catch (error) {
    console.error('Failed to mark notification read:', error);
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllNotificationsAsRead(notifications: AppNotification[]) {
  try {
    const unread = notifications.filter(n => !n.read);
    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to mark all read:', error);
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(id: string) {
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    console.error('Failed to delete notification:', error);
  }
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(notifications: AppNotification[]) {
  try {
    const batch = writeBatch(db);
    notifications.forEach(n => {
      batch.delete(doc(db, 'notifications', n.id));
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to clear notifications:', error);
  }
}
