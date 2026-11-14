import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import {
  subscribeToUserProfile,
  getCachedUserProfile
} from '@/src/lib/userDbManager';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'player' | 'publisher' | 'admin';
  inGameName?: string;
  inGameUID?: string;
  ovr?: string;
  clubId?: string;
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
  profileCompleted?: boolean;
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
        const cached = getCachedUserProfile(firebaseUser.uid);
        if (cached) {
          setProfile(cached);
          setLoading(false);
        } else {
          try {
            const rawLegacy = localStorage.getItem('fc_arena_profile_' + firebaseUser.uid);
            if (rawLegacy) {
              setProfile(JSON.parse(rawLegacy));
              setLoading(false);
            }
          } catch {}
        }

        unsubProfile = subscribeToUserProfile(
          firebaseUser.uid,
          firebaseUser.email,
          (pData) => {
            setProfile(pData);
            setLoading(false);
          },
          (error: any) => {
            if (
              error?.code === 'resource-exhausted' ||
              error?.message?.includes('Quota') ||
              error?.message?.includes('quota')
            ) {
              console.warn('Firestore quota limit reached. Operating from local cache.');
            } else {
              console.warn('Auth profile sync notice:', error?.message || error);
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

