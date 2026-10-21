import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import { Trophy, Clock, Users, ArrowRight, Plus, Activity, Zap, Play, Search, Hash, CheckCircle, History, Shield, Flame, User as UserIcon, Lock, Copy } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Reveal } from '@/src/components/ui/Reveal';

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


  useEffect(() => {
    if (!profile?.uid) return;

    const handleErr = (context: string, err: any) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('unavailable')) {
        console.warn(`Firestore Quota Exceeded (${context}). Operating in cache mode.`);
      } else {
        console.error(context, err);
      }
    };


    // Fetch recent matches
    const qMatches = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      setRecentResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleErr("Firestore Recent Matches Error", err));

    // Fetch user registrations
    const qRegs = query(collection(db, 'registrations'), where('userId', '==', profile?.uid));
    const unsubRegs = onSnapshot(qRegs, (regSnap) => {
      const joinedIds = regSnap.docs.map(d => d.data().tournamentId);
      
      // Initial fetch or update featured tournaments list
      const qT = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(15));
      getDocs(qT).then(tSnap => {
        const all = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Filter: user is publisher, user is registered, or tournament is open
        let filtered = all.filter(t => 
          joinedIds.includes(t.id) || 
          t.publisherId === profile.uid || 
          t.status === 'open'
        );

        // Fallback: If no matches found, show the 3 most recent tournaments regardless of status
        if (filtered.length === 0 && all.length > 0) {
          filtered = all.slice(0, 3);
        }
        
        setFeaturedTournaments(filtered.slice(0, 3));
      }).catch(err => handleErr("Firestore Featured Tournaments Error", err));

    }, (err) => handleErr("Firestore Regs Error", err));

    return () => {
      unsubMatches();
      unsubRegs();
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const fetchSearch = async () => {
        try {
          const q = query(
            collection(db, 'tournaments'),
            orderBy('createdAt', 'desc'),
            limit(100)
          );
          const snapshot = await getDocs(q);
          const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
          const filtered = all.filter(t => 
            (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) || 
            t.id.toLowerCase().includes(searchQuery.toLowerCase())
          );
          setSearchResults(filtered);
        } catch (error) {
          console.error("Search Error:", error);
        }
      };
      fetchSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);


  return (
    <div className="space-y-8 sm:space-y-12 pt-4 min-h-screen">
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
              <div className="absolute top-full left-0 right-0 mt-4 nm-flat rounded-[2.5rem] z-[300] p-6 space-y-3 border border-white/50 shadow-2xl bg-white/95 backdrop-blur-xl">
                <div className="px-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Found {searchResults.length} Cups</span>
                  <div className="w-8 h-1 bg-slate-100 rounded-full" />
                </div>
                <div className="max-h-[350px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {searchResults.map(t => (
                    <div 
                      key={t.id}
                      onClick={() => onEnterTournament(t)}
                      className="w-full flex items-center justify-between p-5 hover:bg-fc-green/10 rounded-[1.8rem] transition-all text-left group border border-transparent hover:border-fc-green/20 bg-[#f8f9fa] cursor-pointer"
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
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(t.id);
                                alert('Tournament ID copied!');
                              }}
                              className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer"
                              title="Copy ID"
                            >
                              <Copy size={10} /> ID: {t.id.slice(0, 8).toUpperCase()}
                            </div>
                            {t.status === 'open' && (
                              <span className="text-[8px] font-black text-fc-green uppercase px-2 py-0.5 rounded-md bg-fc-green/5 border border-fc-green/10">ACTIVE</span>
                            )}
                            {t.entryType === 'invited' ? (
                              <span className="text-[8px] font-black text-indigo-600 uppercase px-2 py-0.5 rounded-md bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-1">
                                <Lock size={8} /> INVITED
                              </span>
                            ) : (
                              <span className="text-[8px] font-black text-emerald-600 uppercase px-2 py-0.5 rounded-md bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-1">
                                <Users size={8} /> PUBLIC
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-400 group-hover:text-fc-green group-hover:nm-inset transition-all">
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
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
          <div className="relative h-40 sm:h-56 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden group fc-card-bg bg-fc-dark/80">
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
        <Card className="flex flex-col gap-3.5 sm:gap-6 bg-gradient-to-b from-white via-[#fafbfe] to-[#f4f6fa] border-2 border-white shadow-[0_20px_50px_rgba(0,0,0,0.06)] p-3.5 sm:p-7 rounded-[2.2rem] sm:rounded-[2.8rem] relative overflow-hidden">
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
                <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full p-1 bg-gradient-to-tr from-amber-400 via-white to-fc-green shadow-xl border border-white flex items-center justify-center bg-white">
                  <UserIcon size={32} className="text-slate-400" />
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <h2 className="text-lg sm:text-2xl font-black text-[#0f172a] uppercase italic tracking-tight truncate leading-tight">
                    {profile?.inGameName || 'Player Name'}
                  </h2>
                  {profile?.inGameName && profile?.inGameUID && profile?.fbUrl && (
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
                      Ready to Play
                    </span>
                  </div>
                </div>
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
          {featuredTournaments.length === 0 && (
            <div className="py-20 text-center space-y-4 nm-inset rounded-[2.5rem] bg-slate-50/50">
              <Trophy size={48} className="mx-auto text-slate-200" />
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic">No Active Tournaments</p>
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Check back later for new events</p>
              </div>
            </div>
          )}
          {featuredTournaments.map((t, idx) => (
            <Reveal key={t.id} direction={idx % 2 === 0 ? 'left' : 'right'} delay={idx * 100}>
              <Card className="p-0 group active:scale-[0.98] overflow-hidden border-2 border-white hover:border-fc-green/20 transition-all shadow-xl" onClick={() => onEnterTournament(t)}>
                 <div className="relative p-4 sm:p-8">
                   {/* Background faint image for card */}
                   <div className="absolute inset-0 opacity-[0.03] grayscale pointer-events-none">
                      <img src="https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
                   </div>

                   <div className="flex items-center justify-between mb-4 sm:mb-8 relative z-10">
                      <div className="flex items-center gap-2">
                        {t.status === 'finished' || t.status === 'completed' ? (
                          <div className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            END
                          </div>
                        ) : t.status === 'ongoing' || (t.filledSlots >= t.totalSlots) ? (
                          <div className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </div>
                        ) : (
                          <div className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-white"></span>
                            </span>
                            UPCOMING
                          </div>
                        )}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(t.id);
                            alert('Tournament ID copied!');
                          }}
                          className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] border border-white flex items-center gap-1.5 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
                          title="Copy ID"
                        >
                          <Copy size={9} /> {t.id.slice(0, 8)}
                        </div>
                        {t.entryType === 'invited' ? (
                          <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-indigo-500/20">
                            <Lock size={10} className="text-indigo-500" />
                            ONLY INVITED
                          </div>
                        ) : (
                          <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-emerald-500/20">
                            <Users size={10} className="text-emerald-500" />
                            PUBLIC
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-100">
                        <Users size={12} />
                        <span className="text-[9px] sm:text-[10px] font-black">{t.filledSlots}/{t.totalSlots}</span>
                      </div>
                   </div>
                   
                   <div className="relative z-10 mb-4 sm:mb-8 space-y-1.5 sm:space-y-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/90 shadow-sm max-w-full">
                        <div className="w-4 h-4 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Shield size={10} />
                        </div>
                        <span className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">ORGANIZER:</span>
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-800 uppercase tracking-tight truncate">
                          {t.organizerName || t.organizationName || t.publisherName || 'Official FC Host'}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      </div>
                      <h4 className="text-xl sm:text-3xl font-black text-slate-800 uppercase italic leading-tight group-hover:text-fc-green transition-colors">{t.title}</h4>
                      <div className="w-10 sm:w-12 h-1 bg-fc-green/20 mt-1" />
                   </div>

                   <div className="flex items-center justify-between relative z-10">
                     <div className="flex flex-col">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5 sm:mb-1">Total Rewards</span>
                        <span className="text-lg sm:text-2xl font-black text-fc-dark tracking-tight flex items-center gap-1.5">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-fc-gold flex items-center justify-center text-white text-[9px] sm:text-[10px] font-black">C</div>
                          {t.prizePool}
                        </span>
                     </div>
                     <Button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onEnterTournament(t);
                       }}
                       className="rounded-xl px-5 sm:px-8 py-2.5 sm:py-4 bg-fc-green text-black text-[10px] sm:text-[11px] font-black uppercase tracking-widest shadow-md shadow-fc-green/20 hover:bg-fc-dark transition-all"
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
      <div className="grid grid-cols-1 gap-6 px-2">
        <Reveal direction="left">
          <button 
            onClick={() => onNavigate('tournament')}
            className="h-32 nm-flat rounded-[2.5rem] p-8 flex items-center justify-between active:nm-pressed transition-all group w-full"
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                <Trophy size={28} fill="currentColor" />
              </div>
              <div className="text-left">
                <span className="text-sm font-black text-slate-800 uppercase italic block leading-none mb-1">Elite Cups</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Join active tournaments</span>
              </div>
            </div>
            <ArrowRight size={20} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
          </button>
        </Reveal>
      </div>

    </div>
  );
};
