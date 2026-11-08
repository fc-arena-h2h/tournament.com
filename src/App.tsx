import { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { ArenaPage } from './pages/Arena';
import { AuthPage } from './pages/Auth';
import { MatchesPage } from './pages/Matches';
import { TournamentListPage } from './pages/TournamentList';
import { AdminDashboard } from './pages/AdminDashboard';
import { CreateTournamentPage } from './pages/CreateTournament';
import { ProfilePage } from './pages/Profile';
import { ArenaDetail } from './pages/ArenaDetail';
import { useAuth } from './hooks/useAuth';
import { useFraudProtection } from './hooks/useFraudProtection';
import { useI18n } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { useAppUpdate } from './hooks/useAppUpdate';
import { Header, BottomNav, NavTab } from './components/layout/Shell';
import { SetupProfile } from './components/auth/SetupProfile';
import { GameLoader } from './components/ui/GameLoader';
import { UpdateOverlay } from './components/ui/UpdateOverlay';
import { Button } from '@/src/components/ui/Primitives';
import { auth } from './lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  AppNotification, 
  playNotificationSound, 
  showSystemNotification, 
  markNotificationAsRead,
  requestPhoneNotificationPermission,
  updateAppBadge,
  subscribeToUserNotificationsAcrossShards,
} from './lib/notifications';
import { findTournamentAcrossShards } from './lib/shardManager';
import { runLocalDbGarbageCollection } from './lib/localDbManager';
import { NotificationCenter } from './components/ui/NotificationCenter';
import { NotificationToast } from './components/ui/NotificationToast';
import { X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef } from 'react';

export default function App() {
  const { t } = useI18n();
  const { user, profile, loading } = useAuth();
  const { updateRequired, serverVersion, isMandatory, updateUrl, telegramUpdateUrl, chromeUpdateUrl, loading: updateLoading } = useAppUpdate();
  const { isFrozen, fraudReason } = useFraudProtection(user, profile);
  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [isDemoCreating, setIsDemoCreating] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [hasStartedApp, setHasStartedApp] = useState(false);
  const [integrityValid, setIntegrityValid] = useState(true);

  // Integrity Check
  useEffect(() => {
    import('./lib/integrity').then(({ checkAppIntegrity }) => {
      checkAppIntegrity().then((result) => {
        if (!result.valid) {
          setIntegrityValid(false);
        }
      });
    });
  }, []);

  // Notification States
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);

  // Set of known notification IDs to detect genuinely new arrivals (even across background/reconnections)
  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadRef = useRef(false);

  // Real-time Multi-Shard Notification Listener (App v1 + MY App 1 + Master zxzx)
  useEffect(() => {
    runLocalDbGarbageCollection();
  }, []);

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

    const unsub = subscribeToUserNotificationsAcrossShards(user.uid, isAdmin, (list) => {
      const newItems: AppNotification[] = [];

      list.forEach((n) => {
        const key = `${n.shardId || 'master'}_${n.id}`;
        if (initialNotifLoadRef.current && !n.read && !knownNotifIdsRef.current.has(key)) {
          newItems.push(n);
        }
        knownNotifIdsRef.current.add(key);
      });

      setNotifications(list);

      if (!initialNotifLoadRef.current) {
        list.forEach((item) => knownNotifIdsRef.current.add(`${item.shardId || 'master'}_${item.id}`));
        initialNotifLoadRef.current = true;
      } else if (newItems.length > 0) {
        const newest = newItems[0];
        setToastNotification(newest);
        playNotificationSound();
        showSystemNotification(newest.title, { 
          body: newest.message, 
          tag: newest.id,
          url: import.meta.env.BASE_URL
        });
      }
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
    
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestPhoneNotificationPermission().catch(() => {});
    }
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
      await markNotificationAsRead(notif.id, notif.shardId);
    }

    if (notif.tournamentId) {
      try {
        const found = await findTournamentAcrossShards(notif.tournamentId, notif.shardId);
        if (found.exists && found.data) {
          setSelectedTournament(found.data);
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
    return (
      <UpdateOverlay
        serverVersion={serverVersion}
        isMandatory={isMandatory}
        updateUrl={updateUrl}
        telegramUpdateUrl={telegramUpdateUrl}
        chromeUpdateUrl={chromeUpdateUrl}
      />
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <AuthPage />
      </ThemeProvider>
    );
  }

  if (isFrozen) {
    return (
      <ThemeProvider>
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
      </ThemeProvider>
    );
  }

  if (!integrityValid) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="space-y-6 max-w-xs">
          <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border-2 border-rose-500/20">
            <X size={40} strokeWidth={3} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white uppercase italic">INTEGRITY FAILURE</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              This application has been modified by an unauthorized 3rd party tool. Please download the official APK from GitHub.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
             <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest italic">Security Guard Active</span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile && !loading) {
    return (
      <ThemeProvider>
        <SetupProfile user={user} />
      </ThemeProvider>
    );
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
          if (isDemoCreating) return <CreateTournamentPage profile={profile} onBack={() => setIsDemoCreating(false)} isDemo />;
          return (
            <AdminDashboard 
              onCreateNew={() => setIsAdminCreating(true)} 
              onCreateDemo={() => setIsDemoCreating(true)}
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
      case 'matches': return 'MY MATCH';

      case 'tournament': return 'ARENA';
      case 'profile': return 'SETTINGS';
      default: return 'DASHBOARD';
    }
  };

  return (
    <ThemeProvider>
      <div className="relative min-h-screen font-sans selection:bg-slate-900 selection:text-white pb-safe">
        {/* Locked Fixed Background Layer - Will NEVER move or scroll */}
        <div className="app-fixed-bg overflow-hidden">
          <div className="hidden dark:block absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#ff7a45]/14 blur-[110px]" />
          <div className="hidden dark:block absolute top-1/4 -right-28 w-[26rem] h-[26rem] rounded-full bg-[#a855f7]/16 blur-[120px]" />
          <div className="hidden dark:block absolute -bottom-24 left-1/4 w-96 h-96 rounded-full bg-[#38bdf8]/12 blur-[110px]" />
        </div>

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
              onNavigateTab={async (tab, meta) => {
                if (meta?.tournamentId) {
                  try {
                    const found = await findTournamentAcrossShards(meta.tournamentId, meta.shardId);
                    if (found.exists && found.data) {
                      setSelectedTournament(found.data);
                      return;
                    }
                  } catch {}
                }
                setSelectedTournament(null);
                setActiveTab(tab as NavTab);
              }}
            />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
