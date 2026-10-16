import { useEffect, useState, useRef } from 'react';
import { checkUserFraudStatus } from '@/src/lib/fraudProtection';

export function useFraudProtection(user: any, profile: any) {
  const [isFrozen, setIsFrozen] = useState(false);
  const [fraudReason, setFraudReason] = useState<string | null>(null);
  const profileRef = useRef(profile);
  const isCheckingRef = useRef(false);

  // Keep latest profile updated without restarting interval
  useEffect(() => {
    profileRef.current = profile;
    if (profile?.isFrozen !== undefined && profile?.isFrozen !== isFrozen) {
      setIsFrozen(profile.isFrozen);
      if (profile.fraudReason) setFraudReason(profile.fraudReason);
    }
  }, [profile, isFrozen]);

  useEffect(() => {
    if (!user?.uid) return;

    const performCheck = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      try {
        const res = await checkUserFraudStatus(user.uid, profileRef.current);
        setIsFrozen(res.isFrozen);
        if (res.fraudReason) setFraudReason(res.fraudReason);
      } catch (err) {
        console.warn("Fraud check error:", err);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Run initial check
    performCheck();

    // Run periodic integrity check every 2 seconds
    const interval = setInterval(performCheck, 2000);

    return () => clearInterval(interval);
  }, [user?.uid]);

  return { isFrozen, fraudReason };
}
