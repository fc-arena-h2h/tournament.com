import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc, deleteField, getDoc, orderBy, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, Clock, CheckCircle, AlertCircle, Camera, Swords, Plus, User, ArrowRight, Zap, Trash2, X, MessageSquare, XCircle, UserPlus, Search, User as UserIcon, Upload, Send, Lock, Copy, Facebook, Calendar, MessageCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { formatMessageTimestamp, cleanupOldMessages } from '@/src/lib/chatUtils';
import { sendAppNotification, notifyMatchParticipants } from '@/src/lib/notifications';

const REACTIONS = ['❤️', '👍', '🔥', '😂', '😮', '😢'];

const BUBBLE_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-rose-500', 'bg-amber-500', 
  'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-orange-500'
];

const getUserIdColor = (userId: string) => {
  if (!userId) return BUBBLE_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BUBBLE_COLORS[Math.abs(hash) % BUBBLE_COLORS.length];
};

const CountdownTimer = ({ targetTime }: { targetTime: Timestamp }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = targetTime.toMillis();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('LIVE');
        clearInterval(timer);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')} : ${m.toString().padStart(2, '0')} : ${s.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  return <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase italic">{timeLeft}</span>;
};

interface Match {
  id: string;
  tournamentId: string;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayerName: string;
  awayPlayerName: string;
  homeScore?: number;
  awayScore?: number;
  status: 'scheduled' | 'reported' | 'completed' | 'disputed';
  screenshotUrl?: string;
  reporterId?: string;
  disputeReason?: string;
  stage?: string;
  groupId?: string;
  matchId?: string;
  scheduledTime?: Timestamp;
}

export const MatchesPage = ({ profile }: { profile: UserProfile | null }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [tournaments, setTournaments] = useState<Record<string, any>>({});
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<UserProfile | null>(null);
  const [reportingMatch, setReportingMatch] = useState<Match | null>(null);
  const [reportFormData, setReportFormData] = useState({ home: 0, away: 0 });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const isAdminUser = profile?.role === 'admin';

  useEffect(() => {
    if (!auth.currentUser) return;

    const matchesQ = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );
    const unsubMatches = onSnapshot(matchesQ, async (snap) => {
      const matchData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchData);
      setLoading(false);



      // Fetch tournament details
      const tIds = Array.from(new Set(matchData.map(m => m.tournamentId))).filter(Boolean);
      const tData = { ...tournaments };
      let tChanged = false;
      await Promise.all(tIds.map(async (tId) => {
        if (!tId || typeof tId !== 'string' || !tId.trim()) return;
        if (!tData[tId]) {
          try {
            const tSnap = await getDoc(doc(db, 'tournaments', tId.trim()));
            if (tSnap.exists()) {
              tData[tId] = { id: tSnap.id, ...tSnap.data() };
              tChanged = true;
            }
          } catch (e) {
            console.error('Error fetching tournament', e);
          }
        }
      }));
      if (tChanged) setTournaments(tData);

      // Fetch player profiles
      const uids = new Set<string>();
      matchData.forEach(m => {
        if (m.homePlayerId) uids.add(m.homePlayerId);
        if (m.awayPlayerId) uids.add(m.awayPlayerId);
      });
      const missing = Array.from(uids).filter(uid => !profiles[uid]);
      if (missing.length > 0) {
        const pData = { ...profiles };
        let pChanged = false;
        await Promise.all(missing.map(async (uid) => {
          try {
            const pSnap = await getDoc(doc(db, 'users', uid));
            if (pSnap.exists()) {
              pData[uid] = pSnap.data() as UserProfile;
              pChanged = true;
            }
          } catch (e) {
            console.error('Error fetching profile', e);
          }
        }));
        if (pChanged) setProfiles(pData);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'matches');
    });

    return () => unsubMatches();
  }, [auth.currentUser?.uid]);







  const submitFinalReport = async () => {
    if (!reportingMatch) return;
    const isKnockout = reportingMatch.stage !== 'group' || reportingMatch.groupId === 'knockout';
    if (isKnockout && reportFormData.home === reportFormData.away) {
      alert('Knockout stage matches cannot end in a draw!');
      return;
    }
    setIsSubmittingReport(true);
    try {
      await updateDoc(doc(db, 'matches', reportingMatch.id), {
        homeScore: reportFormData.home,
        awayScore: reportFormData.away,
        status: 'reported',
        reporterId: auth.currentUser?.uid,

        updatedAt: serverTimestamp()
      });
      alert('Result reported!');
      setReportingMatch(null);
    } catch (err) {
      console.error(err);
      alert('Error uploading result');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleConfirmResult = async (match: Match) => {
    const isKnockout = match.stage !== 'group' || match.groupId === 'knockout';
    const homeScore = match.homeScore || 0;
    const awayScore = match.awayScore || 0;
    if (isKnockout && homeScore === awayScore) {
      alert('Knockout stage matches cannot end in a draw!');
      return;
    }
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      const winnerName = homeScore > awayScore ? match.homePlayerName : (awayScore > homeScore ? match.awayPlayerName : 'Draw');
      notifyMatchParticipants({
        homePlayerId: match.homePlayerId,
        awayPlayerId: match.awayPlayerId,
        title: '🏆 Match Result Confirmed!',
        message: `${match.homePlayerName} (${homeScore}) - (${awayScore}) ${match.awayPlayerName}. Winner: ${winnerName}!`,
        type: 'match_result',
        tournamentId: match.tournamentId,
        matchId: match.id
      }).catch(() => {});
      alert('Result confirmed!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisputeResult = async (match: Match) => {
    const reason = prompt('Why are you disputing this result?');
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'disputed',
        disputeReason: reason || 'Incorrect score reported',
        updatedAt: serverTimestamp()
      });
      alert('Match disputed.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminResolve = async (match: Match, action: 'approve' | 'reset') => {
    try {
      if (action === 'reset') {
        await updateDoc(doc(db, 'matches', match.id), {
          status: 'scheduled',
          homeScore: deleteField(),
          awayScore: deleteField(),

          reporterId: deleteField(),
          updatedAt: serverTimestamp()
        });
        alert('Match reset.');
      } else {
        await handleConfirmResult(match);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-20 h-20 rounded-[2.5rem] nm-flat flex items-center justify-center text-indigo-500 border-2 border-white/50">
          <Calendar size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">Field Hub</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">
          Manage your tournament matches <br /> and view your results
        </p>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 rounded-2xl border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Scanning Field...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="py-20 text-center space-y-6 opacity-40">
            <div className="w-20 h-20 rounded-3xl nm-flat flex items-center justify-center mx-auto text-slate-300">
              <Swords size={40} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No active matches found</p>
          </div>
        ) : (
          matches.map(match => (
            <div key={match.id} className="nm-flat rounded-[2.5rem] p-8 border-2 border-white bg-white text-fc-dark space-y-8 relative overflow-hidden group transition-all hover:scale-[1.01] shadow-xl">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">
                  {tournaments[match.tournamentId]?.title || 'Tournament'}
                </span>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", match.status === 'completed' ? "bg-fc-green" : "bg-amber-500 animate-pulse")} />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {match.stage === 'group' ? `Group Stage · Group ${match.groupId}` : match.stage || 'Match'}
                      </span>
                    </div>
                    {match.matchId && (
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-slate-400">ID: {match.matchId}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(match.matchId || '');
                            alert('Match ID copied to clipboard!');
                          }}
                          className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-indigo-500"
                        >
                          <Copy size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                  {match.status === 'completed' && <span className="text-[9px] font-black text-white uppercase tracking-[0.2em] bg-fc-dark px-5 py-2 rounded-lg shadow-xl">RESULT FINAL</span>}
                </div>
              </div>



              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-4 flex-1">
                  <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 border-4 border-white flex items-center justify-center overflow-hidden shadow-md">
                    <UserIcon size={32} className="text-slate-200" />
                  </div>
                  <div className="text-center">
                    <h5 className="text-xs font-black uppercase italic truncate max-w-[80px]">{match.homePlayerName}</h5>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4 px-2">
                  {match.status !== 'scheduled' ? (
                    <div className="flex items-center gap-4">
                      <span className="text-3xl font-black italic">{match.homeScore || 0}</span>
                      <div className="w-2 h-1 bg-slate-200 rounded-full" />
                      <span className="text-3xl font-black italic">{match.awayScore || 0}</span>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-fc-dark flex items-center justify-center">
                      <span className="text-xs font-black text-white italic">VS</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-4 flex-1">
                  <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 border-4 border-white flex items-center justify-center overflow-hidden shadow-md">
                    <UserIcon size={32} className="text-slate-200" />
                  </div>
                  <div className="text-center">
                    <h5 className="text-xs font-black uppercase italic truncate max-w-[80px]">{match.awayPlayerName}</h5>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-50">
                {/* Opponent Messenger Quick Contact */}
                {!isAdminUser && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const isHome = auth.currentUser?.uid === match.homePlayerId;
                      const opponentUid = isHome ? match.awayPlayerId : match.homePlayerId;
                      const opponentProfile = profiles[opponentUid];
                      if (opponentProfile?.messengerLink) {
                        window.open(opponentProfile.messengerLink, '_blank');
                      } else {
                        alert('This opponent hasn\'t linked their Messenger profile yet.');
                      }
                    }}
                    className="w-12 h-12 rounded-xl nm-flat bg-white flex items-center justify-center text-sky-500 border border-slate-100 hover:bg-sky-50 transition-colors shadow-sm shrink-0"
                    title="Contact Opponent"
                  >
                    <MessageCircle size={20} fill="currentColor" className="opacity-80" />
                  </button>
                )}

                {auth.currentUser?.uid === match.homePlayerId && match.status === 'scheduled' && (
                  <button onClick={() => { setReportingMatch(match); setReportFormData({ home: 0, away: 0 }); }} className="flex-1 h-12 rounded-xl bg-fc-green text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <Upload size={14} /> Report Result
                  </button>
                )}
                {match.status === 'reported' && auth.currentUser?.uid === match.awayPlayerId && (
                  <button onClick={() => handleConfirmResult(match)} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl">
                    <CheckCircle size={14} /> Confirm Result
                  </button>
                )}
                {(match.status === 'reported' || match.status === 'disputed') && isAdminUser && (
                  <div className="w-full flex gap-2">
                    <button onClick={() => handleAdminResolve(match, 'approve')} className="flex-1 h-10 rounded-xl bg-fc-dark text-white text-[8px] font-black uppercase tracking-widest">Approve</button>
                    <button onClick={() => handleAdminResolve(match, 'reset')} className="flex-1 h-10 rounded-xl bg-white text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-widest">Reset</button>
                  </div>
                )}

              </div>
            </div>
          ))
        )}
      </div>

      {reportingMatch && createPortal(
        <div className="fixed inset-0 z-[8000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="w-full max-w-md bg-[#1a1f2e] rounded-[2.5rem] border-2 border-slate-800 p-8 space-y-6">
            <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Report Result</h3>
            <div className="flex items-center justify-between gap-4">
              <input type="number" min="0" value={reportFormData.home} onChange={(e) => setReportFormData({...reportFormData, home: parseInt(e.target.value) || 0})} className="w-full h-20 rounded-3xl bg-slate-900 border-2 border-white/5 text-3xl font-black text-center text-white outline-none" />
              <span className="text-xl font-black text-slate-700">VS</span>
              <input type="number" min="0" value={reportFormData.away} onChange={(e) => setReportFormData({...reportFormData, away: parseInt(e.target.value) || 0})} className="w-full h-20 rounded-3xl bg-slate-900 border-2 border-white/5 text-3xl font-black text-center text-white outline-none" />
            </div>
            <button onClick={submitFinalReport} disabled={isSubmittingReport} className="w-full h-16 rounded-[2rem] bg-amber-500 text-slate-900 font-black uppercase tracking-widest">
              {isSubmittingReport ? 'Reporting...' : 'Submit Result'}
            </button>
            <button onClick={() => setReportingMatch(null)} className="w-full h-12 rounded-[1.5rem] bg-white/5 text-slate-400 uppercase text-[10px] font-black">Cancel</button>
          </div>
        </div>,
        document.body
      )}




    </div>
  );
};
