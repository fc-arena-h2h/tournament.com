import { useEffect, useState } from 'react';

export function useFraudProtection(user: any, profile: any) {
  const [isFrozen, setIsFrozen] = useState(false);
  const [fraudReason, setFraudReason] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !profile) {
      setIsFrozen(false);
      setFraudReason(null);
      return;
    }

    const frozen = Boolean(profile.isFrozen || profile.status === 'banned');
    setIsFrozen(frozen);

    if (frozen) {
      setFraudReason(profile.fraudReason || 'Account suspended by security system or admin');
    } else {
      setFraudReason(profile.fraudReason || null);
    }
  }, [user?.uid, profile?.isFrozen, profile?.status, profile?.fraudReason, profile]);

  return { isFrozen, fraudReason };
}

