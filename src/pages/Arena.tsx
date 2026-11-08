import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { UserProfile } from '@/src/hooks/useAuth';
import {
  Trophy,
  Users,
  ArrowRight,
  Activity,
  Search,
  Hash,
  CheckCircle,
  Shield,
  Flame,
  User as UserIcon,
  Lock,
  Copy
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Reveal } from '@/src/components/ui/Reveal';
import { FootballTacticsAnimation } from '@/src/components/ui/FootballTacticsAnimation';
import { getDemoTournaments, getDemoMatches } from '@/src/lib/localTournaments';
import {
  subscribeToAllTournamentsAcrossShards,
  subscribeToUserRegistrationsAcrossShards,
  subscribeToMatchesAcrossShards
} from '@/src/lib/shardManager';

interface ArenaProps {
  profile: UserProfile | null;
  onNavigate: (tab: any) => void;
  onEnterTournament: (tournament: any) => void;
  onOpenWallet?: () => void;
}

export const ArenaPage: React.FC<ArenaProps> = ({
  profile,
  onNavigate,
  onEnterTournament
}) => {
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [allTournaments, setAllTournaments] = useState<any[]>([]);
  const [joinedTournamentIds, setJoinedTournamentIds] = useState<string[]>([]);
  const [featuredTournaments, setFeaturedTournaments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const joinedIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!profile?.uid) return;

    // 1. Subscribe to recent matches across all Shards (Gariena1 + FC Tournament + Master)
    const unsubMatches = subscribeToMatchesAcrossShards(
      { participantId: profile.uid, maxPerShard: 15 },
      (officialMatches) => {
        const localDemos = getDemoTournaments().filter(
          (dt) => dt.publisherId === profile.uid
        );
        const allDemoMatches: any[] = [];
        localDemos.forEach((dt) => {
          const dm = getDemoMatches(dt.id);
          allDemoMatches.push(...dm);
        });

        const combined = [...allDemoMatches, ...officialMatches].sort((a, b) => {
          const timeA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : a.createdAt || 0;
          const timeB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : b.createdAt || 0;
          return timeB - timeA;
        });

        setRecentResults(combined.slice(0, 5));
      }
    );

    // 2. Subscribe to user registrations across all Shards
    const unsubRegs = subscribeToUserRegistrationsAcrossShards(
      profile.uid,
      (regs) => {
        const ids = regs.map((r) => r.tournamentId).filter(Boolean);
        joinedIdsRef.current = ids;
        setJoinedTournamentIds(ids);
      }
    );

    // 3. Subscribe to tournaments across all Shards (Gariena1 + FC Tournament + Master)
    const unsubTournaments = subscribeToAllTournamentsAcrossShards(
      (tournamentsList) => {
        setAllTournaments(tournamentsList);
      },
      { maxPerShard: 30 }
    );

    return () => {
      unsubMatches();
      unsubRegs();
      unsubTournaments();
    };
  }, [profile?.uid]);

  // Compute Featured Tournaments whenever allTournaments or joinedTournamentIds change
  useEffect(() => {
    if (!profile?.uid) return;
    let filtered = allTournaments.filter(
      (t) =>
        joinedTournamentIds.includes(t.id) ||
        t.publisherId === profile.uid ||
        t.status === 'open'
    );

    if (filtered.length === 0 && allTournaments.length > 0) {
      filtered = allTournaments.slice(0, 3);
    }

    const localDemos = getDemoTournaments().filter(
      (dt) => dt.publisherId === profile.uid
    );
    const mergedTournaments = [...localDemos, ...filtered];
    setFeaturedTournaments(mergedTournaments.slice(0, 3));
  }, [allTournaments, joinedTournamentIds, profile?.uid]);

  // Instant Search across all Shards using locally synced + cached multi-shard tournaments
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      const filtered = allTournaments.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.id && t.id.toLowerCase().includes(q)) ||
          (t.organizerName && t.organizerName.toLowerCase().includes(q))
      );
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, allTournaments]);

  return (
    <div className="space-y-8 sm:space-y-12 pt-4 min-h-screen">
      {/* Search Bar - Neumorphic Inset */}
      <div className="relative z-[200]">
        <Reveal direction="left">
          <div className="relative">
            <Input
              placeholder="Find your tournament"
              className="h-16 pl-16 border-fc-green/20 dark:!bg-[#161930]/90 dark:!border-white/18 dark:!text-white dark:placeholder:!text-slate-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-500 dark:text-indigo-300 z-10">
              <Search size={22} />
            </div>

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-4 nm-flat rounded-[2.5rem] z-[300] p-6 space-y-3 border border-white/50 dark:border-white/20 shadow-2xl bg-white/95 dark:bg-[#161930]/95 backdrop-blur-2xl">
                <div className="px-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 dark:text-indigo-200 uppercase tracking-widest">
                    Found {searchResults.length} Cups
                  </span>
                  <div className="w-8 h-1 bg-slate-100 dark:bg-white/15 rounded-full" />
                </div>
                <div className="max-h-[350px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {searchResults.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onEnterTournament(t)}
                      className="w-full flex items-center justify-between p-5 hover:bg-fc-green/10 dark:hover:bg-white/10 rounded-[1.8rem] transition-all text-left group border border-transparent hover:border-fc-green/20 dark:border-white/12 bg-[#f8f9fa] dark:bg-[#1e223d]/90 cursor-pointer"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-fc-green dark:text-[#ff7a45] group-hover:scale-110 transition-transform bg-white dark:bg-[#13162b]">
                          <Trophy size={24} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-black text-slate-800 dark:text-white block uppercase italic leading-none">
                            {t.title || 'Untitled Cup'}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                              <Shield size={10} />
                              {t.organizerName ||
                                t.organizationName ||
                                t.publisherName ||
                                'Official Host'}
                            </span>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(t.id);
                                alert('Tournament ID copied!');
                              }}
                              className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest flex items-center gap-1 bg-white dark:bg-[#13162b] px-2 py-0.5 rounded-md border border-slate-100 dark:border-white/15 hover:bg-slate-50 transition-all cursor-pointer"
                              title="Copy ID"
                            >
                              <Copy size={10} /> ID: {t.id.slice(0, 8).toUpperCase()}
                            </div>
                            {t.status === 'open' && (
                              <span className="text-[8px] font-black text-fc-green dark:text-emerald-300 uppercase px-2 py-0.5 rounded-md bg-fc-green/5 dark:bg-emerald-500/20 border border-fc-green/10 dark:border-emerald-400/30">
                                ACTIVE
                              </span>
                            )}
                            {t.entryType === 'invited' ? (
                              <span className="text-[8px] font-black text-indigo-600 dark:text-purple-200 uppercase px-2 py-0.5 rounded-md bg-indigo-500/5 dark:bg-purple-500/20 border border-indigo-500/10 dark:border-purple-400/30 flex items-center gap-1">
                                <Lock size={8} /> INVITED
                              </span>
                            ) : (
                              <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-200 uppercase px-2 py-0.5 rounded-md bg-emerald-500/5 dark:bg-emerald-500/20 border border-emerald-500/10 dark:border-emerald-400/30 flex items-center gap-1">
                                <Users size={8} /> PUBLIC
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-400 dark:text-white group-hover:text-fc-green dark:group-hover:text-[#ff7a45] group-hover:nm-inset transition-all">
                        <ArrowRight
                          size={18}
                          className="group-hover:translate-x-1 transition-transform"
                        />
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
        <div className="nm-flat rounded-[2.5rem] p-3 sm:p-4 border-2 border-white dark:border-white/18 dark:!bg-[#1b1f3a]/85">
          <div className="relative h-40 sm:h-56 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden group fc-card-bg bg-fc-dark/80">
            <div className="absolute inset-0 bg-gradient-to-r from-fc-dark via-fc-dark/60 to-transparent" />
            <div className="absolute top-0 right-0 w-1/2 h-full overflow-hidden border-l border-white/15">
              <FootballTacticsAnimation />
            </div>
            <div className="absolute inset-0 border-2 border-white/10 rounded-[2rem] sm:rounded-[2.5rem] pointer-events-none" />

            <div className="absolute top-6 sm:top-8 left-6 sm:left-8 z-10 pointer-events-none">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="w-2 h-2 rounded-full bg-fc-green animate-pulse" />
                <span className="text-[8px] sm:text-[9px] font-black text-fc-green uppercase tracking-[0.3em]">
                  Official Tournament Arena
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white uppercase italic leading-none tracking-tighter mb-2">
                ELITE <br />
                <span className="text-fc-green">ARENA</span>
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
        <Card className="flex flex-col gap-3.5 sm:gap-6 bg-gradient-to-b from-white via-[#fafbfe] to-[#f4f6fa] dark:!bg-gradient-to-br dark:!from-[#2b3158]/92 dark:!via-[#1e2240]/92 dark:!to-[#14172d]/96 border-2 border-white dark:!border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.06)] dark:!shadow-[0_24px_55px_-12px_rgba(4,5,14,0.9),inset_0_1px_1.5px_rgba(255,255,255,0.25)] p-3.5 sm:p-7 rounded-[2.2rem] sm:rounded-[2.8rem] relative overflow-hidden">
          {/* Subtle Corner Glow Accent */}
          <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-gradient-to-br from-emerald-500/10 via-indigo-500/10 to-transparent dark:from-[#ff7a45]/28 dark:via-[#ec4899]/22 dark:to-transparent blur-2xl pointer-events-none" />
          <div className="hidden dark:block absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-gradient-to-tr from-[#38bdf8]/22 via-[#a855f7]/18 to-transparent blur-2xl pointer-events-none" />

          {/* Top Passport Ribbon */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/12 relative z-10">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-indigo-200/90">
                FC ARENA PASSPORT
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/90 dark:bg-[#13162b]/90 border border-slate-200/60 dark:border-white/16 text-slate-600 dark:text-white text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
              <Hash size={10} className="text-indigo-500 dark:text-[#ff7a45]" />
              <span>
                {profile?.inGameUID || profile?.uid?.slice(0, 8).toUpperCase() || 'PLAYER'}
              </span>
            </div>
          </div>

          {/* Player Identity Header */}
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full p-1 bg-gradient-to-tr from-amber-400 via-white to-fc-green dark:from-[#ff7a45] dark:via-[#a855f7] dark:to-[#38bdf8] shadow-xl border border-white dark:border-white/25 flex items-center justify-center bg-white dark:bg-[#161930]">
                  <UserIcon size={32} className="text-slate-400 dark:text-white" />
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <h2 className="text-lg sm:text-2xl font-black text-[#0f172a] dark:text-white uppercase italic tracking-tight truncate leading-tight">
                    {profile?.inGameName || 'Player Name'}
                  </h2>
                  {profile?.inGameName && profile?.inGameUID && profile?.fbUrl && (
                    <div
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-indigo-600 dark:bg-[#ff7a45] flex items-center justify-center text-white shadow-sm shrink-0"
                      title="Verified Player"
                    >
                      <CheckCircle size={10} fill="white" />
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <div className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-500/22 border border-indigo-100/80 dark:border-indigo-400/35 text-indigo-700 dark:text-indigo-200 flex items-center gap-1 shadow-xs">
                    <Shield size={10} className="text-indigo-600 dark:text-indigo-300 shrink-0" />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                      {profile?.leagueName || 'Elite League'}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/22 border border-emerald-100/80 dark:border-emerald-400/35 text-emerald-700 dark:text-emerald-200 flex items-center gap-1 shadow-xs">
                    <Activity
                      size={10}
                      className="text-emerald-600 dark:text-emerald-300 shrink-0"
                    />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                      {profile?.role === 'admin'
                        ? 'Admin'
                        : profile?.role === 'publisher'
                        ? 'Publisher'
                        : 'Pro Tier'}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-500/22 border border-amber-100/80 dark:border-amber-400/35 text-amber-700 dark:text-amber-200 flex items-center gap-1 shadow-xs">
                    <Flame size={10} className="text-amber-500 dark:text-amber-300 fill-amber-500 shrink-0" />
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
      <div className="space-y-6 sm:space-y-8">
        <Reveal direction="right">
          <div className="flex items-center justify-between px-4 sm:px-6">
            <div className="flex flex-col">
              <h3 className="text-[11px] font-black text-slate-800 dark:!text-white uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-sm bg-fc-green dark:bg-gradient-to-tr dark:from-[#ff7a45] dark:to-[#a855f7] dark:shadow-[0_0_10px_rgba(255,122,69,0.8)] rotate-45" />
                ACTIVE CUPS
              </h3>
              <span className="text-[8px] font-bold text-slate-400 dark:!text-indigo-200/80 uppercase tracking-widest mt-1 ml-6">
                Join now and win prizes
              </span>
            </div>
            <button
              onClick={() => onNavigate('tournament')}
              className="text-[10px] font-black text-fc-green dark:!text-[#ff7a45] uppercase flex items-center gap-2 group"
            >
              Explore All{' '}
              <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:gap-8">
          {featuredTournaments.length === 0 && (
            <div className="py-20 text-center space-y-4 nm-inset rounded-[2.5rem] bg-slate-50/50 dark:!bg-[#15182c]/85 dark:!border-white/14">
              <Trophy size={48} className="mx-auto text-slate-200 dark:!text-indigo-400/40" />
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-400 dark:!text-slate-200 uppercase tracking-widest italic">
                  No Active Tournaments
                </p>
                <p className="text-[9px] font-bold text-slate-300 dark:!text-slate-400 uppercase tracking-widest">
                  Check back later for new events
                </p>
              </div>
            </div>
          )}

          {featuredTournaments.map((t, idx) => {
            const isFinished =
              t.status === 'finished' ||
              t.status === 'completed' ||
              Boolean((t as any).winnerId) ||
              Boolean((t as any).winnerText);
            const isLive = t.status === 'ongoing' || (t.filledSlots >= t.totalSlots && !isFinished);
            const remainingSpots = Math.max(0, (t.totalSlots || 16) - (t.filledSlots || 0));

            return (
              <Reveal key={t.id} direction={idx % 2 === 0 ? 'left' : 'right'} delay={idx * 100}>
                <Card
                  className="p-0 group active:scale-[0.985] overflow-hidden rounded-[2rem] sm:rounded-[2.6rem] border-2 border-white hover:border-fc-green/20 dark:!bg-gradient-to-br dark:!from-[#2b3158]/92 dark:!via-[#1d213d]/94 dark:!to-[#14172b]/98 dark:!backdrop-blur-3xl dark:!border-white/22 dark:hover:!border-[#a855f7]/55 dark:!shadow-[0_28px_65px_-12px_rgba(4,5,15,0.95),inset_0_1.5px_2px_rgba(255,255,255,0.28),inset_0_-1px_2px_rgba(255,122,69,0.16)] transition-all duration-300 shadow-xl cursor-pointer"
                  onClick={() => onEnterTournament(t)}
                >
                  <div className="relative p-5 sm:p-8 space-y-5 sm:space-y-6">
                    {/* Ambient Dark Glass Glow Orbs */}
                    <div className="hidden dark:block absolute -top-20 -right-16 w-56 h-56 rounded-full bg-gradient-to-br from-[#ff7a45]/30 via-[#ec4899]/24 to-transparent blur-3xl pointer-events-none" />
                    <div className="hidden dark:block absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-gradient-to-tr from-[#38bdf8]/24 via-[#8b5cf6]/25 to-transparent blur-3xl pointer-events-none" />
                    <div className="hidden dark:block absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none" />

                    {/* Top Status & Badges Row */}
                    <div className="flex items-center justify-between gap-2 relative z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFinished ? (
                          <div className="px-3.5 py-1.5 rounded-full bg-slate-800 dark:!bg-slate-800/85 dark:border dark:border-white/18 text-slate-300 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            END
                          </div>
                        ) : isLive ? (
                          <div className="px-3.5 py-1.5 rounded-full bg-rose-500 dark:!bg-rose-500/24 dark:border dark:border-rose-400/45 text-white dark:!text-rose-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm dark:shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                            LIVE
                          </div>
                        ) : (
                          <div className="px-3.5 py-1.5 rounded-full bg-emerald-500 dark:!bg-emerald-500/24 dark:border dark:border-emerald-400/45 text-white dark:!text-emerald-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm dark:shadow-[0_0_20px_rgba(16,185,129,0.28)]">
                            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white dark:bg-emerald-300 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-white dark:bg-emerald-400"></span>
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
                          className="px-3 py-1.5 rounded-full bg-slate-100 dark:!bg-[#121528]/90 text-slate-500 dark:!text-indigo-200 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.18em] border border-white dark:!border-white/18 flex items-center gap-1.5 hover:bg-slate-200 dark:hover:!bg-[#1b203b] active:scale-95 transition-all cursor-pointer shadow-xs"
                          title="Copy ID"
                        >
                          <Copy size={9} className="dark:text-[#38bdf8]" /> {t.id.slice(0, 8)}
                        </div>

                        {t.entryType === 'invited' ? (
                          <div className="px-3 py-1.5 rounded-full bg-indigo-500/10 dark:!bg-purple-500/25 text-indigo-600 dark:!text-purple-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-indigo-500/20 dark:!border-purple-400/45 dark:shadow-[0_0_14px_rgba(168,85,247,0.24)]">
                            <Lock size={10} className="text-indigo-500 dark:text-purple-300" />
                            INVITED
                          </div>
                        ) : (
                          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 dark:!bg-emerald-500/25 text-emerald-600 dark:!text-emerald-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-emerald-500/20 dark:!border-emerald-400/45 dark:shadow-[0_0_14px_rgba(16,185,129,0.24)]">
                            <Users size={10} className="text-emerald-500 dark:text-emerald-300" />
                            PUBLIC
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 dark:!bg-[#121528]/90 text-slate-600 dark:!text-white border border-slate-100 dark:!border-white/18 shadow-xs shrink-0">
                        <Users size={12} className="dark:text-[#38bdf8]" />
                        <span className="text-[9px] sm:text-[10px] font-black">
                          {t.filledSlots}/{t.totalSlots}
                        </span>
                      </div>
                    </div>

                    {/* Organizer Badge & Tournament Title */}
                    <div className="relative z-10 space-y-2.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:!bg-gradient-to-r dark:!from-indigo-500/22 dark:!to-purple-500/16 border border-slate-200/90 dark:!border-indigo-400/32 shadow-sm max-w-full">
                        <div className="w-4 h-4 rounded-md bg-indigo-600 dark:bg-gradient-to-br dark:from-[#ff7a45] dark:to-[#8b5cf6] text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Shield size={10} />
                        </div>
                        <span className="text-[7px] sm:text-[8px] font-black text-slate-400 dark:!text-indigo-200/90 uppercase tracking-widest shrink-0">
                          ORGANIZER:
                        </span>
                        <span className="text-[8.5px] sm:text-[10px] font-black text-slate-800 dark:!text-white uppercase tracking-tight truncate">
                          {t.organizerName ||
                            t.organizationName ||
                            t.publisherName ||
                            'Official FC Host'}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 dark:shadow-[0_0_6px_rgba(52,211,153,0.9)] shrink-0" />
                      </div>

                      <h4 className="text-xl sm:text-3xl font-black text-slate-800 dark:!text-white uppercase italic leading-tight group-hover:text-fc-green dark:group-hover:!text-[#ff7a45] transition-colors dark:drop-shadow-[0_2px_12px_rgba(255,255,255,0.12)]">
                        {t.title}
                      </h4>
                      <div className="w-14 h-1 bg-fc-green/20 dark:bg-gradient-to-r dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#38bdf8] rounded-full" />
                    </div>

                    {/* Recessed Glass Prize Pool & Action Bar */}
                    <div className="flex items-center justify-between gap-3 relative z-10 p-3.5 sm:p-4 rounded-[1.5rem] bg-slate-50/80 border border-slate-100 dark:!bg-gradient-to-br dark:!from-[#121528]/92 dark:!to-[#1a1f3a]/90 dark:!backdrop-blur-2xl dark:!border-white/16 dark:!shadow-[inset_0_2px_12px_rgba(0,0,0,0.65),0_1px_0_rgba(255,255,255,0.12)]">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-400 dark:!text-indigo-200/90 uppercase tracking-[0.2em] mb-0.5">
                          TOTAL REWARDS · {remainingSpots} SPOTS LEFT
                        </span>
                        <span className="text-lg sm:text-2xl font-black text-fc-dark dark:!text-amber-300 tracking-tight flex items-center gap-2 truncate dark:drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-fc-gold dark:bg-gradient-to-tr dark:from-amber-500 dark:to-yellow-300 flex items-center justify-center text-white dark:text-slate-950 text-[9px] sm:text-[10px] font-black shadow-sm dark:shadow-[0_0_12px_rgba(251,191,36,0.55)] shrink-0">
                            C
                          </div>
                          <span className="truncate">{t.prizePool}</span>
                        </span>
                      </div>

                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEnterTournament(t);
                        }}
                        className="rounded-2xl px-6 sm:px-8 py-3 sm:py-4 bg-fc-green text-black dark:bg-gradient-to-r dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] dark:!text-white dark:border dark:border-white/30 text-[10px] sm:text-[11px] font-black uppercase tracking-widest shadow-md shadow-fc-green/20 dark:shadow-[0_10px_25px_-4px_rgba(236,72,153,0.6),inset_0_1px_1px_rgba(255,255,255,0.38)] hover:bg-fc-dark dark:hover:brightness-110 transition-all shrink-0"
                      >
                        {profile?.uid === t.publisherId ? 'UPDATE' : 'JOIN'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Quick Nav Grid */}
      <div className="grid grid-cols-1 gap-6 px-2">
        <Reveal direction="left">
          <button
            onClick={() => onNavigate('tournament')}
            className="h-32 nm-flat rounded-[2.5rem] p-8 flex items-center justify-between active:nm-pressed transition-all group w-full dark:!bg-gradient-to-r dark:!from-[#2b3056]/92 dark:!via-[#1f2340]/92 dark:!to-[#181b33]/96 dark:!border-white/20 dark:!shadow-[0_22px_50px_-12px_rgba(4,5,15,0.88),inset_0_1px_1px_rgba(255,255,255,0.25)] relative overflow-hidden"
          >
            <div className="hidden dark:block absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-gradient-to-tl from-[#ff7a45]/25 via-[#a855f7]/20 to-transparent blur-2xl pointer-events-none" />
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-14 h-14 rounded-2xl nm-inset dark:!bg-[#13162b]/90 dark:!border-white/15 flex items-center justify-center text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform shadow-inner">
                <Trophy size={28} fill="currentColor" />
              </div>
              <div className="text-left">
                <span className="text-sm font-black text-slate-800 dark:!text-white uppercase italic block leading-none mb-1">
                  Elite Cups
                </span>
                <span className="text-[9px] font-bold text-slate-400 dark:!text-indigo-200/80 uppercase tracking-widest">
                  Join active tournaments
                </span>
              </div>
            </div>
            <ArrowRight
              size={20}
              className="text-slate-300 dark:text-slate-300 group-hover:text-amber-500 dark:group-hover:text-[#ff7a45] transition-colors relative z-10"
            />
          </button>
        </Reveal>

        {/* Official Facebook Page Card */}
        <Reveal direction="right" delay={100}>
          <div className="nm-flat rounded-[2.5rem] p-6 sm:p-8 bg-white dark:!bg-gradient-to-b dark:!from-[#2b3056]/94 dark:!via-[#1f2340]/94 dark:!to-[#161930]/98 border-2 border-white dark:!border-white/22 shadow-xl dark:!shadow-[0_24px_55px_-12px_rgba(4,5,15,0.9),inset_0_1px_1.5px_rgba(255,255,255,0.25)] flex flex-col items-center relative overflow-hidden">
            <div className="hidden dark:block absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-[#38bdf8]/20 via-[#6366f1]/15 to-transparent blur-2xl pointer-events-none" />

            {/* Headline */}
            <div className="text-center mb-4 relative z-10">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:!text-white uppercase tracking-[0.22em] leading-snug">
                Official Facebook Page
              </h3>
              {/* Decorative Zig-Zag Accent */}
              <div className="flex justify-center mt-1.5">
                <svg
                  width="68"
                  height="10"
                  viewBox="0 0 68 10"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-[#7aa5f2] dark:text-[#38bdf8]"
                >
                  <path
                    d="M2 8L8.4 2L14.8 8L21.2 2L27.6 8L34 2L40.4 8L46.8 2L53.2 8L59.6 2L66 8"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Facebook Page Plugin Box */}
            <div className="w-full max-w-[360px] rounded-xl border border-[#dddfe2] dark:border-white/20 bg-white dark:bg-[#1c203b] shadow-sm overflow-hidden relative z-10">
              {/* Top Profile Info Area */}
              <div className="p-3.5 sm:p-4 flex items-start gap-3.5 bg-white dark:bg-[#1c203b]">
                <a
                  href="https://www.facebook.com/profile.php?id=61595965529079"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-md overflow-hidden border border-slate-300 dark:border-white/20 shrink-0 shadow-xs block hover:opacity-95 transition-opacity bg-[#0b1026]"
                >
                  <img
                    src="/fc_arena_icon.jpg"
                    alt="FC ARENA VS"
                    className="w-full h-full object-cover"
                  />
                </a>
                <div className="min-w-0 flex-1 pt-0.5 text-left">
                  <a
                    href="https://www.facebook.com/profile.php?id=61595965529079"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[17px] sm:text-lg font-bold text-[#385898] dark:text-[#60a5fa] hover:underline leading-tight block truncate"
                  >
                    FC ARENA VS
                  </a>
                  <p className="text-xs font-medium text-[#4b4f56] dark:text-slate-300 mt-0.5">
                    Official Community • Follow for Updates
                  </p>
                </div>
              </div>

              {/* Bottom Action Bar (Follow Page & Share) */}
              <div className="px-3.5 py-2.5 bg-[#f5f6f7] dark:bg-[#13162b] border-t border-[#e9ebee] dark:border-white/12 flex items-center justify-between gap-2">
                <a
                  href="https://www.facebook.com/profile.php?id=61595965529079"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[#f5f6f7] hover:bg-[#ebedf0] dark:bg-[#252b4d] dark:hover:bg-[#2f3660] border border-[#ccd0d5] dark:border-white/20 text-[#4b4f56] dark:text-white text-xs font-bold shadow-2xs active:scale-95 transition-all"
                >
                  <span className="w-4 h-4 rounded-[3px] bg-[#1877f2] text-white flex items-center justify-center font-black text-[12px] leading-none">
                    f
                  </span>
                  <span>Follow Page</span>
                </a>

                <a
                  href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.facebook.com%2Fprofile.php%3Fid%3D61595965529079"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[#f5f6f7] hover:bg-[#ebedf0] dark:bg-[#252b4d] dark:hover:bg-[#2f3660] border border-[#ccd0d5] dark:border-white/20 text-[#4b4f56] dark:text-white text-xs font-bold shadow-2xs active:scale-95 transition-all"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-[#4b4f56] dark:text-slate-200"
                  >
                    <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
                  </svg>
                  <span>Share</span>
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
};
