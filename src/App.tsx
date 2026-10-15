import { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { ArenaPage } from '@/src/pages/Arena';
import { AuthPage } from '@/src/pages/Auth';
import { MatchesPage } from '@/src/pages/Matches';
import { TournamentListPage } from '@/src/pages/TournamentList';
import { AdminDashboard } from '@/src/pages/AdminDashboard';
import { CreateTournamentPage } from '@/src/pages/CreateTournament';
import { GlobalChatPage } from '@/src/pages/GlobalChat';
import { LeaderboardPage } from '@/src/pages/Leaderboard';
import { ProfilePage } from '@/src/pages/Profile';
import { ArenaDetail } from '@/src/pages/ArenaDetail';
import { LeaguePage } from '@/src/pages/League';
import { useAuth } from '@/src/hooks/useAuth';
import { useFraudProtection } from '@/src/hooks/useFraudProtection';
import { Header, BottomNav, NavTab } from '@/src/components/layout/Shell';
import { SetupProfile } from '@/src/components/auth/SetupProfile';
import { OfflineIndicator } from '@/src/components/ui/OfflineIndicator';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { Button } from '@/src/components/ui/Primitives';
import { WalletModal } from '@/src/components/wallet/WalletModal';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  AppNotification, 
  playNotificationSound, 
  showSystemNotification, 
  markNotificationAsRead,
  requestPhoneNotificationPermission,
  sendTestPhoneNotification,
  updateAppBadge
} from '@/src/lib/notifications';
import { NotificationCenter } from '@/src/components/ui/NotificationCenter';
import { NotificationToast } from '@/src/components/ui/NotificationToast';
import { Bell, BellRing, X, ShieldAlert } from 'lucide-react';
import { useRef } from 'react';

export default function App() {
  const { user, profile, loading } = useAuth();
  const { isFrozen, fraudReason } = useFraudProtection(user, profile);
  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [leagueSubTab, setLeagueSubTab] = useState<'league' | 'leaderboard' | 'chat'>('league');
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

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

    const isAdmin = profile?.role === 'admin' || user.email === 'sperkplay@gmail.com';
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: AppNotification[] = [];
      const newItems: AppNotification[] = [];

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const n: AppNotification = { id: d.id, ...data } as AppNotification;

        const isForUser = n.recipientId === user.uid || n.recipientId === 'all' || (isAdmin && n.recipientId === 'admin');
        if (isForUser) {
          list.push(n);

          if (initialNotifLoadRef.current && !n.read && !knownNotifIdsRef.current.has(n.id)) {
            newItems.push(n);
          }
          knownNotifIdsRef.current.add(n.id);
        }
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
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestPhoneNotificationPermission().catch(() => {});
    }
  }, [user]);

  const handleNotificationNavigate = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }

    if (notif.extra?.openWallet || notif.type === 'payment_request' || notif.type === 'payment_status') {
      setShowNotificationCenter(false);
      setShowWalletModal(true);
      return;
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

  if (loading || !initialLoadComplete) {
    return (
      <GameLoader 
        text="CONNECTING TO MATCH ENGINE" 
        onComplete={() => setInitialLoadComplete(true)} 
      />
    );
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
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Account Suspended & Transactions Halted</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-relaxed">
              {fraudReason || 'Our 2-second anti-cheat security scanner detected unauthorized balance/token injection or fraudulent activity. All transactions and actions are currently suspended pending Admin verification.'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[10px] font-black text-amber-800 uppercase tracking-widest">
            Waiting for Admin Review & Verification
          </div>
          <Button 
            onClick={async () => {
              await signOut(auth);
              window.location.reload();
            }}
            className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest"
          >
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (!profile && !loading) {
    return <SetupProfile user={user} />;
  }

  const renderContent = () => {
    if (selectedTournament) {
      return (
        <div className="fixed inset-0 z-[4000] bg-soft-bg overflow-y-auto">
          <ArenaDetail 
            tournament={selectedTournament} 
            profile={profile} 
            onBack={() => setSelectedTournament(null)} 
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'arena':
        return (
          <ArenaPage 
            profile={profile} 
            onNavigate={setActiveTab} 
            onEnterTournament={setSelectedTournament} 
            onOpenWallet={() => setShowWalletModal(true)}
          />
        );
      case 'matches':
        if (profile?.role === 'publisher' || profile?.role === 'admin') {
          if (isAdminCreating) return <CreateTournamentPage profile={profile} onBack={() => setIsAdminCreating(false)} />;
          return (
            <AdminDashboard 
              onCreateNew={() => setIsAdminCreating(true)} 
              onEnterTournament={setSelectedTournament} 
              onOpenWallet={() => setShowWalletModal(true)}
            />
          );
        }
        return <MatchesPage profile={profile} />;
      case 'league':
        return (
          <div className="space-y-6 pt-4">
            <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-18 mx-2 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setLeagueSubTab('league')}
                className={cn(
                  "flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-wider rounded-full transition-all",
                  leagueSubTab === 'league' ? "nm-flat text-indigo-500 bg-[#f0f0f3]" : "text-slate-400"
                )}
              >
                Leagues
              </button>
              <button 
                onClick={() => setLeagueSubTab('leaderboard')}
                className={cn(
                  "flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-wider rounded-full transition-all",
                  leagueSubTab === 'leaderboard' ? "nm-flat text-indigo-500 bg-[#f0f0f3]" : "text-slate-400"
                )}
              >
                Top Rank
              </button>
              <button 
                onClick={() => setLeagueSubTab('chat')}
                className={cn(
                  "flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-wider rounded-full transition-all",
                  leagueSubTab === 'chat' ? "nm-flat text-indigo-500 bg-[#f0f0f3]" : "text-slate-400"
                )}
              >
                Global Chat
              </button>
            </div>
            {leagueSubTab === 'league' ? <LeaguePage profile={profile} /> : (leagueSubTab === 'leaderboard' ? <LeaderboardPage /> : <GlobalChatPage profile={profile} />)}
          </div>
        );
      case 'tournament':
        return <TournamentListPage profile={profile} onEnter={setSelectedTournament} />;
      case 'profile':
        return <ProfilePage user={user} profile={profile} onOpenWallet={() => setShowWalletModal(true)} />;
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
      case 'arena': return 'Dashboard';
      case 'matches': return 'My Matches';
      case 'league': return leagueSubTab === 'leaderboard' ? 'LEADERBOARD' : 'ARENA CHAT';
      case 'tournament': return 'ARENA';
      case 'profile': return 'Settings';
      default: return 'Dashboard';
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
          onOpenWallet={() => setShowWalletModal(true)}
          onOpenNotifications={() => setShowNotificationCenter(true)}
          unreadCount={unreadCount}
        />

        {/* Phone Notification Enable Banner */}
        <main className="max-w-lg mx-auto px-4 sm:px-6 pt-32 pb-36 min-h-screen animate-slide-left" key={activeTab}>
          {content}
        </main>
        <BottomNav 
          activeTab={activeTab} 
          onTabChange={(tab) => {
            setSelectedTournament(null);
            setActiveTab(tab);
          }} 
        />
        <OfflineIndicator />

        {/* Global Unified Wallet Modal */}
        <WalletModal 
          isOpen={showWalletModal} 
          onClose={() => setShowWalletModal(false)} 
          profile={profile} 
        />

        {/* Real-time Notification Center Modal */}
        <NotificationCenter 
          isOpen={showNotificationCenter}
          onClose={() => setShowNotificationCenter(false)}
          notifications={notifications}
          userId={user?.uid}
          onNavigateTab={(tab) => {
            setSelectedTournament(null);
            setActiveTab(tab as NavTab);
          }}
          onOpenWallet={() => setShowWalletModal(true)}
        />
      </div>
    </div>
  );
}
