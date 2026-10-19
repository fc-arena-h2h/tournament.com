import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import { 
  Trophy, Clock, Users, ArrowRight, Plus, Activity, Zap, Play, 
  Search, Hash, CheckCircle, History, Shield, Flame, User as UserIcon, 
  Lock, Copy, X, ShieldCheck, ChevronRight, LayoutGrid
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Reveal } from '@/src/components/ui/Reveal';
import { motion, AnimatePresence } from 'framer-motion';

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
      const qT = query(collection(db, 'tournaments'), limit(10));
      getDocs(qT).then(tSnap => {
        const all = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Filter: user is publisher, user is registered, or tournament is open
        const filtered = all.filter(t => 
          joinedIds.includes(t.id) || 
          t.publisherId === profile.uid || 
          t.status === 'open'
        );
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
    <div className="space-y-10 sm:space-y-14 pt-6 min-h-screen relative">
      <div className="absolute inset-0 bg-pattern-dots -z-10" />

      {/* Search Bar - Modern Focused Style */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-[200] px-2"
      >
        <div className="relative max-w-2xl mx-auto">
          <Input 
            placeholder="Search Tournaments..." 
            className="h-16 pl-16 bg-white/80 backdrop-blur-md border-white/50 shadow-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 z-10">
            <Search size={22} strokeWidth={2.5} />
          </div>
          
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute top-full left-0 right-0 mt-4 glass-card rounded-[2.5rem] z-[300] p-6 space-y-3 overflow-hidden shadow-2xl"
              >
                <div className="px-2 mb-2 flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    FOUND {searchResults.length} CUPS
                  </span>
                  <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {searchResults.map((t, idx) => (
                    <motion.div 
                      key={t.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => onEnterTournament(t)}
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-50/80 rounded-3xl transition-all text-left group border border-slate-50 hover:border-indigo-100 bg-white/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                          <Trophy size={24} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-black text-slate-800 block uppercase italic leading-none">{t.title || 'Untitled Cup'}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-indigo-500/70 uppercase tracking-wider flex items-center gap-1">
                              <Shield size={10} />
                              {t.organizerName || t.publisherName || 'Host'}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-slate-200" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[80px]">ID: {t.id.toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Hero Section - Luxury Pro Card */}
      <div className="px-2">
        <Card className="p-1 sm:p-1.5 overflow-hidden border-white bg-slate-200/20">
          <div className="relative h-48 sm:h-64 rounded-[2.2rem] overflow-hidden group">
            {/* Animated Gradient Background */}
            <div className="absolute inset-0 bg-slate-900" />
            <motion.div 
              animate={{ 
                background: [
                  'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%)',
                  'radial-gradient(at 100% 100%, rgba(34, 197, 94, 0.15) 0px, transparent 50%)',
                  'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%)'
                ]
              }}
              transition={{ duration: 10, repeat: Infinity }}
              className="absolute inset-0"
            />
            
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay group-hover:scale-105 transition-transform duration-[5s]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            
            <div className="absolute inset-6 sm:inset-10 flex flex-col justify-end">
               <motion.div 
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: 0.3 }}
                 className="flex items-center gap-3 mb-4"
               >
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-[0.3em]">
                    PRO ARENA LIVE
                  </div>
                  <div className="h-px flex-1 bg-white/10" />
               </motion.div>
               <motion.h1 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.4 }}
                 className="text-4xl sm:text-6xl font-black text-white uppercase italic leading-none tracking-tighter mb-4"
               >
                 ELITE <span className="text-emerald-400">CHAMPIONS</span>
               </motion.h1>
               <motion.p 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 transition={{ delay: 0.5 }}
                 className="text-[10px] sm:text-xs font-medium text-slate-300 uppercase tracking-widest max-w-sm leading-relaxed"
               >
                 The definitive stage for FC Mobile competitive excellence. Compete, advance, and dominate.
               </motion.p>
            </div>
          </div>
        </Card>
      </div>

      {/* Player Passport - Enhanced Typography */}
      <div className="px-2">
        <Card className="bg-white/80 backdrop-blur-md border-white p-6 sm:p-10 shadow-2xl shadow-slate-200/50">
          <div className="flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
            <div className="relative">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2.5rem] bg-slate-900 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden rotate-3 hover:rotate-0 transition-transform duration-500">
                <UserIcon size={48} className="text-slate-700" />
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-emerald-500 border-4 border-white flex items-center justify-center shadow-lg text-white">
                <ShieldCheck size={20} />
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-3">
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase italic leading-none tracking-tighter">
                    {profile?.inGameName || 'Recruit'}
                  </h2>
                  <div className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200/50">PRO</div>
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">FC ARENA VERIFIED ATHLETE</p>
              </div>

              <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                <div className="px-4 py-2 rounded-2xl bg-indigo-50/80 border border-indigo-100 text-indigo-600 text-[9px] font-black uppercase tracking-wider flex items-center gap-2">
                   <Trophy size={14} className="opacity-70" /> {profile?.leagueName || 'Official League'}
                </div>
                <div className="px-4 py-2 rounded-2xl bg-emerald-50/80 border border-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-wider flex items-center gap-2">
                   <Activity size={14} className="opacity-70" /> Competitive Active
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Cups - Visual Grid */}
      <div className="space-y-8 px-2">
        <div className="flex items-center justify-between px-6">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-900 uppercase italic leading-none">ACTIVE CUPS</h3>
            <div className="w-12 h-1 bg-emerald-500 rounded-full" />
          </div>
          <Button variant="ghost" className="text-xs font-black text-indigo-600 uppercase tracking-widest group" onClick={() => onNavigate('tournament')}>
            VIEW ALL <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {featuredTournaments.map((t, idx) => (
            <Card key={t.id} delay={idx * 0.1} className="p-0 border-white hover:border-indigo-100 transition-all shadow-xl group" onClick={() => onEnterTournament(t)}>
              <div className="relative p-6 sm:p-10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8 relative z-10">
                  <div className="flex flex-wrap gap-2">
                    {t.status === 'finished' || t.status === 'completed' ? (
                      <span className="px-4 py-1.5 rounded-full bg-slate-800 text-slate-300 text-[9px] font-black uppercase tracking-widest">FINISHED</span>
                    ) : t.filledSlots >= t.totalSlots ? (
                      <span className="px-4 py-1.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest animate-pulse">FULL</span>
                    ) : (
                      <span className="px-4 py-1.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest">OPEN</span>
                    )}
                    <span className="px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-slate-100 text-slate-400 text-[9px] font-black uppercase tracking-widest">ID: {t.id.toUpperCase()}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-50 border border-slate-100">
                    <Users size={16} className="text-slate-400" />
                    <span className="text-xs font-black text-slate-700">{t.filledSlots} / {t.totalSlots}</span>
                    <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(t.filledSlots / t.totalSlots) * 100}%` }}
                        className="h-full bg-emerald-500" 
                      />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-indigo-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.organizerName || 'Official Host'}</span>
                    </div>
                    <h4 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase italic leading-none tracking-tighter group-hover:text-indigo-600 transition-colors">
                      {t.title}
                    </h4>
                  </div>
                  
                  <div className="flex items-end justify-between pt-4">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PRIZE POOL</span>
                      <div className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center text-white text-[10px] font-black">C</div>
                        {t.prizePool}
                      </div>
                    </div>
                    <Button variant="success" size="lg" className="rounded-2xl shadow-emerald-500/20" onClick={(e) => { e.stopPropagation(); onEnterTournament(t); }}>
                      {profile?.uid === t.publisherId ? 'DASHBOARD' : 'JOIN CUP'}
                    </Button>
                  </div>
                </div>

                {/* Card Subtle Accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-[5rem] pointer-events-none" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-2 pb-20">
        <Reveal direction="up" delay={500}>
          <button 
            onClick={() => onNavigate('tournament')}
            className="w-full h-24 glass-card rounded-[2.5rem] px-8 flex items-center justify-between group active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Trophy size={28} />
              </div>
              <div className="text-left">
                <p className="text-lg font-black text-slate-900 uppercase italic leading-none mb-1">ELITE CHAMPIONSHIPS</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">BROWSE ALL ACTIVE COMPETITIONS</p>
              </div>
            </div>
            <ArrowRight size={24} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-2 transition-all" />
          </button>
        </Reveal>
      </div>
    </div>
  );
};
