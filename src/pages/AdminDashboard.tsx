import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp, addDoc, getDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Users, CheckCircle, XCircle, Trophy, Shield, Plus, Megaphone, Camera, AlertCircle, Swords, X, Trash2, LayoutDashboard, Gamepad2, Clock } from 'lucide-react';
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
  matchId?: string;
  homeScore?: number;
  awayScore?: number;
  screenshotUrl?: string;
  penalizedCreatorId?: string;
  timestamp: Timestamp;
}

export const AdminDashboard = ({ onCreateNew, onEnterTournament }: { onCreateNew: () => void; onEnterTournament: (t: any) => void }) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [adminViewMode, setAdminViewMode] = useState<'dashboard' | 'matches'>('dashboard');

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
    try {
      const wRef = doc(db, 'users', winnerId);
      const wSnap = await getDoc(wRef);
      await updateDoc(wRef, {
        eliteScore: (wSnap.data()?.eliteScore || 0) + (challenge.pot || 200)
      });

      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: winnerId,
        updatedAt: Timestamp.now()
      });
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
    <div className="space-y-8 pb-32 pt-4">
      {/* Mode Switcher for Admins */}
      {userProfile?.role === 'admin' && (
        <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-16 mx-2">
          <button 
            onClick={() => setAdminViewMode('dashboard')}
            className={cn(
              "flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2",
              adminViewMode === 'dashboard' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400"
            )}
          >
            <LayoutDashboard size={14} /> Admin Control Center
          </button>
          <button 
            onClick={() => setAdminViewMode('matches')}
            className={cn(
              "flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2",
              adminViewMode === 'matches' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400"
            )}
          >
            <Gamepad2 size={14} /> My 1v1 Battles
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
                {userProfile?.role === 'admin' ? 'Global Operations' : 'Event Management'}
              </p>
            </div>
            <button 
              onClick={onCreateNew}
              className="w-14 h-14 rounded-2xl nm-flat text-indigo-500 flex items-center justify-center border border-white/50 active:nm-pressed transition-all"
            >
              <Plus size={24} />
            </button>
          </div>

      {userProfile?.role === 'admin' && (
        <div className="px-2 space-y-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Broadcast System</h3>
          <Card className="p-6 border-none space-y-4">
            <textarea 
              className="w-full h-24 p-4 nm-inset rounded-2xl text-slate-700 placeholder:text-slate-400 outline-none border border-white/20 text-xs font-medium"
              placeholder="Send an announcement to all users..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
            />
            <Button onClick={handleBroadcast} className="w-full h-12 rounded-xl flex items-center gap-2">
              <Megaphone size={16} /> Broadcast Alert
            </Button>
          </Card>
        </div>
      )}

      <div className="space-y-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">
          {userProfile?.role === 'admin' ? 'Global Active Cups' : 'Your Active Cups'}
        </h3>
        {Object.values(tournaments).length === 0 ? (
          <div className="nm-inset p-8 rounded-[2rem] text-center border border-white/20 mx-2">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">No deployments found</p>
          </div>
        ) : (
          Object.values(tournaments).map(t => (
            <Card key={t.id} className="p-6 border-none mx-2">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{t.title}</span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl px-4 py-2 border-fc-green text-fc-green hover:bg-fc-green hover:text-white"
                      onClick={() => onEnterTournament(t)}
                    >
                      UPDATE
                    </Button>
                  </div>
                </div>
                <div className="nm-inset px-4 py-2 rounded-xl border border-white/20 w-fit">
                   <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ID:</span>
                      <span className="text-[9px] font-black text-indigo-500 font-mono tracking-wider">{t.id.slice(0, 12)}</span>
                   </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Pending Access</h3>
        {registrations.filter(r => r.status === 'pending').length === 0 ? (
          <div className="nm-inset p-10 rounded-[2.5rem] text-center border border-white/20 mx-2 flex flex-col items-center gap-4 opacity-40">
            <Users size={32} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clear queue</p>
          </div>
        ) : (
          registrations.filter(r => r.status === 'pending').map((reg) => (
            <Card key={reg.id} className="p-5 border-none mx-2 group">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-[1.2rem] nm-inset flex items-center justify-center text-slate-800 font-black italic border border-white/30">
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
                    className="w-10 h-10 rounded-xl nm-flat text-emerald-500 flex items-center justify-center active:nm-pressed border border-white/40"
                  >
                    <CheckCircle size={18} />
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(reg, 'rejected')}
                    className="w-10 h-10 rounded-xl nm-flat text-rose-400 flex items-center justify-center active:nm-pressed border border-white/40"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* 1V1 BATTLES CONTROL PANEL - STRICTLY ADMIN ONLY */}
      {userProfile?.role === 'admin' && (
        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4 flex items-center justify-between">
            <span>1v1 Battles Control Panel</span>
            <span className="text-indigo-500">{challenges.filter(c => c.status === 'reported' || c.status === 'disputed').length} Review Pending</span>
          </h3>

          {challenges.length === 0 ? (
            <div className="nm-inset p-8 rounded-[2rem] text-center border border-white/20 mx-2">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">No 1v1 battles active</p>
            </div>
          ) : (
            challenges.map((c) => (
              <Card key={c.id} className="p-6 border-none mx-2 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Swords size={16} className="text-rose-500" />
                    <span className="text-xs font-black text-slate-900 uppercase italic">Room ID: {c.matchId || 'N/A'}</span>
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

                {/* Player Matchup */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl">
                  <div>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Creator</span>
                    <span className="text-xs font-black text-slate-900 uppercase">{c.creatorName}</span>
                    <span className="text-[8px] font-bold text-slate-400 block">OVR {c.creatorOvr}</span>
                  </div>
                  <div>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Opponent</span>
                    <span className="text-xs font-black text-slate-900 uppercase">{c.opponentName || 'Waiting...'}</span>
                    <span className="text-[8px] font-bold text-slate-400 block">OVR {c.opponentOvr || '-'}</span>
                  </div>
                </div>

                {/* Submitted Score & Screenshot */}
                {(c.status === 'reported' || c.status === 'disputed' || c.status === 'completed') && (
                  <div className="space-y-3 bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Submitted Score:</span>
                      <span className="text-sm font-black text-slate-900">{c.homeScore} - {c.awayScore}</span>
                    </div>

                    {c.screenshotUrl ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Screenshot Proof</span>
                          <span className="text-[8px] font-bold text-amber-700 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} className="shrink-0" /> Screenshot proof will be deleted within 24 hours after result confirmation.
                          </span>
                        </div>
                        <div 
                          onClick={() => setPreviewImageModal(c.screenshotUrl!)}
                          className="relative w-full h-32 rounded-xl overflow-hidden border border-amber-300 bg-slate-900 cursor-pointer group"
                        >
                          <img src={c.screenshotUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-black uppercase tracking-widest gap-2">
                            <Camera size={14} /> View Proof Screenshot
                          </div>
                        </div>
                      </div>
                    ) : c.status === 'completed' && (
                      <div className="p-2 rounded-xl bg-emerald-100/50 text-emerald-800 text-[8px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5">
                        <CheckCircle size={12} /> Screenshot Proof Cleared (24h Storage Saver Active)
                      </div>
                    )}
                  </div>
                )}

                {/* Admin Action Buttons */}
                {c.status !== 'completed' && c.status !== 'expired' && c.status !== 'waiting' && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block text-center">Admin Verification & Resolution</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => handleAdminResolveWinner(c, c.creatorId)}
                        className="py-3 px-2 rounded-xl bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all"
                      >
                        Declare {c.creatorName} Won
                      </button>
                      <button 
                        onClick={() => handleAdminResolveWinner(c, c.opponentId!)}
                        className="py-3 px-2 rounded-xl bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all"
                      >
                        Declare {c.opponentName} Won
                      </button>
                    </div>
                    <button 
                      onClick={() => handleAdminPunishFake(c)}
                      className="w-full py-3 rounded-xl bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                    >
                      <AlertCircle size={14} /> PUNISH FAKE RESULT (Creator Forfeit)
                    </button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Admin Screenshot Lightbox */}
      {previewImageModal && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative max-w-lg w-full max-h-[85vh] flex flex-col items-center">
            <button 
              onClick={() => setPreviewImageModal(null)}
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="w-full h-full overflow-hidden rounded-2xl border-2 border-white/20 bg-black flex items-center justify-center">
              <img src={previewImageModal} className="max-w-full max-h-[75vh] object-contain rounded-xl" />
            </div>
            <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mt-4">Match Screenshot Proof</p>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
