import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc, deleteField, getDoc, orderBy, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, Clock, CheckCircle, AlertCircle, Camera, Swords, Plus, User, ArrowRight, Zap, Trash2, X, MessageSquare, XCircle, UserPlus, Search, User as UserIcon, Upload, Send, Lock, Copy, Facebook, Calendar, MessageCircle, Edit3, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { formatMessageTimestamp, cleanupOldMessages } from '@/src/lib/chatUtils';
import { sendAppNotification, notifyMatchParticipants } from '@/src/lib/notifications';
import { extractTextFromMatchScreenshot, evaluateMatchOcrVerification, OcrVerificationResult } from '@/src/utils/matchOcrVerifier';

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
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState<string | null>(null);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrExtractedText, setOcrExtractedText] = useState<string>('');
  const [ocrVerification, setOcrVerification] = useState<OcrVerificationResult | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const isAdminUser = profile?.role === 'admin';
  const canEditMatch = (match: Match) =>
    isAdminUser || (Boolean(auth.currentUser?.uid) && (tournaments[match.tournamentId]?.publisherId === auth.currentUser?.uid || (match as any).publisherId === auth.currentUser?.uid));

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







  const clearReportOcrState = () => {
    if (reportScreenshotPreview) {
      URL.revokeObjectURL(reportScreenshotPreview);
    }
    setReportScreenshotPreview(null);
    setIsScanningOcr(false);
    setOcrProgress(0);
    setOcrExtractedText('');
    setOcrVerification(null);
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = '';
    }
  };

  const closeReportResultModal = () => {
    clearReportOcrState();
    setReportingMatch(null);
  };

  const openReportResultModal = (match: Match) => {
    clearReportOcrState();
    setReportingMatch(match);
    setReportFormData({
      home: match.homeScore ?? 0,
      away: match.awayScore ?? 0
    });
  };

  useEffect(() => {
    if (!reportingMatch || !ocrExtractedText || isScanningOcr) return;
    const verification = evaluateMatchOcrVerification(ocrExtractedText, {
      expectedHomeName: reportingMatch.homePlayerName,
      expectedAwayName: reportingMatch.awayPlayerName,
      alternateHomeNames: [profiles[reportingMatch.homePlayerId]?.inGameName || ''].filter(Boolean),
      alternateAwayNames: [profiles[reportingMatch.awayPlayerId]?.inGameName || ''].filter(Boolean),
      enteredHomeScore: reportFormData.home,
      enteredAwayScore: reportFormData.away
    });
    setOcrVerification(verification);
  }, [
    ocrExtractedText,
    reportFormData.home,
    reportFormData.away,
    reportingMatch,
    isScanningOcr,
    profiles
  ]);

  const handleReportScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reportingMatch) return;

    if (reportScreenshotPreview) {
      URL.revokeObjectURL(reportScreenshotPreview);
    }

    const localPreviewUrl = URL.createObjectURL(file);
    setReportScreenshotPreview(localPreviewUrl);
    setIsScanningOcr(true);
    setOcrProgress(0);
    setOcrExtractedText('');
    setOcrVerification(null);

    try {
      const extracted = await extractTextFromMatchScreenshot(file, (progress) => {
        setOcrProgress(progress);
      });
      setOcrExtractedText(extracted);
      const result = evaluateMatchOcrVerification(extracted, {
        expectedHomeName: reportingMatch.homePlayerName,
        expectedAwayName: reportingMatch.awayPlayerName,
        alternateHomeNames: [profiles[reportingMatch.homePlayerId]?.inGameName || ''].filter(Boolean),
        alternateAwayNames: [profiles[reportingMatch.awayPlayerId]?.inGameName || ''].filter(Boolean),
        enteredHomeScore: reportFormData.home,
        enteredAwayScore: reportFormData.away
      });
      setOcrVerification(result);
    } catch (err) {
      console.error('Local OCR scan failed:', err);
      setOcrVerification({
        isVerified: false,
        homeNameMatched: false,
        awayNameMatched: false,
        scoreMatched: false,
        extractedText: '',
        detectedScoreText: null,
        feedbackMessage: 'Failed to scan screenshot locally. Please select a clear image.'
      });
    } finally {
      setIsScanningOcr(false);
    }
  };

  const submitFinalReport = async () => {
    if (!reportingMatch) return;
    if (isScanningOcr) {
      alert('Please wait for the screenshot OCR scan to finish.');
      return;
    }

    const isDirectFinalize = canEditMatch(reportingMatch);

    if (!isDirectFinalize) {
      if (!reportScreenshotPreview || !ocrVerification) {
        alert('Please upload a match result screenshot for local OCR verification before submitting.');
        return;
      }
      if (!ocrVerification.isVerified) {
        alert(ocrVerification.feedbackMessage);
        return;
      }
    } else if (reportScreenshotPreview && ocrVerification && !ocrVerification.isVerified) {
      alert(ocrVerification.feedbackMessage);
      return;
    }

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
        status: isDirectFinalize ? 'completed' : 'reported',
        reporterId: auth.currentUser?.uid,
        updatedAt: serverTimestamp()
      });
      alert(isDirectFinalize ? 'Match result updated and finalized!' : 'Result reported!');
      closeReportResultModal();
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
    const reason = prompt('Why are you reporting this match result? (Optional)');
    if (reason === null) return;
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'disputed',
        disputeReason: reason || 'Opponent reported incorrect match result',
        updatedAt: serverTimestamp()
      });

      const hostUid = tournaments[match.tournamentId]?.publisherId || (match as any).publisherId;
      if (hostUid) {
        sendAppNotification({
          recipientId: hostUid,
          title: '⚠️ Match Result Reported',
          message: `${match.awayPlayerName} reported the result of ${match.homePlayerName} (${match.homeScore ?? 0} - ${match.awayScore ?? 0}) ${match.awayPlayerName}.`,
          type: 'system',
          tournamentId: match.tournamentId,
          matchId: match.id
        }).catch(() => {});
      }

      alert('Match result has been reported to the Admin & Publisher portal for review.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminResolve = async (match: Match, action: 'approve' | 'reset') => {
    try {
      if (action === 'reset') {
        await updateDoc(doc(db, 'matches', match.id), {
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
          penaltyWinnerId: null,
          reporterId: null,
          disputeReason: null,
          updatedAt: serverTimestamp()
        });
        alert('Match has been reset to scheduled status.');
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
                  <div className="flex items-center gap-2">
                    {canEditMatch(match) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReportResultModal(match);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest shadow-xs active:scale-95 transition-all"
                        title="Edit Match Result"
                      >
                        <Edit3 size={12} />
                        <span>EDIT</span>
                      </button>
                    )}
                    {match.status === 'completed' && <span className="text-[9px] font-black text-white uppercase tracking-[0.2em] bg-fc-dark px-5 py-2 rounded-lg shadow-xl">RESULT FINAL</span>}
                    {match.status === 'reported' && <span className="text-[8px] sm:text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] bg-amber-50 px-3 sm:px-4 py-1.5 rounded-lg border border-amber-200">PENDING</span>}
                    {match.status === 'disputed' && <span className="text-[8px] sm:text-[9px] font-black text-rose-600 uppercase tracking-[0.2em] bg-rose-50 px-3 sm:px-4 py-1.5 rounded-lg border border-rose-200">REPORTED</span>}
                  </div>
                </div>
              </div>



              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-4 flex-1">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400">HOME</span>
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
                  <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400">AWAY</span>
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
                {!canEditMatch(match) && (
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

                {/* Scheduled Match: Home Player gets Upload button; Away Player sees waiting message */}
                {match.status === 'scheduled' && (
                  <>
                    {(auth.currentUser?.uid === match.homePlayerId || canEditMatch(match)) && (
                      <button
                        onClick={() => openReportResultModal(match)}
                        className="flex-1 min-w-[140px] h-12 rounded-xl bg-fc-green text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                      >
                        <Upload size={14} /> {auth.currentUser?.uid === match.homePlayerId ? 'Upload Match Result' : 'Admin: Upload Result'}
                      </button>
                    )}

                    {auth.currentUser?.uid === match.awayPlayerId && !canEditMatch(match) && (
                      <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                        <Clock size={14} className="text-amber-600 shrink-0 animate-pulse" />
                        <span>Waiting for opponent's update</span>
                      </div>
                    )}
                  </>
                )}

                {/* Pending / Reported Match: Home sees Pending status; Away gets Confirm Result & Report Result */}
                {match.status === 'reported' && !canEditMatch(match) && (
                  <>
                    {auth.currentUser?.uid === match.homePlayerId && (
                      <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                        <Clock size={14} className="text-amber-600 shrink-0 animate-pulse" />
                        <span>Pending Opponent Confirmation</span>
                      </div>
                    )}

                    {auth.currentUser?.uid === match.awayPlayerId && (
                      <>
                        <button
                          onClick={() => handleConfirmResult(match)}
                          className="flex-1 min-w-[120px] h-12 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
                        >
                          <CheckCircle size={14} /> Confirm Result
                        </button>
                        <button
                          onClick={() => handleDisputeResult(match)}
                          className="flex-1 min-w-[110px] h-12 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
                        >
                          <AlertCircle size={14} /> Report Result
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* Disputed Status Banner for Players */}
                {match.status === 'disputed' && !canEditMatch(match) && (
                  <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                    <AlertCircle size={14} className="text-rose-600 shrink-0" />
                    <span>Reported to Admin & Publisher for Review</span>
                  </div>
                )}

                {/* Admin & Publisher Resolution Portal (Confirm Result, Edit Result, Reset Match) */}
                {(match.status === 'reported' || match.status === 'disputed') && canEditMatch(match) && (
                  <div className="w-full flex flex-col gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest text-center">
                      {match.status === 'disputed' ? 'Reported Match · Admin & Publisher Action' : 'Pending Match · Admin & Publisher Action'}
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAdminResolve(match, 'approve')}
                        className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                      >
                        <CheckCircle size={12} /> Confirm Result
                      </button>
                      <button
                        type="button"
                        onClick={() => openReportResultModal(match)}
                        className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                      >
                        <Edit3 size={12} /> Edit Result
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdminResolve(match, 'reset')}
                        className="h-10 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                      >
                        <RotateCcw size={12} /> Reset Match
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {reportingMatch && (() => {
        const isHostOrAdmin = canEditMatch(reportingMatch);
        const isOcrBlocked = !isHostOrAdmin
          ? (!reportScreenshotPreview || isScanningOcr || !ocrVerification?.isVerified)
          : (isScanningOcr || Boolean(reportScreenshotPreview && !ocrVerification?.isVerified));
        const isSubmitDisabled = isSubmittingReport || isOcrBlocked;

        return createPortal(
          <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
            <div className="w-full max-w-md max-h-[92vh] bg-white rounded-[2.5rem] border border-slate-200 overflow-y-auto shadow-[0_25px_70px_-15px_rgba(15,23,42,0.28)] relative my-auto">
              <div className="p-6 sm:p-8 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xs z-20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <Upload size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">REPORT RESULT</h3>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Submit final match scoreline</p>
                  </div>
                </div>
                <button
                  onClick={closeReportResultModal}
                  className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">{reportingMatch.homePlayerName}</label>
                    <input type="number" min="0" value={reportFormData.home} onChange={(e) => setReportFormData({...reportFormData, home: Math.max(0, parseInt(e.target.value) || 0)})} className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all" />
                  </div>
                  <span className="text-xl font-black text-slate-400 italic pt-6">VS</span>
                  <div className="flex-1 space-y-3">
                    <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">{reportingMatch.awayPlayerName}</label>
                    <input type="number" min="0" value={reportFormData.away} onChange={(e) => setReportFormData({...reportFormData, away: Math.max(0, parseInt(e.target.value) || 0)})} className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all" />
                  </div>
                </div>

                {/* Match Result Check By AI Section */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera size={14} className="text-indigo-600" />
                      <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
                        Match Result Check By AI
                      </span>
                    </div>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border",
                      !isHostOrAdmin
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {!isHostOrAdmin ? 'Required' : 'Optional for Host'}
                    </span>
                  </div>

                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReportScreenshotChange}
                    className="hidden"
                  />

                  {!reportScreenshotPreview ? (
                    <button
                      type="button"
                      onClick={() => screenshotInputRef.current?.click()}
                      className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-xs group-hover:scale-105 transition-transform">
                        <Upload size={18} />
                      </div>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                        Upload Match Result Screenshot
                      </span>
                      <span className="text-[8.5px] font-bold text-slate-400 text-center leading-relaxed">
                        Match Result Check By AI
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={reportScreenshotPreview}
                            alt="Match Screenshot Preview"
                            className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-800 uppercase tracking-wider truncate">
                              {isScanningOcr
                                ? `Checking By AI... ${ocrProgress}%`
                                : ocrVerification?.isVerified
                                  ? 'AI Verification Passed'
                                  : 'AI Mismatch Detected'}
                            </p>
                            <p className="text-[8.5px] font-bold text-slate-400">
                              Match Result Check By AI
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => screenshotInputRef.current?.click()}
                            disabled={isScanningOcr}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[8px] font-black uppercase tracking-wider transition-colors"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={clearReportOcrState}
                            disabled={isScanningOcr}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-500 border border-slate-200 transition-colors"
                            title="Remove Screenshot"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {isScanningOcr && (
                        <div className="space-y-1.5">
                          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 transition-all duration-200"
                              style={{ width: `${Math.max(8, ocrProgress)}%` }}
                            />
                          </div>
                          <p className="text-[8.5px] font-black text-indigo-600 uppercase tracking-widest text-center animate-pulse">
                            Match Result Check By AI...
                          </p>
                        </div>
                      )}

                      {!isScanningOcr && ocrVerification && (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-3 gap-2">
                            <div className={cn(
                              "p-2 rounded-xl border text-center",
                              ocrVerification.homeNameMatched
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-rose-50 border-rose-200 text-rose-800"
                            )}>
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                {ocrVerification.homeNameMatched ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-rose-600" />}
                                <span className="text-[7.5px] font-black uppercase tracking-wider">Home Name</span>
                              </div>
                              <p className="text-[8px] font-bold truncate">{reportingMatch.homePlayerName}</p>
                            </div>

                            <div className={cn(
                              "p-2 rounded-xl border text-center",
                              ocrVerification.awayNameMatched
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-rose-50 border-rose-200 text-rose-800"
                            )}>
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                {ocrVerification.awayNameMatched ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-rose-600" />}
                                <span className="text-[7.5px] font-black uppercase tracking-wider">Away Name</span>
                              </div>
                              <p className="text-[8px] font-bold truncate">{reportingMatch.awayPlayerName}</p>
                            </div>

                            <div className={cn(
                              "p-2 rounded-xl border text-center",
                              ocrVerification.scoreMatched
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-rose-50 border-rose-200 text-rose-800"
                            )}>
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                {ocrVerification.scoreMatched ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-rose-600" />}
                                <span className="text-[7.5px] font-black uppercase tracking-wider">Scoreline</span>
                              </div>
                              <p className="text-[8px] font-bold truncate">
                                {reportFormData.home} - {reportFormData.away}
                              </p>
                            </div>
                          </div>

                          <div className={cn(
                            "p-2.5 rounded-xl border text-[9px] font-bold leading-relaxed flex items-start gap-2",
                            ocrVerification.isVerified
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-rose-50 border-rose-200 text-rose-900"
                          )}>
                            {ocrVerification.isVerified ? (
                              <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <span>{ocrVerification.feedbackMessage}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={submitFinalReport}
                  disabled={isSubmitDisabled}
                  className={cn(
                    "w-full h-16 rounded-[2rem] text-[12px] font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                    isSubmitDisabled
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                      : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 hover:scale-[1.01]"
                  )}
                >
                  {isSubmittingReport
                    ? 'DEPLOYING...'
                    : isScanningOcr
                      ? 'CHECKING BY AI...'
                      : (!isHostOrAdmin && !reportScreenshotPreview)
                        ? 'UPLOAD SCREENSHOT TO UNLOCK'
                        : isOcrBlocked
                          ? 'AI VERIFICATION REQUIRED'
                          : 'DEPLOY FINAL RESULT'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}




    </div>
  );
};
