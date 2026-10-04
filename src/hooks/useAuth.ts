import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'player' | 'publisher' | 'admin';
  inGameName?: string;
  inGameUID?: string;
  leagueName?: string;
  ovr?: number;
  fbUrl?: string;
  messengerLink?: string;
  whatsappNumber?: string;
  phone?: string;
  avatar?: string;
  wallet?: number;
  eliteScore?: number;
  stats?: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    globalRank: number;
  };
}

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Listen to profile changes
        const unsub = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (error) => {
            console.error("Auth profile sync error:", error);
            setLoading(false);
          }
        );
        return () => unsub();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  return { user, profile, loading };
}
