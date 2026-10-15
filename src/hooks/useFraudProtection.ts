import { useEffect, useState } from 'react';
import { checkUserFraudStatus } from '@/src/lib/fraudProtection';

export function useFraudProtection(user: any, profile: any) {
  const [isFrozen, setIsFrozen] = useState(false);
  const [fraudReason, setFraudReason] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !profile) return;

    // Check immediately on mount
    checkUserFraudStatus(user.uid, profile).then(res => {
      setIsFrozen(res.isFrozen);
      if (res.fraudReason) setFraudReason(res.fraudReason);
    });

    // Run every 2 seconds as requested by user
    const interval = setInterval(async () => {
      const res = await checkUserFraudStatus(user.uid, profile);
      setIsFrozen(res.isFrozen);
      if (res.fraudReason) setFraudReason(res.fraudReason);
    }, 2000);

    return () => clearInterval(interval);
  }, [user?.uid, profile]);

  return { isFrozen, fraudReason };
}
