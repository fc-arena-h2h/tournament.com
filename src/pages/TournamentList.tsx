import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, onSnapshot, addDoc, Timestamp, where, getDocs, doc, getDoc, updateDoc, orderBy, limit, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, Users, Shield, ArrowRight, Clock, Target, CheckCircle, Hash } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { Reveal } from '@/src/components/ui/Reveal';

import { GameLoader } from '@/src/components/ui/GameLoader';
import { getDemoTournaments } from '@/src/lib/localTournaments';

interface Tournament {
  id: string;
  title: string;
  description: string;
  format?: 'group_knockout' | 'knockout';
  entryType: 'public' | 'invited';
  activationKey?: string;
  status: 'open' | 'registration_closed' | 'ongoing' | 'finished' | 'completed';
  prizePool: string;
  totalSlots: number;
  filledSlots: number;
  publisherId?: string;
  organizerName?: string;
  organizationName?: string;
  publisherName?: string;
}

interface Registration {
  tournamentId: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface TournamentListPageProps {
  profile: UserProfile | null;
  onEnter: (tournament: Tournament) => void;
}

export const TournamentListPage = ({ profile, onEnter }: TournamentListPageProps) => {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => {
    try {
      const cached = localStorage.getItem('fc_arena_tournaments');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [publisherProfiles, setPublisherProfiles] = useState<Record<string, UserProfile>>({});
  const [userRegistrations, setUserRegistrations] = useState<Record<string, Registration>>(() => {
    try {
      const cached = localStorage.getItem('fc_arena_user_registrations');
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  const [loading, setLoading] = useState(tournaments.length === 0);
  const [viewMode, setViewMode] = useState<'joined' | 'all'>('joined');

  useEffect(() => {
    const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(40));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
      
      // Merge local demo tournaments
      const demoTournaments = getDemoTournaments();
      const merged = [...demoTournaments, ...tData];
      
      setTournaments(merged as any);
      try {
        localStorage.setItem('fc_arena_tournaments', JSON.stringify(merged));
      } catch {}

      // Fetch publisher profiles for tournaments that have a publisherId
      const pubIds = Array.from(new Set(tData.map(t => t.publisherId))).filter(Boolean) as string[];
      pubIds.forEach(async (pId) => {
        if (!pId || typeof pId !== 'string' || !pId.trim()) return;
        try {
          const uSnap = await getDoc(doc(db, 'users', pId.trim()));
          if (uSnap.exists()) {
            setPublisherProfiles(prev => ({ ...prev, [pId]: uSnap.data() as UserProfile }));
          }
        } catch (e) {
          console.error("Error fetching publisher profile", e);
        }
      });
    });

    if (auth.currentUser) {
      const regQ = query(collection(db, 'registrations'), where('userId', '==', auth.currentUser.uid));
      getDocs(regQ).then(snapshot => {
        const regs: Record<string, Registration> = {};
        snapshot.forEach(doc => {
          const data = doc.data() as Registration;
          regs[data.tournamentId] = data;
        });
        setUserRegistrations(regs);
        try {
          localStorage.setItem('fc_arena_user_registrations', JSON.stringify(regs));
        } catch {}
      });
    }

    setLoading(false);
    return () => unsubscribe();
  }, []);

  const handleJoin = async (tournament: Tournament) => {
    if (!profile) return alert('Please complete your profile first');
    
    // Profile Validation
    const isProfileComplete = profile.inGameName && profile.inGameUID && profile.fbUrl;
    if (!isProfileComplete) {
      alert('Incomplete Profile! Please add your In-Game Name, UID, and Facebook Link in your profile settings.');
      return;
    }

    if (tournament.entryType === 'invited') {
      const key = prompt('This is an INVITED tournament. Please enter the Activation Key:');
      if (!key) return;
      if (key !== tournament.activationKey) {
        return alert('Invalid Activation Key!');
      }
    }

    try {
      await setDoc(doc(db, 'registrations', `${auth.currentUser?.uid}_${tournament.id}`), {
        tournamentId: tournament.id,
        userId: auth.currentUser?.uid,
        status: 'pending',
        gameName: profile.inGameName,
        gameUid: profile.inGameUID,
        createdAt: Timestamp.now()
      });
      alert('Join request sent! Waiting for publisher approval.');
      // Update local state
      setUserRegistrations({
        ...userRegistrations,
        [tournament.id]: { tournamentId: tournament.id, status: 'pending' }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'registrations');
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="LOADING TOURNAMENTS..." />;

  const filteredTournaments = viewMode === 'joined' 
    ? tournaments.filter(t => userRegistrations[t.id] || (t as any).isDemo)
    : tournaments;

  return (
    <div className="space-y-5 sm:space-y-8 pt-2 sm:pt-4">
      <Reveal direction="left">
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-800 uppercase italic">ARENA</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {viewMode === 'joined' ? 'Your active campaigns' : 'Discover new challenges'}
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex nm-inset p-1.5 rounded-[1.8rem] border border-white/20 bg-slate-100">
            <button 
              onClick={() => setViewMode('joined')}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.4rem] transition-all",
                viewMode === 'joined' ? "nm-flat text-black dark:text-white bg-white shadow-md" : "text-black dark:text-slate-400"
              )}
            >
              My Arena
            </button>
            <button 
              onClick={() => setViewMode('all')}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.4rem] transition-all",
                viewMode === 'all' ? "nm-flat text-black dark:text-white bg-white shadow-md" : "text-black dark:text-slate-400"
              )}
            >
              Discover
            </button>
          </div>
        </div>
      </Reveal>

      {filteredTournaments.length === 0 ? (
        <Reveal direction="left">
          <Card className="text-center py-20">
            <Trophy size={48} className="mx-auto text-slate-200 mb-6" />
            <p className="text-slate-300 font-black uppercase tracking-[0.2em] text-xs italic">
              {viewMode === 'joined' ? 'You haven\'t joined any cups yet' : 'No Cups Active'}
            </p>
            {viewMode === 'joined' && (
              <Button 
                onClick={() => setViewMode('all')}
                className="mt-6 mx-auto rounded-2xl px-6 py-2 text-[10px]"
              >
                Browse Cups
              </Button>
            )}
          </Card>
        </Reveal>
      ) : (
        filteredTournaments.map((t, idx) => {
          const reg = userRegistrations[t.id];
          const isFull = t.filledSlots >= t.totalSlots;
          const remainingSpots = t.totalSlots - t.filledSlots;
          
          const isPublisher = t.publisherId === auth.currentUser?.uid;
          const canEnter = t.status === 'open' || reg || isPublisher;
          
          const isFinished = t.status === 'finished' || t.status === 'completed';
          const isLive = t.status === 'ongoing' || (isFull && !isFinished);
          const organizerName = t.organizerName || t.organizationName || t.publisherName || (t.publisherId ? publisherProfiles[t.publisherId]?.inGameName : null) || 'Official FC Host';

          return (
            <Reveal key={t.id} direction={idx % 2 === 0 ? 'left' : 'right'} delay={idx * 100}>
              <Card className="relative group overflow-visible p-4 sm:p-7 rounded-[1.8rem] sm:rounded-[2.5rem] dark:!bg-gradient-to-br dark:!from-[#2b3054]/88 dark:!via-[#1e223d]/88 dark:!to-[#16192e]/94 dark:!border-white/16 dark:hover:!border-[#a855f7]/45 dark:!shadow-[0_24px_55px_-12px_rgba(4,5,15,0.9),inset_0_1px_1px_rgba(255,255,255,0.22),inset_0_-1px_1px_rgba(255,122,69,0.12)] transition-all duration-300">
                {/* Top Bar: Status Badge and Entry Type */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  {isFinished ? (
                    <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-slate-100 text-slate-600 dark:!bg-slate-800/80 dark:!text-slate-300 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:!border-white/15 flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      END
                    </div>
                  ) : isLive ? (
                    <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-rose-50 text-rose-600 dark:!bg-rose-500/20 dark:!text-rose-300 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-rose-200 dark:!border-rose-400/35 flex items-center gap-1.5 shadow-sm dark:shadow-[0_0_18px_rgba(244,63,94,0.22)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                      LIVE
                    </div>
                  ) : (
                    <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-emerald-50 text-emerald-600 dark:!bg-emerald-500/20 dark:!text-emerald-300 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-emerald-200 dark:!border-emerald-400/35 flex items-center gap-1.5 shadow-sm dark:shadow-[0_0_18px_rgba(16,185,129,0.22)]">
                      <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"></span>
                      </span>
                      UPCOMING
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="bg-slate-100 dark:!bg-[#15182c]/85 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 border border-slate-200 dark:!border-white/14 shadow-sm">
                      <span className="text-[8px] sm:text-[9px] font-black text-slate-700 dark:!text-slate-200 uppercase tracking-tight">
                        {t.format === 'knockout' ? 'Knockout' : 'Group + Knockout'}
                      </span>
                    </div>
                    <div className="bg-purple-50 dark:!bg-purple-500/22 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 border border-purple-100 dark:!border-purple-400/35 shadow-sm dark:shadow-[0_0_14px_rgba(168,85,247,0.2)]">
                      <span className="text-[8px] sm:text-[9px] font-black text-purple-600 dark:!text-purple-200 uppercase tracking-tight">
                        {t.entryType === 'invited' ? 'Invited' : 'Public'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {/* Season, Organizer, and Title */}
                  <div className="space-y-2 sm:space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:!text-amber-300/90">
                        <Trophy size={13} className="opacity-70 dark:opacity-100 text-amber-500 dark:text-amber-400" />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">SEASON 27</span>
                      </div>
                      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:!bg-[#14172b]/85 text-slate-500 dark:!text-slate-300 border border-white dark:!border-white/12">
                        <Hash size={9} className="opacity-70 text-indigo-400" />
                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest leading-none mt-0.5">{t.id.slice(0, 8)}</span>
                      </div>
                    </div>

                    {/* Organizer / Organization Badge */}
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 dark:!bg-gradient-to-r dark:!from-indigo-500/18 dark:!to-purple-500/12 border border-slate-200/90 dark:!border-indigo-400/28 shadow-sm max-w-full">
                        <div className="w-4 h-4 rounded-md bg-indigo-600 dark:bg-gradient-to-br dark:from-[#ff7a45] dark:to-[#8b5cf6] text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Shield size={10} />
                        </div>
                        <span className="text-[7px] sm:text-[8px] font-black text-slate-400 dark:!text-indigo-200/80 uppercase tracking-widest shrink-0">ORGANIZER:</span>
                        <span className="text-[9px] sm:text-[10px] font-black text-slate-800 dark:!text-white uppercase tracking-tight truncate">
                          {organizerName}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 dark:shadow-[0_0_6px_rgba(52,211,153,0.9)] shrink-0" title="Verified Organizer" />
                      </div>
                    </div>

                    <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:!text-white uppercase leading-snug tracking-tight truncate dark:drop-shadow-[0_2px_10px_rgba(255,255,255,0.08)]">
                      {t.title}
                    </h3>
                    <p className="text-[11px] sm:text-sm text-slate-400 dark:!text-slate-300/80 font-medium tracking-tight line-clamp-2">
                      {t.description || 'Official FC Mobile H2H Tournament'}
                    </p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 pt-1 sm:pt-2">
                    {/* Guaranteed Pool */}
                    <div className="nm-flat rounded-[1.6rem] sm:rounded-[2.2rem] p-3.5 sm:p-5 border border-white/40 dark:!bg-gradient-to-br dark:!from-[#15182c]/92 dark:!to-[#1d213b]/88 dark:!border-white/14 dark:!shadow-[inset_0_2px_12px_rgba(0,0,0,0.65),0_1px_0_rgba(255,255,255,0.1)] space-y-2 sm:space-y-3">
                      <span className="text-[8px] sm:text-[9px] font-black text-slate-400 dark:!text-indigo-300/80 uppercase tracking-[0.15em] block">
                        PRIZE POOL
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-black text-slate-900 dark:!text-amber-300 tracking-tighter dark:drop-shadow-[0_0_12px_rgba(251,191,36,0.25)]">{t.prizePool}</span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100/70 dark:!border-white/10">
                        <div className="nm-inset w-4 h-4 rounded-full flex items-center justify-center border border-white/20 dark:!bg-emerald-500/20 dark:!border-emerald-400/35">
                          <CheckCircle size={9} className="text-slate-800 dark:!text-emerald-300" />
                        </div>
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-500 dark:!text-slate-300 uppercase tracking-wider truncate">Top 3 Rewarded</span>
                      </div>
                    </div>

                    {/* Slots Info */}
                    <div className="nm-flat rounded-[1.6rem] sm:rounded-[2.2rem] p-3.5 sm:p-5 border border-white/40 dark:!bg-gradient-to-br dark:!from-[#15182c]/92 dark:!to-[#1d213b]/88 dark:!border-white/14 dark:!shadow-[inset_0_2px_12px_rgba(0,0,0,0.65),0_1px_0_rgba(255,255,255,0.1)] space-y-2 sm:space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-400 dark:!text-indigo-300/80 uppercase tracking-[0.15em]">
                          SLOTS
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-black text-slate-900 dark:!text-white tracking-tight">
                          {t.filledSlots}/{t.totalSlots}
                        </span>
                      </div>
                      
                      {/* Dots indicator */}
                      <div className="flex items-center gap-1 py-0.5">
                         {[...Array(6)].map((_, i) => (
                           <div key={`dot-${t.id}-${i}`} className={cn(
                             "w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full transition-all",
                             i < (t.filledSlots / t.totalSlots * 6) 
                              ? "bg-[#2d3748] shadow-sm dark:bg-gradient-to-tr dark:from-[#ff7a45] dark:to-[#a855f7] dark:shadow-[0_0_8px_rgba(255,122,69,0.75)]" 
                              : "bg-slate-200 dark:!bg-white/12 dark:border dark:border-white/10"
                           )} />
                         ))}
                      </div>

                      <div className="pt-1.5 border-t border-slate-100/70 dark:!border-white/10">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-400 dark:!text-slate-300 uppercase tracking-wider block truncate">
                          {remainingSpots} spots remaining
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Main Action Button */}
                  <div className="pt-2 sm:pt-4">
                    <button 
                      disabled={!canEnter && (isFull && !reg)}
                      onClick={() => onEnter(t)}
                      className={cn(
                        "w-full h-13 sm:h-16 rounded-[1.6rem] sm:rounded-[2.2rem] text-xs sm:text-sm font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98]",
                        !canEnter
                          ? "bg-slate-200 text-slate-500 dark:!bg-[#15182c] dark:!text-slate-500 dark:border dark:border-white/10 cursor-not-allowed" 
                          : "bg-[#00ff9d] text-black border-2 border-black hover:bg-[#00e68d] dark:bg-gradient-to-r dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] dark:!text-white dark:border-white/25 dark:shadow-[0_12px_28px_-6px_rgba(236,72,153,0.5),inset_0_1px_1px_rgba(255,255,255,0.35)] dark:hover:brightness-110"
                      )}
                    >
                      {!canEnter ? (isFull ? 'CUP FULL' : 'LOCKED') : (
                        <>ENTER ARENA <ArrowRight size={17} className="text-black dark:!text-white" /></>
                      )}
                    </button>
                  </div>
                </div>
              </Card>
            </Reveal>
          );

        })
      )}
    </div>
  );
};
