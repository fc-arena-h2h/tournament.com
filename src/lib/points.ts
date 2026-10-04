import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

export interface PointTransaction {
  id?: string;
  userId: string;
  type: 'earned' | 'spent' | 'refunded' | 'penalized';
  amount: number;
  title: string;
  description: string;
  timestamp: Timestamp | string;
}

export const logPointTransaction = async (
  userId: string,
  type: 'earned' | 'spent' | 'refunded' | 'penalized',
  amount: number,
  title: string,
  description: string
) => {
  try {
    await addDoc(collection(db, 'point_transactions'), {
      userId,
      type,
      amount,
      title,
      description,
      timestamp: Timestamp.now()
    });
  } catch (err) {
    console.error('Failed to log point transaction:', err);
  }
};
