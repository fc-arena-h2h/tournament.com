import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { showSystemNotification, playNotificationSound } from '@/src/lib/notifications';

let messagingInstance: any = null;

/**
 * Check if the browser supports Web Push & Firebase Cloud Messaging
 */
export async function isPushNotificationSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Register background service worker and initialize FCM
 */
export async function setupBackgroundPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // Register the FCM & Push service worker
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    console.log('Background push service worker registered:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('Could not register firebase-messaging-sw.js, trying default sw:', err);
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  }
}

/**
 * Request notification permission and get device token, saving it to Firestore user document
 */
export async function requestPushNotificationToken(userId?: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const supported = await isPushNotificationSupported();
    if (!supported) {
      // Fallback: standard web notification permission
      const perm = await Notification.requestPermission();
      return {
        success: perm === 'granted',
        error: perm === 'granted' ? undefined : 'Permission denied'
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'User denied notification permission' };
    }

    const reg = await setupBackgroundPushWorker();
    const app = initializeApp(firebaseConfig, 'fcm-app-' + Date.now());
    const messaging = getMessaging(app);
    messagingInstance = messaging;

    // Listen for incoming foreground messages
    onMessage(messaging, (payload) => {
      console.log('Foreground push received:', payload);
      playNotificationSound();
      showSystemNotification(payload.notification?.title || 'FC Arena VS', {
        body: payload.notification?.body || 'নতুন নোটিফিকেশন এসেছে!',
        tag: payload.data?.tag || 'fcm-' + Date.now(),
        url: payload.data?.url || '/'
      });
    });

    // Retrieve FCM registration token
    let token = '';
    try {
      token = await getToken(messaging, {
        serviceWorkerRegistration: reg || undefined
      });
    } catch (tokenErr) {
      console.warn('FCM getToken notice:', tokenErr);
    }

    // Save token to Firestore profile if user is logged in
    const targetUid = userId || auth.currentUser?.uid;
    if (targetUid && token) {
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          fcmTokens: arrayUnion(token),
          pushEnabled: true
        });
      } catch (dbErr) {
        console.warn('Could not save FCM token to user document:', dbErr);
      }
    }

    return { success: true, token };
  } catch (err: any) {
    console.warn('Push notification setup notice:', err);
    return { success: false, error: err?.message || 'Failed to setup push notifications' };
  }
}
