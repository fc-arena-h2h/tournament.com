import { collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';

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
 * Register for Push Notifications (FCM) on native platforms (Android/iOS).
 * This allows notifications to arrive even if the app is killed/backgrounded.
 */
export async function registerPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications registration skipped: Not a native platform');
    return;
  }

  try {
    // 1. Request permission
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    // 2. Register with FCM/APNS
    await PushNotifications.register();

    // 3. Handle Registration Success (get token)
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      // Save FCM token to user's Firestore profile for background targeting
      if (userId) {
        try {
          await updateDoc(doc(db, 'users', userId), {
            fcmTokens: arrayUnion(token.value),
            lastTokenUpdate: Timestamp.now()
          });
        } catch (e) {
          console.error('Failed to save FCM token to Firestore:', e);
        }
      }
    });

    // 4. Handle Registration Error
    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Push registration error: ' + JSON.stringify(error));
    });

    // 5. Handle Notification Received (while app is in foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received:', notification);
      // We can also trigger a local notification or toast here if we want
      playNotificationSound();
    });

    // 6. Handle Notification Action (when user taps notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      console.log('Push notification action performed:', notification);
      const data = notification.notification.data;
      if (data && data.url) {
        window.location.href = data.url;
      }
    });

  } catch (e) {
    console.error('Error during push notification registration:', e);
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
  // If running in native Android/iOS Capacitor
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await PushNotifications.requestPermissions();
      return perm.receive === 'granted' ? 'granted' : 'denied';
    } catch (e) {
      console.warn('Capacitor PushNotifications permission error:', e);
    }
  }

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
export function showSystemNotification(title: string, options?: { body?: string; icon?: string; tag?: string; url?: string }) {
  // If running on native Capacitor Android
  if (Capacitor.isNativePlatform()) {
    try {
      LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2147483647),
            title,
            body: options?.body || '',
            schedule: { at: new Date(Date.now() + 100) },
            extra: { url: options?.url || '/' }
          }
        ]
      }).catch((e) => console.warn('Capacitor schedule error:', e));
      return;
    } catch (e) {
      console.warn('Capacitor LocalNotifications failed:', e);
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notificationOptions: NotificationOptions = {
    body: options?.body || '',
    icon: options?.icon || '/pwa-192x192.png',
    badge: '/fc_arena_icon.jpg',
    tag: options?.tag || 'fc-arena-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    ...({
      vibrate: [200, 100, 200, 100, 200],
      data: { url: options?.url || '/' }
    } as any)
  };

  try {
    const userAgent = typeof window !== 'undefined' && window.navigator ? window.navigator.userAgent : '';
    const isAndroid = /Android/i.test(userAgent);

    // Android Chrome REQUIRES ServiceWorkerRegistration.showNotification.
    // Directly calling `new Notification(...)` throws TypeError: Illegal constructor on Android.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration && registration.showNotification) {
          return registration.showNotification(title, notificationOptions);
        }
      }).catch((swErr) => {
        console.warn('Service worker notification failed:', swErr);
        // Fallback for non-Android browsers only
        if (!isAndroid && typeof Notification !== 'undefined') {
          try {
            new Notification(title, notificationOptions);
          } catch {}
        }
      });
      return;
    }

    // Fallback for desktop non-Android browsers without service worker
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
        message: 'Notification permission not granted. Please allow notifications in browser settings.'
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

/**
 * Create and send a notification record into Firestore,
 * and dispatch sound/system notification if recipient is self.
 */
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
    const payload = sanitizeForFirestore({
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
    await addDoc(collection(db, 'notifications'), payload);
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
    ? `💳 New Deposit Request (BDT${amount})` 
    : `💸 New Withdrawal Request (BDT${amount})`;

  const message = isDeposit
    ? `${userName} requested to deposit BDT${amount} via ${method.toUpperCase()} (TrxID: ${trxId || 'N/A'}). Please verify and approve.`
    : `${userName} requested to withdraw BDT${amount} to ${method.toUpperCase()} account (${recipientAccount || 'N/A'}).`;

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
export async function markAllNotificationsAsRead(notifications: AppNotification[], userId: string, isAdmin: boolean = false) {
  try {
    const targets = notifications.filter(n => 
      !n.read && (n.recipientId === userId || (isAdmin && n.recipientId === 'admin'))
    );
    
    if (targets.length === 0) return;

    const batch = writeBatch(db);
    targets.forEach(n => {
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
 * Clear all notifications for current user
 */
export async function clearAllNotifications(notifications: AppNotification[], userId: string, isAdmin: boolean = false) {
  try {
    const targets = notifications.filter(n => 
      n.recipientId === userId || (isAdmin && n.recipientId === 'admin')
    );

    if (targets.length === 0) return;

    const batch = writeBatch(db);
    targets.forEach(n => {
      batch.delete(doc(db, 'notifications', n.id));
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to clear notifications:', error);
  }
}
