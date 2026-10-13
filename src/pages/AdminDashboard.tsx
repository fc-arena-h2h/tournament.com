import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp, addDoc, getDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { logPointTransaction } from '@/src/lib/points';
import { Users, CheckCircle, XCircle, Trophy, Shield, Plus, Megaphone, Camera, AlertCircle, Swords, X, Trash2, LayoutDashboard, Gamepad2, Clock, Wallet } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { MatchesPage } from '@/src/pages/Matches';
import { GameLoader } from '@/src/components/ui/GameLoader';

interface Registration {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  gameName: string;
  ovr: number;
}

interface Tournament {
  id: string;
  title: string;
  publisherId: string;
  filledSlots: number;
  organizerName?: string;
  organizationName?: string;
  publisherName?: string;
}

interface Challenge {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorOvr: number;
  opponentId?: string;
  opponentName?: string;
  opponentOvr?: number;
  status: 'waiting' | 'accepted' | 'reported' | 'completed' | 'disputed' | 'expired';
  pot: number;
  entryFee?: number;
  matchId?: string;
  homeScore?: number;
  awayScore?: number;
  screenshotUrl?: string;
  penalizedCreatorId?: string;
  timestamp: Timestamp;
}

export const AdminDashboard = ({ 
  onCreateNew, 
  onEnterTournament,
  onOpenWallet
}: { 
  onCreateNew: () => void; 
  onEnterTournament: (t: any) => void;
  onOpenWallet?: () => void;
}) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [adminViewMode, setAdminViewMode] = useState<'dashboard' | 'matches'>('dashboard');
  const [activeAdminSection, setActiveAdminSection] = useState<'cups' | 'access' | '1v1'>('cups');

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen to 1v1 challenges
    const cQ = query(collection(db, 'challenges'));
    const unsubChallenges = onSnapshot(cQ, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
    }, (error) => {
      console.error("Admin Challenges Error:", error);
    });

    const fetchProfile = async () => {
      const snap = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      if (snap.exists()) {
        const profile = snap.data() as UserProfile;
        setUserProfile(profile);

        // Fetch tournaments based on role
        const tQ = profile.role === 'admin' 
          ? query(collection(db, 'tournaments'))
          : query(collection(db, 'tournaments'), where('publisherId', '==', auth.currentUser!.uid));

        const unsubTournaments = onSnapshot(tQ, (snapshot) => {
          const tMap: Record<string, Tournament> = {};
          snapshot.forEach(doc => tMap[doc.id] = { id: doc.id, ...doc.data() } as Tournament);
          setTournaments(tMap);

          const tournamentIds = Object.keys(tMap);
          if (tournamentIds.length > 0) {
            const rQ = profile.role === 'admin'
              ? query(collection(db, 'registrations'))
              : query(collection(db, 'registrations'), where('tournamentId', 'in', tournamentIds.slice(0, 30)));
            
            const unsubRegs = onSnapshot(rQ, (regSnap) => {
              setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
              setLoading(false);
            }, (error) => {
              console.error("Admin Regs Error:", error);
              setLoading(false);
            });
            return () => unsubRegs();
          } else {
            setLoading(false);
          }
        }, (error) => {
          console.error("Admin Tournaments Error:", error);
          setLoading(false);
        });
        return unsubTournaments;
      }
    };

    const unsubProfile = fetchProfile();
    return () => {
      unsubChallenges();
      unsubProfile.then(unsub => unsub?.());
    };
  }, []);

  const handleAdminResolveWinner = async (challenge: Challenge, winnerId: string) => {
    if (!winnerId || typeof winnerId !== 'string' || !winnerId.trim()) return;
    try {
      const wRef = doc(db, 'users', winnerId.trim());
      const wSnap = await getDoc(wRef);
      await updateDoc(wRef, {
        eliteScore: (wSnap.data()?.eliteScore || 0) + (challenge.pot || 200)
      });

      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: winnerId,
        updatedAt: Timestamp.now()
      });

      await logPointTransaction(
        winnerId,
        'earned',
        challenge.pot || 200,
        '1v1 Victory Award',
        `Awarded victory for 1v1 battle (Room: ${challenge.matchId})`
      );

      alert('Winner declared & rewards awarded!');
    } catch (error) {
      console.error(error);
      alert('Failed to resolve match.');
    }
  };

  const handleAdminPunishFake = async (challenge: Challenge) => {
    try {
      if (challenge.opponentId) {
        const oRef = doc(db, 'users', challenge.opponentId);
        const oSnap = await getDoc(oRef);
        await updateDoc(oRef, {
          eliteScore: (oSnap.data()?.eliteScore || 0) + (challenge.entryFee || 100)
        });
      }

      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: challenge.opponentId || '',
        penalizedCreatorId: challenge.creatorId,
        penaltyReason: 'Fake Result Submission',
        updatedAt: Timestamp.now()
      });
      if (challenge.opponentId) {
        await logPointTransaction(
          challenge.opponentId,
          'refunded',
          challenge.entryFee || 100,
          'Dispute Refund',
          `Refunded 100 points due to invalid opponent report`
        );
      }
      await logPointTransaction(
        challenge.creatorId,
        'penalized',
        100,
        'Fake Report Penalty',
        `Penalized entry fee for false match result submission`
      );

      alert('Creator penalized 100 points for fake submission. Opponent refunded 100 points.');
    } catch (error) {
      console.error(error);
      alert('Failed to apply penalty.');
    }
  };

  const handleDeleteChallenge = async (challengeId: string) => {
    try {
      await deleteDoc(doc(db, 'challenges', challengeId));
    } catch (error) {
      console.error(error);
    }
  };

  const handleBroadcast = async () => {
    if (!announcement.trim()) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        text: announcement,
        senderId: auth.currentUser?.uid,
        senderName: userProfile?.inGameName || 'System Admin',
        createdAt: Timestamp.now()
      });
      setAnnouncement('');
      alert('Announcement broadcasted!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements');
    }
  };

  const handleUpdateStatus = async (reg: Registration, newStatus: 'approved' | 'rejected') => {
    try {
      const regRef = doc(db, 'registrations', reg.id);
      await updateDoc(regRef, { status: newStatus });

      if (newStatus === 'approved') {
        const tRef = doc(db, 'tournaments', reg.tournamentId);
        const t = tournaments[reg.tournamentId];
        await updateDoc(tRef, { filledSlots: (t.filledSlots || 0) + 1 });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `registrations/${reg.id}`);
    }
  };

  const [schedulingTournamentId, setSchedulingTournamentId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    homePlayerId: '',
    awayPlayerId: '',
    stage: 'group' as 'group' | 'r16' | 'qtr' | 'semi' | 'final',
    scheduledDate: '',
    scheduledTime: ''
  });

  const handleCreateMatch = async () => {
    if (!schedulingTournamentId || !scheduleForm.homePlayerId || !scheduleForm.awayPlayerId) return alert('Fill all fields');
    if (scheduleForm.homePlayerId === scheduleForm.awayPlayerId) return alert('Select different players');

    try {
      const homePlayer = registrations.find(r => r.userId === scheduleForm.homePlayerId && r.tournamentId === schedulingTournamentId);
      const awayPlayer = registrations.find(r => r.userId === scheduleForm.awayPlayerId && r.tournamentId === schedulingTournamentId);
      
      const scheduledTimestamp = scheduleForm.scheduledDate && scheduleForm.scheduledTime 
        ? Timestamp.fromDate(new Date(`${scheduleForm.scheduledDate}T${scheduleForm.scheduledTime}`))
        : Timestamp.now();

      await addDoc(collection(db, 'matches'), {
        tournamentId: schedulingTournamentId,
        homePlayerId: scheduleForm.homePlayerId,
        awayPlayerId: scheduleForm.awayPlayerId,
        homePlayerName: homePlayer?.gameName || 'Unknown',
        awayPlayerName: awayPlayer?.gameName || 'Unknown',
        participants: [scheduleForm.homePlayerId, scheduleForm.awayPlayerId],
        status: 'scheduled',
        stage: scheduleForm.stage,
        scheduledTime: scheduledTimestamp,
        createdAt: Timestamp.now()
      });
      
      alert('Match scheduled!');
      setSchedulingTournamentId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'matches');
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="LOADING DASHBOARD..." />;

  return (
    <div className="space-y-12 pb-32 pt-4 px-2">
      {/* Admin Mode Switcher */}
      {userProfile?.role === 'admin' && (
        <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-16 mx-2">
          <button 
            onClick={() => setAdminViewMode('dashboard')}
            className={cn(
              "flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2",
              adminViewMode === 'dashboard' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400"
            )}
          >
            <LayoutDashboard size={14} /> Admin Center
          </button>
          <button 
            onClick={() => setAdminViewMode('matches')}
            className={cn(
              "flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2",
              adminViewMode === 'matches' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400"
            )}
          >
            <Gamepad2 size={14} /> My Battles
          </button>
        </div>
      )}

      {adminViewMode === 'matches' ? (
        <MatchesPage profile={userProfile} />
      ) : (
        <>
          <div className="flex items-center justify-between px-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">
                {userProfile?.role === 'admin' ? 'Command Center' : 'Publisher Portal'}
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                System Operations & Control
              </p>
            </div>
            <button 
              onClick={onCreateNew}
              className="w-14 h-14 rounded-2xl nm-flat text-indigo-500 flex items-center justify-center border border-white/50 active:nm-pressed transition-all"
            >
              <Plus size={24} />
            </button>
          </div>

          {/* Wallet & Payment Requests Fast-Action Card (Admin Only) */}
          {userProfile?.role === 'admin' && (
            <div className="px-2">
              <div 
                onClick={() => onOpenWallet?.()}
                className="nm-flat rounded-[2rem] p-5 border-2 border-emerald-100/70 bg-gradient-to-r from-emerald-50/60 via-white to-teal-50/40 flex items-center justify-between cursor-pointer active:scale-95 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                    <Wallet size={22} />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900 uppercase italic">Financials & Wallet Requests</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase">
                        Admin Only
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Manage player cash-in deposits & withdrawal approvals
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider group-hover:bg-emerald-600 transition-colors">
                    Review Requests
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 1: ACTIVE CUPS */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 px-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Trophy size={14} />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase italic">Tournament Management</h3>
            </div>
            
            <div className="space-y-4">
              {userProfile?.role === 'admin' && (
                <Card className="p-6 border-none space-y-4 mx-2 bg-indigo-50/30">
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Broadcast Alert</span>
                  <textarea 
                    className="w-full h-24 p-4 nm-inset rounded-2xl text-slate-700 placeholder:text-slate-400 outline-none border border-white/20 text-xs font-medium"
                    placeholder="Send announcement to all users..."
                    value={announcement}
                    onChange={(e) => setAnnouncement(e.target.value)}
                  />
                  <Button onClick={handleBroadcast} className="w-full h-12 rounded-xl flex items-center gap-2">
                    <Megaphone size={16} /> Broadcast System Update
                  </Button>
                </Card>
              )}

              {Object.values(tournaments).length === 0 ? (
                <div className="nm-inset p-8 rounded-[2rem] text-center border border-white/20 mx-2">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">No active cups</p>
                </div>
              ) : (
                Object.values(tournaments).map(t => (
                  <Card key={`cup-${t.id}`} className="p-6 border-none mx-2 group hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{t.title}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                              <Shield size={10} />
                              {t.organizerName || t.organizationName || t.publisherName || 'Host'}
                            </span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">· ID:</span>
                            <span className="text-[9px] font-black text-slate-500 font-mono tracking-wider">{t.id.slice(0, 8)}</span>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-xl px-4 py-2 border-fc-green text-fc-green hover:bg-fc-green hover:text-white"
                        onClick={() => onEnterTournament(t)}
                      >
                        MANAGE
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          {/* Section 2: ACCESS QUEUE */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 px-4">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <Users size={14} />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase italic">Registration Access Queue</h3>
            </div>

            <div className="space-y-4">
              {registrations.filter(r => r.status === 'pending').length === 0 ? (
                <div className="nm-inset p-10 rounded-[2.5rem] text-center border border-white/20 mx-2 flex flex-col items-center gap-4 opacity-40 bg-slate-50">
                  <CheckCircle size={32} className="text-emerald-500" />
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">All requests processed</p>
                </div>
              ) : (
                registrations.filter(r => r.status === 'pending').map((reg) => (
                  <Card key={`reg-${reg.id}`} className="p-5 border-none mx-2 group">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[1.2rem] nm-inset flex items-center justify-center text-slate-800 font-black italic border border-white/30 bg-white">
                          {reg.gameName.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-800 uppercase italic">{reg.gameName}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            OVR {reg.ovr} · {tournaments[reg.tournamentId]?.title}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleUpdateStatus(reg, 'approved')}
                          className="w-10 h-10 rounded-xl nm-flat bg-white text-emerald-500 flex items-center justify-center active:nm-pressed border border-white/40"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(reg, 'rejected')}
                          className="w-10 h-10 rounded-xl nm-flat bg-white text-rose-400 flex items-center justify-center active:nm-pressed border border-white/40"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          {/* Section 3: 1V1 MODERATION */}
          {userProfile?.role === 'admin' && (
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-4">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <Swords size={14} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase italic">1v1 Match Moderation</h3>
              </div>

              <div className="space-y-4">
                {challenges.length === 0 ? (
                  <div className="nm-inset p-8 rounded-[2rem] text-center border border-white/20 mx-2 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">No matches in queue</p>
                  </div>
                ) : (
                  challenges.map((c) => (
                    <Card key={`challenge-${c.id}`} className="p-6 border-none mx-2 space-y-4 bg-white shadow-lg">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">MATCH ROOM</span>
                          <span className="text-xs font-black text-indigo-600 font-mono italic">{c.matchId || '---'}</span>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest",
                          c.status === 'disputed' ? "bg-rose-100 text-rose-700 border border-rose-200" :
                          c.status === 'reported' ? "bg-amber-100 text-amber-800 border border-amber-200" :
                          c.status === 'completed' ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        )}>
                          {c.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="space-y-1">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Home Side</span>
                          <span className="text-xs font-black text-slate-900 uppercase truncate block">{c.creatorName}</span>
                          <div className="px-2 py-0.5 bg-indigo-50 rounded text-[7px] font-black text-indigo-600 w-fit">OVR {c.creatorOvr}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Away Side</span>
                          <span className="text-xs font-black text-slate-900 uppercase truncate block">{c.opponentName || 'SEARCHING...'}</span>
                          <div className="px-2 py-0.5 bg-rose-50 rounded text-[7px] font-black text-rose-600 w-fit">OVR {c.opponentOvr || '-'}</div>
                        </div>
                      </div>

                      {(c.status === 'reported' || c.status === 'disputed' || c.status === 'completed') && (
                        <div className="space-y-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-200/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Reported Score</span>
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-black text-slate-900 italic">{c.homeScore}</span>
                              <div className="w-2 h-0.5 bg-slate-300 rounded-full" />
                              <span className="text-lg font-black text-slate-900 italic">{c.awayScore}</span>
                            </div>
                          </div>

                          {c.screenshotUrl ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Screenshot Evidence</span>
                                <div className="flex items-center gap-1 text-[7px] font-bold text-amber-600 uppercase tracking-widest">
                                  <Clock size={8} /> Auto-purge enabled
                                </div>
                              </div>
                              <div 
                                onClick={() => setPreviewImageModal(c.screenshotUrl!)}
                                className="relative w-full h-36 rounded-xl overflow-hidden border border-amber-200 bg-slate-900 cursor-pointer group shadow-inner"
                              >
                                <img src={c.screenshotUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-black uppercase tracking-widest gap-2">
                                  <Camera size={14} /> Full View
                                </div>
                              </div>
                            </div>
                          ) : c.status === 'completed' && (
                            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-2 border border-emerald-100">
                              <CheckCircle size={12} /> Verification Evidence Purged (Storage Optimizer)
                            </div>
                          )}
                        </div>
                      )}

                      {c.status !== 'completed' && c.status !== 'expired' && c.status !== 'waiting' && (
                        <div className="space-y-3 pt-2">
                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={() => handleAdminResolveWinner(c, c.creatorId)}
                              className="py-4 px-2 rounded-xl bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                            >
                              Confirm {c.creatorName} Win
                            </button>
                            <button 
                              onClick={() => handleAdminResolveWinner(c, c.opponentId!)}
                              className="py-4 px-2 rounded-xl bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                            >
                              Confirm {c.opponentName} Win
                            </button>
                          </div>
                          <button 
                            onClick={() => handleAdminPunishFake(c)}
                            className="w-full py-4 rounded-xl bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"
                          >
                            <AlertCircle size={14} /> Issue Fake Result Penalty
                          </button>
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Screenshot Lightbox */}
      {previewImageModal && (
        <div className="fixed inset-0 z-[5000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="relative max-w-lg w-full max-h-[85vh] flex flex-col items-center">
            <button 
              onClick={() => setPreviewImageModal(null)}
              className="absolute -top-14 right-0 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all border border-white/20"
            >
              <X size={24} />
            </button>
            <div className="w-full h-full overflow-hidden rounded-[2.5rem] border-4 border-white/20 bg-black flex items-center justify-center shadow-2xl">
              <img src={previewImageModal} className="max-w-full max-h-[75vh] object-contain" />
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-[10px] font-black text-white uppercase tracking-[0.4em] italic">Verification Evidence</p>
              <div className="w-12 h-1 bg-indigo-500 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
