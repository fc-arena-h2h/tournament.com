import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import { Trophy, Clock, Users, ArrowRight, Plus, Activity, Zap, Play, Search, Hash, CheckCircle, History, Shield, Flame } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Reveal } from '@/src/components/ui/Reveal';
import { PointsHistoryModal } from '@/src/components/ui/PointsHistoryModal';
import { logPointTransaction } from '@/src/lib/points';

interface ArenaProps {
  profile: UserProfile | null;
  onNavigate: (tab: any) => void;
  onEnterTournament: (tournament: any) => void;
  onOpenWallet?: () => void;
}

export const ArenaPage: React.FC<ArenaProps> = ({ profile, onNavigate, onEnterTournament, onOpenWallet }) => {
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [featuredTournaments, setFeaturedTournaments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showPointsHistoryModal, setShowPointsHistoryModal] = useState(false);
  const [liveStats, setLiveStats] = useState({
    played: profile?.stats?.played || 0,
    won: profile?.stats?.won || 0,
    drawn: profile?.stats?.drawn || 0,
    lost: profile?.stats?.lost || 0,
    goalsFor: profile?.stats?.goalsFor || 0,
    goalsAgainst: profile?.stats?.goalsAgainst || 0,
    globalRank: profile?.stats?.globalRank || 1
  });

  useEffect(() => {
    if (!profile?.uid) return;

    // Listen to all completed matches, challenges, and users to calculate exact live stats
    const qMatches = query(collection(db, 'matches'), where('status', '==', 'completed'));
    const qChallenges = query(collection(db, 'challenges'), where('status', '==', 'completed'));
    const qUsers = query(collection(db, 'users'), orderBy('eliteScore', 'desc'));

    let cMatches: any[] = [];
    let cChallenges: any[] = [];
    let allUsers: any[] = [];

    const computeAndSyncStats = () => {
      let played = 0;
      let won = 0;
      let drawn = 0;
      let lost = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      // 1. Calculate stats from completed tournament matches
      cMatches.forEach(m => {
        const isHome = m.homePlayerId === profile.uid;
        const isAway = m.awayPlayerId === profile.uid;
        if (!isHome && !isAway) return;

        played++;
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;
        const myScore = isHome ? hScore : aScore;
        const oppScore = isHome ? aScore : hScore;

        goalsFor += myScore;
        goalsAgainst += oppScore;

        if (myScore > oppScore) won++;
        else if (myScore === oppScore) drawn++;
        else lost++;
      });

      // 2. Calculate stats from completed 1v1 challenges
      cChallenges.forEach(c => {
        const isCreator = c.creatorId === profile.uid;
        const isOpponent = c.opponentId === profile.uid;
        if (!isCreator && !isOpponent) return;

        played++;
        const hScore = c.homeScore || 0;
        const aScore = c.awayScore || 0;
        const myScore = isCreator ? hScore : aScore;
        const oppScore = isCreator ? aScore : hScore;

        goalsFor += myScore;
        goalsAgainst += oppScore;

        if (c.winnerId === profile.uid) {
          won++;
        } else if (c.winnerId === 'draw' || myScore === oppScore) {
          drawn++;
        } else if (c.winnerId) {
          lost++;
        } else {
          if (myScore > oppScore) won++;
          else if (myScore === oppScore) drawn++;
          else lost++;
        }
      });

      // 3. Calculate Global Rank based on eliteScore ranking
      const userIndex = allUsers.findIndex(u => u.id === profile.uid || u.uid === profile.uid);
      const globalRank = userIndex !== -1 ? userIndex + 1 : 1;

      const newStats = { played, won, drawn, lost, goalsFor, goalsAgainst, globalRank };
      setLiveStats(newStats);

      // 4. Sync live stats back to user document in Firestore if changed
      if (
        profile.stats?.played !== played ||
        profile.stats?.won !== won ||
        profile.stats?.globalRank !== globalRank
      ) {
        updateDoc(doc(db, 'users', profile.uid), {
          'stats.played': played,
          'stats.won': won,
          'stats.drawn': drawn,
          'stats.lost': lost,
          'stats.goalsFor': goalsFor,
          'stats.goalsAgainst': goalsAgainst,
          'stats.globalRank': globalRank
        }).catch(err => console.error("Error syncing stats:", err));
      }
    };

    const unsubM = onSnapshot(qMatches, (snap) => {
      cMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      computeAndSyncStats();
    }, (err) => console.error("Firestore Matches Sync Error:", err));

    const unsubC = onSnapshot(qChallenges, (snap) => {
      cChallenges = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      computeAndSyncStats();
    }, (err) => console.error("Firestore Challenges Sync Error:", err));

    const unsubU = onSnapshot(qUsers, (snap) => {
      allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      computeAndSyncStats();
    }, (err) => console.error("Firestore Users Sync Error:", err));

    return () => {
      unsubM();
      unsubC();
      unsubU();
    };
  }, [profile?.uid]);

  useEffect(() => {
    // Gift 1000 points to existing users who haven't received it yet
    if (profile && !profile.pointsGifted) {
      updateDoc(doc(db, 'users', profile.uid), {
        eliteScore: (profile.eliteScore || 0) + 1000,
        pointsGifted: true
      }).then(() => {
        logPointTransaction(profile.uid, 'earned', 1000, 'Welcome Gift', 'Initial 1,000 Arena Points credited');
      }).catch(err => console.error("Point gift failed:", err));
    }

    // Fetch recent matches
    const qMatches = query(
      collection(db, 'matches'),
      limit(3)
    );
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      setRecentResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Recent Matches Error:", err));

    // Fetch featured/active tournaments for the user
    const qRegs = query(collection(db, 'registrations'), where('userId', '==', profile?.uid));
    const unsubRegs = onSnapshot(qRegs, async (regSnap) => {
      const joinedIds = regSnap.docs.map(d => d.data().tournamentId);
      
      // Also include tournaments created by the user
      const qCreated = query(collection(db, 'tournaments'), where('publisherId', '==', profile?.uid));
      const createdSnap = await getDocs(qCreated);
      const createdIds = createdSnap.docs.map(d => d.id);
      
      const allIds = Array.from(new Set([...joinedIds, ...createdIds]));
      
      if (allIds.length > 0) {
        // Fetch these tournaments
        const qT = query(collection(db, 'tournaments'), limit(5)); // Simplified for now as where-in has limits
        onSnapshot(qT, (tSnap) => {
          const all = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
          const filtered = all.filter(t => allIds.includes(t.id) || t.status === 'open');
          setFeaturedTournaments(filtered.slice(0, 3));
        }, (err) => console.error("Firestore Featured Tournaments Error:", err));
      } else {
        // Fallback to open tournaments
        const qOpen = query(collection(db, 'tournaments'), where('status', '==', 'open'), limit(3));
        onSnapshot(qOpen, (tSnap) => {
          setFeaturedTournaments(tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => console.error("Firestore Open Tournaments Error:", err));
      }
    }, (err) => console.error("Firestore Regs Error:", err));

    return () => {
      unsubMatches();
      unsubRegs();
    };
  }, []);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const q = query(
        collection(db, 'tournaments'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const filtered = all.filter(t => 
          (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) || 
          t.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSearchResults(filtered);
      }, (error) => {
        console.error("Search Error:", error);
      });
      return () => unsubscribe();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const stats = profile?.stats || {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    globalRank: 48
  };

  return (
    <div className="space-y-12 pt-4 min-h-screen">
      {/* Search Bar - Neumorphic Inset */}
      <div className="relative z-[200]">
        <Reveal direction="left">
          <div className="relative">
            <Input 
              placeholder="Find your tournament" 
              className="h-16 pl-16 border-fc-green/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-500 z-10">
              <Search size={22} />
            </div>
            
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-4 nm-flat rounded-[2.5rem] z-[300] p-6 space-y-3 border border-white/50 shadow-2xl bg-white/95 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="px-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Found {searchResults.length} Cups</span>
                  <div className="w-8 h-1 bg-slate-100 rounded-full" />
                </div>
                <div className="max-h-[350px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {searchResults.map(t => (
                    <button 
                      key={t.id}
                      onClick={() => onEnterTournament(t)}
                      className="w-full flex items-center justify-between p-5 hover:bg-fc-green/10 rounded-[1.8rem] transition-all text-left group border border-transparent hover:border-fc-green/20 bg-[#f8f9fa]"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-fc-green group-hover:scale-110 transition-transform bg-white">
                          <Trophy size={24} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-black text-slate-800 block uppercase italic leading-none">{t.title || 'Untitled Cup'}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                              <Shield size={10} />
                              {t.organizerName || t.organizationName || t.publisherName || 'Official Host'}
                            </span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                              ID: {t.id.slice(0, 8).toUpperCase()}
                            </span>
                            {t.status === 'open' && (
                              <span className="text-[8px] font-black text-fc-green uppercase px-2 py-0.5 rounded-md bg-fc-green/5 border border-fc-green/10">ACTIVE</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-400 group-hover:text-fc-green group-hover:nm-inset transition-all">
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>

            {/* Hero Banner - FC Mobile Styled */}
      <Reveal direction="right" delay={100}>
        <div className="nm-flat rounded-[2.5rem] p-3 sm:p-4 border-2 border-white">
          <div className="relative h-48 sm:h-56 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden group fc-card-bg bg-fc-dark/80">
            <div className="absolute inset-0 bg-gradient-to-r from-fc-dark via-fc-dark/60 to-transparent" />
            <div className="absolute top-0 right-0 w-1/2 h-full opacity-40 group-hover:scale-110 transition-transform duration-1000">
               <img src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
            </div>
            <div className="absolute inset-0 border-2 border-white/10 rounded-[2rem] sm:rounded-[2.5rem] pointer-events-none" />
            
            <div className="absolute top-6 sm:top-8 left-6 sm:left-8">
               <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-2 h-2 rounded-full bg-fc-green animate-pulse" />
                  <span className="text-[8px] sm:text-[9px] font-black text-fc-green uppercase tracking-[0.3em]">Official Tournament Arena</span>
               </div>
               <h1 className="text-3xl sm:text-5xl font-black text-white uppercase italic leading-none tracking-tighter mb-2">
                 ELITE <br /><span className="text-fc-green">ARENA</span>
               </h1>
               <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-[180px] leading-relaxed">
                 The ultimate destination for FC Mobile pro players
               </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Profile Card - Enhanced FC Mobile Pro Player Passport */}
      <Reveal direction="left" delay={200}>
        <Card className="flex flex-col gap-5 sm:gap-6 bg-gradient-to-b from-white via-[#fafbfe] to-[#f4f6fa] border-2 border-white shadow-[0_20px_50px_rgba(0,0,0,0.06)] p-4 sm:p-7 rounded-[2.2rem] sm:rounded-[2.8rem] relative overflow-hidden">
          {/* Subtle Corner Glow Accent */}
          <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-gradient-to-br from-emerald-500/10 via-indigo-500/10 to-transparent blur-2xl pointer-events-none" />

          {/* Top Passport Ribbon */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 relative z-10">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">FC ARENA PASSPORT</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/90 border border-slate-200/60 text-slate-600 text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
              <Hash size={10} className="text-indigo-500" />
              <span>{profile?.inGameUID || profile?.uid?.slice(0, 8).toUpperCase() || 'PLAYER'}</span>
            </div>
          </div>

          {/* Player Identity Header */}
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full p-1 bg-gradient-to-tr from-amber-400 via-white to-fc-green shadow-xl border border-white overflow-hidden">
                  <img 
                    src={profile?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"} 
                    className="w-full h-full object-cover rounded-full bg-slate-100" 
                    alt="Player Avatar" 
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 px-2 py-0.5 min-w-[32px] sm:min-w-[36px] rounded-xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border-2 border-white flex items-center justify-center shadow-lg">
                  <span className="text-[7px] sm:text-[8px] font-black text-amber-400 mr-0.5">OVR</span>
                  <span className="text-[10px] sm:text-xs font-black text-white italic tracking-tight">{profile?.ovr || 100}</span>
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <h2 className="text-lg sm:text-2xl font-black text-[#0f172a] uppercase italic tracking-tight truncate leading-tight">
                    {profile?.inGameName || 'Player Name'}
                  </h2>
                  {profile?.inGameName && profile?.inGameUID && profile?.ovr && profile?.fbUrl && (
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0" title="Verified Player">
                      <CheckCircle size={10} fill="white" />
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <div className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-100/80 text-indigo-700 flex items-center gap-1 shadow-xs">
                    <Shield size={10} className="text-indigo-600 shrink-0" />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{profile?.leagueName || 'Elite League'}</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100/80 text-emerald-700 flex items-center gap-1 shadow-xs">
                    <Activity size={10} className="text-emerald-600 shrink-0" />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                      {profile?.role === 'admin' ? 'Admin' : (profile?.role === 'publisher' ? 'Publisher' : 'Pro Tier')}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-100/80 text-amber-700 flex items-center gap-1 shadow-xs">
                    <Flame size={10} className="text-amber-500 fill-amber-500 shrink-0" />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                      {liveStats.played > 0 ? (liveStats.won >= liveStats.lost ? 'Form: Hot' : 'Form: Active') : 'Ready'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Stats - Enhanced Inset Metrics */}
          <div className="nm-inset rounded-[1.8rem] sm:rounded-[2.2rem] bg-[#f8f9fc] p-4 sm:p-5 border border-white/70 space-y-3.5 relative z-10">
            {/* 3 Core Metric Columns */}
            <div className="grid grid-cols-3 divide-x divide-slate-200/80">
              {/* Global Rank */}
              <div className="flex flex-col items-center justify-center px-1 sm:px-2 py-0.5 text-center">
                <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <Trophy size={11} className="text-amber-500 shrink-0" />
                  <span className="truncate">Global Rank</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-slate-400 text-xs font-black">#</span>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter italic">
                    {liveStats.globalRank}
                  </span>
                </div>
                <span className="text-[7px] sm:text-[8px] font-extrabold text-indigo-500 uppercase tracking-wider mt-0.5">Leaderboard</span>
              </div>

              {/* Win Rate */}
              <div className="flex flex-col items-center justify-center px-1 sm:px-2 py-0.5 text-center">
                <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <Activity size={11} className="text-emerald-500 shrink-0" />
                  <span className="truncate">Win Rate</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter italic">
                    {liveStats.played > 0 ? ((liveStats.won / liveStats.played) * 100).toFixed(1) : '0.0'}
                  </span>
                  <span className="text-slate-400 text-[10px] font-black">%</span>
                </div>
                <span className="text-[7px] sm:text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">
                  {liveStats.won}W · {liveStats.drawn}D · {liveStats.lost}L
                </span>
              </div>

              {/* Total Matches */}
              <div className="flex flex-col items-center justify-center px-1 sm:px-2 py-0.5 text-center">
                <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <Users size={11} className="text-indigo-500 shrink-0" />
                  <span className="truncate">Total Play</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter italic">
                    {liveStats.played}
                  </span>
                </div>
                <span className="text-[7px] sm:text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5">
                  GF: {liveStats.goalsFor} | GA: {liveStats.goalsAgainst}
                </span>
              </div>
            </div>

            {/* Performance Bar (Win / Draw / Loss Record) */}
            <div className="pt-2.5 border-t border-slate-200/70">
              <div className="flex items-center justify-between text-[7px] sm:text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-0.5">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-emerald-600 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> W: {liveStats.won}
                  </span>
                  <span className="flex items-center gap-1 text-amber-600 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> D: {liveStats.drawn}
                  </span>
                  <span className="flex items-center gap-1 text-rose-600 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" /> L: {liveStats.lost}
                  </span>
                </div>
                <span className="text-slate-600 font-black">
                  GD: {liveStats.goalsFor - liveStats.goalsAgainst >= 0 ? `+${liveStats.goalsFor - liveStats.goalsAgainst}` : `${liveStats.goalsFor - liveStats.goalsAgainst}`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
                {liveStats.played > 0 ? (
                  <>
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500" 
                      style={{ width: `${(liveStats.won / liveStats.played) * 100}%` }}
                      title={`Won: ${liveStats.won}`}
                    />
                    <div 
                      className="h-full bg-amber-400 transition-all duration-500" 
                      style={{ width: `${(liveStats.drawn / liveStats.played) * 100}%` }}
                      title={`Drawn: ${liveStats.drawn}`}
                    />
                    <div 
                      className="h-full bg-rose-500 transition-all duration-500" 
                      style={{ width: `${(liveStats.lost / liveStats.played) * 100}%` }}
                      title={`Lost: ${liveStats.lost}`}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-slate-200" />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Quick Access Currencies */}
          <div className="grid grid-cols-2 gap-3 relative z-10">
            <div 
              onClick={() => setShowPointsHistoryModal(true)}
              className="nm-inset bg-[#f1f2f6] rounded-[1.6rem] p-3.5 sm:p-4 flex items-center gap-3 border border-white cursor-pointer hover:bg-slate-200/70 active:scale-95 transition-all group"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                <Zap size={18} fill="currentColor" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Arena Points</span>
                  <History size={9} className="text-amber-500 shrink-0 animate-pulse" />
                </div>
                <div className="flex items-baseline gap-1 truncate">
                  <span className="text-[9px] sm:text-[10px] font-black text-amber-600 italic">FP:</span>
                  <span className="text-base sm:text-lg font-black text-slate-900 italic tracking-tight truncate">
                    {profile?.eliteScore?.toLocaleString() || '0'}
                  </span>
                </div>
              </div>
            </div>

            <div 
              onClick={() => onOpenWallet ? onOpenWallet() : null}
              className="nm-inset bg-[#f1f2f6] rounded-[1.6rem] p-3.5 sm:p-4 flex items-center gap-3 border border-white cursor-pointer hover:bg-slate-200/70 active:scale-95 transition-all group"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-sm flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                <span className="text-sm sm:text-base font-black italic">৳</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Wallet Balance</span>
                  <span className="text-[7px] font-black text-emerald-600 bg-emerald-100/90 px-1 py-0.2 rounded uppercase">
                    Add / Draw
                  </span>
                </div>
                <span className="text-base sm:text-lg font-black text-slate-900 italic tracking-tight truncate">
                  ৳{profile?.wallet?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Featured Section */}
      <div className="space-y-8">
        <Reveal direction="right">
          <div className="flex items-center justify-between px-6">
            <div className="flex flex-col">
              <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-sm bg-fc-green rotate-45" /> 
                ACTIVE CUPS
              </h3>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1 ml-6">Join now and win prizes</span>
            </div>
            <button 
              onClick={() => onNavigate('tournament')}
              className="text-[10px] font-black text-fc-green uppercase flex items-center gap-2 group"
            >
              Explore All <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-8">
          {featuredTournaments.map((t, idx) => (
            <Reveal key={t.id} direction={idx % 2 === 0 ? 'left' : 'right'} delay={idx * 100}>
              <Card className="p-0 group active:scale-[0.98] overflow-hidden border-2 border-white hover:border-fc-green/20 transition-all shadow-xl" onClick={() => onEnterTournament(t)}>
                 <div className="relative p-8">
                   {/* Background faint image for card */}
                   <div className="absolute inset-0 opacity-[0.03] grayscale pointer-events-none">
                      <img src="https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
                   </div>

                   <div className="flex items-center justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-2">
                        {t.status === 'finished' || t.status === 'completed' ? (
                          <div className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            END
                          </div>
                        ) : t.status === 'ongoing' || (t.filledSlots >= t.totalSlots) ? (
                          <div className="px-3.5 py-1.5 rounded-lg bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </div>
                        ) : (
                          <div className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            UPCOMING
                          </div>
                        )}
                        <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] border border-white flex items-center gap-1.5">
                          <Hash size={10} /> {t.id.slice(0, 8)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-100">
                        <Users size={14} />
                        <span className="text-[10px] font-black">{t.filledSlots}/{t.totalSlots}</span>
                      </div>
                   </div>
                   
                   <div className="relative z-10 mb-8 space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200/90 shadow-sm max-w-full">
                        <div className="w-4 h-4 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Shield size={10} />
                        </div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">ORGANIZER:</span>
                        <span className="text-[9px] font-black text-slate-800 uppercase tracking-tight truncate">
                          {t.organizerName || t.organizationName || t.publisherName || 'Official FC Host'}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      </div>
                      <h4 className="text-3xl font-black text-slate-800 uppercase italic leading-tight group-hover:text-fc-green transition-colors">{t.title}</h4>
                      <div className="w-12 h-1 bg-fc-green/20 mt-1" />
                   </div>

                   <div className="flex items-center justify-between relative z-10">
                     <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Rewards</span>
                        <span className="text-2xl font-black text-fc-dark tracking-tight flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-fc-gold flex items-center justify-center text-white text-[10px] font-black">C</div>
                          {t.prizePool}
                        </span>
                     </div>
                     <Button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onEnterTournament(t);
                       }}
                       className="rounded-xl px-8 py-4 bg-fc-green text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-fc-green/20 hover:bg-fc-dark transition-all"
                     >
                        {profile?.uid === t.publisherId ? 'UPDATE' : 'JOIN'}
                     </Button>
                   </div>
                 </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Quick Nav Grid */}
      <div className="grid grid-cols-2 gap-6 px-2">
        <Reveal direction="left">
          <button 
            onClick={() => onNavigate('tournament')}
            className="aspect-square nm-flat rounded-[3rem] p-8 flex flex-col justify-between active:nm-pressed transition-all group w-full"
          >
            <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <Trophy size={28} fill="currentColor" />
            </div>
            <div className="text-left">
              <span className="text-sm font-black text-slate-800 uppercase italic block leading-none mb-1">Compete</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tournament</span>
            </div>
          </button>
        </Reveal>
        <Reveal direction="right">
          <button 
            onClick={() => onNavigate('league')}
            className="aspect-square nm-flat rounded-[3rem] p-8 flex flex-col justify-between active:nm-pressed transition-all group w-full"
          >
            <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
              <Users size={28} />
            </div>
            <div className="text-left">
              <span className="text-sm font-black text-slate-800 uppercase italic block leading-none mb-1">League</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global Rank</span>
            </div>
          </button>
        </Reveal>
      </div>

      {/* Points History Modal */}
      {showPointsHistoryModal && (
        <PointsHistoryModal 
          profile={profile} 
          onClose={() => setShowPointsHistoryModal(false)} 
        />
      )}
    </div>
  );
};
