import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/src/lib/utils';
import { ArenaPage } from '@/src/pages/Arena';
import { AuthPage } from '@/src/pages/Auth';
import { MatchesPage } from '@/src/pages/Matches';
import { TournamentListPage } from '@/src/pages/TournamentList';
import { AdminDashboard } from '@/src/pages/AdminDashboard';
import { CreateTournamentPage } from '@/src/pages/CreateTournament';
import { ProfilePage } from '@/src/pages/Profile';
import { ArenaDetail } from '@/src/pages/ArenaDetail';
import { useAuth } from '@/src/hooks/useAuth';
import { useFraudProtection } from '@/src/hooks/useFraudProtection';
import { useI18n } from '@/src/lib/i18n';
import { useAppUpdate } from '@/src/hooks/useAppUpdate';
import { Header, BottomNav, NavTab } from '@/src/components/layout/Shell';
import { SetupProfile } from '@/src/components/auth/SetupProfile';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { UpdateOverlay } from '@/src/components/ui/UpdateOverlay';
import { Button } from '@/src/components/ui/Primitives';
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  AppNotification, 
  playNotificationSound, 
  showSystemNotification, 
  markNotificationAsRead,
  requestPhoneNotificationPermission,
  sendTestPhoneNotification,
  updateAppBadge,
  registerPushNotifications
} from '@/src/lib/notifications';
import { NotificationCenter } from '@/src/components/ui/NotificationCenter';
import { NotificationToast } from '@/src/components/ui/NotificationToast';
import { Bell, BellRing, X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef } from 'react';

export default function App() {
  const { t } = useI18n();
  const { user, profile, loading } = useAuth();
  const { updateRequired, serverVersion, isMandatory, updateUrl, loading: updateLoading } = useAppUpdate();
  const { isFrozen, fraudReason } = useFraudProtection(user, profile);
  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [hasStartedApp, setHasStartedApp] = useState(false);

  // Notification States
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);

  // Set of known notification IDs to detect genuinely new arrivals (even across background/reconnections)
  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadRef = useRef(false);

  // Real-time Notification Listener
  useEffect(() => {
    if (!user?.uid) return;

    const isAdmin = profile?.role === 'admin' || user?.email === 'sperkplay@gmail.com';

    // Notify Service Worker about current user for background Firestore listening
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      setTimeout(() => {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SET_USER_ID',
          userId: user.uid
        });
      }, 2000);
    }

    const recipientIds = [user.uid, 'all'];
    if (isAdmin) recipientIds.push('admin');

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', 'in', recipientIds),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: AppNotification[] = [];
      const newItems: AppNotification[] = [];

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const n: AppNotification = { id: d.id, ...data } as AppNotification;
        list.push(n);

        if (initialNotifLoadRef.current && !n.read && !knownNotifIdsRef.current.has(n.id)) {
          newItems.push(n);
        }
        knownNotifIdsRef.current.add(n.id);
      });

      setNotifications(list);

      if (!initialNotifLoadRef.current) {
        list.forEach((item) => knownNotifIdsRef.current.add(item.id));
        initialNotifLoadRef.current = true;
      } else if (newItems.length > 0) {
        const newest = newItems[0];
        setToastNotification(newest);
        playNotificationSound();
        showSystemNotification(newest.title, { 
          body: newest.message, 
          tag: newest.id,
          url: '/'
        });
      }
    }, (err) => {
      console.warn("Notifications listener error:", err?.message || err);
    });

    return () => unsub();
  }, [user?.uid, profile?.role]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  // Automatically enable notification mode in background if supported
  useEffect(() => {
    if (!user) return;
    
    // Register for native push notifications (Android/Capacitor) with a slight delay
    // to ensure app stability during the login/auth transition.
    const timer = setTimeout(() => {
      if (Capacitor.isNativePlatform()) {
        console.log('Registering for push notifications...');
        registerPushNotifications(user.uid).catch(err => {
          console.error('Push registration error handled:', err);
        });
      }
    }, 5000); // 5 second delay

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestPhoneNotificationPermission().catch(() => {});
    }

    return () => clearTimeout(timer);
  }, [user?.uid]);

  // Scroll to top on navigation or modal open
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab, selectedTournament]);

  // Lock body scroll when global modals are open
  useEffect(() => {
    if (showNotificationCenter || selectedTournament) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showNotificationCenter, selectedTournament]);

  const handleNotificationNavigate = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }



    if (notif.tournamentId) {
      try {
        const tSnap = await getDoc(doc(db, 'tournaments', notif.tournamentId));
        if (tSnap.exists()) {
          setSelectedTournament({ id: tSnap.id, ...tSnap.data() });
          setShowNotificationCenter(false);
          return;
        }
      } catch (e) {
        console.warn("Could not load tournament:", e);
      }
    }

    if (notif.linkTab) {
      setSelectedTournament(null);
      setActiveTab(notif.linkTab as NavTab);
      setShowNotificationCenter(false);
    }
  };

  if (loading || !hasStartedApp || updateLoading) {
    return <GameLoader onComplete={() => setHasStartedApp(true)} />;
  }

  if (updateRequired) {
    return <UpdateOverlay serverVersion={serverVersion} isMandatory={isMandatory} updateUrl={updateUrl} />;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (isFrozen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border-4 border-rose-500/30 text-center space-y-6 animate-in zoom-in-95">
          <div className="w-20 h-20 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner border border-rose-100">
            <ShieldAlert size={40} className="animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">{t('security_alert')}</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-relaxed">
              {fraudReason || t('security_message')}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[10px] font-black text-amber-800 uppercase tracking-widest">
            {t('waiting_admin')}
          </div>
          <Button 
            onClick={async () => {
              await signOut(auth);
              window.location.reload();
            }}
            className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest"
          >
            {t('sign_out_button')}
          </Button>
        </div>
      </div>
    );
  }

  if (!profile && !loading) {
    return <SetupProfile user={user} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'arena':
        return (
          <ArenaPage 
            profile={profile} 
            onNavigate={setActiveTab} 
            onEnterTournament={setSelectedTournament} 
          />
        );
      case 'matches':
        if (profile?.role === 'publisher' || profile?.role === 'admin') {
          if (isAdminCreating) return <CreateTournamentPage profile={profile} onBack={() => setIsAdminCreating(false)} />;
          return (
            <AdminDashboard 
              onCreateNew={() => setIsAdminCreating(true)} 
              onEnterTournament={setSelectedTournament} 
            />
          );
        }
        return <MatchesPage profile={profile} />;

      case 'tournament':
        return <TournamentListPage profile={profile} onEnter={setSelectedTournament} />;
      case 'profile':
        return <ProfilePage user={user} profile={profile} />;
      default:
        return <ArenaPage profile={profile} onNavigate={setActiveTab} onEnterTournament={setSelectedTournament} />;
    }
  };

  // Publisher hack: If user is publisher, replace matches with admin dashboard
  const content = renderContent();

  const getTitle = () => {
    if (activeTab === 'matches' && (profile?.role === 'publisher' || profile?.role === 'admin')) {
      return isAdminCreating ? 'CREATE TOURNAMENT' : (profile.role === 'admin' ? 'COMMAND CENTER' : 'PUBLISHER PORTAL');
    }
    switch (activeTab) {
      case 'arena': return 'DASHBOARD';
      case 'matches': return 'My Matches';

      case 'tournament': return 'ARENA';
      case 'profile': return 'SETTINGS';
      default: return 'DASHBOARD';
    }
  };

  return (
    <div className="relative min-h-screen font-sans selection:bg-slate-900 selection:text-white pb-safe">
      {/* Locked Fixed Background Layer - Will NEVER move or scroll */}
      <div className="app-fixed-bg" />

      {/* Real-time floating Notification Toast Banner */}
      <NotificationToast 
        notification={toastNotification}
        onClose={() => setToastNotification(null)}
        onClick={(n) => {
          setToastNotification(null);
          handleNotificationNavigate(n);
        }}
      />

      <div className="relative z-10">
        <Header 
          title={getTitle()} 
          profile={profile} 
          onOpenNotifications={() => setShowNotificationCenter(true)}
          unreadCount={unreadCount}
        />

        {/* Phone Notification Enable Banner */}
        <AnimatePresence mode="wait">
          <motion.main 
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-lg mx-auto px-4 sm:px-6 pt-28 pb-36 min-h-screen"
          >
            {content}
          </motion.main>
        </AnimatePresence>

        {/* Tournament Arena Window - Outside main to prevent transform issues */}
        {selectedTournament && (
          <div className="fixed inset-0 z-[8000] bg-soft-bg overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
            <ArenaDetail 
              tournament={selectedTournament} 
              profile={profile} 
              onBack={() => setSelectedTournament(null)} 
            />
          </div>
        )}

        <div className="relative z-[9000]">
          <BottomNav 
            activeTab={activeTab} 
            onTabChange={(tab) => {
              setSelectedTournament(null);
              setActiveTab(tab);
            }} 
          />
        </div>


        {/* Real-time Notification Center Modal */}
        <div className="relative z-[5001]">
          <NotificationCenter 
            isOpen={showNotificationCenter}
            onClose={() => setShowNotificationCenter(false)}
            notifications={notifications}
            userId={user?.uid}
            onNavigateTab={(tab) => {
              setSelectedTournament(null);
              setActiveTab(tab as NavTab);
            }}
          />
        </div>
      </div>
    </div>
  );
}
