import { Trophy, Home, Calendar, Users, User, Download, Shield, Bell, X, Megaphone, Clock, MoreVertical, LifeBuoy, Info, Wallet, Settings, Activity, ShieldAlert, HeartHandshake, Zap, LogOut, Languages, Send } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { Card } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { useI18n } from '@/src/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';

import { SupportAI } from '@/src/components/ui/SupportAI';
import { Logo } from '@/src/components/ui/Logo';

export type NavTab = 'arena' | 'matches' | 'tournament' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const { t } = useI18n();
  const tabs = [
    { id: 'arena' as NavTab, label: t('nav_dashboard'), icon: Home },
    { id: 'tournament' as NavTab, label: t('nav_arena'), icon: Trophy },
    { id: 'matches' as NavTab, label: t('nav_field'), icon: Calendar },
    { id: 'profile' as NavTab, label: t('nav_me'), icon: User },
  ];

  return (
    <nav className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-[9000] w-[96%] max-w-lg px-1 sm:px-2">
      <div className="nm-flat rounded-[2.5rem] sm:rounded-[3rem] h-20 sm:h-24 flex items-center justify-around border-2 border-white/50 px-2 sm:px-4 shadow-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-all h-20 w-16 rounded-[2rem] relative',
                isActive ? 'nm-inset text-indigo-500 bg-[#e6e6e9]' : 'text-slate-400'
              )}
            >
              <Icon size={24} strokeWidth={isActive ? 3 : 2} className={cn(isActive && 'scale-110')} />
              <span className="text-[8px] font-black tracking-widest uppercase mt-1">
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-2 w-1.5 h-1.5 rounded-full bg-indigo-500 nm-flat border border-white/50 shadow-sm" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export const Header = ({ 
  title, 
  profile, 
  showBack, 
  onBack,
  onOpenWallet,
  onOpenNotifications,
  unreadCount = 0
}: { 
  title: string; 
  profile?: UserProfile | null; 
  showBack?: boolean; 
  onBack?: () => void;
  onOpenWallet?: () => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}) => {
  const { isInstallable, install } = usePWAInstall();
  const { t } = useI18n();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSupportAI, setShowSupportAI] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnnouncements(docs);
      if (!snap.empty) {
        setHasNew(true);
      }
    }, (err) => {
      console.warn("Announcements notice:", err?.message || err);
    });
    return () => unsub();
  }, []);

  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 px-3 sm:px-6 py-4 sm:py-6 transition-all duration-300",
      showMenu || showAbout || showSupportAI ? "z-[3000]" : "z-50"
    )}>
      <div className="nm-flat rounded-full h-18 sm:h-20 px-4 sm:px-8 flex items-center justify-between border-2 border-white/50 relative">
        <div className="flex items-center gap-4">
          {showBack ? (
            <button onClick={onBack} className="w-12 h-12 rounded-2xl nm-flat flex items-center justify-center text-slate-800 border border-white/40 active:nm-pressed">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div className="relative group">
              <div className="w-14 h-14 rounded-[1.2rem] bg-fc-dark border-2 border-white shadow-2xl flex items-center justify-center overflow-hidden relative active:scale-95 transition-all duration-300">
                <Logo size={42} variant="color" className="relative z-10" />
                
                {/* Pro Badge */}
                <div className="absolute -bottom-0.5 -right-0.5 bg-indigo-600 text-white text-[6px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-lg border border-white/20 transform rotate-12 group-hover:rotate-0 transition-transform">
                  Pro
                </div>
                
                {/* Neon Accent Line */}
                <div className="absolute inset-0 border border-indigo-500/20 rounded-[1.1rem] pointer-events-none" />
              </div>
              {/* Badge */}
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-lg bg-fc-green border-2 border-white flex items-center justify-center text-[6px] font-black text-white italic shadow-lg z-20">
                FC
              </div>
            </div>
          )}
        </div>

        {/* Decorative Title Area */}
        <div className="flex-1 flex items-center justify-center gap-4 px-4">
          <div className="flex-1 h-[1px] bg-slate-200" />
          <h1 className="text-sm font-black text-slate-800 uppercase italic tracking-widest whitespace-nowrap">
            {title}
          </h1>
          <div className="flex-1 h-[1px] bg-slate-200" />
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">

          <button 
            onClick={() => {
              if (onOpenNotifications) {
                onOpenNotifications();
              } else {
                setShowNotifications(true);
                setHasNew(false);
              }
            }}
            className="w-11 sm:w-12 h-11 sm:h-12 rounded-2xl nm-flat text-slate-800 border border-white/40 flex items-center justify-center relative active:nm-pressed"
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full border-2 border-white flex items-center justify-center shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : hasNew ? (
              <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white animate-pulse" />
            ) : null}
          </button>
          {isInstallable && (
            <button 
              onClick={install}
              className="w-10 h-10 rounded-xl nm-flat text-indigo-500 border border-white/40 flex items-center justify-center animate-pulse active:nm-pressed"
            >
              <Download size={18} />
            </button>
          )}
          <button 
            onClick={() => setShowMenu(true)}
            className="w-11 sm:w-12 h-11 sm:h-12 rounded-2xl nm-flat text-slate-800 border border-white/40 flex items-center justify-center active:nm-pressed shadow-sm"
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      <SupportAI 
        isOpen={showSupportAI} 
        onClose={() => setShowSupportAI(false)} 
        userId={auth.currentUser?.uid || 'guest'} 
      />

      {/* About Arena Modal */}
      <AnimatePresence>
        {showAbout && (
          <div className="fixed inset-0 z-[4000] bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-[#f0f1f5] rounded-[3rem] border-2 border-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-white/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl nm-inset bg-[#e6e6e9] flex items-center justify-center text-indigo-600">
                    <Info size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">App Identity</span>
                    <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">About <span className="text-indigo-600">Arena</span></h2>
                  </div>
                </div>
                <button onClick={() => setShowAbout(false)} className="w-11 h-11 rounded-2xl nm-flat bg-white flex items-center justify-center text-slate-400 active:nm-pressed">
                  <X size={22} />
                </button>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto no-scrollbar pb-12">
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Welcome to the Arena
                  </h3>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-tight">
                    Thank you for joining <span className="text-indigo-600">FC ARENA VS</span>. We are honored to welcome you to the most professional eSports management platform for FC Mobile pro players. Our goal is to provide a seamless, competitive, and fair environment for the community to showcase their skills.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Core Features
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { title: 'Tournament Tracking', desc: 'Real-time updates on active Cups and match schedules.' },
                      { title: 'Automated Brackets', desc: 'Instant progression from group stages to knockout finals.' },
                      { title: 'Digital Hub', desc: 'Direct Messenger & WhatsApp contact for opponent coordination.' },
                      { title: 'Official Results', desc: 'Direct score reporting and host verification for all matches.' },
                      { title: 'Smart Alerts', desc: 'Push notifications for match schedules and tournament news.' }
                    ].map((f) => (
                      <div key={f.title} className="p-4 rounded-2xl nm-inset bg-white/40 border border-white/50 space-y-1">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{f.title}</span>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight leading-normal">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-fc-green" />
                    How It Works
                  </h3>
                  <div className="p-6 rounded-[2rem] nm-flat bg-white border border-white/50 space-y-4">
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Phase 1: Enlistment</span>
                      <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase italic">
                        Verified Hosts create tournaments with unique prize pools and rules. Players enlist in public or invited Cups using their FC Mobile credentials.
                      </p>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Phase 2: Battle</span>
                      <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase italic">
                        Once approved, you enter the Arena. Matches are automatically scheduled. Connect with your opponent via the integrated Messenger links to coordinate the game.
                      </p>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Phase 3: Victory</span>
                      <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase italic">
                        Report your match score directly in the app. Once confirmed by the host, winners advance through the bracket until a champion is crowned.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-indigo-50/50 border-t border-white/20 text-center shrink-0">
                <button 
                  onClick={() => setShowAbout(false)}
                  className="w-full h-14 nm-flat bg-indigo-600 rounded-2xl text-white font-black uppercase tracking-widest italic active:nm-pressed shadow-xl"
                >
                  Return to Menu
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Panel Overlay */}
      {showNotifications && (
        <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
           <div className="p-8 pt-16 border-b border-slate-100 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alerts & Updates</span>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Notification Center</h2>
              </div>
              <button 
                onClick={() => setShowNotifications(false)}
                className="w-12 h-12 rounded-full nm-flat flex items-center justify-center text-slate-400 active:nm-pressed"
              >
                <X size={24} />
              </button>
           </div>

           <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
             {announcements.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <Megaphone size={48} className="text-slate-300 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">No new announcements</p>
               </div>
             ) : (
               announcements.map((a) => (
                 <Card key={a.id} className="p-6 border-none bg-indigo-50/30">
                    <div className="flex items-start gap-4">
                       <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shrink-0">
                          <Megaphone size={16} />
                       </div>
                       <div className="flex flex-col gap-2 flex-1">
                          <div className="flex items-center justify-between">
                             <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{a.senderName || 'Admin'}</span>
                             <div className="flex items-center gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                <Clock size={10} />
                                {a.createdAt?.toMillis ? new Date(a.createdAt.toMillis()).toLocaleDateString() : 'Just now'}
                             </div>
                          </div>
                          <p className="text-xs font-bold text-slate-800 leading-relaxed uppercase italic">
                            {a.text}
                          </p>
                       </div>
                    </div>
                 </Card>
               ))
             )}
           </div>
        </div>
      )}

      {/* Main Menu Overlay - Full Screen Solid Window */}
      {showMenu && (
        <div className="fixed inset-0 w-screen h-screen z-[3001] bg-[#f8fafc] flex flex-col animate-in slide-in-from-right duration-500">
           {/* Header of the Menu - Solid background */}
           <div className="shrink-0 bg-[#f8fafc] border-b border-slate-200 pt-16 px-8 pb-8 flex items-center justify-between shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Navigation & Services</span>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Arena Menu</h2>
              </div>
              <button 
                onClick={() => setShowMenu(false)}
                className="w-12 h-12 rounded-full nm-flat flex items-center justify-center text-slate-400 active:nm-pressed"
              >
                <X size={24} />
              </button>
           </div>

           {/* Scrollable Content Area with Perfectly Solid Background */}
           <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar pb-32 bg-[#f8fafc]">
              {/* General Section */}
              <div className="space-y-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] ml-4">GENERAL SERVICES</span>
                <div className="grid grid-cols-1 gap-3">
                  {[

                    {
                      label: 'Test Push Notification',
                      icon: Bell,
                      color: 'text-amber-500',
                      badge: 'FCM',
                      sub: 'Send test background push',
                      onClick: async () => {
                        setShowMenu(false);
                        const { sendTestPhoneNotification } = await import('@/src/lib/notifications');
                        const res = await sendTestPhoneNotification();
                        alert(res.message);
                      }
                    },
                    { 
                      label: 'Support Center', 
                      icon: HeartHandshake, 
                      color: 'text-indigo-500', 
                      sub: '24/7 Player Assistance',
                      onClick: () => {
                        setShowMenu(false);
                        setShowSupportAI(true);
                      }
                    },
                    { 
                      label: 'About Arena', 
                      icon: Info, 
                      color: 'text-slate-800', 
                      sub: 'FC Mobile eSports Platform',
                      onClick: () => {
                        setShowMenu(false);
                        setShowAbout(true);
                      }
                    },
                    { 
                      label: 'Contact Us', 
                      icon: Send, 
                      color: 'text-sky-500', 
                      sub: 'Join our Telegram community',
                      onClick: () => {
                        setShowMenu(false);
                        window.open('https://t.me/fcarenavs', '_blank');
                      }
                    }
                  ].map((item) => (
                    <button 
                      key={item.label} 
                      onClick={() => {
                        if (item.onClick) {
                          item.onClick();
                        }
                      }}
                      className="w-full h-20 nm-flat bg-white rounded-3xl px-6 flex items-center justify-between border border-white/50 active:nm-pressed group transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl nm-inset flex items-center justify-center transition-transform group-active:scale-95 shrink-0", item.color)}>
                          <item.icon size={24} />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="text-sm font-black text-slate-800 uppercase italic leading-tight">{item.label}</span>
                          <span className="text-[10px] font-bold text-slate-400">{item.sub}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge && (
                          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black font-mono border border-emerald-200">
                            {item.badge}
                          </span>
                        )}
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-200 group-hover:bg-slate-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin/Host Controls - Only for privileged users */}
              {(profile?.role === 'admin' || profile?.role === 'publisher') && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 ml-4">
                    <Shield size={12} className="text-indigo-500" />
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em]">ADMIN OPERATIONS</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { label: 'Tournament Control', icon: Activity, color: 'text-indigo-600' },
                      { label: 'User Management', icon: ShieldAlert, color: 'text-amber-600' },
                      { label: 'Platform Settings', icon: Settings, color: 'text-slate-600' }
                    ].map((item) => (
                      <button key={item.label} className="w-full h-20 nm-flat bg-white rounded-3xl px-6 flex items-center justify-between border border-indigo-100/30 active:nm-pressed group">
                        <div className="flex items-center gap-5">
                          <div className={cn("w-12 h-12 rounded-2xl nm-inset flex items-center justify-center transition-transform group-active:scale-95", item.color)}>
                            <item.icon size={24} />
                          </div>
                          <span className="text-sm font-black text-slate-800 uppercase italic">{item.label}</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-indigo-50 text-[8px] font-black text-indigo-600 uppercase border border-indigo-100">PRO</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Support Socials Footer */}
              <div className="nm-flat rounded-[3rem] p-10 border-4 border-white/40 space-y-8 bg-slate-50/50">
                 <div className="text-center space-y-2">
                    <h4 className="text-xs font-black text-slate-800 uppercase italic">Elite Community</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Connect with pro players worldwide</p>
                 </div>
                 <div className="flex gap-4">
                    {[1, 2, 3].map(i => (
                      <button key={`soc-${i}`} className="flex-1 h-16 nm-flat bg-white rounded-2xl border border-white/50 flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-colors">
                        <Users size={24} />
                      </button>
                    ))}
                 </div>
              </div>

              {/* Danger Zone */}
              <div className="space-y-4 pb-12">
                <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.3em] ml-4">Account Security</span>
                <button 
                  onClick={async () => {
                    try {
                      console.log("Attempting sign out...");
                      await signOut(auth);
                      console.log("Sign out successful, reloading...");
                      window.localStorage.clear(); // Clear any local state
                      window.sessionStorage.clear();
                      window.location.href = '/'; // Force redirect to home
                    } catch (error) {
                      console.error("Sign out failed", error);
                      alert("Sign out failed. Please try again.");
                    }
                  }}
                  className="w-full h-20 nm-flat bg-white rounded-3xl px-6 flex items-center gap-5 border border-rose-100/30 active:nm-pressed text-rose-500 group"
                >
                  <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center transition-transform group-active:scale-95 bg-rose-50">
                    <LogOut size={24} />
                  </div>
                  <span className="text-sm font-black uppercase italic">Sign Out of Arena</span>
                </button>
              </div>
           </div>
        </div>
      )}
    </header>
  );
};
