import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { APP_VERSION, APP_ID, DEFAULT_UPDATE_URL } from '@/src/lib/constants';

export function useAppUpdate() {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [serverVersion, setServerVersion] = useState(APP_VERSION);
  const [isMandatory, setIsMandatory] = useState(false);
  const [updateUrl, setUpdateUrl] = useState(DEFAULT_UPDATE_URL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to system configuration for app versioning
    const unsub = onSnapshot(doc(db, 'settings', 'app_update'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const minVersion = data.min_version || APP_VERSION;
        const remoteAppId = data.app_id || APP_ID;
        const forceUpdate = data.force_update ?? true;
        const remoteUpdateUrl = data.update_url || DEFAULT_UPDATE_URL;

        setServerVersion(minVersion);
        setIsMandatory(forceUpdate);
        setUpdateUrl(remoteUpdateUrl);

        // Check if local version or app ID is outdated
        const needsUpdate = (APP_VERSION !== minVersion) || (APP_ID !== remoteAppId);
        
        if (needsUpdate && forceUpdate) {
          setUpdateRequired(true);
        } else {
          setUpdateRequired(false);
        }
      }
      setLoading(false);
    }, (err) => {
      console.warn("Update checker error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { updateRequired, serverVersion, isMandatory, updateUrl, loading };
}
