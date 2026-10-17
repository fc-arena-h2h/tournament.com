import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

/**
 * Perform a security integrity check every 2 seconds between local profile and Firestore server data
 */
export async function checkUserFraudStatus(userId: string, currentProfile: any): Promise<{ isFrozen: boolean; fraudReason?: string }> {
  if (!userId) return { isFrozen: false };

  // Skip remote check if client is temporarily offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { isFrozen: !!currentProfile?.isFrozen, fraudReason: currentProfile?.fraudReason };
  }

  try {
    const userRef = doc(db, 'users', userId);
    let serverSnap;
    try {
      serverSnap = await getDoc(userRef);
    } catch (fetchErr: any) {
      // Gracefully handle network transitions without error spam
      if (fetchErr?.code === 'unavailable' || fetchErr?.message?.includes('offline') || fetchErr?.message?.includes('could not be completed')) {
        return { isFrozen: !!currentProfile?.isFrozen, fraudReason: currentProfile?.fraudReason };
      }
      throw fetchErr;
    }

    if (!serverSnap || !serverSnap.exists()) return { isFrozen: false };
    const serverData = serverSnap.data();

    // Check if admin already froze the account
    if (serverData.isFrozen || serverData.status === 'banned') {
      return { isFrozen: true, fraudReason: serverData.fraudReason || 'Account suspended by security system or admin' };
    }

    return { isFrozen: serverData.isFrozen || false, fraudReason: serverData.fraudReason };
  } catch (err) {
    console.warn("Fraud check error:", err);
    return { isFrozen: false };
  }
}

/**
 * Admin Action: Continue / Verify Account (Unfreeze)
 */
export async function adminVerifyAndContinueAccount(userId: string, reportId?: string) {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    isFrozen: false,
    fraudAlert: false,
    fraudReason: null,
    status: 'active',
    updatedAt: serverTimestamp()
  });

  if (reportId) {
    await updateDoc(doc(db, 'fraudReports', reportId), {
      status: 'resolved',
      adminAction: 'continued',
      resolvedAt: serverTimestamp()
    });
  }
}

/**
 * Admin Action: Block / Ban Account
 */
export async function adminBlockAccount(userId: string, reportId?: string) {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    isFrozen: true,
    status: 'banned',
    fraudReason: 'Permanently blocked by admin due to fraud detection',
    updatedAt: serverTimestamp()
  });

  if (reportId) {
    await updateDoc(doc(db, 'fraudReports', reportId), {
      status: 'resolved',
      adminAction: 'blocked',
      resolvedAt: serverTimestamp()
    });
  }
}
