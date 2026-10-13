import React, { useState, useEffect } from 'react';
import { 
  Bell, BellRing, Trophy, Calendar, MessageSquare, Wallet, CheckCircle, 
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

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  userId?: string;
  onNavigateTab?: (tab: string, meta?: any) => void;
  onOpenWallet?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  userId,
  onNavigateTab,
  onOpenWallet
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'announcements'>('all');
  const [announcements, setAnnouncements] = useState<any[]>([]);

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
    
    // Check if notification links to wallet
    if (notif.extra?.openWallet || notif.type === 'payment_request' || notif.type === 'payment_status') {
      onClose();
      onOpenWallet?.();
      return;
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
      case 'payment_request':
        return {
          icon: Wallet,
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200'
        };
      case 'payment_status':
        return {
          icon: CheckCircle,
          color: 'text-teal-600 bg-teal-50 border-teal-200'
        };
      case 'challenge':
        return {
          icon: Swords,
          color: 'text-rose-600 bg-rose-50 border-rose-200'
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

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-lg bg-[#f0f0f3] rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-[85vh] flex flex-col shadow-2xl border-2 border-white/80 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-200 bg-white/70 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl nm-inset bg-[#e6e6e9] flex items-center justify-center text-indigo-600 relative">
              <BellRing size={22} className="animate-wiggle" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black border-2 border-white shadow-sm">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Real-time alerts</span>
              <h2 className="text-xl font-black text-slate-900 uppercase italic">Notification Center</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => playNotificationSound()}
              className="w-9 h-9 rounded-xl nm-flat text-slate-500 hover:text-indigo-600 flex items-center justify-center active:nm-pressed"
              title="Test notification sound"
            >
              <Volume2 size={16} />
            </button>
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-500 hover:text-slate-900 active:nm-pressed"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Quick Actions */}
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            {/* Tabs */}
            <div className="flex nm-inset p-1 rounded-2xl bg-[#e6e6e9] border border-white/50 w-full sm:w-auto">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  activeTab === 'all' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                )}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setActiveTab('unread')}
                className={cn(
                  "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                  activeTab === 'unread' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                )}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('announcements')}
                className={cn(
                  "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  activeTab === 'announcements' ? "nm-flat bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                )}
              >
                Announcements ({announcements.length})
              </button>
            </div>
          </div>

          {/* Action Row */}
          {activeTab !== 'announcements' && notifications.length > 0 && (
            <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-500">
              <span>{filteredNotifications.length} Notifications</span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button 
                    onClick={() => markAllNotificationsAsRead(notifications)}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-black uppercase"
                  >
                    <CheckCheck size={12} />
                    Mark all read
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete all notifications?')) {
                      clearAllNotifications(notifications);
                    }
                  }}
                  className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-black uppercase"
                >
                  <Trash2 size={12} />
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-12 space-y-2.5 no-scrollbar">
          {activeTab === 'announcements' ? (
            // Announcements Tab
            announcements.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center opacity-40">
                <Megaphone size={40} className="text-slate-400 mb-2" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">No Announcements</p>
              </div>
            ) : (
              announcements.map((a) => (
                <div 
                  key={a.id} 
                  className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-2 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                        <Megaphone size={14} />
                      </div>
                      <span className="text-xs font-black text-slate-800 uppercase">{a.senderName || 'Admin'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock size={10} />
                      {formatTimestamp(a.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">
                    {a.text}
                  </p>
                </div>
              ))
            )
          ) : (
            // Notifications Tab
            filteredNotifications.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center opacity-40">
                <Bell size={40} className="text-slate-400 mb-2" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
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
                      "p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer relative group",
                      n.read 
                        ? "bg-white/70 border-slate-200/80 hover:bg-white" 
                        : "bg-white border-indigo-200 shadow-md ring-1 ring-indigo-400/30 hover:shadow-lg"
                    )}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse border-2 border-white shadow-sm" />
                    )}

                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", style.color)}>
                        <IconComponent size={18} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={cn("text-xs font-black tracking-tight truncate", n.read ? "text-slate-800" : "text-indigo-950")}>
                            {n.title}
                          </h4>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-600 line-clamp-2 leading-relaxed">
                          {n.message}
                        </p>
                        
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[10px]">
                          <span className="text-slate-400 font-mono flex items-center gap-1">
                            <Clock size={10} />
                            {formatTimestamp(n.createdAt)}
                          </span>

                          <div className="flex items-center gap-2">
                            {(n.linkTab || n.extra?.openWallet) && (
                              <span className="text-indigo-600 font-black flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                                View <ArrowRight size={10} />
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(n.id);
                              }}
                              className="text-slate-300 hover:text-rose-500 p-1 rounded-md transition-colors"
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
