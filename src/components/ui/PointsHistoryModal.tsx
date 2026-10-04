import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { PointTransaction } from '@/src/lib/points';
import { UserProfile } from '@/src/hooks/useAuth';
import { Zap, ArrowUpRight, ArrowDownLeft, X, ShieldAlert, History, Filter } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface PointsHistoryModalProps {
  profile: UserProfile | null;
  onClose: () => void;
}

export const PointsHistoryModal: React.FC<PointsHistoryModalProps> = ({ profile, onClose }) => {
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'earned' | 'spent'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;

    // Listen to real-time point transactions
    const q = query(
      collection(db, 'point_transactions'),
      where('userId', '==', profile.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const realLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PointTransaction));
      
      // Sort desc by timestamp
      realLogs.sort((a, b) => {
        const timeA = a.timestamp instanceof Timestamp ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp instanceof Timestamp ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA;
      });

      // If no explicit transactions exist yet, create initial fallback logs based on user profile
      if (realLogs.length === 0) {
        const fallbackLogs: PointTransaction[] = [
          {
            id: 'initial-gift',
            userId: profile.uid,
            type: 'earned',
            amount: 1000,
            title: 'Initial Welcome Bonus',
            description: 'Gifted 1,000 Arena Points upon registering profile',
            timestamp: profile.createdAt ? new Date(profile.createdAt).toISOString() : new Date().toISOString()
          }
        ];
        setTransactions(fallbackLogs);
      } else {
        setTransactions(realLogs);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching transactions:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [profile?.uid]);

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'earned') return t.type === 'earned' || t.type === 'refunded';
    if (filter === 'spent') return t.type === 'spent' || t.type === 'penalized';
    return true;
  });

  const totalEarned = transactions
    .filter(t => t.type === 'earned' || t.type === 'refunded')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalSpent = transactions
    .filter(t => t.type === 'spent' || t.type === 'penalized')
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  const formatDate = (raw: Timestamp | string) => {
    if (!raw) return 'Recently';
    const date = raw instanceof Timestamp ? raw.toDate() : new Date(raw);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#f8f9fc] rounded-[2.5rem] shadow-2xl border-2 border-white/60 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Zap size={24} fill="currentColor" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase italic tracking-wider leading-none">Point History Log</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Arena Points Earned & Spent</p>
            </div>
          </div>

          {/* Balance Cards Summary */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Current Balance</span>
              <span className="text-lg font-black text-amber-400 tracking-tight">{profile?.eliteScore?.toLocaleString() || 0} Pts</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col">
              <span className="text-[7px] font-black text-emerald-300 uppercase tracking-widest">Total Earned</span>
              <span className="text-lg font-black text-emerald-400 tracking-tight">+{totalEarned.toLocaleString()}</span>
            </div>
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col">
              <span className="text-[7px] font-black text-rose-300 uppercase tracking-widest">Total Spent</span>
              <span className="text-lg font-black text-rose-400 tracking-tight">-{totalSpent.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Filter Tab Switcher */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Filter size={12} /> Filter Log
          </span>
          <div className="flex bg-slate-100 p-1 rounded-full text-[8px] font-black uppercase tracking-wider">
            <button 
              onClick={() => setFilter('all')}
              className={cn("px-3 py-1.5 rounded-full transition-all", filter === 'all' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500")}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('earned')}
              className={cn("px-3 py-1.5 rounded-full transition-all", filter === 'earned' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500")}
            >
              Earned (+)
            </button>
            <button 
              onClick={() => setFilter('spent')}
              className={cn("px-3 py-1.5 rounded-full transition-all", filter === 'spent' ? "bg-rose-600 text-white shadow-sm" : "text-slate-500")}
            >
              Spent (-)
            </button>
          </div>
        </div>

        {/* Transaction History List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest animate-pulse">
              Loading Points History...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <History size={32} className="mx-auto opacity-30" />
              <p className="text-[9px] font-black uppercase tracking-widest">No transaction records found</p>
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isEarned = tx.type === 'earned' || tx.type === 'refunded';
              const isPenalized = tx.type === 'penalized';

              return (
                <div 
                  key={tx.id || Math.random().toString()}
                  className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-between gap-4 hover:border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      isEarned ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                      isPenalized ? "bg-rose-50 text-rose-600 border border-rose-100" :
                      "bg-amber-50 text-amber-600 border border-amber-100"
                    )}>
                      {isEarned ? <ArrowUpRight size={18} /> : isPenalized ? <ShieldAlert size={18} /> : <ArrowDownLeft size={18} />}
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-xs font-black text-slate-900 uppercase italic block leading-snug">{tx.title}</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight line-clamp-1">{tx.description}</p>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">{formatDate(tx.timestamp)}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={cn(
                      "text-sm font-black tracking-tight block",
                      isEarned ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {isEarned ? `+${tx.amount}` : `-${Math.abs(tx.amount)}`} PTS
                    </span>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                      {tx.type}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button 
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
          >
            Close History
          </button>
        </div>

      </div>
    </div>
  );
};
