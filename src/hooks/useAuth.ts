import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'player' | 'publisher' | 'admin';
  inGameName?: string;
  inGameUID?: string;
  leagueName?: string;
  fbUrl?: string;
  messengerLink?: string;
  leagueMessengerGroupLink?: string;
  whatsappNumber?: string;
  phone?: string;
  pushEnabled?: boolean;
  fcmTokens?: string[];
  isFrozen?: boolean;
  status?: string;
  fraudReason?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        // Load cached profile immediately for instant UI
        try {
          const cached = localStorage.getItem('fc_arena_profile_' + firebaseUser.uid);
          if (cached) {
            setProfile(JSON.parse(cached));
            setLoading(false);
          }
        } catch {}

        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          (docSnap) => {
            if (docSnap.exists()) {
              const pData = docSnap.data() as UserProfile;
              setProfile(pData);
              try {
                localStorage.setItem('fc_arena_profile_' + firebaseUser.uid, JSON.stringify(pData));
              } catch {}
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (error: any) => {
            // Graceful handling for quota exceeded or offline errors
            if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota') || error?.message?.includes('quota')) {
              console.warn("Firestore quota limit reached. Operating from local cache.");
            } else {
              console.warn("Auth profile sync notice:", error?.message || error);
            }
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return { user, profile, loading };
}
