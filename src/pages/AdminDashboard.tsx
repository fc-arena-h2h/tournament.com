import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  addDoc,
  deleteDoc,
  limit,
  orderBy,
  setDoc,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  Users,
  CheckCircle,
  XCircle,
  Trophy,
  Shield,
  Plus,
  Megaphone,
  X,
  LayoutDashboard,
  Gamepad2,
  Trash2,
  Copy as CopyIcon,
  Download,
  AlertCircle,
  Edit3,
  RotateCcw,
  Send,
  MessageCircle,
  Database,
  Server,
  HardDrive,
  Globe
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { MatchesPage } from '@/src/pages/Matches';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { getDemoTournaments, deleteDemoTournament } from '@/src/lib/localTournaments';
import { notifyMatchParticipants } from '@/src/lib/notifications';
import {
  getShardClusters,
  getShardClusterInfo,
  getTournamentDbByTournamentId,
  subscribeToAllTournamentsAcrossShards,
  getAllTournamentDbs
} from '@/src/lib/shardManager';
import { ShardId, getLocalDbStats, LocalDbStats } from '@/src/lib/localDbManager';

interface Registration {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  gameName: string;
  shardId?: ShardId;
}

interface Tournament {
  id: string;
  title: string;
  publisherId: string;
  filledSlots: number;
  organizerName?: string;
  organizationName?: string;
  publisherName?: string;
  shardId?: ShardId;
  notifShardId?: string;
}

export const AdminDashboard = ({
  onCreateNew,
  onCreateDemo,
  onEnterTournament
}: {
  onCreateNew: () => void;
  onCreateDemo?: () => void;
  onEnterTournament: (t: any) => void;
}) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [demoTournaments, setDemoTournaments] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [perShardCounts, setPerShardCounts] = useState<Record<string, number>>({
    shard_1: 0,
    shard_2: 0,
    master: 0
  });
  const [adminShardFilter, setAdminShardFilter] = useState<'all' | ShardId>('all');
  const [selectedKeyShardId, setSelectedKeyShardId] = useState<ShardId>('shard_1');
  const [localDbStats, setLocalDbStats] = useState<LocalDbStats>(() => getLocalDbStats());
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [adminViewMode, setAdminViewMode] = useState<'dashboard' | 'matches'>('dashboard');
  const [activeSection, setActiveSection] = useState<'tournaments' | 'access' | 'reports' | 'keys'>('tournaments');
  const [regFilter, setRegFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reportedMatches, setReportedMatches] = useState<any[]>([]);
  const [editingPortalMatch, setEditingPortalMatch] = useState<any | null>(null);
  const [portalEditScores, setPortalEditScores] = useState({ home: 0, away: 0 });
  const [isSavingPortalMatch, setIsSavingPortalMatch] = useState(false);
  const [licenseKeys, setLicenseKeys] = useState<any[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [settings, setSettings] = useState({
    telegramLink: 'https://t.me/your_admin_telegram',
    facebookLink: ''
  });
  const [appSettings, setAppSettings] = useState({
    min_version: '2.4.5',
    app_id: 'fc-arena-vs-2025',
    force_update: true,
    update_url: 'https://t.me/fcarenavsofficial',
    telegram_update_url: 'https://t.me/fcarenavsofficial',
    chrome_update_url: 'https://t.me/fcarenavsofficial'
  });

  const shardClusters = getShardClusters();

  useEffect(() => {
    if (!auth.currentUser || !userProfile) return;

    let innerUnsubs: Unsubscribe[] = [];

    const cleanupInner = () => {
      innerUnsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      innerUnsubs = [];
    };

    // 1. Subscribe to Tournaments across all Shards (Gariena1 + FC Tournament + Master)
    const unsubTournaments = subscribeToAllTournamentsAcrossShards(
      (allList, counts) => {
        setPerShardCounts(counts);
        setLocalDbStats(getLocalDbStats());

        const filteredList =
          userProfile.role === 'admin'
            ? allList
            : allList.filter((t) => t.publisherId === auth.currentUser?.uid);

        const tMap: Record<string, Tournament> = {};
        filteredList.forEach((t) => {
          tMap[t.id] = t as Tournament;
        });
        setTournaments(tMap);

        cleanupInner();

        const allShardTargets = getAllTournamentDbs(true);
        const regsByShard = new Map<ShardId, Registration[]>();
        const matchesByShard = new Map<ShardId, any[]>();

        const emitRegs = () => {
          const merged: Registration[] = [];
          const seen = new Set<string>();
          for (const [, list] of regsByShard.entries()) {
            for (const r of list) {
              if (!seen.has(r.id)) {
                seen.add(r.id);
                merged.push(r);
              }
            }
          }
          setRegistrations(merged);
          setLoading(false);
        };

        const emitMatches = () => {
          const merged: any[] = [];
          const seen = new Set<string>();
          for (const [, list] of matchesByShard.entries()) {
            for (const m of list) {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            }
          }
          setReportedMatches(merged);
        };

        if (userProfile.role === 'admin') {
          for (const target of allShardTargets) {
            const rQ = query(collection(target.db, 'registrations'), limit(100));
            const uR = onSnapshot(
              rQ,
              (regSnap) => {
                regsByShard.set(
                  target.shardId,
                  regSnap.docs.map(
                    (d) => ({ id: d.id, ...d.data(), shardId: target.shardId } as Registration)
                  )
                );
                emitRegs();
              },
              () => {
                regsByShard.set(target.shardId, []);
                emitRegs();
              }
            );
            innerUnsubs.push(uR);

            const mQ = query(
              collection(target.db, 'matches'),
              where('status', 'in', ['disputed', 'reported']),
              limit(100)
            );
            const uM = onSnapshot(
              mQ,
              (mSnap) => {
                matchesByShard.set(
                  target.shardId,
                  mSnap.docs.map((d) => ({ id: d.id, ...d.data(), shardId: target.shardId }))
                );
                emitMatches();
              },
              () => {
                matchesByShard.set(target.shardId, []);
                emitMatches();
              }
            );
            innerUnsubs.push(uM);
          }
        } else {
          // Publisher: group their tournamentIds by shardId and listen only to their tournaments
          const idsByShard = new Map<ShardId, string[]>();
          filteredList.forEach((t) => {
            const s = (t.shardId || 'master') as ShardId;
            const arr = idsByShard.get(s) || [];
            arr.push(t.id);
            idsByShard.set(s, arr);
          });

          if (idsByShard.size === 0) {
            setRegistrations([]);
            setReportedMatches([]);
            setLoading(false);
          } else {
            for (const [shardId, ids] of idsByShard.entries()) {
              const target = allShardTargets.find((t) => t.shardId === shardId);
              if (!target || ids.length === 0) continue;
              const sliceIds = ids.slice(0, 30);

              const rQ = query(
                collection(target.db, 'registrations'),
                where('tournamentId', 'in', sliceIds),
                limit(100)
              );
              const uR = onSnapshot(
                rQ,
                (regSnap) => {
                  regsByShard.set(
                    shardId,
                    regSnap.docs.map(
                      (d) => ({ id: d.id, ...d.data(), shardId } as Registration)
                    )
                  );
                  emitRegs();
                },
                () => {
                  regsByShard.set(shardId, []);
                  emitRegs();
                }
              );
              innerUnsubs.push(uR);

              const mQ = query(
                collection(target.db, 'matches'),
                where('tournamentId', 'in', sliceIds),
                limit(150)
              );
              const uM = onSnapshot(
                mQ,
                (mSnap) => {
                  const allM = mSnap.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                    shardId
                  }));
                  matchesByShard.set(
                    shardId,
                    allM.filter((m: any) => m.status === 'disputed' || m.status === 'reported')
                  );
                  emitMatches();
                },
                () => {
                  matchesByShard.set(shardId, []);
                  emitMatches();
                }
              );
              innerUnsubs.push(uM);
            }
          }
        }
      },
      { maxPerShard: 50 }
    );

    // 2. Fetch Keys & Settings from Master DB (Admin Only)
    let unsubKeys: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;
    let unsubAppSettings: (() => void) | null = null;

    if (userProfile.role === 'admin') {
      const kQ = query(collection(db, 'licenseKeys'), orderBy('createdAt', 'desc'), limit(50));
      unsubKeys = onSnapshot(kQ, (snapshot) => {
        setLicenseKeys(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as any);
        }
      });

      unsubAppSettings = onSnapshot(doc(db, 'settings', 'app_update'), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setAppSettings({
            min_version: data.min_version || '2.4.5',
            app_id: data.app_id || 'fc-arena-vs-2025',
            force_update: data.force_update ?? true,
            update_url: data.update_url || data.telegram_update_url || 'https://t.me/fcarenavsofficial',
            telegram_update_url: data.telegram_update_url || data.update_url || 'https://t.me/fcarenavsofficial',
            chrome_update_url: data.chrome_update_url || data.update_url || 'https://t.me/fcarenavsofficial'
          });
        } else {
          setDoc(doc(db, 'settings', 'app_update'), {
            min_version: '2.4.5',
            app_id: 'fc-arena-vs-2025',
            force_update: true,
            update_url: 'https://t.me/fcarenavsofficial',
            telegram_update_url: 'https://t.me/fcarenavsofficial',
            chrome_update_url: 'https://t.me/fcarenavsofficial'
          }).catch(console.error);
        }
      });
    }

    return () => {
      unsubTournaments();
      cleanupInner();
      if (unsubKeys) unsubKeys();
      if (unsubSettings) unsubSettings();
      if (unsubAppSettings) unsubAppSettings();
    };
  }, [userProfile?.role, auth.currentUser?.uid]);

  // Load Demo Tournaments
  useEffect(() => {
    setDemoTournaments(getDemoTournaments());
  }, [activeSection]);

  // Separate effect to fetch the profile itself from Master DB
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [auth.currentUser?.uid]);

  const handleUpdateStatus = async (reg: Registration, newStatus: 'approved' | 'rejected') => {
    try {
      const t = tournaments[reg.tournamentId];
      const { db: targetDb } = getTournamentDbByTournamentId(
        reg.tournamentId,
        reg.shardId || t?.shardId
      );
      await updateDoc(doc(targetDb, 'registrations', reg.id), { status: newStatus });
      if (newStatus === 'approved' && t) {
        await updateDoc(doc(targetDb, 'tournaments', reg.tournamentId), {
          filledSlots: (t.filledSlots || 0) + 1
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `registrations/${reg.id}`);
    }
  };

  const handleBroadcast = async () => {
    if (!announcement.trim()) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        text: announcement,
        senderId: auth.currentUser?.uid,
        senderName: userProfile?.inGameName || 'System Admin',
        createdAt: serverTimestamp()
      });
      setAnnouncement('');
      alert('Broadcasted!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'system'), settings, { merge: true });
      alert('Settings saved!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/system');
    }
  };

  const handleGenerateKey = async () => {
    if (!auth.currentUser) return;
    setIsGeneratingKey(true);
    try {
      const clusterInfo = getShardClusterInfo(selectedKeyShardId);
      const shardTag =
        selectedKeyShardId === 'shard_2'
          ? 'DB2'
          : selectedKeyShardId === 'shard_1'
          ? 'DB1'
          : 'DBX';
      const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const keyString = `FC-${shardTag}-${randomPart()}-${randomPart()}`;

      await setDoc(doc(db, 'licenseKeys', keyString), {
        key: keyString,
        status: 'active',
        targetShardId: selectedKeyShardId,
        targetShardName: clusterInfo.name,
        notifShardId: selectedKeyShardId === 'shard_2' ? 'notif_2' : 'notif_1',
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      alert(`Key Generated for ${clusterInfo.name}: ${keyString}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'licenseKeys');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await deleteDoc(doc(db, 'licenseKeys', keyId));
      return true;
    } catch (error) {
      console.error('Failed to delete license key:', error);
      handleFirestoreError(error, OperationType.DELETE, `licenseKeys/${keyId}`);
      return false;
    }
  };

  const handleDeleteDemo = (id: string) => {
    if (confirm('Delete this demo arena and all its data? This cannot be undone.')) {
      deleteDemoTournament(id);
      setDemoTournaments(getDemoTournaments());
    }
  };

  const handlePortalConfirmMatch = async (match: any) => {
    try {
      const hScore = match.homeScore ?? 0;
      const aScore = match.awayScore ?? 0;
      const t = tournaments[match.tournamentId];
      const effectiveShard = match.shardId || t?.shardId;
      const { db: targetDb, shardId } = getTournamentDbByTournamentId(
        match.tournamentId,
        effectiveShard
      );

      await updateDoc(doc(targetDb, 'matches', match.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      const winnerName =
        hScore > aScore
          ? match.homePlayerName
          : aScore > hScore
          ? match.awayPlayerName
          : 'Draw';
      notifyMatchParticipants({
        homePlayerId: match.homePlayerId,
        awayPlayerId: match.awayPlayerId,
        title: '🏆 Match Result Confirmed!',
        message: `${match.homePlayerName} (${hScore}) - (${aScore}) ${match.awayPlayerName}. Winner: ${winnerName}!`,
        type: 'match_result',
        tournamentId: match.tournamentId,
        matchId: match.id,
        shardId
      }).catch(() => {});
      alert('Match result confirmed and finalized!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  const handlePortalResetMatch = async (match: any) => {
    try {
      const t = tournaments[match.tournamentId];
      const { db: targetDb } = getTournamentDbByTournamentId(
        match.tournamentId,
        match.shardId || t?.shardId
      );
      await updateDoc(doc(targetDb, 'matches', match.id), {
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        penaltyWinnerId: null,
        reporterId: null,
        disputeReason: null,
        updatedAt: serverTimestamp()
      });
      alert('Match has been reset to scheduled status.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  const handlePortalSaveEditedMatch = async () => {
    if (!editingPortalMatch) return;
    setIsSavingPortalMatch(true);
    try {
      const t = tournaments[editingPortalMatch.tournamentId];
      const { db: targetDb } = getTournamentDbByTournamentId(
        editingPortalMatch.tournamentId,
        editingPortalMatch.shardId || t?.shardId
      );
      await updateDoc(doc(targetDb, 'matches', editingPortalMatch.id), {
        homeScore: portalEditScores.home,
        awayScore: portalEditScores.away,
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      alert('Match score updated and finalized!');
      setEditingPortalMatch(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${editingPortalMatch.id}`);
    } finally {
      setIsSavingPortalMatch(false);
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="LOADING DASHBOARD..." />;

  const visibleTournaments = Object.values(tournaments).filter((t) => {
    if (adminShardFilter === 'all') return true;
    return (t.shardId || 'master') === adminShardFilter;
  });

  return (
    <div className="space-y-12 pb-32 pt-4 px-2">
      {userProfile?.role === 'admin' && (
        <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-16 mx-2">
          <button
            onClick={() => setAdminViewMode('dashboard')}
            className={cn(
              'flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2',
              adminViewMode === 'dashboard'
                ? 'nm-flat text-indigo-600 bg-[#f0f0f3]'
                : 'text-slate-400'
            )}
          >
            <LayoutDashboard size={14} /> Admin
          </button>
          <button
            onClick={() => setAdminViewMode('matches')}
            className={cn(
              'flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2',
              adminViewMode === 'matches'
                ? 'nm-flat text-indigo-600 bg-[#f0f0f3]'
                : 'text-slate-400'
            )}
          >
            <Gamepad2 size={14} /> Battles
          </button>
        </div>
      )}

      {adminViewMode === 'matches' ? (
        <MatchesPage profile={userProfile} />
      ) : (
        <>
          <div className="flex flex-col gap-6 px-2">
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">
                  {userProfile?.role === 'admin' ? 'Command Center' : 'Publisher'}
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {userProfile?.role === 'admin'
                    ? 'System Operations · Multi-Database Cluster'
                    : 'System Operations'}
                </p>
              </div>
            </div>

            {/* Admin Multi-Database Cluster Monitor */}
            {userProfile?.role === 'admin' && (
              <Card className="p-5 border-none mx-2 bg-white/90 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl nm-inset bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Database size={18} />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-slate-800 uppercase italic tracking-tight">
                        5-Database Cluster & Local Engine
                      </h4>
                      <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
                        Auth (zxzx) · DB 1 (Gariena1) · DB 2 (FC Tournament)
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    CLUSTER ONLINE
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-2xl nm-inset bg-emerald-50/40 border border-emerald-200/40 space-y-1">
                    <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase tracking-wider">
                      <Server size={10} /> DB 1 · Gariena1
                    </div>
                    <div className="text-lg font-black text-slate-800 italic leading-none">
                      {perShardCounts.shard_1 || 0}
                    </div>
                    <div className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider">
                      Notif: App v1
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl nm-inset bg-indigo-50/40 border border-indigo-200/40 space-y-1">
                    <div className="flex items-center gap-1 text-[8px] font-black text-indigo-600 uppercase tracking-wider">
                      <Server size={10} /> DB 2 · FC Tourney
                    </div>
                    <div className="text-lg font-black text-slate-800 italic leading-none">
                      {perShardCounts.shard_2 || 0}
                    </div>
                    <div className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider">
                      Notif: MY App 1
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl nm-inset bg-amber-50/40 border border-amber-200/40 space-y-1">
                    <div className="flex items-center gap-1 text-[8px] font-black text-amber-600 uppercase tracking-wider">
                      <HardDrive size={10} /> Local DB Cache
                    </div>
                    <div className="text-lg font-black text-slate-800 italic leading-none">
                      {localDbStats.routedTournamentsCount}
                    </div>
                    <div className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider">
                      Saved {localDbStats.estimatedSavedReads} Reads
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 px-2">
              <div className="p-5 nm-flat bg-white rounded-[2rem] border border-white/50 flex items-center justify-between group">
                <div className="flex flex-col gap-1">
                  <h4 className="text-[12px] font-black text-slate-800 uppercase italic tracking-tight">
                    Create a Tournament
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Official Competition
                  </p>
                </div>
                <button
                  onClick={onCreateNew}
                  className="w-14 h-14 rounded-2xl nm-inset bg-[#f0f1f5] text-indigo-600 flex items-center justify-center active:scale-95 transition-all shadow-sm"
                  title="Create Tournament"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="p-5 nm-flat bg-white/60 rounded-[2rem] border border-white/30 flex items-center justify-between opacity-80">
                <div className="flex flex-col gap-1">
                  <h4 className="text-[12px] font-black text-slate-500 uppercase italic tracking-tight">
                    Create a Demo Tournament
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Sandbox / Testing
                  </p>
                </div>
                <button
                  onClick={onCreateDemo}
                  className="w-14 h-14 rounded-2xl nm-inset bg-[#f0f1f5] text-slate-400 flex items-center justify-center active:scale-95 transition-all shadow-sm"
                  title="Create Demo"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>
          </div>

          <div className="mx-2 p-1.5 nm-inset rounded-[1.6rem] bg-[#e6e6e9] border-2 border-white/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-inner">
            <button
              onClick={() => setActiveSection('tournaments')}
              className={cn(
                'flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                activeSection === 'tournaments'
                  ? 'nm-flat bg-[#f0f0f3] text-indigo-600 shadow-sm'
                  : 'text-slate-500'
              )}
            >
              <Trophy size={14} /> Tournaments
            </button>
            <button
              onClick={() => setActiveSection('reports')}
              className={cn(
                'flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 relative',
                activeSection === 'reports'
                  ? 'nm-flat bg-[#f0f0f3] text-rose-600 shadow-sm'
                  : 'text-slate-500'
              )}
            >
              <AlertCircle size={14} /> Reports
              {reportedMatches.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[8px] font-black">
                  {reportedMatches.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveSection('access')}
              className={cn(
                'flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                activeSection === 'access'
                  ? 'nm-flat bg-[#f0f0f3] text-amber-600 shadow-sm'
                  : 'text-slate-500'
              )}
            >
              <Users size={14} /> Access
            </button>
            {userProfile?.role === 'admin' && (
              <button
                onClick={() => setActiveSection('keys')}
                className={cn(
                  'flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                  activeSection === 'keys'
                    ? 'nm-flat bg-[#f0f0f3] text-emerald-600 shadow-sm'
                    : 'text-slate-500'
                )}
              >
                <Shield size={14} /> Keys
              </button>
            )}
          </div>

          {activeSection === 'tournaments' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">
                    Tournament Management
                  </h3>
                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                    {visibleTournaments.length} Total
                  </span>
                </div>

                {userProfile?.role === 'admin' && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {[
                      { id: 'all', label: `All Databases (${Object.values(tournaments).length})` },
                      { id: 'shard_1', label: `DB 1: Gariena1 (${perShardCounts.shard_1 || 0})` },
                      { id: 'shard_2', label: `DB 2: FC Tourney (${perShardCounts.shard_2 || 0})` },
                      ...(perShardCounts.master > 0
                        ? [{ id: 'master', label: `Master Legacy (${perShardCounts.master})` }]
                        : [])
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setAdminShardFilter(tab.id as any)}
                        className={cn(
                          'px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all',
                          adminShardFilter === tab.id
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'nm-flat bg-white text-slate-500'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {userProfile?.role === 'admin' && (
                  <Card className="p-6 border-none space-y-4 mx-2 bg-indigo-50/30">
                    <textarea
                      className="w-full h-24 p-4 nm-inset rounded-2xl text-slate-700 outline-none border border-white/20 text-xs font-medium"
                      placeholder="Broadcast to all users..."
                      value={announcement}
                      onChange={(e) => setAnnouncement(e.target.value)}
                    />
                    <Button
                      onClick={handleBroadcast}
                      className="w-full h-12 rounded-xl flex items-center gap-2"
                    >
                      <Megaphone size={16} /> Broadcast Update
                    </Button>
                  </Card>
                )}

                {/* Demo Tournaments List */}
                {demoTournaments.length > 0 && (
                  <div className="space-y-4 px-2">
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                        Local Demo Arenas
                      </span>
                      <div className="h-px flex-1 bg-amber-100" />
                    </div>
                    {demoTournaments.map((t) => (
                      <Card
                        key={t.id}
                        className="p-6 border-none mx-2 group bg-amber-50/30 border-amber-100/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-black text-slate-800 uppercase italic">
                              {t.title}
                            </span>
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
                              Demo · Local Storage
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDeleteDemo(t.id)}
                              className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white"
                              onClick={() => onEnterTournament(t)}
                            >
                              MANAGE DEMO
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {visibleTournaments.length === 0 && demoTournaments.length === 0 && (
                  <div className="py-20 text-center space-y-4 nm-inset rounded-[2.5rem] bg-slate-50/50 mx-2">
                    <Trophy size={48} className="mx-auto text-slate-200" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                      {userProfile?.role === 'admin'
                        ? 'No Tournaments Found in Selected Database'
                        : 'No Tournaments Found'}
                    </p>
                  </div>
                )}

                {visibleTournaments.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                        Official Live Arenas
                      </span>
                      <div className="h-px flex-1 bg-indigo-100" />
                    </div>
                    {visibleTournaments.map((t) => {
                      const shardInfo = getShardClusterInfo(t.shardId);
                      return (
                        <Card key={t.id} className="p-6 border-none mx-2 group">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-800 uppercase italic truncate">
                                  {t.title}
                                </span>
                                {userProfile?.role === 'admin' && (
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border',
                                      t.shardId === 'shard_2'
                                        ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                                        : t.shardId === 'shard_1'
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    )}
                                  >
                                    {shardInfo.shortLabel}
                                  </span>
                                )}
                              </div>
                              {userProfile?.role === 'admin' && (
                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">
                                  {t.organizerName || 'Host'} · Notif: {shardInfo.notifLabel}
                                </span>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-fc-green text-fc-green hover:bg-fc-green hover:text-white shrink-0"
                              onClick={() => onEnterTournament(t)}
                            >
                              MANAGE
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === 'keys' && userProfile?.role === 'admin' && (
            <section className="space-y-12 animate-in fade-in">
              <div className="space-y-6">
                <div className="px-4 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">
                    Platform Control
                  </h3>
                </div>

                {/* Admin Links */}
                <Card className="p-6 border-none mx-2 space-y-6 bg-white shadow-sm">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Megaphone size={12} className="text-indigo-500" /> Admin Contact Links
                      </label>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">
                        For Activation Key Inquiries
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-500 uppercase ml-2 flex items-center gap-1.5">
                          <Send size={10} className="text-sky-500" /> Admin Telegram Link
                        </span>
                        <Input
                          placeholder="https://t.me/your_admin_telegram"
                          value={settings.telegramLink || ''}
                          onChange={(e) =>
                            setSettings({ ...settings, telegramLink: e.target.value })
                          }
                          className="h-14"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-500 uppercase ml-2 flex items-center gap-1.5">
                          <MessageCircle size={10} className="text-blue-600" /> Admin Facebook /
                          Messenger Link
                        </span>
                        <Input
                          placeholder="https://facebook.com/your_admin_page"
                          value={settings.facebookLink || ''}
                          onChange={(e) =>
                            setSettings({ ...settings, facebookLink: e.target.value })
                          }
                          className="h-14"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveSettings}
                      className="w-full h-14 nm-flat bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest shadow-md"
                    >
                      Update Contact Links
                    </Button>
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* App Update Management */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Download size={12} /> App Update Protocol
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-slate-400 uppercase ml-2">
                          Min Version
                        </span>
                        <Input
                          value={appSettings.min_version}
                          onChange={(e) =>
                            setAppSettings({ ...appSettings, min_version: e.target.value })
                          }
                          placeholder="e.g. 2.4.1"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-slate-400 uppercase ml-2">
                          Application ID
                        </span>
                        <Input
                          value={appSettings.app_id}
                          onChange={(e) =>
                            setAppSettings({ ...appSettings, app_id: e.target.value })
                          }
                          placeholder="fc-arena-vs-2024"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-sky-600 uppercase ml-2 flex items-center gap-1.5">
                          <Send size={10} /> Telegram Update Link (Continue Update in Telegram)
                        </span>
                        <Input
                          value={appSettings.telegram_update_url || appSettings.update_url || ''}
                          onChange={(e) =>
                            setAppSettings({
                              ...appSettings,
                              telegram_update_url: e.target.value,
                              update_url: e.target.value
                            })
                          }
                          placeholder="https://t.me/..."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-indigo-600 uppercase ml-2 flex items-center gap-1.5">
                          <Globe size={10} /> Google Chrome Update Link (Continue Update in Google Chrome)
                        </span>
                        <Input
                          value={appSettings.chrome_update_url || ''}
                          onChange={(e) =>
                            setAppSettings({
                              ...appSettings,
                              chrome_update_url: e.target.value
                            })
                          }
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl nm-inset bg-slate-50">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                          Enforce Mandatory Update
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">
                          Blocks app usage if version mismatch
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setAppSettings({
                            ...appSettings,
                            force_update: !appSettings.force_update
                          })
                        }
                        className={cn(
                          'w-14 h-8 rounded-full transition-all relative flex items-center px-1',
                          appSettings.force_update ? 'bg-emerald-500' : 'bg-slate-300'
                        )}
                      >
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full bg-white shadow-md transition-all',
                            appSettings.force_update ? 'translate-x-6' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>

                    <Button
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'settings', 'app_update'), appSettings, {
                            merge: true
                          });
                          alert('App Update Settings Deployment Successful!');
                        } catch {
                          alert('Deployment Failed!');
                        }
                      }}
                      className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl"
                    >
                      Deploy Update Protocol
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Activation Keys with Target Database Shard Selection */}
              <div className="space-y-6">
                <div className="px-4 flex flex-col gap-1">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">
                    Tournament Activation Keys
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Select which Database Shard will host the tournament created with this key
                  </p>
                </div>

                <Card className="p-6 border-none mx-2 space-y-5 bg-white shadow-sm">
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Database size={12} className="text-indigo-600" /> Select Target Tournament
                      Database
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {shardClusters.map((cluster) => {
                        const isSelected = selectedKeyShardId === cluster.id;
                        return (
                          <button
                            key={cluster.id}
                            type="button"
                            onClick={() => setSelectedKeyShardId(cluster.id)}
                            className={cn(
                              'p-4 rounded-2xl text-left border-2 transition-all flex flex-col gap-1.5',
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50/40 shadow-md'
                                : 'nm-inset bg-slate-50/70 border-transparent opacity-75 hover:opacity-100'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-slate-800 uppercase italic">
                                {cluster.name}
                              </span>
                              <span
                                className={cn(
                                  'w-3 h-3 rounded-full border-2',
                                  isSelected
                                    ? 'bg-indigo-600 border-indigo-600'
                                    : 'border-slate-300'
                                )}
                              />
                            </div>
                            <span className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">
                              Project: {cluster.tournamentProjectId}
                            </span>
                            <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">
                              Paired Notification DB: {cluster.notifLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    onClick={handleGenerateKey}
                    disabled={isGeneratingKey}
                    className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[11px] tracking-widest shadow-lg"
                  >
                    {isGeneratingKey
                      ? 'GENERATING KEY...'
                      : `Generate Key for ${getShardClusterInfo(selectedKeyShardId).shortLabel}`}
                  </Button>
                </Card>

                <div className="space-y-4 px-2">
                  {licenseKeys.length === 0 && (
                    <p className="text-center text-[10px] text-slate-400 py-10 uppercase tracking-widest font-black">
                      No keys generated yet
                    </p>
                  )}
                  {licenseKeys.map((k) => {
                    const keyShardInfo = getShardClusterInfo(k.targetShardId || 'shard_1');
                    return (
                      <Card
                        key={k.id}
                        className="p-4 border-none flex items-center justify-between gap-4"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono font-black text-slate-800 select-all">
                              {k.key}
                            </span>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border',
                                (k.targetShardId || 'shard_1') === 'shard_2'
                                  ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              )}
                            >
                              {keyShardInfo.shortLabel}
                            </span>
                          </div>
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            Status:{' '}
                            <span
                              className={cn(
                                k.status === 'active' ? 'text-emerald-500' : 'text-rose-400'
                              )}
                            >
                              {k.status}
                            </span>
                            <span>· {keyShardInfo.notifLabel}</span>
                            {k.status === 'used' && k.usedAt && (
                              <span className="text-slate-300">
                                · Used on {new Date(k.usedAt.seconds * 1000).toLocaleDateString()}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(k.key);
                              alert('Key copied to clipboard');
                            }}
                            className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-slate-400 hover:text-indigo-500"
                            title="Copy Key"
                          >
                            <CopyIcon size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (
                                window.confirm(`Are you sure you want to delete key ${k.key}?`)
                              ) {
                                await handleDeleteKey(k.id);
                                alert('Key deleted successfully');
                              }
                            }}
                            className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors group"
                            title="Delete Key"
                          >
                            <X
                              size={18}
                              className="pointer-events-none group-active:scale-90 transition-transform"
                            />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'access' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4">
                <h3 className="text-sm font-black text-slate-800 uppercase italic">Access Queue</h3>
              </div>
              <div className="flex gap-2 px-3">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRegFilter(f)}
                    className={cn(
                      'py-1.5 px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all',
                      regFilter === f ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-500'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                {registrations
                  .filter((r) => regFilter === 'all' || r.status === regFilter)
                  .map((reg) => (
                    <Card key={reg.id} className="p-5 border-none mx-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-slate-800 font-black italic">
                            {reg.gameName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-slate-800 uppercase italic">
                              {reg.gameName}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              {tournaments[reg.tournamentId]?.title}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateStatus(reg, 'approved')}
                            className="w-10 h-10 rounded-xl nm-flat text-emerald-500 bg-white"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(reg, 'rejected')}
                            className="w-10 h-10 rounded-xl nm-flat text-rose-400 bg-white"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            </section>
          )}

          {activeSection === 'reports' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">
                    Reported & Pending Match Results
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Review opponent reports, confirm, edit, or reset matches
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-black uppercase tracking-widest">
                  {reportedMatches.length} Matches
                </span>
              </div>

              <div className="space-y-4 px-2">
                {reportedMatches.length === 0 ? (
                  <div className="py-16 text-center space-y-3 nm-inset rounded-[2.5rem] bg-slate-50/50">
                    <CheckCircle size={40} className="mx-auto text-emerald-300" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                      No reported or pending match results right now
                    </p>
                  </div>
                ) : (
                  reportedMatches.map((m) => (
                    <Card
                      key={m.id}
                      className="p-6 border-2 border-white bg-white space-y-4 shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                            {tournaments[m.tournamentId]?.title || 'Tournament Match'}
                          </span>
                          <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
                            {m.stage === 'group'
                              ? `Group Stage · Group ${m.groupId}`
                              : m.stage || 'Match'}{' '}
                            {m.matchId ? `· ID: ${m.matchId}` : ''}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border',
                            m.status === 'disputed'
                              ? 'bg-rose-50 text-rose-600 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          )}
                        >
                          {m.status === 'disputed'
                            ? 'REPORTED BY OPPONENT'
                            : 'PENDING CONFIRMATION'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">
                            HOME
                          </span>
                          <span className="text-xs font-black text-slate-900 uppercase italic truncate block">
                            {m.homePlayerName}
                          </span>
                        </div>
                        <div className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 text-lg font-black italic text-indigo-600">
                          {m.homeScore ?? 0} - {m.awayScore ?? 0}
                        </div>
                        <div className="flex-1 text-right min-w-0">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">
                            AWAY
                          </span>
                          <span className="text-xs font-black text-slate-900 uppercase italic truncate block">
                            {m.awayPlayerName}
                          </span>
                        </div>
                      </div>

                      {m.disputeReason && m.status === 'disputed' && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[9px] font-bold text-rose-800">
                          Report Reason: {m.disputeReason}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handlePortalConfirmMatch(m)}
                          className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <CheckCircle size={13} /> Confirm Result
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPortalMatch(m);
                            setPortalEditScores({
                              home: m.homeScore ?? 0,
                              away: m.awayScore ?? 0
                            });
                          }}
                          className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <Edit3 size={13} /> Edit Result
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortalResetMatch(m)}
                          className="h-10 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <RotateCcw size={13} /> Reset Match
                        </button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </section>
          )}

          {editingPortalMatch &&
            createPortal(
              <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-[0_25px_70px_-15px_rgba(15,23,42,0.28)] relative">
                  <div className="p-6 sm:p-8 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                        <Edit3 size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                          EDIT RESULT
                        </h3>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Modify & finalize reported match scoreline
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingPortalMatch(null)}
                      className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-6 sm:p-8 space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">
                          {editingPortalMatch.homePlayerName}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={portalEditScores.home}
                          onChange={(e) =>
                            setPortalEditScores({
                              ...portalEditScores,
                              home: Math.max(0, parseInt(e.target.value) || 0)
                            })
                          }
                          className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all"
                        />
                      </div>
                      <span className="text-xl font-black text-slate-400 italic pt-6">VS</span>
                      <div className="flex-1 space-y-3">
                        <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">
                          {editingPortalMatch.awayPlayerName}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={portalEditScores.away}
                          onChange={(e) =>
                            setPortalEditScores({
                              ...portalEditScores,
                              away: Math.max(0, parseInt(e.target.value) || 0)
                            })
                          }
                          className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handlePortalSaveEditedMatch}
                      disabled={isSavingPortalMatch}
                      className="w-full h-16 rounded-[2rem] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-[12px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
                    >
                      {isSavingPortalMatch ? 'SAVING...' : 'SAVE & FINALIZE RESULT'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </>
      )}
    </div>
  );
};
