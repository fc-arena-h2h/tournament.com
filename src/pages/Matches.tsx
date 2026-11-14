import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc, deleteField, getDoc, orderBy, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { getUserProfileById } from '@/src/lib/userDbManager';
import { getClubByCode, getClubLogoUrl } from '@/src/lib/fcClubs';
import { subscribeToMatchesAcrossShards, getTournamentDbByTournamentId, findTournamentAcrossShards } from '@/src/lib/shardManager';
import { Trophy, Clock, CheckCircle, AlertCircle, Camera, Swords, Plus, User, ArrowRight, Zap, Trash2, X, MessageSquare, XCircle, UserPlus, Search, User as UserIcon, Upload, Send, Lock, Copy, Facebook, Calendar, MessageCircle, Edit3, RotateCcw, Phone } from 'lucide-react';
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

const CountdownTimer = ({ targetTime, compact = false }: { targetTime: Timestamp; compact?: boolean }) => {
  const [timeLeft, setTimeLeft] = useState<string>('LIVE');
  const [isCountingDown, setIsCountingDown] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      if (!targetTime || typeof targetTime.toMillis !== 'function') {
        setTimeLeft('LIVE');
        setIsCountingDown(false);
        return false;
      }
      const now = Date.now();
      const target = targetTime.toMillis();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('LIVE');
        setIsCountingDown(false);
        return false;
      }

      setIsCountingDown(true);
      const totalHours = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      if (totalHours >= 24) {
        const d = Math.floor(totalHours / 24);
        const remH = totalHours % 24;
        setTimeLeft(`${d}D ${remH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      } else {
        setTimeLeft(`${totalHours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
      return true;
    };

    const hasRemaining = updateTimer();
    if (!hasRemaining) return;

    const timer = setInterval(() => {
      if (!updateTimer()) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  return (
    <span className={cn(
      "font-black uppercase italic block font-mono",
      compact ? "text-[6.5px] sm:text-[7.5px] tracking-wider" : "text-[8px] sm:text-[9.5px] tracking-widest",
      isCountingDown ? "text-amber-500 dark:!text-amber-400" : "text-slate-400 dark:!text-slate-300"
    )}>
      {isCountingDown ? `⏳ ${timeLeft}` : timeLeft}
    </span>
  );
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

  const openPlayerProfile = async (userId?: string | null, fallbackName?: string) => {
    const cleanUid = (userId || '').trim();
    if (!cleanUid && !fallbackName) return;

    if (cleanUid && profiles[cleanUid]) {
      setSelectedPlayerProfile(profiles[cleanUid]);
      return;
    }

    if (cleanUid && !cleanUid.startsWith('demo')) {
      try {
        const fetched = await getUserProfileById(cleanUid);
        if (fetched) {
          setProfiles(prev => ({ ...prev, [cleanUid]: fetched }));
          setSelectedPlayerProfile(fetched);
          return;
        }
      } catch (e) {
        console.error('Error fetching player profile on demand:', e);
      }
    }

    setSelectedPlayerProfile({
      uid: cleanUid || 'unknown',
      inGameName: fallbackName || 'Player',
      inGameUID: 'Not Set',
      role: 'player',
      email: '',
    });
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubMatches = subscribeToMatchesAcrossShards(
      { participantId: auth.currentUser.uid },
      async (rawMatches) => {
        const matchData = rawMatches as Match[];
        setMatches(matchData);
        setLoading(false);

        // Fetch tournament details across shards
        const tIds = Array.from(new Set(matchData.map(m => m.tournamentId))).filter(Boolean);
        const tData = { ...tournaments };
        let tChanged = false;
        await Promise.all(tIds.map(async (tId) => {
          if (!tId || typeof tId !== 'string' || !tId.trim()) return;
          if (!tData[tId]) {
            try {
              const found = await findTournamentAcrossShards(tId.trim());
              if (found && found.exists) {
                tData[tId] = { id: found.id, ...found.data };
                tChanged = true;
              }
            } catch (e) {
              console.error('Error fetching tournament', e);
            }
          }
        }));
        if (tChanged) setTournaments(tData);

        // Fetch player profiles from 2nd User DB (sperk-play)
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
              const fetched = await getUserProfileById(uid);
              if (fetched) {
                pData[uid] = fetched;
                pChanged = true;
              }
            } catch (e) {
              console.error('Error fetching profile', e);
            }
          }));
          if (pChanged) setProfiles(pData);
        }
      }
    );

    return () => unsubMatches();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    if (profile?.uid) {
      setProfiles((prev) => ({
        ...prev,
        [profile.uid]: { ...(prev[profile.uid] || {}), ...profile }
      }));
    }
  }, [profile]);







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
      const { db: targetDb } = getTournamentDbByTournamentId(
        reportingMatch.tournamentId,
        (reportingMatch as any).shardId || tournaments[reportingMatch.tournamentId]?.shardId
      );
      await updateDoc(doc(targetDb, 'matches', reportingMatch.id), {
        homeScore: reportFormData.home,
        awayScore: reportFormData.away,
        status: isDirectFinalize ? 'completed' : 'reported',
        reporterId: auth.currentUser?.uid,
        updatedAt: serverTimestamp()
      });
      if (isDirectFinalize) {
        const updatedMatch: Match = {
          ...reportingMatch,
          homeScore: reportFormData.home,
          awayScore: reportFormData.away,
          status: 'completed'
        };
        await checkAndFinalizeTournamentIfGrandFinal(targetDb, updatedMatch);
      }
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
    if (isKnockout && homeScore === awayScore && !(match as any).penaltyWinnerId) {
      alert('Knockout stage matches cannot end in a draw!');
      return;
    }
    try {
      const { db: targetDb } = getTournamentDbByTournamentId(
        match.tournamentId,
        (match as any).shardId || tournaments[match.tournamentId]?.shardId
      );
      await updateDoc(doc(targetDb, 'matches', match.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      const updatedMatch: Match = { ...match, status: 'completed' };
      await checkAndFinalizeTournamentIfGrandFinal(targetDb, updatedMatch);
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
      const { db: targetDb } = getTournamentDbByTournamentId(
        match.tournamentId,
        (match as any).shardId || tournaments[match.tournamentId]?.shardId
      );
      await updateDoc(doc(targetDb, 'matches', match.id), {
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
        const { db: targetDb } = getTournamentDbByTournamentId(
          match.tournamentId,
          (match as any).shardId || tournaments[match.tournamentId]?.shardId
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
      } else {
        await handleConfirmResult(match);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getPairTieInfo = (pairMatches: Match[]) => {
    if (pairMatches.length === 0) return null;
    const first = pairMatches[0];
    const [p1Id, p2Id] = [first.homePlayerId, first.awayPlayerId].sort();
    let p1Agg = 0;
    let p2Agg = 0;
    let completedLegs = 0;
    let penaltyWinnerId: string | undefined;

    pairMatches.forEach((m) => {
      if (m.status === 'completed') {
        completedLegs += 1;
        const hScore = Number(m.homeScore ?? 0);
        const aScore = Number(m.awayScore ?? 0);
        if (m.homePlayerId === p1Id) {
          p1Agg += hScore;
          p2Agg += aScore;
        } else {
          p2Agg += hScore;
          p1Agg += aScore;
        }
        if ((m as any).penaltyWinnerId) {
          penaltyWinnerId = (m as any).penaltyWinnerId;
        }
      }
    });

    const isTwoLegged = pairMatches.length >= 2;
    const isTieCompleted = pairMatches.length > 0 && completedLegs === pairMatches.length;
    let winnerId: string | undefined;
    if (isTieCompleted) {
      if (p1Agg > p2Agg) winnerId = p1Id;
      else if (p2Agg > p1Agg) winnerId = p2Id;
      else if (penaltyWinnerId) winnerId = penaltyWinnerId;
    }

    const p1Name =
      profiles[p1Id]?.inGameName ||
      (first.homePlayerId === p1Id ? first.homePlayerName : first.awayPlayerName) ||
      'Player 1';
    const p2Name =
      profiles[p2Id]?.inGameName ||
      (first.homePlayerId === p2Id ? first.homePlayerName : first.awayPlayerName) ||
      'Player 2';

    return {
      isTwoLegged,
      totalLegs: pairMatches.length,
      completedLegs,
      isTieCompleted,
      player1Id: p1Id,
      player2Id: p2Id,
      player1AggScore: p1Agg,
      player2AggScore: p2Agg,
      winnerId,
      winnerName: winnerId === p1Id ? p1Name : winnerId === p2Id ? p2Name : undefined,
    };
  };

  const checkAndFinalizeTournamentIfGrandFinal = async (targetDb: any, completedMatch: Match) => {
    const isGrandFinal =
      completedMatch.stage === 'FINAL' &&
      completedMatch.matchId !== 'FINAL_M2' &&
      !completedMatch.matchId?.startsWith('3RD_PLACE');
    if (!isGrandFinal || !completedMatch.tournamentId) return;

    try {
      const updatedAll = matches.map((m) => (m.id === completedMatch.id ? completedMatch : m));
      const finalMatches = updatedAll.filter(
        (m) =>
          m.tournamentId === completedMatch.tournamentId &&
          m.stage === 'FINAL' &&
          m.matchId !== 'FINAL_M2' &&
          !m.matchId?.startsWith('3RD_PLACE')
      );
      if (finalMatches.length === 0) return;

      const tieInfo = getPairTieInfo(finalMatches);
      if (tieInfo && tieInfo.isTieCompleted && tieInfo.winnerId) {
        const winnerName = tieInfo.winnerName || 'Champion';
        await updateDoc(doc(targetDb, 'tournaments', completedMatch.tournamentId), {
          status: 'finished',
          winnerId: tieInfo.winnerId,
          winnerText: winnerName,
          updatedAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.warn('Could not mark tournament finished from Matches:', err);
    }
  };

  const renderMatchCard = (
    match: Match,
    isSideBySide: boolean = false,
    pairLegNumber?: number,
    pairTotalLegs?: number
  ) => {
    const homeProfile = profiles[match.homePlayerId];
    const awayProfile = profiles[match.awayPlayerId];
    const isHome = auth.currentUser?.uid === match.homePlayerId;
    const isAway = auth.currentUser?.uid === match.awayPlayerId;
    const isParticipant = isHome || isAway;
    const hostManageable = canEditMatch(match);
    const tournamentObj = tournaments[match.tournamentId];
    const currentUploadType = tournamentObj?.resultUploadType || 'players';

    const homeWin = (match.homeScore || 0) > (match.awayScore || 0);
    const awayWin = (match.awayScore || 0) > (match.homeScore || 0);
    const isCompleted = match.status === 'completed';

    const getStageLabel = () => {
      if (isSideBySide) {
        if (match.stage === 'group') return `Group ${match.groupId}`;
        if (match.stage === '3RD_PLACE') return '3rd Place';
        return match.stage || 'Match';
      }
      if (match.stage === 'group') return `Group Stage · Group ${match.groupId}`;
      if (match.stage === 'R32') return 'Knockout · Round of 32';
      if (match.stage === 'R16') return 'Knockout · Round of 16';
      if (match.stage === 'QTR') return 'Knockout · Quarter Final';
      if (match.stage === 'SEMI') return 'Knockout · Semi Final';
      if (match.stage === 'FINAL') return 'Knockout · Grand Final';
      if (match.stage === '3RD_PLACE') return 'Knockout · 3rd Place Match';
      return match.stage || 'Match';
    };

    return (
      <div
        key={match.id}
        className={cn(
          "nm-flat p-0 border-2 border-white bg-white text-fc-dark dark:!bg-gradient-to-br dark:!from-[#2b3054]/88 dark:!via-[#1e223d]/88 dark:!to-[#16192e]/94 dark:!border-white/16 dark:hover:!border-[#a855f7]/45 dark:!shadow-[0_22px_50px_-12px_rgba(4,5,14,0.88),inset_0_1px_1px_rgba(255,255,255,0.22)] space-y-0 relative overflow-hidden group transition-all hover:scale-[1.01] shadow-xl flex flex-col justify-between h-full",
          isSideBySide ? "rounded-[1.25rem] sm:rounded-[2.2rem]" : "rounded-[2.5rem]"
        )}
      >
        {/* Background faint logo */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] dark:opacity-[0.06] grayscale pointer-events-none -mr-16 -mt-16">
          <Trophy size={120} />
        </div>

        <div
          className={cn(
            "relative z-10 flex flex-col justify-between h-full",
            isSideBySide ? "p-2 xs:p-2.5 sm:p-5 space-y-2 sm:space-y-4" : "p-4 sm:p-8 space-y-4 sm:space-y-6"
          )}
        >
          {/* Top Header */}
          <div className="flex flex-col gap-1 relative z-10">
            {!isSideBySide && (
              <span className="text-[9px] sm:text-[10px] font-black text-indigo-600 dark:!text-[#ff7a45] uppercase tracking-[0.2em] truncate">
                {tournamentObj?.title || 'Tournament'}
              </span>
            )}

            <div className="flex items-start justify-between gap-1">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  <div
                    className={cn(
                      "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0",
                      isCompleted ? "bg-emerald-500 dark:bg-emerald-400 shadow-md dark:shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-amber-500 dark:bg-amber-400 animate-pulse"
                    )}
                  />
                  <span
                    className={cn(
                      "font-black text-slate-400 dark:!text-indigo-200/85 uppercase tracking-wider truncate",
                      isSideBySide ? "text-[6.5px] xs:text-[7px] sm:text-[9px]" : "text-[8.5px] sm:text-[10px] tracking-widest"
                    )}
                  >
                    {getStageLabel()}
                  </span>
                  {pairTotalLegs && pairTotalLegs >= 2 && (
                    <span
                      className={cn(
                        "rounded-full bg-indigo-50 dark:!bg-indigo-500/22 text-indigo-600 dark:!text-indigo-200 border border-indigo-200 dark:!border-indigo-400/35 font-black uppercase tracking-wider shrink-0",
                        isSideBySide
                          ? "px-1.5 py-0.2 text-[6px] xs:text-[6.5px] sm:text-[7.5px]"
                          : "px-2 py-0.5 text-[7.5px] sm:text-[8.5px] tracking-widest"
                      )}
                    >
                      {isSideBySide ? `LEG ${pairLegNumber}` : `MATCH ${pairLegNumber} (LEG ${pairLegNumber})`}
                    </span>
                  )}
                </div>

                {match.matchId && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={cn(
                        "font-bold text-slate-400 dark:!text-slate-300 truncate",
                        isSideBySide ? "text-[7px] sm:text-[8.5px] max-w-[85px] sm:max-w-none" : "text-[9px]"
                      )}
                    >
                      ID: {match.matchId}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(match.matchId || '');
                        alert('Match ID copied to clipboard!');
                      }}
                      className="p-0.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors text-slate-400 dark:text-slate-300 hover:text-indigo-500 shrink-0"
                    >
                      <Copy size={isSideBySide ? 9 : 10} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap justify-end">
                {hostManageable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReportResultModal(match);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:!bg-indigo-500/22 dark:hover:!bg-indigo-500/35 text-indigo-600 dark:!text-indigo-200 border border-indigo-200 dark:!border-indigo-400/35 font-black uppercase tracking-wider shadow-xs active:scale-95 transition-all",
                      isSideBySide
                        ? "px-1.5 py-1 text-[6.5px] sm:text-[8px]"
                        : "px-3 py-1.5 sm:px-3.5 sm:py-2 text-[8px] sm:text-[9px] tracking-widest"
                    )}
                    title="Edit Match Result"
                  >
                    <Edit3 size={isSideBySide ? 10 : 12} />
                    <span>EDIT</span>
                  </button>
                )}
                {isCompleted && (
                  <span
                    className={cn(
                      "font-black text-white uppercase bg-fc-dark dark:bg-gradient-to-r dark:from-emerald-500/25 dark:to-teal-500/20 dark:!text-emerald-200 dark:border dark:border-emerald-400/35 rounded-lg shadow-md",
                      isSideBySide
                        ? "text-[6.5px] sm:text-[8px] tracking-wider px-1.5 sm:px-2.5 py-1"
                        : "text-[8px] sm:text-[9px] tracking-[0.2em] px-3 sm:px-5 py-1.5 sm:py-2"
                    )}
                  >
                    {isSideBySide ? 'FINAL' : 'RESULT FINAL'}
                  </span>
                )}
                {match.status === 'reported' && (
                  <span
                    className={cn(
                      "font-black text-amber-600 dark:!text-amber-300 uppercase bg-amber-50 dark:!bg-amber-500/20 rounded-lg border border-amber-200 dark:!border-amber-400/35",
                      isSideBySide
                        ? "text-[6.5px] sm:text-[8px] tracking-wider px-1.5 py-1"
                        : "text-[8px] sm:text-[9px] tracking-[0.2em] px-3 sm:px-5 py-1.5 sm:py-2"
                    )}
                  >
                    {isSideBySide ? 'PENDING' : 'PENDING VERIFICATION'}
                  </span>
                )}
                {match.status === 'disputed' && (
                  <span
                    className={cn(
                      "font-black text-red-500 dark:!text-rose-300 uppercase bg-red-50 dark:!bg-rose-500/20 rounded-lg border border-red-200 dark:!border-rose-400/35",
                      isSideBySide
                        ? "text-[6.5px] sm:text-[8px] tracking-wider px-1.5 py-1"
                        : "text-[8px] sm:text-[9px] tracking-[0.2em] px-3 sm:px-5 py-1.5 sm:py-2"
                    )}
                  >
                    DISPUTED
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Players & Scoreline */}
          <div className="space-y-1.5 relative z-10">
            <div
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-0",
                isSideBySide ? "gap-1 sm:gap-2" : "gap-1.5 sm:gap-2"
              )}
            >
              {/* Home Player */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  openPlayerProfile(match.homePlayerId, homeProfile?.inGameName || match.homePlayerName);
                }}
                title="Click to view player profile"
                className={cn(
                  "flex flex-col items-center min-w-0 w-full transition-all cursor-pointer group/player",
                  isSideBySide ? "gap-1 sm:gap-2" : "gap-2.5 sm:gap-4",
                  isCompleted && awayWin ? "opacity-60 scale-95" : ""
                )}
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-0.5",
                    isSideBySide ? "min-h-[14px] sm:min-h-[24px]" : "min-h-[26px] sm:min-h-[32px]"
                  )}
                >
                  <span
                    className={cn(
                      "font-black uppercase",
                      isSideBySide ? "text-[6px] xs:text-[6.5px] sm:text-[8.5px] tracking-wider" : "text-[8.5px] sm:text-[10px] tracking-[0.2em]",
                      homeWin ? "text-amber-500 dark:!text-amber-400 font-black" : "text-slate-400 dark:!text-slate-300"
                    )}
                  >
                    HOME
                  </span>
                  {isCompleted && homeWin && (
                    <div className="flex items-center gap-0.5 px-1 sm:px-2 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-300">
                      <Trophy size={isSideBySide ? 6 : 9} fill="currentColor" />
                      <span
                        className={cn(
                          "uppercase tracking-wider",
                          isSideBySide ? "text-[5px] sm:text-[6.5px]" : "text-[6.5px] sm:text-[7.5px]"
                        )}
                      >
                        Win
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={cn(
                    "flex items-center justify-center overflow-hidden transition-all duration-700 shadow-lg relative group-hover/player:ring-2 group-hover/player:ring-indigo-400 group-active/player:scale-95",
                    getClubLogoUrl(homeProfile?.clubId || (isHome ? profile?.clubId : undefined))
                      ? "bg-white dark:bg-white/95 p-1 sm:p-2"
                      : "bg-slate-900 dark:bg-gradient-to-b dark:from-[#16192e] dark:to-[#0f1121]",
                    isSideBySide
                      ? "w-8 h-8 xs:w-9 xs:h-9 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border"
                      : "w-14 h-14 xs:w-16 xs:h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2.5rem] border-2 sm:border-4",
                    isCompleted && homeWin ? "border-amber-400 ring-2 ring-amber-400/80 shadow-md dark:shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-105" : "border-slate-200/80 dark:border-white/20"
                  )}
                >
                  {getClubLogoUrl(homeProfile?.clubId || (isHome ? profile?.clubId : undefined)) ? (
                    <img
                      src={getClubLogoUrl(homeProfile?.clubId || (isHome ? profile?.clubId : undefined))!}
                      alt={homeProfile?.inGameName || match.homePlayerName || 'Home'}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <UserIcon size={isSideBySide ? 14 : 24} className="text-slate-700 dark:text-slate-200 sm:w-6 sm:h-6" />
                  )}
                </div>
                <div className="text-center w-full min-w-0 px-0.5">
                  <h5
                    className={cn(
                      "font-black uppercase italic tracking-tight transition-colors truncate w-full block group-hover/player:text-indigo-500 dark:group-hover/player:!text-[#ff7a45] group-hover/player:underline",
                      isSideBySide
                        ? "text-[7.5px] xs:text-[8.5px] sm:text-xs leading-tight"
                        : "text-xs sm:text-sm max-w-[95px] sm:max-w-[130px] mx-auto",
                      homeWin && isCompleted ? "text-amber-600 dark:!text-amber-300 font-black" : homeWin ? "text-fc-dark dark:!text-white" : "text-slate-500 dark:!text-slate-100"
                    )}
                  >
                    {homeProfile?.inGameName || match.homePlayerName || 'Loading...'}
                  </h5>
                </div>
              </div>

              {/* Score / VS Box */}
              <div
                className={cn(
                  "flex flex-col items-center justify-center shrink-0",
                  isSideBySide ? "gap-1 px-0" : "gap-2 sm:gap-4 px-1 sm:px-2"
                )}
              >
                {isCompleted || match.status === 'reported' || match.status === 'disputed' ? (
                  <div className={cn("flex items-center", isSideBySide ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-4")}>
                    <span
                      className={cn(
                        "font-black italic tracking-tighter",
                        isSideBySide ? "text-sm xs:text-base sm:text-2xl" : "text-3xl xs:text-4xl sm:text-5xl",
                        homeWin && isCompleted ? "text-amber-500 dark:!text-amber-300 drop-shadow-xs dark:drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]" : homeWin ? "text-fc-dark dark:!text-white" : "text-slate-300 dark:!text-slate-200"
                      )}
                    >
                      {match.homeScore || 0}
                    </span>
                    <div className={cn("bg-slate-200 dark:!bg-white/25 rounded-full", isSideBySide ? "w-1 sm:w-2 h-0.5" : "w-2.5 sm:w-4 h-0.5 sm:h-1")} />
                    <span
                      className={cn(
                        "font-black italic tracking-tighter",
                        isSideBySide ? "text-sm xs:text-base sm:text-2xl" : "text-3xl xs:text-4xl sm:text-5xl",
                        awayWin && isCompleted ? "text-amber-500 dark:!text-amber-300 drop-shadow-xs dark:drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]" : awayWin ? "text-fc-dark dark:!text-white" : "text-slate-300 dark:!text-slate-200"
                      )}
                    >
                      {match.awayScore || 0}
                    </span>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "bg-fc-dark dark:bg-gradient-to-br dark:from-[#ff7a45] dark:to-[#8b5cf6] border border-white dark:border-white/25 flex items-center justify-center shadow-md",
                      isSideBySide ? "w-5 h-5 xs:w-6 xs:h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-xl" : "w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border-2"
                    )}
                  >
                    <span className={cn("font-black text-white italic", isSideBySide ? "text-[7px] xs:text-[8px] sm:text-xs" : "text-sm sm:text-lg")}>
                      VS
                    </span>
                  </div>
                )}

                {!isSideBySide && (
                  <div className="bg-slate-50 dark:!bg-[#131629]/90 rounded-lg sm:rounded-xl border border-slate-100 dark:!border-white/12 px-2.5 sm:px-4 py-1 sm:py-2">
                    {match.status === 'scheduled' && match.scheduledTime ? (
                      <CountdownTimer targetTime={match.scheduledTime} compact={false} />
                    ) : (
                      <span className="font-black text-slate-400 dark:!text-slate-300 uppercase tracking-widest italic block text-[7px] sm:text-[8px]">
                        {match.status === 'scheduled' ? 'LIVE' : match.status === 'reported' ? 'VERIFYING' : 'ARCHIVED'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Away Player */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  openPlayerProfile(match.awayPlayerId, awayProfile?.inGameName || match.awayPlayerName);
                }}
                title="Click to view player profile"
                className={cn(
                  "flex flex-col items-center min-w-0 w-full transition-all cursor-pointer group/player",
                  isSideBySide ? "gap-1 sm:gap-2" : "gap-2.5 sm:gap-4",
                  isCompleted && homeWin ? "opacity-60 scale-95" : ""
                )}
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-0.5",
                    isSideBySide ? "min-h-[14px] sm:min-h-[24px]" : "min-h-[26px] sm:min-h-[32px]"
                  )}
                >
                  <span
                    className={cn(
                      "font-black uppercase",
                      isSideBySide ? "text-[6px] xs:text-[6.5px] sm:text-[8.5px] tracking-wider" : "text-[8.5px] sm:text-[10px] tracking-[0.2em]",
                      awayWin ? "text-amber-500 dark:!text-amber-400 font-black" : "text-slate-400 dark:!text-slate-300"
                    )}
                  >
                    AWAY
                  </span>
                  {isCompleted && awayWin && (
                    <div className="flex items-center gap-0.5 px-1 sm:px-2 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-300">
                      <Trophy size={isSideBySide ? 6 : 9} fill="currentColor" />
                      <span
                        className={cn(
                          "uppercase tracking-wider",
                          isSideBySide ? "text-[5px] sm:text-[6.5px]" : "text-[6.5px] sm:text-[7.5px]"
                        )}
                      >
                        Win
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={cn(
                    "flex items-center justify-center overflow-hidden transition-all duration-700 shadow-lg relative group-hover/player:ring-2 group-hover/player:ring-indigo-400 group-active/player:scale-95",
                    getClubLogoUrl(awayProfile?.clubId || (isAway ? profile?.clubId : undefined))
                      ? "bg-white dark:bg-white/95 p-1 sm:p-2"
                      : "bg-slate-900 dark:bg-gradient-to-b dark:from-[#16192e] dark:to-[#0f1121]",
                    isSideBySide
                      ? "w-8 h-8 xs:w-9 xs:h-9 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border"
                      : "w-14 h-14 xs:w-16 xs:h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2.5rem] border-2 sm:border-4",
                    isCompleted && awayWin ? "border-amber-400 ring-2 ring-amber-400/80 shadow-md dark:shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-105" : "border-slate-200/80 dark:border-white/20"
                  )}
                >
                  {getClubLogoUrl(awayProfile?.clubId || (isAway ? profile?.clubId : undefined)) ? (
                    <img
                      src={getClubLogoUrl(awayProfile?.clubId || (isAway ? profile?.clubId : undefined))!}
                      alt={awayProfile?.inGameName || match.awayPlayerName || 'Away'}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <UserIcon size={isSideBySide ? 14 : 24} className="text-slate-700 dark:text-slate-200 sm:w-6 sm:h-6" />
                  )}
                </div>
                <div className="text-center w-full min-w-0 px-0.5">
                  <h5
                    className={cn(
                      "font-black uppercase italic tracking-tight transition-colors truncate w-full block group-hover/player:text-indigo-500 dark:group-hover/player:!text-[#ff7a45] group-hover/player:underline",
                      isSideBySide
                        ? "text-[7.5px] xs:text-[8.5px] sm:text-xs leading-tight"
                        : "text-xs sm:text-sm max-w-[95px] sm:max-w-[130px] mx-auto",
                      awayWin && isCompleted ? "text-amber-600 dark:!text-amber-300 font-black" : awayWin ? "text-fc-dark dark:!text-white" : "text-slate-500 dark:!text-slate-100"
                    )}
                  >
                    {awayProfile?.inGameName || match.awayPlayerName || 'Loading...'}
                  </h5>
                </div>
              </div>
            </div>

            {/* Dedicated Compact Timer / Status Pill Row for Side-by-Side Cards */}
            {isSideBySide && (
              <div className="flex justify-center pt-0.5">
                <div className="bg-slate-50 dark:!bg-[#131629]/90 rounded-md border border-slate-100 dark:!border-white/12 px-2 py-0.5 max-w-full overflow-hidden">
                  {match.status === 'scheduled' && match.scheduledTime ? (
                    <CountdownTimer targetTime={match.scheduledTime} compact={true} />
                  ) : (
                    <span className="font-black text-slate-400 dark:!text-slate-300 uppercase tracking-widest italic block text-[6px] sm:text-[7px] text-center">
                      {match.status === 'scheduled' ? 'LIVE' : match.status === 'reported' ? 'VERIFYING' : 'ARCHIVED'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons & Two-Step Verification */}
          <div
            className={cn(
              "flex flex-wrap relative z-10 border-t border-slate-50 dark:border-white/10",
              isSideBySide ? "gap-1.5 pt-2.5" : "gap-3 pt-4"
            )}
          >
            {/* Opponent Messenger Quick Contact */}
            {isParticipant && !hostManageable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const opponentProfile = isHome ? awayProfile : homeProfile;
                  if (opponentProfile?.messengerLink) {
                    window.open(opponentProfile.messengerLink, '_blank');
                  } else {
                    alert("This opponent hasn't linked their Messenger profile yet.");
                  }
                }}
                className={cn(
                  "nm-flat bg-white flex items-center justify-center text-sky-500 border border-slate-100 hover:bg-sky-50 transition-colors shadow-sm shrink-0",
                  isSideBySide ? "w-9 h-9 rounded-lg" : "w-12 h-12 rounded-xl"
                )}
                title="Contact Opponent"
              >
                <MessageCircle size={isSideBySide ? 15 : 20} fill="currentColor" className="opacity-80" />
              </button>
            )}

            {/* Scheduled Match */}
            {match.status === 'scheduled' && (
              <>
                {((isHome && currentUploadType === 'players') || hostManageable) && (
                  <button
                    onClick={() => openReportResultModal(match)}
                    className={cn(
                      "flex-1 rounded-xl text-white font-black uppercase flex items-center justify-center shadow-lg active:scale-95 transition-transform",
                      isSideBySide
                        ? "min-w-0 h-9 text-[7.5px] sm:text-[8.5px] tracking-wider gap-1 px-2"
                        : "min-w-[140px] h-12 text-[9px] tracking-widest gap-2",
                      hostManageable && !isHome ? "bg-fc-dark shadow-fc-dark/20" : "bg-fc-green shadow-fc-green/20"
                    )}
                  >
                    <Upload size={isSideBySide ? 11 : 14} />
                    <span className="truncate">
                      {isHome ? 'Upload Result' : isSideBySide ? 'Upload Score' : 'Admin: Upload Result'}
                    </span>
                  </button>
                )}

                {isAway && !hostManageable && currentUploadType === 'players' && (
                  <div
                    className={cn(
                      "flex-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-black uppercase flex items-center justify-center text-center",
                      isSideBySide
                        ? "min-w-0 h-9 text-[7px] sm:text-[8px] tracking-wider gap-1 px-1.5"
                        : "min-w-[160px] h-12 text-[9px] tracking-widest gap-2 px-4"
                    )}
                  >
                    <Clock size={isSideBySide ? 11 : 14} className="text-amber-600 shrink-0 animate-pulse" />
                    <span className="truncate">
                      {isSideBySide ? 'Waiting Opponent' : "Waiting for opponent's update"}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Pending / Reported Match */}
            {match.status === 'reported' && !hostManageable && (
              <>
                {isHome && (
                  <div
                    className={cn(
                      "flex-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-black uppercase flex items-center justify-center text-center",
                      isSideBySide
                        ? "min-w-0 h-9 text-[7px] tracking-wider gap-1 px-1.5"
                        : "min-w-[160px] h-12 text-[9px] tracking-widest gap-2 px-4"
                    )}
                  >
                    <Clock size={isSideBySide ? 11 : 14} className="text-amber-600 shrink-0 animate-pulse" />
                    <span className="truncate">
                      {isSideBySide ? 'Pending Confirm' : 'Pending Opponent Confirmation'}
                    </span>
                  </div>
                )}

                {isAway && (
                  <>
                    <button
                      onClick={() => handleConfirmResult(match)}
                      className={cn(
                        "flex-1 rounded-xl bg-emerald-600 text-white font-black uppercase flex items-center justify-center shadow-xl active:scale-95 transition-transform",
                        isSideBySide
                          ? "min-w-0 h-9 text-[7px] tracking-wider gap-1 px-1.5"
                          : "min-w-[120px] h-12 text-[9px] tracking-widest gap-2"
                      )}
                    >
                      <CheckCircle size={isSideBySide ? 11 : 14} />{' '}
                      <span>{isSideBySide ? 'Confirm' : 'Confirm Result'}</span>
                    </button>
                    <button
                      onClick={() => handleDisputeResult(match)}
                      className={cn(
                        "flex-1 rounded-xl bg-rose-600 text-white font-black uppercase flex items-center justify-center shadow-xl active:scale-95 transition-transform",
                        isSideBySide
                          ? "min-w-0 h-9 text-[7px] tracking-wider gap-1 px-1.5"
                          : "min-w-[110px] h-12 text-[9px] tracking-widest gap-2"
                      )}
                    >
                      <AlertCircle size={isSideBySide ? 11 : 14} />{' '}
                      <span>{isSideBySide ? 'Report' : 'Report Result'}</span>
                    </button>
                  </>
                )}
              </>
            )}

            {/* Disputed Status Banner for Players */}
            {match.status === 'disputed' && isParticipant && !hostManageable && (
              <div
                className={cn(
                  "flex-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-black uppercase flex items-center justify-center text-center",
                  isSideBySide
                    ? "min-w-0 h-9 text-[7px] tracking-wider gap-1 px-1.5"
                    : "min-w-[160px] h-12 text-[9px] tracking-widest gap-2 px-4"
                )}
              >
                <AlertCircle size={isSideBySide ? 11 : 14} className="text-rose-600 shrink-0" />
                <span className="truncate">
                  {isSideBySide ? 'Under Review' : 'Reported to Admin & Publisher for Review'}
                </span>
              </div>
            )}

            {/* Admin & Publisher Resolution Portal */}
            {(match.status === 'reported' || match.status === 'disputed') && hostManageable && (
              <div
                className={cn(
                  "w-full flex flex-col rounded-2xl bg-slate-50 border border-slate-200",
                  isSideBySide ? "gap-1.5 p-2" : "gap-2.5 p-3.5"
                )}
              >
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center truncate">
                  {match.status === 'disputed' ? 'Reported Match' : 'Pending Match'}
                </span>
                <div className={cn("grid gap-1.5", isSideBySide ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-3 gap-2")}>
                  <button
                    type="button"
                    onClick={() => handleAdminResolve(match, 'approve')}
                    className="h-8 sm:h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                  >
                    <CheckCircle size={11} /> Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => openReportResultModal(match)}
                    className="h-8 sm:h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                  >
                    <Edit3 size={11} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdminResolve(match, 'reset')}
                    className="h-8 sm:h-10 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPairedMatchesList = (fixtureList: Match[]) => {
    const activeFixtures = fixtureList.filter(
      (m) => (m.status as string) !== 'draft' && m.homePlayerId && m.awayPlayerId
    );
    const pairMap = new Map<string, Match[]>();

    const sortedFixtures = [...activeFixtures].sort((a, b) => {
      if (a.tournamentId !== b.tournamentId) {
        return (a.tournamentId || '').localeCompare(b.tournamentId || '');
      }
      const parseOrder = (id?: string) => {
        if (!id) return 999;
        const mMatch = id.match(/_M(\d+)/);
        const base = mMatch ? parseInt(mMatch[1], 10) * 10 : 500;
        const leg = id.endsWith('_L2') ? 2 : 1;
        return base + leg;
      };
      return parseOrder(a.matchId) - parseOrder(b.matchId);
    });

    sortedFixtures.forEach((m) => {
      const subStage =
        m.stage === '3RD_PLACE' || m.matchId?.startsWith('3RD_PLACE') || m.matchId === 'FINAL_M2'
          ? '3RD_PLACE'
          : m.stage === 'group'
            ? `group_${m.groupId || ''}`
            : m.stage || 'match';
      const pairKey =
        m.homePlayerId && m.awayPlayerId
          ? `${m.tournamentId}::${subStage}::${[m.homePlayerId, m.awayPlayerId].sort().join('__')}`
          : `single::${m.id}`;
      const existing = pairMap.get(pairKey) || [];
      existing.push(m);
      pairMap.set(pairKey, existing);
    });

    return Array.from(pairMap.entries()).map(([pairKey, pairMatches], pairIdx) => {
      if (pairMatches.length >= 2) {
        const leg1 = pairMatches[0];
        const tournamentTitle = tournaments[leg1.tournamentId]?.title || 'Tournament';
        const p1Name = profiles[leg1.homePlayerId]?.inGameName || leg1.homePlayerName || 'Player 1';
        const p2Name = profiles[leg1.awayPlayerId]?.inGameName || leg1.awayPlayerName || 'Player 2';
        const isKo = leg1.stage !== 'group' || leg1.groupId === 'knockout';
        const koTieInfo = isKo ? getPairTieInfo(pairMatches) : null;

        return (
          <div
            key={pairKey}
            className="p-2.5 xs:p-3 sm:p-4 rounded-[2rem] sm:rounded-[2.6rem] bg-slate-100/90 dark:!bg-[#181b31]/85 border-2 border-indigo-100/80 dark:!border-indigo-400/25 space-y-2.5 sm:space-y-3.5 shadow-sm dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)]"
          >
            {/* Tournament Name + Pair Header Banner */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2">
                <span className="text-[9px] sm:text-[10px] font-black text-indigo-600 dark:!text-[#ff7a45] uppercase tracking-[0.2em] truncate">
                  {tournamentTitle}
                </span>
                <span className="text-[8px] font-black text-slate-400 dark:!text-indigo-200/85 uppercase tracking-widest shrink-0">
                  {leg1.stage === 'group' ? `Group Stage · Group ${leg1.groupId}` : `Knockout · ${leg1.stage}`}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-slate-900 text-white shadow-xs flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500 text-white text-[7px] sm:text-[8px] font-black uppercase tracking-widest shrink-0">
                    PAIR #{pairIdx + 1} · 2 MATCHES
                  </span>
                  <span className="text-[8.5px] sm:text-[10px] font-black uppercase italic text-white truncate">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPlayerProfile(leg1.homePlayerId, p1Name);
                      }}
                      className="hover:text-amber-300 hover:underline transition-colors cursor-pointer"
                    >
                      {p1Name}
                    </button>{' '}
                    <span className="text-indigo-400 not-italic px-0.5">⇄</span>{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPlayerProfile(leg1.awayPlayerId, p2Name);
                      }}
                      className="hover:text-amber-300 hover:underline transition-colors cursor-pointer"
                    >
                      {p2Name}
                    </button>
                  </span>
                </div>

                {koTieInfo?.isTwoLegged ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[8px] sm:text-[9px] font-black font-mono text-amber-400">
                      AGG: {koTieInfo.player1AggScore} - {koTieInfo.player2AggScore}
                    </span>
                    {koTieInfo.isTieCompleted && koTieInfo.winnerName && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPlayerProfile(koTieInfo.winnerId, koTieInfo.winnerName || undefined);
                        }}
                        className="px-2 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-[7px] sm:text-[8px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trophy size={8} fill="currentColor" /> {koTieInfo.winnerName}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-emerald-400 shrink-0">
                    HOME & AWAY
                  </span>
                )}
              </div>
            </div>

            {/* Side-by-Side (পাশাপাশি) Match Cards Grid */}
            <div className="grid grid-cols-2 gap-1.5 xs:gap-2 sm:gap-4 items-stretch">
              {pairMatches.map((m, idx) => renderMatchCard(m, true, idx + 1, pairMatches.length))}
            </div>
          </div>
        );
      }

      return renderMatchCard(pairMatches[0], false);
    });
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-20 h-20 rounded-[2.5rem] nm-flat flex items-center justify-center text-indigo-500 border-2 border-white/50">
          <Calendar size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">My Match</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">
          Manage your tournament matches <br /> and view your results
        </p>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 rounded-2xl border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Loading My Matches...</span>
          </div>
        ) : matches.filter((m) => (m.status as string) !== 'draft' && m.homePlayerId && m.awayPlayerId).length === 0 ? (
          <div className="py-20 text-center space-y-6 opacity-40">
            <div className="w-20 h-20 rounded-3xl nm-flat flex items-center justify-center mx-auto text-slate-300">
              <Swords size={40} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No active matches found</p>
          </div>
        ) : (
          renderPairedMatchesList(matches)
        )}
      </div>

      {reportingMatch && (() => {
        const isHostOrAdmin = canEditMatch(reportingMatch);
        const isOcrBlocked = !isHostOrAdmin
          ? (!reportScreenshotPreview || isScanningOcr || !ocrVerification?.isVerified)
          : (isScanningOcr || Boolean(reportScreenshotPreview && !ocrVerification?.isVerified));
        const isSubmitDisabled = isSubmittingReport || isOcrBlocked;

        return createPortal(
          <div className="fixed inset-0 z-[8000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
            <div className="w-full max-w-md max-h-[92vh] solid-modal-surface bg-white rounded-[2.5rem] border border-slate-200 overflow-y-auto shadow-[0_25px_70px_-15px_rgba(0,0,0,0.65)] relative my-auto">
              <div className="p-6 sm:p-8 flex items-center justify-between border-b border-slate-100 sticky top-0 solid-modal-header bg-white z-20">
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
                    <button
                      type="button"
                      onClick={() => openPlayerProfile(reportingMatch.homePlayerId, reportingMatch.homePlayerName)}
                      className="text-[9px] font-black text-slate-700 hover:text-indigo-600 hover:underline uppercase tracking-[0.15em] text-center block truncate w-full px-2 cursor-pointer transition-colors"
                    >
                      {reportingMatch.homePlayerName}
                    </button>
                    <input type="number" min="0" value={reportFormData.home} onChange={(e) => setReportFormData({...reportFormData, home: Math.max(0, parseInt(e.target.value) || 0)})} className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all" />
                  </div>
                  <span className="text-xl font-black text-slate-400 italic pt-6">VS</span>
                  <div className="flex-1 space-y-3">
                    <button
                      type="button"
                      onClick={() => openPlayerProfile(reportingMatch.awayPlayerId, reportingMatch.awayPlayerName)}
                      className="text-[9px] font-black text-slate-700 hover:text-indigo-600 hover:underline uppercase tracking-[0.15em] text-center block truncate w-full px-2 cursor-pointer transition-colors"
                    >
                      {reportingMatch.awayPlayerName}
                    </button>
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
      {selectedPlayerProfile && createPortal(
        <div
          onClick={() => setSelectedPlayerProfile(null)}
          className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <Card className="w-full p-0 overflow-hidden border-2 border-white shadow-2xl">
              <div className="relative h-32 bg-fc-dark overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-fc-green/40 to-transparent" />
                <button 
                  onClick={() => setSelectedPlayerProfile(null)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="px-8 pb-10 -mt-12 relative z-10">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-24 h-24 rounded-[2rem] bg-white p-2 shadow-xl border-4 border-white flex items-center justify-center overflow-hidden">
                    {getClubLogoUrl(selectedPlayerProfile.clubId) ? (
                      <img
                        src={getClubLogoUrl(selectedPlayerProfile.clubId)!}
                        alt={getClubByCode(selectedPlayerProfile.clubId)?.name || 'Club'}
                        className="w-16 h-16 object-contain"
                      />
                    ) : (
                      <UserIcon size={40} className="text-slate-300" />
                    )}
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight leading-none">
                        {selectedPlayerProfile.inGameName}
                      </h3>
                      {selectedPlayerProfile.ovr && (
                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] font-black uppercase italic tracking-wider">
                          OVR {selectedPlayerProfile.ovr}
                        </span>
                      )}
                    </div>
                    {getClubByCode(selectedPlayerProfile.clubId) && (
                      <span className="text-[9.5px] font-black text-indigo-600 uppercase tracking-widest block">
                        {getClubByCode(selectedPlayerProfile.clubId)?.name}
                      </span>
                    )}
                    {(profile?.role === 'admin' || selectedPlayerProfile.email === auth.currentUser?.email) && (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{selectedPlayerProfile.email}</span>
                    )}
                  </div>

                  <div className="w-full grid grid-cols-1 gap-3">
                    <div className="nm-inset rounded-2xl p-4 bg-slate-50 border border-white">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">In-Game ID</span>
                        <span className="text-xs font-black text-slate-800">
                          {selectedPlayerProfile.inGameUID || 'Not Set'}
                          {selectedPlayerProfile.ovr ? ` • OVR ${selectedPlayerProfile.ovr}` : ''}
                        </span>
                      </div>
                    </div>

                    {selectedPlayerProfile.fbUrl && (
                      <a href={selectedPlayerProfile.fbUrl} target="_blank" rel="noopener noreferrer" className="w-full h-14 rounded-2xl nm-flat bg-white flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-50 transition-colors">
                        <Facebook size={18} className="text-blue-600" />
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Facebook Profile</span>
                      </a>
                    )}
                    
                    {selectedPlayerProfile.messengerLink && (
                      <a href={selectedPlayerProfile.messengerLink} target="_blank" rel="noopener noreferrer" className="w-full h-14 rounded-2xl nm-flat bg-white flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-50 transition-colors">
                        <MessageSquare size={18} className="text-indigo-500" />
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Messenger Chat</span>
                      </a>
                    )}
                    
                    {selectedPlayerProfile.whatsappNumber && (
                      <a href={`https://wa.me/${selectedPlayerProfile.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-full h-14 rounded-2xl nm-flat bg-white flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-50 transition-colors">
                        <Phone size={18} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">WhatsApp Chat</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
