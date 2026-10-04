import { Timestamp, collection, query, where, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Formats a Firestore Timestamp according to requirements:
 * - Today: 14:30
 * - Within 7 days: Monday 14:30
 * - Older than 7 days: 2026-09-24 14:30
 */
export const formatMessageTimestamp = (timestamp: Timestamp | null) => {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  const now = new Date();
  
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  // Check if it's today
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return timeStr;
  }
  
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: 'long' });
    return `${dayName} ${timeStr}`;
  }
  
  const dateStr = date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${dateStr} ${timeStr}`;
};

/**
 * Deletes messages older than 15 days from the database.
 * This should be called periodically (e.g., when the app loads or a message is sent).
 */
export const cleanupOldMessages = async () => {
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const cutoffTimestamp = Timestamp.fromDate(fifteenDaysAgo);
  
  try {
    const q = query(
      collection(db, 'messages'),
      where('timestamp', '<', cutoffTimestamp)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    
    const batch = writeBatch(db);
    snapshot.docs.forEach((msgDoc) => {
      batch.delete(msgDoc.ref);
    });
    
    await batch.commit();
    console.log(`Cleaned up ${snapshot.size} old messages.`);
  } catch (error) {
    console.error("Failed to cleanup old messages:", error);
  }
};
