import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, onSnapshot, addDoc, Timestamp, where, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, Users, Shield, ArrowRight, Clock, Target, CheckCircle, Hash } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { Reveal } from '@/src/components/ui/Reveal';

import { GameLoader } from '@/src/components/ui/GameLoader';

interface Tournament {
  id: string;
  title: string;
  description: string;
  format: 'league' | 'knockout' | 'hybrid';
  entryType: 'free' | 'paid';
  ovrLimit: number;
  status: 'open' | 'registration_closed' | 'ongoing' | 'finished' | 'completed';
  prizePool: string;
  totalSlots: number;
  filledSlots: number;
  publisherId?: string;
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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [userRegistrations, setUserRegistrations] = useState<Record<string, Registration>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'joined' | 'all'>('joined');

  useEffect(() => {
    const q = query(collection(db, 'tournaments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
      setTournaments(tData);
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
      });
    }

    setLoading(false);
    return () => unsubscribe();
  }, []);

  const handleJoin = async (tournament: Tournament) => {
    if (!profile) return alert('Please complete your profile first');
    
    // Profile Validation
    const isProfileComplete = profile.inGameName && profile.inGameUID && profile.ovr && profile.fbUrl;
    if (!isProfileComplete) {
      alert('Incomplete Profile! Please add your In-Game Name, UID, OVR, and Facebook Link in your profile settings.');
      return;
    }

    const userOvr = profile?.ovr || 0;
    if (userOvr > tournament.ovrLimit) {
      return alert(`Your OVR (${userOvr}) exceeds the limit (${tournament.ovrLimit})`);
    }

    try {
      await addDoc(collection(db, 'registrations'), {
        tournamentId: tournament.id,
        userId: auth.currentUser?.uid,
        status: 'pending',
        gameName: profile.inGameName,
        gameUid: profile.inGameUID,
        ovr: profile.ovr || 0,
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
    ? tournaments.filter(t => userRegistrations[t.id])
    : tournaments;

  return (
    <div className="space-y-10 pt-4">
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
                viewMode === 'joined' ? "nm-flat text-black bg-white shadow-md" : "text-black"
              )}
            >
              My Arena
            </button>
            <button 
              onClick={() => setViewMode('all')}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.4rem] transition-all",
                viewMode === 'all' ? "nm-flat text-black bg-white shadow-md" : "text-black"
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

          return (
            <Reveal key={t.id} direction={idx % 2 === 0 ? 'left' : 'right'} delay={idx * 100}>
              <Card className="relative group overflow-visible p-8">
                {/* Top Bar: Status Badge and Entry Type */}
                <div className="flex items-center justify-between mb-8">
                  {isFinished ? (
                    <div className="px-5 py-2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      END
                    </div>
                  ) : isLive ? (
                    <div className="px-5 py-2 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-widest border border-rose-200 flex items-center gap-2 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                      LIVE
                    </div>
                  ) : (
                    <div className="px-5 py-2 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest border border-emerald-200 flex items-center gap-2 shadow-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]"></span>
                      </span>
                      UPCOMING
                    </div>
                  )}

                  <div className="bg-purple-50 rounded-full px-5 py-2 border border-purple-100 shadow-sm">
                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-tight">
                      {t.entryType === 'paid' ? 'Paid Entry' : 'Free Entry'}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Season and Title */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Trophy size={14} className="opacity-70" />
                        <span className="text-[10px] font-black uppercase tracking-widest">SEASON 27</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 border border-white">
                        <Hash size={10} className="opacity-70" />
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none mt-0.5">{t.id.slice(0, 8)}</span>
                      </div>
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 uppercase leading-none tracking-tight">
                      {t.title}
                    </h3>
                    <p className="text-lg text-slate-400 font-medium tracking-tight">
                      {t.description || 'Official FC Mobile H2H Tournament'}
                    </p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-6 pt-4">
                    {/* Guaranteed Pool */}
                    <div className="nm-flat rounded-[2.5rem] p-6 border border-white/40 space-y-4">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] block">
                        GUARANTEED POOL
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-900 tracking-tighter">{t.prizePool}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">USDT</span>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100/50">
                        <div className="nm-inset w-5 h-5 rounded-full flex items-center justify-center border border-white/20">
                          <CheckCircle size={10} className="text-slate-800" />
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Top 3 Rewarded</span>
                      </div>
                    </div>

                    {/* Slots Info */}
                    <div className="nm-flat rounded-[2.5rem] p-6 border border-white/40 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">
                          SLOTS
                        </span>
                        <span className="text-[11px] font-black text-slate-900 tracking-tight">
                          {t.filledSlots}/{t.totalSlots}
                        </span>
                      </div>
                      
                      {/* Dots indicator */}
                      <div className="flex items-center gap-1.5 py-1">
                         {[...Array(6)].map((_, i) => (
                           <div key={i} className={cn(
                             "w-4 h-4 rounded-full transition-all",
                             i < (t.filledSlots / t.totalSlots * 6) 
                              ? "bg-[#2d3748] shadow-sm" 
                              : "bg-slate-200"
                           )} />
                         ))}
                      </div>

                      <div className="pt-2 border-t border-slate-100/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {remainingSpots} spots remaining
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Main Action Button */}
                  <div className="pt-6">
                    <button 
                      disabled={!canEnter && (isFull && !reg)}
                      onClick={() => onEnter(t)}
                      className={cn(
                        "w-full h-20 rounded-[2.5rem] text-sm font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl active:scale-[0.98]",
                        !canEnter
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed" 
                          : "bg-[#00ff9d] text-black border-2 border-black hover:bg-[#00e68d]"
                      )}
                    >
                      {!canEnter ? (isFull ? 'CUP FULL' : 'LOCKED') : (
                        <>ENTER ARENA <ArrowRight size={20} className="text-black" /></>
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
