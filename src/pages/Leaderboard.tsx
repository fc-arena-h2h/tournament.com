import React, { useState, useEffect } from 'react';
import { Card } from '@/src/components/ui/Primitives';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Trophy, Crown, Zap, Activity, CheckCircle } from 'lucide-react';
import { UserProfile } from '@/src/hooks/useAuth';
import { Reveal } from '@/src/components/ui/Reveal';
import { GameLoader } from '@/src/components/ui/GameLoader';

export const LeaderboardPage = () => {
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Primary query ordered by eliteScore desc
    const q = query(
      collection(db, 'users'),
      orderBy('eliteScore', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let playerData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      // Guarantee client-side sort accuracy
      playerData.sort((a, b) => (b.eliteScore || 0) - (a.eliteScore || 0));
      setPlayers(playerData);
      setLoading(false);
    }, (error) => {
      console.warn("Leaderboard index query fallback:", error);
      // Fallback query if Firestore composite index is missing
      const fallbackQ = query(collection(db, 'users'), limit(100));
      const fallbackUnsub = onSnapshot(fallbackQ, (snap) => {
        let pData = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        pData.sort((a, b) => (b.eliteScore || 0) - (a.eliteScore || 0));
        setPlayers(pData);
        setLoading(false);
      });
      return () => fallbackUnsub();
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <GameLoader fullScreen={false} text="LOADING HALL OF FAME..." />;

  const getWinRate = (p?: UserProfile) => {
    if (!p?.stats || !p.stats.played) return '0%';
    return `${Math.round((p.stats.won / p.stats.played) * 100)}%`;
  };

  return (
    <div className="space-y-10 pt-4 pb-20">
      <Reveal direction="left">
        <div className="flex flex-col gap-2 px-4">
          <h2 className="text-3xl font-black text-slate-900 uppercase italic leading-none">Elite Leaderboard</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Global FC Mobile Champions</p>
        </div>
      </Reveal>

      {/* Top 3 Podium */}
      <Reveal direction="left" delay={100}>
        <div className="grid grid-cols-3 items-end gap-3 pt-8 pb-4 px-2">
          {/* Rank 2 */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-[2rem] nm-inset p-1 border-2 border-slate-200 bg-white">
                 <div className="w-full h-full rounded-[1.6rem] nm-flat overflow-hidden">
                    <img 
                      src={players[1]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${players[1]?.inGameName || 'p2'}`} 
                      alt="Avatar" 
                      className="w-full h-full object-cover" 
                    />
                 </div>
              </div>
              <div className="absolute -top-3 -right-2 w-8 h-8 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white">2</div>
            </div>
            <div className="text-center px-1 space-y-0.5">
              <span className="text-[11px] font-black text-slate-900 uppercase italic truncate block max-w-[90px]">
                {players[1]?.inGameName || '---'}
              </span>
              <div className="flex items-center justify-center gap-1">
                <Zap size={10} className="text-indigo-500 fill-current" />
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tight">
                  {players[1]?.eliteScore?.toLocaleString() || 0}
                </span>
              </div>
              <span className="text-[8px] font-bold text-slate-400 uppercase block">OVR {players[1]?.ovr || 100}</span>
            </div>
          </div>

          {/* Rank 1 */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-26 h-26 rounded-[2.5rem] nm-flat p-1.5 border-4 border-amber-300 bg-amber-50/30">
                 <div className="w-full h-full rounded-[2.2rem] nm-inset overflow-hidden border-2 border-amber-400 bg-white">
                    <img 
                      src={players[0]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${players[0]?.inGameName || 'p1'}`} 
                      alt="Avatar" 
                      className="w-full h-full object-cover" 
                    />
                 </div>
              </div>
              <div className="absolute -top-5 -right-3 w-12 h-12 rounded-[1.5rem] bg-gradient-to-tr from-amber-500 to-amber-300 text-white flex items-center justify-center border-2 border-white shadow-xl">
                <Crown size={24} fill="currentColor" />
              </div>
            </div>
            <div className="text-center px-1 space-y-1">
              <span className="text-sm font-black text-slate-900 uppercase italic truncate block max-w-[110px]">
                {players[0]?.inGameName || '---'}
              </span>
              <div className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300">
                <Zap size={12} className="text-amber-600 fill-current" />
                <span className="text-[11px] font-black text-amber-900 uppercase tracking-tight">
                  {players[0]?.eliteScore?.toLocaleString() || 0} PTS
                </span>
              </div>
              <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest block">
                WR: {getWinRate(players[0])} · {players[0]?.stats?.played || 0} Matches
              </span>
            </div>
          </div>

          {/* Rank 3 */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-[2rem] nm-inset p-1 border-2 border-orange-200 bg-white">
                 <div className="w-full h-full rounded-[1.6rem] nm-flat overflow-hidden">
                    <img 
                      src={players[2]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${players[2]?.inGameName || 'p3'}`} 
                      alt="Avatar" 
                      className="w-full h-full object-cover" 
                    />
                 </div>
              </div>
              <div className="absolute -top-3 -right-2 w-8 h-8 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white">3</div>
            </div>
            <div className="text-center px-1 space-y-0.5">
              <span className="text-[11px] font-black text-slate-900 uppercase italic truncate block max-w-[90px]">
                {players[2]?.inGameName || '---'}
              </span>
              <div className="flex items-center justify-center gap-1">
                <Zap size={10} className="text-orange-500 fill-current" />
                <span className="text-[10px] font-black text-orange-600 uppercase tracking-tight">
                  {players[2]?.eliteScore?.toLocaleString() || 0}
                </span>
              </div>
              <span className="text-[8px] font-bold text-slate-400 uppercase block">OVR {players[2]?.ovr || 100}</span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Full Leaderboard List */}
      <div className="space-y-3 px-2">
        {players.slice(3).map((player, index) => {
          const rank = index + 4;
          const played = player.stats?.played || 0;
          const won = player.stats?.won || 0;
          const wr = played > 0 ? `${Math.round((won / played) * 100)}%` : '0%';

          return (
            <Reveal key={player.uid} direction={index % 2 === 0 ? 'left' : 'right'} delay={index * 30}>
              <Card className="p-4 border-2 border-white bg-white/90 shadow-sm rounded-[2rem] hover:shadow-md transition-all">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-xs font-black text-slate-400 w-8 italic text-center shrink-0">#{rank}</span>
                    <div className="w-12 h-12 rounded-2xl nm-inset p-0.5 bg-slate-50 border border-slate-100 shrink-0">
                      <div className="w-full h-full rounded-xl overflow-hidden nm-flat">
                        <img 
                          src={player.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.inGameName || player.uid}`} 
                          alt="Avatar" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-900 uppercase italic tracking-tight truncate">
                          {player.inGameName || 'Player'}
                        </span>
                        {player.inGameName && player.inGameUID && (
                          <CheckCircle size={10} className="text-indigo-600 shrink-0" fill="currentColor" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>OVR {player.ovr || 100}</span>
                        <span>•</span>
                        <span>{played} Played</span>
                        <span>•</span>
                        <span className="text-emerald-600">WR {wr}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <div className="flex items-center gap-1">
                      <Zap size={12} className="text-amber-500 fill-current" />
                      <span className="text-sm font-black text-slate-900 tracking-tight">
                        {player.eliteScore?.toLocaleString() || 0}
                      </span>
                    </div>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Arena Pts</span>
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
};
