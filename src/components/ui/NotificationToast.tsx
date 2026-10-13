import React, { useEffect } from 'react';
import { Bell, Trophy, Calendar, MessageSquare, Wallet, CheckCircle, X, ArrowRight } from 'lucide-react';
import { AppNotification } from '@/src/lib/notifications';
import { cn } from '@/src/lib/utils';

interface NotificationToastProps {
  notification: AppNotification | null;
  onClose: () => void;
  onClick: (notification: AppNotification) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onClose,
  onClick
}) => {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const getToastIcon = (type: string) => {
    switch (type) {
      case 'match_scheduled':
        return <Calendar size={18} className="text-indigo-600" />;
      case 'match_result':
        return <Trophy size={18} className="text-amber-600" />;
      case 'chat_message':
        return <MessageSquare size={18} className="text-blue-600" />;
      case 'payment_request':
      case 'payment_status':
        return <Wallet size={18} className="text-emerald-600" />;
      default:
        return <Bell size={18} className="text-purple-600" />;
    }
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[6000] w-[92%] max-w-md animate-in slide-in-from-top duration-300 pointer-events-auto">
      <div 
        onClick={() => onClick(notification)}
        className="p-3.5 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center justify-between gap-3 cursor-pointer group hover:bg-slate-900 transition-all ring-1 ring-white/20"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/15">
            {getToastIcon(notification.type)}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-white truncate group-hover:text-indigo-300 transition-colors">
              {notification.title}
            </h4>
            <p className="text-[11px] text-slate-300 font-medium truncate">
              {notification.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/20 px-2 py-1 rounded-lg flex items-center gap-1">
            View <ArrowRight size={10} />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
