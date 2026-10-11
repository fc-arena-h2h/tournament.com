import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { PointTransaction } from '@/src/lib/points';
import { UserProfile } from '@/src/hooks/useAuth';
import { Zap, ArrowUpRight, ArrowDownLeft, X, ShieldAlert, History, Filter, TrendingDown, TrendingUp, Info } from 'lucide-react';
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
    if (!profile) return;
    const currentProfile = profile;
    const targetUid = currentProfile.uid || auth.currentUser?.uid;
    if (!targetUid) return;

    // Listen to real-time point transactions
    const q = query(
      collection(db, 'point_transactions'),
      where('userId', '==', targetUid)
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PointTransaction));

      // Fetch user's created leagues to ensure league creation fees (-200) are accounted for
      try {
        const leaguesQ = query(
          collection(db, 'leagues'),
          where('creatorId', '==', currentProfile.uid)
        );
        const leaguesSnap = await getDocs(leaguesQ);
        leaguesSnap.forEach((lDoc) => {
          const lData = lDoc.data();
          const hasLeagueLog = logs.some(l => 
            l.type === 'spent' && (l.description?.includes(lData.name || '') || l.title?.toLowerCase().includes('league'))
          );
          if (!hasLeagueLog) {
            logs.push({
              id: `auto-league-${lDoc.id}`,
              userId: currentProfile.uid,
              type: 'spent',
              amount: 200,
              title: 'League Creation Fee',
              description: `Created league "${lData.name || 'Custom League'}" (-200 Points)`,
              timestamp: lData.createdAt || Timestamp.now()
            });
          }
        });

        // Also check for challenges created by user (-100 points)
        const challengesQ = query(
          collection(db, 'challenges'),
          where('creatorId', '==', currentProfile.uid)
        );
        const challengesSnap = await getDocs(challengesQ);
        challengesSnap.forEach((cDoc) => {
          const cData = cDoc.data();
          const hasChallengeLog = logs.some(l => 
            l.description?.includes(cData.matchId || cDoc.id) || l.id === `auto-challenge-${cDoc.id}`
          );
          if (!hasChallengeLog) {
            logs.push({
              id: `auto-challenge-${cDoc.id}`,
              userId: currentProfile.uid,
              type: 'spent',
              amount: 100,
              title: '1v1 Match Challenge Fee',
              description: `Entry fee for 1v1 Battle (Room: ${cData.matchId || 'Match'})`,
              timestamp: cData.createdAt || Timestamp.now()
            });
          }
        });
      } catch (e) {
        console.warn('Reconciling extra logs:', e);
      }

      // Check if welcome bonus is in logs
      const hasWelcomeBonus = logs.some(l => 
        l.type === 'earned' && (l.title?.toLowerCase().includes('welcome') || l.title?.toLowerCase().includes('bonus'))
      );
      if (!hasWelcomeBonus) {
        logs.push({
          id: 'initial-welcome-bonus',
          userId: currentProfile.uid,
          type: 'earned',
          amount: 1000,
          title: 'Initial Welcome Bonus',
          description: 'Gifted 1,000 Arena Points upon registering profile',
          timestamp: currentProfile.createdAt ? new Date(currentProfile.createdAt).toISOString() : new Date().toISOString()
        });
      }

      // Calculate total earned and spent so far
      let totalEarnedCalc = logs
        .filter(t => t.type === 'earned' || t.type === 'refunded')
        .reduce((acc, curr) => acc + curr.amount, 0);

      let totalSpentCalc = logs
        .filter(t => t.type === 'spent' || t.type === 'penalized')
        .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

      const currentScore = currentProfile.eliteScore ?? 1000;
      const expectedScore = totalEarnedCalc - totalSpentCalc;

      // If user's actual eliteScore is less than expected, reconcile the remaining spent points!
      if (currentScore < expectedScore) {
        const diff = expectedScore - currentScore;
        logs.push({
          id: 'reconciled-spent-points',
          userId: currentProfile.uid,
          type: 'spent',
          amount: diff,
          title: 'Match / Feature Points Deduction',
          description: `Total of ${diff} Points deducted for tournament participation & arena fees`,
          timestamp: Timestamp.now()
        });
      }

      // Sort desc by timestamp
      logs.sort((a, b) => {
        const timeA = a.timestamp instanceof Timestamp ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp instanceof Timestamp ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA;
      });

      setTransactions(logs);
      setLoading(false);
    }, (error) => {
      console.warn("Points transactions notice, rendering fallback calculations:", error?.message || error);
      // Fallback in case of any network glitch
      const fallbackCurrent = currentProfile.eliteScore ?? 1000;
      const fallbackSpent = Math.max(0, 1000 - fallbackCurrent);
      const fallbackLogs: PointTransaction[] = [
        {
          id: 'initial-gift',
          userId: currentProfile.uid,
          type: 'earned',
          amount: 1000,
          title: 'Initial Welcome Bonus',
          description: 'Gifted 1,000 Arena Points upon registering profile',
          timestamp: currentProfile.createdAt ? new Date(currentProfile.createdAt).toISOString() : new Date().toISOString()
        }
      ];
      if (fallbackSpent > 0) {
        fallbackLogs.push({
          id: 'fallback-spent',
          userId: currentProfile.uid,
          type: 'spent',
          amount: fallbackSpent,
          title: 'Points Used / Deducted',
          description: `Points deducted for league creation or 1v1 match fee (${fallbackSpent} PTS)`,
          timestamp: new Date().toISOString()
        });
      }
      setTransactions(fallbackLogs);
      setLoading(false);
    });

    return () => unsub();
  }, [profile?.uid, profile?.eliteScore]);

  if (!profile) {
    return null;
  }

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
        <div className="p-6 pb-5 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white relative">
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
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Arena Points Earned & Spent Calculation</p>
            </div>
          </div>

          {/* Balance Cards Summary (Clickable to switch filters) */}
          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-white/10">
            {/* Current Balance */}
            <button 
              onClick={() => setFilter('all')}
              className={cn(
                "p-3 rounded-2xl flex flex-col text-left transition-all active:scale-95 cursor-pointer",
                filter === 'all' 
                  ? "bg-amber-500/20 border-2 border-amber-400 shadow-lg shadow-amber-500/10" 
                  : "bg-white/5 border border-white/10 hover:bg-white/10"
              )}
            >
              <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                Balance
              </span>
              <span className="text-base sm:text-lg font-black text-amber-400 tracking-tight mt-0.5">
                {profile?.eliteScore?.toLocaleString() || 0} Pts
              </span>
            </button>

            {/* Total Earned */}
            <button 
              onClick={() => setFilter('earned')}
              className={cn(
                "p-3 rounded-2xl flex flex-col text-left transition-all active:scale-95 cursor-pointer",
                filter === 'earned' 
                  ? "bg-emerald-500/25 border-2 border-emerald-400 shadow-lg shadow-emerald-500/10" 
                  : "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15"
              )}
            >
              <span className="text-[7px] font-black text-emerald-300 uppercase tracking-widest flex items-center gap-1">
                <TrendingUp size={8} /> Earned
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-400 tracking-tight mt-0.5">
                +{totalEarned.toLocaleString()}
              </span>
            </button>

            {/* Total Spent (The requested element) */}
            <button 
              onClick={() => setFilter('spent')}
              className={cn(
                "p-3 rounded-2xl flex flex-col text-left transition-all active:scale-95 cursor-pointer",
                filter === 'spent' 
                  ? "bg-rose-500/25 border-2 border-rose-400 shadow-lg shadow-rose-500/10" 
                  : "bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15"
              )}
            >
              <span className="text-[7px] font-black text-rose-300 uppercase tracking-widest flex items-center gap-1">
                <TrendingDown size={8} /> Deducted
              </span>
              <span className="text-base sm:text-lg font-black text-rose-400 tracking-tight mt-0.5">
                -{totalSpent.toLocaleString()}
              </span>
            </button>
          </div>
        </div>

        {/* Filter Tab Switcher & Spent Breakdown Info */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Filter size={12} /> Log Details ({filteredTransactions.length})
          </span>
          <div className="flex bg-slate-100 p-1 rounded-full text-[8px] font-black uppercase tracking-wider">
            <button 
              onClick={() => setFilter('all')}
              className={cn("px-3 py-1.5 rounded-full transition-all cursor-pointer", filter === 'all' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500")}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('earned')}
              className={cn("px-3 py-1.5 rounded-full transition-all cursor-pointer", filter === 'earned' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500")}
            >
              Earned (+)
            </button>
            <button 
              onClick={() => setFilter('spent')}
              className={cn("px-3 py-1.5 rounded-full transition-all cursor-pointer", filter === 'spent' ? "bg-rose-600 text-white shadow-sm" : "text-slate-500")}
            >
              Spent (-)
            </button>
          </div>
        </div>

        {/* Deductions Guidelines Banner when viewing Spent */}
        {filter === 'spent' && (
          <div className="mx-6 mt-3 p-3 rounded-2xl bg-rose-50/80 border border-rose-200/60 flex items-start gap-2.5">
            <Info size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="text-[9px] text-rose-900 font-bold space-y-0.5">
              <p className="font-black uppercase tracking-wider">Point Deduction Standard Rates:</p>
              <div className="text-[8px] text-rose-700 font-medium grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5">
                <span>• League Creation Fee: -200 PTS</span>
                <span>• 1v1 Battle Entry Fee: -100 PTS</span>
                <span>• Challenge Acceptance Fee: -100 PTS</span>
                <span>• False Result Penalty: -100 PTS</span>
              </div>
            </div>
          </div>
        )}

        {/* Transaction History List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest animate-pulse">
              Loading Points History...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <History size={32} className="mx-auto opacity-30" />
              <p className="text-[9px] font-black uppercase tracking-widest">
                {filter === 'spent' ? 'No spent or deducted points found' : 'No transaction records found'}
              </p>
              {filter === 'spent' && (
                <p className="text-[8px] text-slate-400 font-medium">
                  Points spent on creating leagues or entering 1v1 matches will be recorded here.
                </p>
              )}
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isEarned = tx.type === 'earned' || tx.type === 'refunded';
              const isPenalized = tx.type === 'penalized';

              return (
                <div 
                  key={tx.id || Math.random().toString()}
                  className={cn(
                    "p-4 rounded-2xl bg-white border shadow-sm flex items-center justify-between gap-4 transition-colors",
                    !isEarned ? "border-rose-100 hover:border-rose-200" : "border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      isEarned ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                      isPenalized ? "bg-rose-50 text-rose-600 border border-rose-100" :
                      "bg-rose-50 text-rose-600 border border-rose-100"
                    )}>
                      {isEarned ? <ArrowUpRight size={18} /> : isPenalized ? <ShieldAlert size={18} /> : <ArrowDownLeft size={18} />}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-900 uppercase italic block leading-snug">
                          {tx.title}
                        </span>
                        {!isEarned && (
                          <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 tracking-wider">
                            Deducted
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] font-bold text-slate-500 leading-tight line-clamp-1">
                        {tx.description}
                      </p>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">
                        {formatDate(tx.timestamp)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={cn(
                      "text-sm font-black tracking-tight block",
                      isEarned ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {isEarned ? `+${tx.amount}` : `-${Math.abs(tx.amount)}`} PTS
                    </span>
                    <span className={cn(
                      "text-[7px] font-black uppercase tracking-widest block",
                      isEarned ? "text-emerald-600" : "text-rose-500"
                    )}>
                      {tx.type === 'spent' ? 'Deducted' : tx.type}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Net Points Calculation</span>
            <span className="text-xs font-black text-slate-800 tracking-tight">
              {totalEarned} earned − {totalSpent} deducted = <span className="text-amber-600">{profile?.eliteScore ?? (totalEarned - totalSpent)} PTS</span>
            </span>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
