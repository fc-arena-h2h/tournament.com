import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

/**
 * Evaluate user fraud/ban status directly from the real-time profile synced via onSnapshot
 */
export async function checkUserFraudStatus(userId: string, currentProfile: any): Promise<{ isFrozen: boolean; fraudReason?: string }> {
  if (!userId || !currentProfile) return { isFrozen: false };

  if (currentProfile.isFrozen || currentProfile.status === 'banned') {
    return {
      isFrozen: true,
      fraudReason: currentProfile.fraudReason || 'Account suspended by security system or admin'
    };
  }

  return { isFrozen: false, fraudReason: currentProfile.fraudReason };
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
