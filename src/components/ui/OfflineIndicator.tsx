import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-24 left-6 right-6 z-50 animate-bounce">
      <div className="bg-rose-600 text-white px-6 py-4 rounded-[2rem] shadow-2xl flex items-center justify-center gap-3">
        <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
        <span className="text-sm font-black uppercase tracking-widest">Offline Mode</span>
      </div>
    </div>
  );
};
