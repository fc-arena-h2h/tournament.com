import React, { useState, useEffect } from 'react';
import { 
  Bell, BellRing, Trophy, Calendar, MessageSquare, CheckCircle, 
  XCircle, Trash2, CheckCheck, Megaphone, Clock, ExternalLink, Swords, 
  Zap, AlertCircle, X, ShieldAlert, ArrowRight, Volume2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Card, Button } from '@/src/components/ui/Primitives';
import { 
  AppNotification, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification, 
  clearAllNotifications,
  requestPhoneNotificationPermission,
  playNotificationSound,
  sendTestPhoneNotification,
  showSystemNotification
} from '@/src/lib/notifications';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useI18n } from '@/src/lib/i18n';
import { requestPushNotificationToken } from '@/src/lib/fcm';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  userId?: string;
  onNavigateTab?: (tab: string, meta?: any) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  userId,
  onNavigateTab,
}) => {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'announcements'>('all');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [pushLoading, setPushLoading] = useState(false);

  // Sync announcements from db
  useEffect(() => {
    if (!isOpen) return;
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnnouncements(docs);
    }, (err) => {
      console.warn('Announcements error:', err);
    });
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.read;
    return true;
  });

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }
    


    // Check if notification links to a tab
    if (notif.linkTab) {
      onClose();
      onNavigateTab?.(notif.linkTab, {
        tournamentId: notif.tournamentId,
        matchId: notif.matchId,
        extra: notif.extra
      });
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'Just now';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHrs = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'match_scheduled':
        return {
          icon: Calendar,
          color: 'text-indigo-600 bg-indigo-50 border-indigo-200'
        };
      case 'match_result':
        return {
          icon: Trophy,
          color: 'text-amber-600 bg-amber-50 border-amber-200'
        };
      case 'chat_message':
        return {
          icon: MessageSquare,
          color: 'text-blue-600 bg-blue-50 border-blue-200'
        };


      case 'announcement':
        return {
          icon: Megaphone,
          color: 'text-purple-600 bg-purple-50 border-purple-200'
        };
      default:
        return {
          icon: Zap,
          color: 'text-slate-600 bg-slate-50 border-slate-200'
        };
    }
  };

  const isAdmin = notifications.some(n => n.recipientId === 'admin'); // Rough check or pass via props

  const handleMarkAllRead = () => {
    if (!userId) return;
    markAllNotificationsAsRead(notifications, userId, isAdmin);
  };

  const handleClearAll = () => {
    if (!userId) return;
    if (window.confirm('Clear all personal notifications?')) {
      clearAllNotifications(notifications, userId, isAdmin);
    }
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950/40 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-300">
      <div 
        className="w-full sm:max-w-lg bg-[#f0f0f3] rounded-t-[3rem] sm:rounded-[3rem] h-[92vh] sm:h-[85vh] flex flex-col shadow-2xl border-t-2 border-white/50 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Handle for Mobile Drag Feel */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-300/50 rounded-full mx-auto mt-4 mb-2 shrink-0" />

        {/* Header */}
        <div className="p-6 sm:p-8 pb-5 flex flex-col gap-6 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl nm-inset bg-[#e6e6e9] flex items-center justify-center text-indigo-600 relative">
                <BellRing size={26} className={unreadCount > 0 ? "animate-wiggle" : ""} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black border-2 border-[#f0f0f3] flex items-center justify-center shadow-lg">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black text-indigo-500/70 uppercase tracking-[0.3em] block">Real-time alerts</span>
                <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none tracking-tighter">Notification <span className="text-indigo-600">Center</span></h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
               <button
                onClick={() => playNotificationSound()}
                className="w-11 h-11 rounded-2xl nm-flat bg-white/50 text-slate-400 hover:text-indigo-500 flex items-center justify-center active:nm-pressed transition-all"
                title="Test sound"
              >
                <Volume2 size={20} />
              </button>
              <button 
                onClick={onClose}
                className="w-11 h-11 rounded-2xl nm-flat bg-white/50 text-slate-400 hover:text-rose-500 flex items-center justify-center active:nm-pressed transition-all"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Quick Push Access */}
          <div className="nm-inset p-3.5 rounded-[1.8rem] bg-white/30 flex items-center justify-between border border-white/40">
             <div className="flex items-center gap-3 pl-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SYSTEM CHANNEL ACTIVE</span>
             </div>
             <button
                onClick={async () => {
                  setPushLoading(true);
                  try {
                    const res = await requestPushNotificationToken(userId);
                    if (res.success) {
                      await sendTestPhoneNotification();
                    } else {
                      alert(res.error || 'Permission Denied');
                    }
                  } finally {
                    setPushLoading(false);
                  }
                }}
                disabled={pushLoading}
                className="px-5 py-2.5 rounded-[1.2rem] nm-flat bg-white text-indigo-600 active:nm-pressed text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                <ShieldAlert size={14} className={pushLoading ? 'animate-spin' : ''} />
                <span>{pushLoading ? 'WAIT...' : 'ENABLE PUSH'}</span>
              </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pb-2 shrink-0">
          <div className="flex nm-inset p-1.5 rounded-[1.8rem] bg-[#e6e6e9] border border-white/50">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "flex-1 py-3 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2",
                activeTab === 'all' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
            >
              ALL <span className="opacity-50">({notifications.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={cn(
                "flex-1 py-3 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2",
                activeTab === 'unread' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
            >
              UNREAD
              {unreadCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('announcements')}
              className={cn(
                "flex-1 py-3 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2",
                activeTab === 'announcements' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
            >
              ANNOUNCEMENTS <span className="opacity-50">({announcements.length})</span>
            </button>
          </div>
        </div>

        {/* Global Controls Row */}
        {activeTab !== 'announcements' && notifications.length > 0 && (
          <div className="px-8 py-4 flex items-center justify-between shrink-0">
             <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase italic">{filteredNotifications.length} Alerts</span>
                <div className="w-8 h-1 bg-indigo-200 rounded-full mt-1" />
             </div>
             <div className="flex items-center gap-4">
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-[10px] font-black uppercase tracking-widest transition-colors group"
                  >
                    <CheckCheck size={14} className="group-hover:scale-110 transition-transform" />
                    Mark all read
                  </button>
                )}
                <button 
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 text-rose-500 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest transition-colors group"
                >
                  <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                  Clear all
                </button>
             </div>
          </div>
        )}

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 pb-20 space-y-3.5 no-scrollbar custom-scrollbar pt-2">
          {activeTab === 'announcements' ? (
            // Announcements Tab
            announcements.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center opacity-30">
                <div className="w-20 h-20 rounded-3xl nm-inset flex items-center justify-center mb-4">
                  <Megaphone size={32} className="text-slate-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 italic">No Official Announcements</p>
              </div>
            ) : (
              announcements.map((a) => (
                <div 
                  key={a.id} 
                  className="p-5 rounded-[2rem] nm-flat bg-white space-y-3 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl nm-inset bg-purple-50 flex items-center justify-center text-purple-600">
                        <Megaphone size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{a.senderName || 'System Admin'}</span>
                        <div className="flex items-center gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          <Clock size={10} />
                          {formatTimestamp(a.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-600 leading-relaxed italic border-l-4 border-purple-200 pl-4 py-1">
                    {a.text}
                  </p>
                </div>
              ))
            )
          ) : (
            // Notifications Tab
            filteredNotifications.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center opacity-30">
                <div className="w-20 h-20 rounded-3xl nm-inset flex items-center justify-center mb-4">
                  <Bell size={32} className="text-slate-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 italic">
                  {activeTab === 'unread' ? 'Clean Slate – No Unread Alerts' : 'No Activity Logs Yet'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const style = getNotificationIcon(n.type);
                const IconComponent = style.icon;

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "p-5 rounded-[2.2rem] transition-all cursor-pointer relative group border-2",
                      n.read 
                        ? "nm-flat bg-white/40 border-transparent hover:bg-white" 
                        : "nm-flat bg-white border-indigo-200/50 shadow-xl shadow-indigo-500/5 ring-1 ring-indigo-500/10"
                    )}
                  >
                    {/* Unread Highlight Bar */}
                    {!n.read && (
                      <div className="absolute left-0 top-10 bottom-10 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    )}

                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={cn("w-12 h-12 rounded-[1.2rem] flex items-center justify-center shrink-0 nm-inset bg-white", style.color)}>
                        <IconComponent size={22} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className={cn("text-sm font-black tracking-tight uppercase italic leading-tight truncate", n.read ? "text-slate-700" : "text-indigo-950")}>
                            {n.title}
                          </h4>
                          {!n.read && (
                             <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 line-clamp-2 leading-relaxed tracking-tight mb-3">
                          {n.message}
                        </p>
                        
                        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100/50">
                          <div className="flex items-center gap-1.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                {formatTimestamp(n.createdAt)}
                             </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {n.linkTab && (
                              <div className="text-indigo-600 font-black text-[9px] uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-1 transition-all">
                                View <ArrowRight size={12} />
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(n.id);
                              }}
                              className="w-8 h-8 rounded-xl nm-inset bg-white text-slate-300 hover:text-rose-500 flex items-center justify-center transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
};
