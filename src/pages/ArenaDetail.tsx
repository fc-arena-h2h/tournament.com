import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { Trophy, LayoutGrid, List, FileText, GitPullRequest, Copy, UserPlus, Search, User as UserIcon, MessageSquare, Clock, Facebook, MessageCircle, Upload, CheckCircle, XCircle, X, Users, Settings, Zap, Edit3, Trash2, Save, Plus, Send, Lock, Camera, ArrowLeftRight, Shield, RotateCcw, AlertTriangle, AlertCircle, Phone, CircleHelp } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, getDocs, deleteDoc, arrayRemove, runTransaction, Timestamp, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { sendAppNotification, notifyMatchParticipants } from '@/src/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';
import { getDemoParticipants, getDemoMatches, updateDemoMatch, addDemoMatch, updateDemoParticipant, updateDemoTournament, saveDemoParticipants, saveDemoMatches, deleteDemoMatch, DemoMatch, DemoParticipant } from '@/src/lib/localTournaments';
import { extractTextFromMatchScreenshot, evaluateMatchOcrVerification, OcrVerificationResult } from '@/src/utils/matchOcrVerifier';



const DEFAULT_RULES = [
  "Participants must be available during their scheduled match time. Failure to show up within 10 minutes results in a forfeit.",
  "Fair Play & Respect: Toxic behavior, cheating, or glitched gameplay will result in an immediate match loss and potential tournament ban.",
  "Match Verification: Results must be confirmed by both players in the Arena or Match Center for official score verification."
];

interface Tournament {
  id: string;
  title: string;
  description: string;
  publisherId: string;
  filledSlots: number;
  totalSlots: number;
  rules?: string[];
  status?: string;
  autoKnockout?: boolean;
  winnerText?: string;
  winnerId?: string;
  organizerName?: string;
  organizationName?: string;
  publisherName?: string;
  entryType?: 'public' | 'invited';
  activationKey?: string;
  invitationKey?: string;
  messengerGroupLink?: string;
  resultUploadType?: 'players' | 'publisher';
  autoMatchDeploy?: boolean;
}

interface Match {
  id: string;
  tournamentId?: string;
  matchId?: string;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayerName: string;
  awayPlayerName: string;
  homeScore?: number;
  awayScore?: number;
  status: 'scheduled' | 'reported' | 'disputed' | 'completed' | 'draft';
  reporterId?: string;
  screenshotUrl?: string;
  disputeReason?: string;
  groupId: string;
  stage: string;
  scheduledTime?: Timestamp;
  penaltyWinnerId?: string | null;
}

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

type ArenaTab = 'group' | 'knockout' | 'players' | 'rules' | 'support' | 'manage';

interface ArenaDetailProps {
  tournament: Tournament;
  profile: UserProfile | null;
  onBack: () => void;
}

export const ArenaDetail = ({ tournament, profile, onBack }: ArenaDetailProps) => {
  const [currentTournament, setCurrentTournament] = useState<any>(tournament);
  const isKnockoutOnly = ((currentTournament as any)?.format === 'knockout' || (tournament as any)?.format === 'knockout');
  const [activeTab, setActiveTab] = useState<ArenaTab>(isKnockoutOnly ? 'knockout' : 'group');
  const [activeGroup, setActiveGroup] = useState('A');
  
  const totalSlots = currentTournament?.totalSlots || tournament?.totalSlots || 16;
  const advancingCount = isKnockoutOnly ? totalSlots : totalSlots / 2;
  
  const allPossibleStages = ['R32', 'R16', 'QTR', 'SEMI', 'FINAL'];
  const knockoutStages = advancingCount >= 32 ? ['R32', 'R16', 'QTR', 'SEMI', 'FINAL'] :
                         advancingCount >= 16 ? ['R16', 'QTR', 'SEMI', 'FINAL'] :
                         advancingCount >= 8 ? ['QTR', 'SEMI', 'FINAL'] :
                         ['SEMI', 'FINAL'];

  const [activeKnockoutStage, setActiveKnockoutStage] = useState(knockoutStages[0]);
  const [registration, setRegistration] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<UserProfile | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [reportingMatch, setReportingMatch] = useState<Match | null>(null);
  const [reportFormData, setReportFormData] = useState({ home: 0, away: 0, penaltyWinnerId: '' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState<string | null>(null);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrExtractedText, setOcrExtractedText] = useState<string>('');
  const [ocrVerification, setOcrVerification] = useState<OcrVerificationResult | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [editingRules, setEditingRules] = useState(false);
  const [editableRules, setEditableRules] = useState<string[]>([]);
  const [savingRules, setSavingRules] = useState(false);

  // Publisher 4 Deployment Modes State
  const [actionLoading, setActionLoading] = useState(false);
  const [localGroupSetupDone, setLocalGroupSetupDone] = useState(false);
  const [localMatchDeployDone, setLocalMatchDeployDone] = useState(false);
  const [showManualGroupModal, setShowManualGroupModal] = useState(false);
  const [showManualMatchModal, setShowManualMatchModal] = useState(false);
  const [manualMatchForm, setManualMatchForm] = useState({
    homeUserId: '',
    awayUserId: '',
    stage: 'group',
    groupId: 'A',
    scheduledDate: '',
    scheduledTime: ''
  });

  const isPublisher = Boolean(auth.currentUser?.uid) && (currentTournament?.publisherId || tournament.publisherId) === auth.currentUser?.uid;
  const isDemo = currentTournament?.isDemo || (tournament as any).isDemo || tournament.id?.startsWith('demo_');
  const isAdminUser = profile?.role === 'admin' || isPublisher || isDemo;

  const approvedPlayersList = participants.filter(p => p.status === 'approved');
  const distinctAssignedGroups = Array.from(new Set(approvedPlayersList.map(p => p.groupId).filter(Boolean)));
  const isGroupsConfigured = (approvedPlayersList.length > 0 && approvedPlayersList.every(p => !!p.groupId)) || localGroupSetupDone || matches.length > 0;
  const isMatchesDeployed = matches.length > 0 || localMatchDeployDone;

  // Interactive Knockout Bracket Slot Assignment State
  const [slotAssignModal, setSlotAssignModal] = useState<{
    stage: string;
    matchSlotId: string;
    role: 'home' | 'away';
    matchNumber: number;
    existingMatch?: Match;
  } | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [autoMatchToast, setAutoMatchToast] = useState<{ title: string; subtitle: string } | null>(null);

  // Danger Zone / Tournament Reset & Delete States
  const [confirmAction, setConfirmAction] = useState<{
    type: 'reset' | 'delete';
    title: string;
    description: string;
    confirmLabel: string;
  } | null>(null);
  const [isResettingTournament, setIsResettingTournament] = useState(false);
  const [isDeletingTournament, setIsDeletingTournament] = useState(false);

  // Join Key Modal State
  const [showJoinKeyModal, setShowJoinKeyModal] = useState(false);
  const [enteredJoinKey, setEnteredJoinKey] = useState('');
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);

  // Manual Round Progression Modal State
  const [progressionModal, setProgressionModal] = useState<{
    currentStageKey: string;
    currentStageLabel: string;
    nextStageKey: string;
    nextStageLabel: string;
    completedCount: number;
    totalCount: number;
    qualifiedCount: number;
  } | null>(null);
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);

  useEffect(() => {
    if (autoMatchToast) {
      const timer = setTimeout(() => setAutoMatchToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [autoMatchToast]);

  const handleSlotClick = (matchSlotId: string, role: 'home' | 'away', matchNumber: number, existingMatch?: Match, stageOverride?: string) => {
    if (!isAdminUser) {
      const playerId = role === 'home' ? existingMatch?.homePlayerId : existingMatch?.awayPlayerId;
      if (playerId && profiles[playerId]) {
        setSelectedPlayerProfile(profiles[playerId]);
      }
      return;
    }

    setSlotAssignModal({
      stage: stageOverride || activeKnockoutStage,
      matchSlotId,
      role,
      matchNumber,
      existingMatch
    });
    setPlayerSearchQuery('');
  };

  const [matchSearchQuery, setMatchSearchQuery] = useState('');

  const generateMatchId = () => {
    return 'M-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleAssignPlayerToSlot = async (selectedPlayer: any) => {
    if (!slotAssignModal) return;
    const { stage, matchSlotId, role, matchNumber } = slotAssignModal;

    setActionLoading(true);
    try {
      const pProfile = profiles[selectedPlayer.userId];
      const playerName = pProfile?.inGameName || selectedPlayer.gameName || 'Player';
      const playerUid = selectedPlayer.userId;

      // Find existing match by matchSlotId or current match
      const existingMatch = matches.find(m => m.matchId === matchSlotId || (slotAssignModal.existingMatch && m.id === slotAssignModal.existingMatch.id));

      if (existingMatch) {
        const newHomeId = role === 'home' ? playerUid : (existingMatch.homePlayerId || '');
        const newHomeName = role === 'home' ? playerName : (existingMatch.homePlayerName || '');
        const newAwayId = role === 'away' ? playerUid : (existingMatch.awayPlayerId || '');
        const newAwayName = role === 'away' ? playerName : (existingMatch.awayPlayerName || '');

        const hasBothPlayers = Boolean(newHomeId && newAwayId);

        if (isDemo) {
          updateDemoMatch(tournament.id, existingMatch.id, {
            matchId: matchSlotId,
            stage: stage,
            groupId: 'knockout',
            homePlayerId: newHomeId,
            homePlayerName: newHomeName,
            awayPlayerId: newAwayId,
            awayPlayerName: newAwayName,
            status: hasBothPlayers ? 'scheduled' : 'draft',
          });
          setMatches(prev => prev.map(m => (m.id === existingMatch.id) ? {
            ...m,
            matchId: matchSlotId,
            stage: stage,
            homePlayerId: newHomeId,
            homePlayerName: newHomeName,
            awayPlayerId: newAwayId,
            awayPlayerName: newAwayName,
            status: hasBothPlayers ? 'scheduled' : 'draft' as any
          } : m));
        } else {
          await updateDoc(doc(db, 'matches', existingMatch.id), {
            matchId: matchSlotId,
            stage: stage,
            groupId: 'knockout',
            homePlayerId: newHomeId,
            homePlayerName: newHomeName,
            awayPlayerId: newAwayId,
            awayPlayerName: newAwayName,
            participants: [newHomeId, newAwayId].filter(Boolean),
            status: hasBothPlayers ? 'scheduled' : 'draft',
            updatedAt: Timestamp.now()
          });
        }

        if (hasBothPlayers) {
          setAutoMatchToast({
            title: 'AUTOMATIC MATCH CREATED!',
            subtitle: `${newHomeName} (HOME) vs ${newAwayName} (AWAY) is now live in ${stage}!`
          });
          setSlotAssignModal(null);
        } else {
          // One player is assigned, switch modal to prompt for the other player
          const nextRole: 'home' | 'away' = role === 'home' ? 'away' : 'home';
          setSlotAssignModal({
            stage,
            matchSlotId,
            role: nextRole,
            matchNumber,
            existingMatch: {
              ...existingMatch,
              homePlayerId: newHomeId,
              homePlayerName: newHomeName,
              awayPlayerId: newAwayId,
              awayPlayerName: newAwayName,
              status: 'draft'
            }
          });
        }
      } else {
        const isHome = role === 'home';
        const homeId = isHome ? playerUid : '';
        const homeName = isHome ? playerName : '';
        const awayId = !isHome ? playerUid : '';
        const awayName = !isHome ? playerName : '';

        let newMatchId = '';
        if (isDemo) {
          const newMatch = addDemoMatch(tournament.id, {
            tournamentId: tournament.id,
            matchId: matchSlotId,
            stage: stage,
            groupId: 'knockout',
            homePlayerId: homeId,
            homePlayerName: homeName,
            awayPlayerId: awayId,
            awayPlayerName: awayName,
            status: 'draft',
            scheduledTime: { toMillis: () => Date.now() }
          });
          newMatchId = newMatch.id;
          setMatches(prev => [...prev, newMatch as any]);
        } else {
          const newDocRef = await addDoc(collection(db, 'matches'), {
            tournamentId: tournament.id,
            matchId: matchSlotId,
            stage: stage,
            groupId: 'knockout',
            homePlayerId: homeId,
            homePlayerName: homeName,
            awayPlayerId: awayId,
            awayPlayerName: awayName,
            participants: [homeId, awayId].filter(Boolean),
            status: 'draft',
            publisherId: tournament.publisherId,
            scheduledTime: serverTimestamp(),
            createdAt: serverTimestamp()
          });
          newMatchId = newDocRef.id;
        }

        // Prompt to select the other player right away
        const nextRole: 'home' | 'away' = role === 'home' ? 'away' : 'home';
        setSlotAssignModal({
          stage,
          matchSlotId,
          role: nextRole,
          matchNumber,
          existingMatch: {
            id: newMatchId,
            tournamentId: tournament.id,
            matchId: matchSlotId,
            stage,
            groupId: 'knockout',
            homePlayerId: homeId,
            homePlayerName: homeName,
            awayPlayerId: awayId,
            awayPlayerName: awayName,
            status: 'draft',
            participants: [homeId, awayId].filter(Boolean)
          } as Match
        });
      }
    } catch (err) {
      console.error('Error assigning player to slot:', err);
      alert('Failed to assign player.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearSlotPlayer = async () => {
    if (!slotAssignModal) return;
    const { matchSlotId, role, existingMatch } = slotAssignModal;
    const currentMatchDoc = matches.find(m => m.matchId === matchSlotId || (existingMatch && m.id === existingMatch.id));
    if (!currentMatchDoc) {
      setSlotAssignModal(null);
      return;
    }

    setActionLoading(true);
    try {
      const remainingId = role === 'home' ? currentMatchDoc.awayPlayerId : currentMatchDoc.homePlayerId;
      if (!remainingId) {
        if (isDemo) {
          deleteDemoMatch(tournament.id, currentMatchDoc.id);
          setMatches(prev => prev.filter(m => m.id !== currentMatchDoc.id));
        } else {
          await deleteDoc(doc(db, 'matches', currentMatchDoc.id));
        }
      } else {
        if (isDemo) {
          const updates = {
            [role === 'home' ? 'homePlayerId' : 'awayPlayerId']: '',
            [role === 'home' ? 'homePlayerName' : 'awayPlayerName']: '',
            status: 'draft'
          };
          updateDemoMatch(tournament.id, currentMatchDoc.id, updates as any);
          setMatches(prev => prev.map(m => m.id === currentMatchDoc.id ? { ...m, ...updates as any } : m));
        } else {
          await updateDoc(doc(db, 'matches', currentMatchDoc.id), {
            [role === 'home' ? 'homePlayerId' : 'awayPlayerId']: '',
            [role === 'home' ? 'homePlayerName' : 'awayPlayerName']: '',
            participants: [remainingId],
            status: 'draft',
            updatedAt: Timestamp.now()
          });
        }
      }
      setSlotAssignModal(null);
    } catch (err) {
      console.error('Error clearing slot:', err);
      alert('Failed to clear player.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwapHomeAway = async () => {
    if (!slotAssignModal) return;
    const { matchSlotId, existingMatch } = slotAssignModal;
    const currentMatchDoc = matches.find(m => m.matchId === matchSlotId || (existingMatch && m.id === existingMatch.id));
    if (!currentMatchDoc) return;

    setActionLoading(true);
    try {
      if (isDemo) {
        const updates = {
          homePlayerId: currentMatchDoc.awayPlayerId || '',
          homePlayerName: currentMatchDoc.awayPlayerName || '',
          awayPlayerId: currentMatchDoc.homePlayerId || '',
          awayPlayerName: currentMatchDoc.homePlayerName || '',
        };
        updateDemoMatch(tournament.id, currentMatchDoc.id, updates);
        setMatches(prev => prev.map(m => m.id === currentMatchDoc.id ? { ...m, ...updates } : m));
      } else {
        await updateDoc(doc(db, 'matches', currentMatchDoc.id), {
          homePlayerId: currentMatchDoc.awayPlayerId || '',
          homePlayerName: currentMatchDoc.awayPlayerName || '',
          awayPlayerId: currentMatchDoc.homePlayerId || '',
          awayPlayerName: currentMatchDoc.homePlayerName || '',
          updatedAt: Timestamp.now()
        });
      }
      setSlotAssignModal(null);
    } catch (err) {
      console.error('Error swapping players:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMatchFixture = async () => {
    if (!slotAssignModal) return;
    const { matchSlotId, existingMatch } = slotAssignModal;
    const currentMatchDoc = matches.find(m => m.matchId === matchSlotId || (existingMatch && m.id === existingMatch.id));
    if (!currentMatchDoc) {
      setSlotAssignModal(null);
      return;
    }
    if (!confirm('Are you sure you want to remove this match fixture?')) return;

    setActionLoading(true);
    try {
      if (isDemo) {
        deleteDemoMatch(tournament.id, currentMatchDoc.id);
        setMatches(prev => prev.filter(m => m.id !== currentMatchDoc.id));
      } else {
        await deleteDoc(doc(db, 'matches', currentMatchDoc.id));
      }
      setSlotAssignModal(null);
    } catch (err) {
      console.error('Error deleting fixture:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 1. Automatic Group Setup
  const handleAutoGroupSetup = async () => {
    if (matches.length > 0 || localMatchDeployDone) {
      return alert('Matches have already been deployed! You cannot run Auto Group Setup while matches are active.');
    }
    const approved = participants.filter(p => p.status === 'approved');
    if (approved.length === 0) {
      return alert('Please approve players before running auto group setup!');
    }
    
    if (!confirm(`Deploy ${approved.length} players into groups of 4? This will reset any manual group assignments.`)) return;

    setActionLoading(true);
    try {
      // Shuffle approved players for fair group draw
      const shuffled = [...approved].sort(() => Math.random() - 0.5);

      const PLAYERS_PER_GROUP = 4;
      const totalCapacity = currentTournament?.totalSlots || tournament.totalSlots || approved.length;
      const neededGroups = Math.max(1, Math.min(26, Math.ceil(Math.max(approved.length, totalCapacity) / PLAYERS_PER_GROUP)));
      const groupLetters = Array.from({ length: neededGroups }, (_, i) => String.fromCharCode(65 + i));

      const assignedGroupsSet = new Set<string>();

      if (isDemo) {
        const updatedParticipants = shuffled.map((p, idx) => {
          const groupIdx = Math.min(Math.floor(idx / PLAYERS_PER_GROUP), groupLetters.length - 1);
          const assignedGroup = groupLetters[groupIdx];
          assignedGroupsSet.add(assignedGroup);
          return { ...p, groupId: assignedGroup, stage: 'group' };
        });
        saveDemoParticipants(tournament.id, updatedParticipants as any);
        setParticipants(updatedParticipants);
      } else {
        await Promise.all(shuffled.map((p, idx) => {
          const groupIdx = Math.min(Math.floor(idx / PLAYERS_PER_GROUP), groupLetters.length - 1);
          const assignedGroup = groupLetters[groupIdx];
          assignedGroupsSet.add(assignedGroup);
          return updateDoc(doc(db, 'registrations', p.id), {
            groupId: assignedGroup,
            stage: 'group',
            updatedAt: Timestamp.now()
          });
        }));
      }

      setLocalGroupSetupDone(true);
      const usedGroups = Array.from(assignedGroupsSet).sort();
      alert(`Auto Group Setup Complete!\n${approved.length} players distributed into ${usedGroups.length} groups.`);
    } catch (err) {
      console.error('Auto group setup error:', err);
      alert('Failed to run auto group setup.');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Automatic Match Deploy
  const handleAutoMatchDeploy = async () => {
    if (matches.length > 0 || localMatchDeployDone) {
      return alert('Matches already exist! Cannot redeploy automatically.');
    }
    const approved = participants.filter(p => p.status === 'approved');
    if (approved.length < 2) {
      return alert('Need at least 2 approved players!');
    }
    if (!isKnockoutOnly && approved.some(p => !p.groupId)) {
      return alert('Please run Auto Group Setup (Step 1) first!');
    }

    if (!confirm(`Generate and deploy all match fixtures for ${approved.length} players? This cannot be undone.`)) return;

    setActionLoading(true);
    try {
      const newMatches: any[] = [];

      if (isKnockoutOnly) {
        let stage = 'R16';
        if (approved.length <= 2) stage = 'FINAL';
        else if (approved.length <= 4) stage = 'SEMI';
        else if (approved.length <= 8) stage = 'QTR';
        else if (approved.length <= 16) stage = 'R16';
        else stage = 'R32';

        const shuffled = [...approved].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length - 1; i += 2) {
          const p1 = shuffled[i];
          const p2 = shuffled[i + 1];
          const p1Profile = profiles[p1.userId];
          const p2Profile = profiles[p2.userId];
          const matchId = `${stage}_M${(i / 2) + 1}`;

          newMatches.push({
            tournamentId: tournament.id,
            matchId: matchId,
            stage: stage,
            groupId: 'knockout',
            homePlayerId: p1.userId,
            awayPlayerId: p2.userId,
            homePlayerName: p1Profile?.inGameName || p1.gameName || 'Player 1',
            awayPlayerName: p2Profile?.inGameName || p2.gameName || 'Player 2',
            participants: [p1.userId, p2.userId],
            status: 'scheduled',
            scheduledTime: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      } else {
        const distinctGroups = Array.from(new Set(
          approved.map(p => p.groupId).filter(Boolean)
        )) as string[];
        const targetGroups = distinctGroups.length > 0 ? distinctGroups.sort() : groups;

        targetGroups.forEach(gName => {
          const gPlayers = approved.filter(p => p.groupId === gName);
          const n = gPlayers.length;
          if (n < 2) return;

          // Build balanced Home/Away index pairs [homeIdx, awayIdx] so no player has all Home or all Away matches
          const indexPairs: Array<[number, number]> = [];
          if (n === 4) {
            // Canonical 4-player 3-round FIFA schedule:
            // P0: 2H, 1A | P1: 1H, 2A | P2: 1H, 2A | P3: 2H, 1A
            indexPairs.push(
              [0, 1], [2, 3], // Round 1
              [1, 2], [3, 0], // Round 2
              [0, 2], [3, 1]  // Round 3
            );
          } else if (n === 3) {
            // Canonical 3-player cycle: each player gets 1 Home and 1 Away match
            indexPairs.push([0, 1], [1, 2], [2, 0]);
          } else {
            // General N-player balanced round-robin tracker
            const homeCounts = new Array(n).fill(0);
            const awayCounts = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                const iNetHome = homeCounts[i] - awayCounts[i];
                const jNetHome = homeCounts[j] - awayCounts[j];
                let homeIdx = i;
                let awayIdx = j;
                if (iNetHome > jNetHome) {
                  homeIdx = j;
                  awayIdx = i;
                } else if (iNetHome === jNetHome && ((i + j) % 2 === 1)) {
                  homeIdx = j;
                  awayIdx = i;
                }
                homeCounts[homeIdx]++;
                awayCounts[awayIdx]++;
                indexPairs.push([homeIdx, awayIdx]);
              }
            }
          }

          indexPairs.forEach(([homeIdx, awayIdx]) => {
            const p1 = gPlayers[homeIdx];
            const p2 = gPlayers[awayIdx];
            const p1Profile = profiles[p1.userId];
            const p2Profile = profiles[p2.userId];

            newMatches.push({
              tournamentId: tournament.id,
              matchId: generateMatchId(),
              homePlayerId: p1.userId,
              awayPlayerId: p2.userId,
              homePlayerName: p1Profile?.inGameName || p1.gameName || 'Player 1',
              awayPlayerName: p2Profile?.inGameName || p2.gameName || 'Player 2',
              participants: [p1.userId, p2.userId],
              status: 'scheduled',
              stage: 'group',
              groupId: gName,
              publisherId: tournament.publisherId,
              scheduledTime: serverTimestamp(),
              createdAt: serverTimestamp()
            });
          });
        });
      }

      if (newMatches.length > 0) {
        if (isDemo) {
          const demoMatches: DemoMatch[] = newMatches.map(m => ({
            ...m,
            id: `demo_m_${Math.random().toString(36).substr(2, 9)}`,
            scheduledTime: { toMillis: () => Date.now() }
          }));
          saveDemoMatches(tournament.id, demoMatches);
          setMatches(demoMatches as any);
        } else {
          await Promise.all(newMatches.map(m => addDoc(collection(db, 'matches'), m)));
          
          // Notify
          newMatches.forEach(m => {
            notifyMatchParticipants({
              homePlayerId: m.homePlayerId,
              awayPlayerId: m.awayPlayerId,
              title: '⚽ New Match Scheduled!',
              message: `${m.homePlayerName} vs ${m.awayPlayerName} is live!`,
              type: 'match_scheduled',
              tournamentId: tournament.id
            }).catch(() => {});
          });
        }
        
        setLocalMatchDeployDone(true);
        alert(`Match Deploy Complete! ${newMatches.length} fixtures created.`);
      } else {
        alert('No matches were generated. Check group assignments.');
      }
    } catch (err) {
      console.error('Auto match deploy error:', err);
      alert('Failed to deploy matches.');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Manual Match Deploy
  const handleCreateManualMatch = async () => {
    if (!manualMatchForm.homeUserId || !manualMatchForm.awayUserId) {
      return alert('Please select both Home and Away players!');
    }
    if (manualMatchForm.homeUserId === manualMatchForm.awayUserId) {
      return alert('Home and Away players must be different!');
    }
    setActionLoading(true);
    try {
      const p1Reg = participants.find(p => p.userId === manualMatchForm.homeUserId);
      const p2Reg = participants.find(p => p.userId === manualMatchForm.awayUserId);
      const p1Profile = profiles[manualMatchForm.homeUserId];
      const p2Profile = profiles[manualMatchForm.awayUserId];

      const scheduledTimestamp = (manualMatchForm.scheduledDate && manualMatchForm.scheduledTime)
        ? Timestamp.fromDate(new Date(`${manualMatchForm.scheduledDate}T${manualMatchForm.scheduledTime}`))
        : Timestamp.now();

      const homeName = p1Profile?.inGameName || p1Reg?.gameName || 'Player 1';
      const awayName = p2Profile?.inGameName || p2Reg?.gameName || 'Player 2';

      if (isDemo) {
        const newMatch = addDemoMatch(tournament.id, {
          tournamentId: tournament.id,
          matchId: generateMatchId(),
          homePlayerId: manualMatchForm.homeUserId,
          awayPlayerId: manualMatchForm.awayUserId,
          homePlayerName: homeName,
          awayPlayerName: awayName,
          status: 'scheduled',
          stage: manualMatchForm.stage,
          groupId: manualMatchForm.groupId,
          scheduledTime: { toMillis: () => scheduledTimestamp.toMillis() }
        });
        setMatches(prev => [...prev, newMatch as any]);
      } else {
        const matchRef = await addDoc(collection(db, 'matches'), {
          tournamentId: tournament.id,
          matchId: generateMatchId(),
          homePlayerId: manualMatchForm.homeUserId,
          awayPlayerId: manualMatchForm.awayUserId,
          homePlayerName: homeName,
          awayPlayerName: awayName,
          participants: [manualMatchForm.homeUserId, manualMatchForm.awayUserId],
          status: 'scheduled',
          stage: manualMatchForm.stage,
          groupId: manualMatchForm.groupId,
          publisherId: tournament.publisherId,
          scheduledTime: scheduledTimestamp,
          createdAt: serverTimestamp()
        });

        // Notify both players
        notifyMatchParticipants({
          homePlayerId: manualMatchForm.homeUserId,
          awayPlayerId: manualMatchForm.awayUserId,
          title: '⚽ New Match Scheduled!',
          message: `New match created: ${homeName} vs ${awayName}. Check the arena and get ready!`,
          type: 'match_scheduled',
          tournamentId: tournament.id,
          matchId: matchRef.id
        }).catch(() => {});
      }

      alert('Manual Match Deploy complete!');
      setShowManualMatchModal(false);
      setManualMatchForm({ homeUserId: '', awayUserId: '', stage: 'group', groupId: 'A', scheduledDate: '', scheduledTime: '' });
    } catch (err) {
      console.error('Manual match create error:', err);
      alert('Manual Match Deploy failed!');
    } finally {
      setActionLoading(false);
    }
  };

  const formatStageDisplayName = (stageKey: string) => {
    if (stageKey === 'group') return 'Group Stage';
    if (stageKey === 'R32') return 'Knockout Stage (Round of 32)';
    if (stageKey === 'R16') return 'Knockout Stage (Round of 16)';
    if (stageKey === 'QTR') return 'Knockout Stage (Quarter Finals)';
    if (stageKey === 'SEMI') return 'Knockout Stage (Semi Finals)';
    if (stageKey === 'FINAL') return 'Knockout Stage (Grand Final)';
    return stageKey;
  };

  const handleOpenProgressionModal = () => {
    if (!isAdminUser) {
      alert('Only tournament hosts and admins can advance players to the next round.');
      return;
    }

    const realMatches = matches.filter(m => m.status !== 'draft' && m.homePlayerId && m.awayPlayerId);
    if (realMatches.length === 0) {
      alert('No active matches found in this tournament yet! Please deploy matches first before advancing players.');
      return;
    }

    const koStagesWithMatches = allPossibleStages.filter(st =>
      realMatches.some(m => m.stage === st)
    );

    if (koStagesWithMatches.length === 0) {
      // Currently in Group Stage
      const activeGroups = Array.from(new Set(participants.map(p => p.groupId).filter(Boolean))).sort() as string[];
      const numG = activeGroups.length;
      if (numG === 0) {
        alert('No active groups found. Please set up groups and matches first.');
        return;
      }

      let firstKoStage = knockoutStages[0] || 'QTR';
      if (numG === 8) firstKoStage = 'R16';
      else if (numG === 4) firstKoStage = 'QTR';
      else if (numG === 2) firstKoStage = 'SEMI';
      else if (numG === 1) firstKoStage = 'FINAL';
      else {
        const totalAdv = numG * 2;
        firstKoStage = totalAdv <= 2 ? 'FINAL' : totalAdv <= 4 ? 'SEMI' : totalAdv <= 8 ? 'QTR' : 'R16';
      }

      const groupMatches = realMatches.filter(m => m.stage === 'group');
      const completedCount = groupMatches.filter(m => m.status === 'completed').length;
      const totalCount = groupMatches.length;

      let qualifiedCount = 0;
      activeGroups.forEach(gId => {
        const table = calculateGroupTable(gId, matches);
        qualifiedCount += Math.min(2, table.length);
      });

      setProgressionModal({
        currentStageKey: 'group',
        currentStageLabel: formatStageDisplayName('group'),
        nextStageKey: firstKoStage,
        nextStageLabel: formatStageDisplayName(firstKoStage),
        completedCount,
        totalCount,
        qualifiedCount
      });
      return;
    }

    // Currently in a Knockout Stage
    const latestKoStage = koStagesWithMatches[koStagesWithMatches.length - 1];
    if (latestKoStage === 'FINAL') {
      alert('The tournament is currently in the Grand Final stage. There are no subsequent rounds after the Final.');
      return;
    }

    const stageIdx = allPossibleStages.indexOf(latestKoStage);
    const nextStageKey = allPossibleStages[stageIdx + 1] || 'FINAL';
    const stageMatches = realMatches.filter(m => m.stage === latestKoStage);
    const completedCount = stageMatches.filter(m => m.status === 'completed').length;
    const totalCount = stageMatches.length;
    const qualifiedCount = stageMatches.filter(m => m.status === 'completed' && Boolean(getWinnerId(m))).length;

    setProgressionModal({
      currentStageKey: latestKoStage,
      currentStageLabel: formatStageDisplayName(latestKoStage),
      nextStageKey,
      nextStageLabel: formatStageDisplayName(nextStageKey),
      completedCount,
      totalCount,
      qualifiedCount
    });
  };

  const handleConfirmProgression = async () => {
    if (!progressionModal) return;
    const { currentStageKey, nextStageKey, qualifiedCount } = progressionModal;

    if (currentStageKey !== 'group' && qualifiedCount < 2) {
      alert(`At least 2 completed match winners are required in ${progressionModal.currentStageLabel} to advance to ${progressionModal.nextStageLabel}.`);
      return;
    }

    setIsAdvancingRound(true);
    setActionLoading(true);
    try {
      if (currentStageKey === 'group') {
        await generateKnockoutMatches(matches);
      } else {
        await advanceStage(currentStageKey, nextStageKey, matches);
      }
      setProgressionModal(null);
    } catch (err) {
      console.error('Error advancing round:', err);
      alert('Failed to advance qualified players to the next round.');
    } finally {
      setIsAdvancingRound(false);
      setActionLoading(false);
    }
  };

  const handleToggleAutoKnockout = () => {
    handleOpenProgressionModal();
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const cleanRules = editableRules.map(r => r.trim()).filter(r => r.length > 0);
      if (isDemo) {
        updateDemoTournament(tournament.id, { rules: cleanRules });
        setCurrentTournament((prev: any) => ({ ...prev, rules: cleanRules }));
      } else {
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          rules: cleanRules,
          updatedAt: Timestamp.now()
        });
      }
      setEditingRules(false);
      alert('Tournament rules updated successfully!');
    } catch (err) {
      console.error('Error saving rules:', err);
      alert('Failed to update rules.');
    } finally {
      setSavingRules(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    if (isDemo) {
      // --- Demo Mode Data Loading (Local Storage) ---
      const demoParticipants = getDemoParticipants(tournament.id);
      setParticipants(demoParticipants);
      
      const demoMatches = getDemoMatches(tournament.id);
      setMatches(demoMatches as any);

      setLoading(false);
      return;
    } else {
      // --- Official Mode Data Loading (Firestore) ---
      // Fetch user's registration for this tournament
      const regDocRef = doc(db, 'registrations', `${auth.currentUser.uid}_${tournament.id}`);
      const unsubReg = onSnapshot(regDocRef, (snap) => {
        if (snap.exists()) {
          setRegistration({ id: snap.id, ...snap.data() });
        } else {
          setRegistration(null);
        }
      });

      const matchesQ = query(
        collection(db, 'matches'),
        where('tournamentId', '==', tournament.id)
      );
      const unsubMatches = onSnapshot(matchesQ, (snap) => {
        setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
      });

      const unsubTournamentDoc = onSnapshot(doc(db, 'tournaments', tournament.id), (snap) => {
        if (snap.exists()) {
          setCurrentTournament({ id: snap.id, ...snap.data() } as Tournament);
        }
      });

      // Participant list: only live if tournament is not finished
      const playersQ = query( collection(db, 'registrations'), where('tournamentId', '==', tournament.id) );

      let unsubPlayers: () => void;
      if (tournament.status === 'finished' || tournament.status === 'completed') {
        getDocs(playersQ).then(pSnap => {
          const regs = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setParticipants(regs);
        });
        unsubPlayers = () => {};
      } else {
        unsubPlayers = onSnapshot(playersQ, (pSnap) => {
          const regs = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setParticipants(regs);
        });
      }

      return () => {
        unsubTournamentDoc();
        unsubReg();
        unsubMatches();
        unsubPlayers();
      };
    }
  }, [tournament.id, auth.currentUser?.uid, tournament.status, isDemo]);

  // Separate effect to fetch profiles for participants, publisher, and matches
  useEffect(() => {
    const fetchMissing = async () => {
      const uids = new Set<string>();
      participants.forEach(p => {
        if (p.userId && typeof p.userId === 'string' && p.userId.trim()) {
          uids.add(p.userId.trim());
        }
      });
      matches.forEach(m => {
        if (m.homePlayerId && typeof m.homePlayerId === 'string' && m.homePlayerId.trim()) {
          uids.add(m.homePlayerId.trim());
        }
        if (m.awayPlayerId && typeof m.awayPlayerId === 'string' && m.awayPlayerId.trim()) {
          uids.add(m.awayPlayerId.trim());
        }
      });
      if (tournament.winnerId && typeof tournament.winnerId === 'string' && tournament.winnerId.trim()) {
        uids.add(tournament.winnerId.trim());
      }
      const pubId = currentTournament?.publisherId || tournament.publisherId;
      if (pubId && typeof pubId === 'string' && pubId.trim() && !pubId.startsWith('demo_')) {
        uids.add(pubId.trim());
      }

      const missing = Array.from(uids).filter(uid => 
        Boolean(uid) && !profiles[uid] && !uid.startsWith('demo_')
      );
      if (missing.length === 0) return;

      const newProfiles = { ...profiles };
      let changed = false;

      await Promise.all(missing.map(async (uid) => {
        if (!uid || typeof uid !== 'string' || !uid.trim()) return;
        try {
          const userSnap = await getDoc(doc(db, 'users', uid.trim()));
          if (userSnap.exists()) {
            newProfiles[uid] = userSnap.data() as UserProfile;
            changed = true;
          }
        } catch (err) {
          console.error(`Error fetching profile for ${uid}:`, err);
        }
      }));

      if (changed) setProfiles(newProfiles);
    };

    fetchMissing();
  }, [participants, matches, tournament.winnerId, tournament.publisherId, currentTournament?.publisherId]);

  const handleJoin = async () => {
    if (!profile) return alert('Please set up your profile first');
    
    // Profile Validation
    const isProfileComplete = profile.inGameName && profile.inGameUID && profile.fbUrl;
    if (!isProfileComplete) {
      alert('Incomplete Profile! Please add your In-Game Name, UID, and Facebook Link in your profile settings.');
      return;
    }

    if (tournament.entryType === 'invited') {
      setShowJoinKeyModal(true);
      return;
    }

    await performJoin();
  };

  const performJoin = async () => {
    if (isDemo) {
      alert("You cannot join a demo tournament. It's for simulation only.");
      return;
    }
    try {
      // Deterministic ID: userId_tournamentId for efficient security rules and lookups
      await setDoc(doc(db, 'registrations', `${auth.currentUser?.uid}_${tournament.id}`), {
        tournamentId: tournament.id,
        userId: auth.currentUser?.uid,
        status: 'pending',
        gameName: profile?.inGameName,
        gameUid: profile?.inGameUID,
        createdAt: serverTimestamp()
      });

      alert('Join request sent! Waiting for publisher approval.');
      setShowJoinKeyModal(false);
      setEnteredJoinKey('');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to join tournament');
    }
  };

  const verifyAndJoin = async () => {
    if (!enteredJoinKey.trim()) return alert('Please enter the invitation key.');
    
    setIsVerifyingKey(true);
    try {
      if (enteredJoinKey.trim() !== tournament.invitationKey) {
        alert('Invalid Invitation Key! Please double check the key provided by the host.');
        setIsVerifyingKey(false);
        return;
      }
      
      await performJoin();
    } catch (err) {
      console.error(err);
      alert('Verification failed.');
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const renderJoinKeyModal = () => {
    if (!showJoinKeyModal) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9000] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-[0_25px_70px_-15px_rgba(15,23,42,0.28)] relative">
          {/* Header */}
          <div className="p-8 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                   <Lock size={20} className="text-indigo-600" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">INVITED ONLY</h3>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                     Enter invitation key to join
                   </p>
                </div>
             </div>
             <button 
               onClick={() => {
                 setShowJoinKeyModal(false);
                 setEnteredJoinKey('');
               }}
               className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-colors"
             >
               <X size={20} />
             </button>
          </div>

          <div className="p-8 space-y-6">
             <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
               <p className="text-[10px] font-bold leading-relaxed">
                 This tournament is restricted to invited players only. Please enter the unique invitation key provided by the host to proceed with your join request.
               </p>
             </div>

             <div className="space-y-3">
               <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-4">Invitation Key</label>
               <input 
                 type="text"
                 placeholder="INV-XXXXXX"
                 value={enteredJoinKey}
                 onChange={(e) => setEnteredJoinKey(e.target.value.toUpperCase())}
                 className="w-full h-16 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-xl font-black text-center text-slate-900 placeholder:text-slate-400 outline-none transition-all uppercase"
               />
             </div>

             <button 
               onClick={verifyAndJoin}
               disabled={isVerifyingKey || !enteredJoinKey.trim()}
               className={cn(
                 "w-full h-16 rounded-[2rem] flex items-center justify-center text-[12px] font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                 isVerifyingKey || !enteredJoinKey.trim()
                   ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" 
                   : "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/25 hover:scale-[1.01]"
               )}
             >
                {isVerifyingKey ? 'VERIFYING...' : 'VERIFY & SEND REQUEST'}
             </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };



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

  const handleUploadResult = (match: Match) => {
    clearReportOcrState();
    setReportingMatch(match);
    setReportFormData({
      home: match.homeScore ?? 0,
      away: match.awayScore ?? 0,
      penaltyWinnerId: match.penaltyWinnerId || ''
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

    // Strict local OCR check: Required for players, optional for admins/publishers (unless a screenshot is attached)
    if (!isAdminUser) {
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

    // Knockout Stage: Draw is strictly prohibited (must have a decisive winner)
    const isKnockout = reportingMatch.stage !== 'group' || (tournament as any)?.format === 'knockout' || reportingMatch.groupId === 'knockout';
    if (isKnockout && reportFormData.home === reportFormData.away && !reportFormData.penaltyWinnerId) {
      alert('Knockout matches cannot end in a draw! Extra time or penalties must decide a winner. Draw results cannot be submitted.');
      return;
    }

    setIsSubmittingReport(true);
    try {
      if (isDemo) {
        setMatches(prev => {
          const updated = prev.map(m => m.id === reportingMatch.id ? { 
            ...m, 
            status: 'completed' as const,
            homeScore: reportFormData.home,
            awayScore: reportFormData.away,
            penaltyWinnerId: reportFormData.penaltyWinnerId || null
          } : m);

          updateDemoMatch(tournament.id, reportingMatch.id, {
            homeScore: reportFormData.home,
            awayScore: reportFormData.away,
            penaltyWinnerId: reportFormData.penaltyWinnerId || null,
            status: 'completed'
          });

          return updated;
        });
        
        alert('ম্যাচ রেজাল্ট সফলভাবে রেকর্ড করা হয়েছে! (Demo Mode)');
        closeReportResultModal();
        return;
      }

      await updateDoc(doc(db, 'matches', reportingMatch.id), {
        homeScore: reportFormData.home,
        awayScore: reportFormData.away,
        penaltyWinnerId: reportFormData.penaltyWinnerId || null,
        status: isAdminUser ? 'completed' : 'reported',
        reporterId: auth.currentUser?.uid,
        updatedAt: Timestamp.now()
      });
      
      if (isAdminUser) {
        alert('ম্যাচ রেজাল্ট সফলভাবে আপডেট এবং ফাইনাল করা হয়েছে!');
      } else {
        alert('রেজাল্ট রিপোর্ট করা হয়েছে! প্রতিপক্ষের কনফার্মেশনের জন্য অপেক্ষা করুন।');
      }
      closeReportResultModal();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `matches/${reportingMatch.id}`);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const renderReportResultModal = () => {
    if (!reportingMatch) return null;

    const homeName = reportingMatch.homePlayerName;
    const awayName = reportingMatch.awayPlayerName;
    const isKnockout = reportingMatch.stage !== 'group' || (tournament as any)?.format === 'knockout' || reportingMatch.groupId === 'knockout';
    const isDraw = reportFormData.home === reportFormData.away;
    const isDrawBlocked = isKnockout && isDraw;
    const isEditingCompleted = reportingMatch.status === 'completed';

    const isOcrBlocked = !isAdminUser
      ? (!reportScreenshotPreview || isScanningOcr || !ocrVerification?.isVerified)
      : (isScanningOcr || Boolean(reportScreenshotPreview && !ocrVerification?.isVerified));

    const isSubmitDisabled =
      isSubmittingReport ||
      isOcrBlocked ||
      (isKnockout && isDraw && !reportFormData.penaltyWinnerId);

    return createPortal(
      <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-md max-h-[92vh] bg-white rounded-[2.5rem] border border-slate-200 overflow-y-auto shadow-[0_25px_70px_-15px_rgba(15,23,42,0.28)] relative my-auto">
          {/* Header */}
          <div className="p-6 sm:p-8 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xs z-20">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                   {isEditingCompleted ? <Edit3 size={20} className="text-amber-600" /> : <Upload size={20} className="text-amber-600" />}
                </div>
                <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                     {isEditingCompleted ? 'EDIT RESULT' : 'REPORT RESULT'}
                   </h3>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                     {isKnockout ? 'Knockout Stage · Decisive Winner Required' : (isEditingCompleted ? 'Modify finalized match scoreline' : 'Submit final match scoreline')}
                   </p>
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
             {/* Knockout Stage Rule Banner */}
             {isKnockout && (
               <div className={cn(
                 "p-3.5 rounded-2xl border text-center transition-all",
                 isDraw 
                   ? "bg-rose-50 border-rose-200 text-rose-800" 
                   : "bg-amber-50 border-amber-200 text-amber-900"
               )}>
                 <div className="flex items-center justify-center gap-2 mb-1">
                   {isDraw ? <AlertCircle size={14} className="text-rose-600" /> : <Trophy size={14} className="text-amber-600" />}
                   <span className="text-[9.5px] font-black uppercase tracking-wider">
                     {isDraw ? "Draw result is not permitted!" : "Knockout Stage: Winner Required"}
                   </span>
                 </div>
                 <p className="text-[8.5px] font-bold leading-relaxed">
                   {isDraw 
                     ? "Draw results cannot be submitted for knockout matches. Please record extra time or penalty shootout score in favor of the winner." 
                     : "Matches in this knockout stage cannot end in a draw. One player must advance as the winner."}
                 </p>
               </div>
             )}

             {/* Scores */}
             <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-3">
                   <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">{homeName}</label>
                   <input 
                     type="number"
                     min="0"
                     value={reportFormData.home}
                     onChange={(e) => setReportFormData({...reportFormData, home: Math.max(0, parseInt(e.target.value) || 0)})}
                     className={cn(
                       "w-full h-20 rounded-3xl bg-slate-50 border-2 text-3xl font-black text-center text-slate-900 outline-none transition-all focus:bg-white",
                       isDrawBlocked ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"
                     )}
                   />
                </div>
                <span className="text-xl font-black text-slate-400 italic pt-6">VS</span>
                <div className="flex-1 space-y-3">
                   <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">{awayName}</label>
                   <input 
                     type="number"
                     min="0"
                     value={reportFormData.away}
                     onChange={(e) => setReportFormData({...reportFormData, away: Math.max(0, parseInt(e.target.value) || 0)})}
                     className={cn(
                       "w-full h-20 rounded-3xl bg-slate-50 border-2 text-3xl font-black text-center text-slate-900 outline-none transition-all focus:bg-white",
                       isDrawBlocked ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"
                     )}
                   />
                </div>
             </div>

             {/* Penalty Winner Selection for Knockout Draws */}
             {isKnockout && isDraw && (
               <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                 <div className="flex flex-col items-center gap-2">
                   <div className="h-px w-full bg-slate-200" />
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4 bg-white -mt-3 relative z-10">Penalty Shootout Winner</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setReportFormData({...reportFormData, penaltyWinnerId: reportingMatch.homePlayerId})}
                     className={cn(
                       "h-12 rounded-2xl border-2 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                       reportFormData.penaltyWinnerId === reportingMatch.homePlayerId 
                         ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20" 
                         : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                     )}
                   >
                     {reportFormData.penaltyWinnerId === reportingMatch.homePlayerId && <CheckCircle size={14} />}
                     {homeName}
                   </button>
                   <button 
                     onClick={() => setReportFormData({...reportFormData, penaltyWinnerId: reportingMatch.awayPlayerId})}
                     className={cn(
                       "h-12 rounded-2xl border-2 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                       reportFormData.penaltyWinnerId === reportingMatch.awayPlayerId 
                         ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20" 
                         : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                     )}
                   >
                     {reportFormData.penaltyWinnerId === reportingMatch.awayPlayerId && <CheckCircle size={14} />}
                     {awayName}
                   </button>
                 </div>
               </div>
             )}

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
                   !isAdminUser
                     ? "bg-amber-50 text-amber-700 border-amber-200"
                     : "bg-slate-50 text-slate-500 border-slate-200"
                 )}>
                   {!isAdminUser ? 'Required' : 'Optional for Host'}
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

                   {/* Scanning Progress Bar */}
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

                   {/* Verification Checklist & Feedback */}
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
                           <p className="text-[8px] font-bold truncate">{homeName}</p>
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
                           <p className="text-[8px] font-bold truncate">{awayName}</p>
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

             {/* Deploy Button */}
             <button 
               onClick={submitFinalReport}
               disabled={isSubmitDisabled}
               className={cn(
                 "w-full h-16 sm:h-18 rounded-[2rem] flex items-center justify-center text-[11px] sm:text-[13px] font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                 isSubmitDisabled
                   ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" 
                   : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 hover:scale-[1.01]"
               )}
             >
                {isSubmittingReport 
                  ? 'DEPLOYING...' 
                  : isScanningOcr
                    ? 'CHECKING BY AI...'
                    : (!isAdminUser && !reportScreenshotPreview)
                      ? 'UPLOAD SCREENSHOT TO UNLOCK'
                      : isOcrBlocked
                        ? 'AI VERIFICATION REQUIRED'
                        : (isKnockout && isDraw && !reportFormData.penaltyWinnerId)
                          ? 'Select Penalty Winner' 
                          : 'DEPLOY FINAL RESULT'}
             </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const handleDisputeResult = async (match: Match) => {
    const reason = prompt('Why are you reporting this match result? (Optional)');
    if (reason === null) return;
    try {
      if (isDemo) {
        updateDemoMatch(tournament.id, match.id, {
          status: 'disputed' as any
        });
        setMatches(prev => prev.map(m => m.id === match.id ? {
          ...m,
          status: 'disputed' as const,
          disputeReason: reason || 'Opponent reported incorrect match result'
        } : m));
        alert('Match result has been reported to the Admin & Publisher portal for review.');
        return;
      }
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'disputed',
        disputeReason: reason || 'Opponent reported incorrect match result',
        updatedAt: Timestamp.now()
      });

      const hostUid = currentTournament?.publisherId || tournament.publisherId;
      if (hostUid) {
        sendAppNotification({
          recipientId: hostUid,
          title: '⚠️ Match Result Reported',
          message: `${match.awayPlayerName} reported the result of ${match.homePlayerName} (${match.homeScore ?? 0} - ${match.awayScore ?? 0}) ${match.awayPlayerName}.`,
          type: 'system',
          tournamentId: tournament.id,
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
        if (isDemo) {
          updateDemoMatch(tournament.id, match.id, {
            status: 'scheduled',
            homeScore: undefined,
            awayScore: undefined,
            penaltyWinnerId: null
          });
          setMatches(prev => prev.map(m => m.id === match.id ? { 
            ...m, 
            status: 'scheduled' as any, 
            homeScore: undefined, 
            awayScore: undefined, 
            penaltyWinnerId: null 
          } : m));
        } else {
          await updateDoc(doc(db, 'matches', match.id), {
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
            penaltyWinnerId: null,
            reporterId: null,
            disputeReason: null,
            updatedAt: Timestamp.now()
          });
        }
        alert('Match has been reset to scheduled status.');
      } else {
        await handleConfirmResult(match);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Group calculation & standings logic
  const assignedGroupLetters = participants.map(p => p.groupId).filter(Boolean) as string[];
  const maxAssignedGroupChar = assignedGroupLetters.reduce((max, g) => (g > max ? g : max), 'A');
  const maxAssignedGroupCount = maxAssignedGroupChar.charCodeAt(0) - 64;
  const slotsGroupCount = Math.ceil(totalSlots / 4);
  const numGroups = isKnockoutOnly ? 0 : Math.max(slotsGroupCount, maxAssignedGroupCount);
  const groups = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i));

  const calculateGroupTable = (groupId: string, customMatches?: Match[], customParticipants?: any[]) => {
    const pList = customParticipants || participants;
    const mList = customMatches || matches;
    const groupParticipants = pList.filter(p => p.groupId === groupId);
    const groupMatches = mList.filter(m => m.groupId === groupId && m.status === 'completed');

    const table = groupParticipants.map(p => {
      const stats = {
        userId: p.userId,
        name: p.gameName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        gd: 0,
        pts: 0
      };

      groupMatches.forEach(m => {
        if (m.homePlayerId === p.userId) {
          stats.played++;
          stats.goalsFor += (m.homeScore || 0);
          stats.goalsAgainst += (m.awayScore || 0);
          if ((m.homeScore || 0) > (m.awayScore || 0)) { stats.won++; stats.pts += 3; }
          else if ((m.homeScore || 0) === (m.awayScore || 0)) { stats.drawn++; stats.pts += 1; }
          else stats.lost++;
        } else if (m.awayPlayerId === p.userId) {
          stats.played++;
          stats.goalsFor += (m.awayScore || 0);
          stats.goalsAgainst += (m.homeScore || 0);
          if ((m.awayScore || 0) > (m.homeScore || 0)) { stats.won++; stats.pts += 3; }
          else if ((m.awayScore || 0) === (m.homeScore || 0)) { stats.drawn++; stats.pts += 1; }
          else stats.lost++;
        }
      });

      stats.gd = stats.goalsFor - stats.goalsAgainst;
      return stats;
    });

    return table.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.goalsFor - a.goalsFor;
    });
  };

  const getWinnerId = (m: Match): string | null => {
    const hScore = m.homeScore ?? 0;
    const aScore = m.awayScore ?? 0;
    if (hScore > aScore) return m.homePlayerId;
    if (aScore > hScore) return m.awayPlayerId;
    // For knockout draws, check the penalty winner if defined
    if (m.penaltyWinnerId) return m.penaltyWinnerId;
    return null;
  };

  const getLoserId = (m: Match): string | null => {
    const hScore = m.homeScore ?? 0;
    const aScore = m.awayScore ?? 0;
    if (hScore > aScore) return m.awayPlayerId;
    if (aScore > hScore) return m.homePlayerId;
    // For knockout draws, loser is the one NOT in penaltyWinnerId
    if (m.penaltyWinnerId) return m.penaltyWinnerId === m.homePlayerId ? m.awayPlayerId : m.homePlayerId;
    return null;
  };

  const getQualifiedPlayerIds = (targetStage: string): string[] | null => {
    if (targetStage === 'group') return null;

    if (targetStage === '3RD_PLACE') {
      const semiMatches = matches.filter(m => m.stage === 'SEMI');
      const finalists = matches.filter(m => m.stage === 'FINAL' && (m.matchId === 'FINAL_M1' || !m.matchId))
        .flatMap(m => [m.homePlayerId, m.awayPlayerId])
        .filter(Boolean);
      
      const semiParticipants = semiMatches.flatMap(m => [m.homePlayerId, m.awayPlayerId]).filter(Boolean);
      
      // If semi matches are completed, we know exactly who the losers are
      const completedSemis = semiMatches.filter(m => m.status === 'completed');
      if (completedSemis.length > 0) {
        const losers = completedSemis.map(m => getLoserId(m)).filter(Boolean) as string[];
        // Filter out anyone who somehow made it to the final (safety check)
        const actualLosers = losers.filter(id => !finalists.includes(id));
        
        // Also include semi participants who are NOT finalists (for flexibility if result is pending)
        const potentialLosers = semiParticipants.filter(id => !finalists.includes(id));
        
        // Combine and unique
        const combined = Array.from(new Set([...actualLosers, ...potentialLosers]));
        return combined.length > 0 ? combined : null;
      }
      
      // If semis are not completed, show all semi participants who are NOT in the grand final
      const potentialLosers = semiParticipants.filter(id => !finalists.includes(id));
      return potentialLosers.length > 0 ? potentialLosers : null;
    }

    const stageIdx = knockoutStages.indexOf(targetStage);
    if (stageIdx === -1) return null;

    // First knockout stage
    if (stageIdx === 0) {
      if (isKnockoutOnly) {
        return participants.filter(p => p.status === 'approved').map(p => p.userId);
      } else {
        const activeGroups = Array.from(new Set(participants.map(p => p.groupId).filter(Boolean))).sort() as string[];
        const qualified: string[] = [];
        activeGroups.forEach(gId => {
          const table = calculateGroupTable(gId, matches);
          if (table.length >= 1) qualified.push(table[0].userId);
          if (table.length >= 2) qualified.push(table[1].userId);
        });
        return qualified;
      }
    }

    // Subsequent stages: winners of previous stage
    const prevStage = knockoutStages[stageIdx - 1];
    const prevMatches = matches.filter(m => m.stage === prevStage);
    const winners: string[] = [];
    prevMatches.forEach(m => {
      const wId = getWinnerId(m);
      if (wId) winners.push(wId);
    });
    return winners;
  };

  const upsertStageMatch = async (
    allActiveMatches: Match[],
    matchId: string,
    stage: string,
    homePlayer: { userId: string, name: string },
    awayPlayer: { userId: string, name: string }
  ) => {
    const existing = allActiveMatches.find(m => m.matchId === matchId || (m.stage === stage && m.matchId === matchId));
    if (existing) {
      const updates = {
        homePlayerId: homePlayer.userId,
        awayPlayerId: awayPlayer.userId,
        homePlayerName: homePlayer.name,
        awayPlayerName: awayPlayer.name,
        stage: stage,
        groupId: 'knockout',
        status: 'scheduled' as const,
        homeScore: undefined,
        awayScore: undefined,
        penaltyWinnerId: null
      };

      if (isDemo) {
        updateDemoMatch(tournament.id, existing.id, updates as any);
        setMatches(prev => prev.map(m => m.id === existing.id ? { ...m, ...updates } : m));
        return;
      }
      await updateDoc(doc(db, 'matches', existing.id), {
        ...updates,
        participants: [homePlayer.userId, awayPlayer.userId],
        homeScore: 0,
        awayScore: 0,
        updatedAt: Timestamp.now()
      });
    } else {
      const matchData = {
        tournamentId: tournament.id,
        matchId: matchId,
        homePlayerId: homePlayer.userId,
        awayPlayerId: awayPlayer.userId,
        homePlayerName: homePlayer.name,
        awayPlayerName: awayPlayer.name,
        status: 'scheduled' as const,
        stage: stage,
        groupId: 'knockout'
      };

      if (isDemo) {
        const newMatch = addDemoMatch(tournament.id, {
          ...matchData,
          scheduledTime: { toMillis: () => Date.now() }
        });
        setMatches(prev => [...prev, newMatch as any]);
        return;
      }
      await addDoc(collection(db, 'matches'), {
        ...matchData,
        participants: [homePlayer.userId, awayPlayer.userId],
        publisherId: tournament.publisherId,
        scheduledTime: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    }
  };

  // World Cup Style Group -> Knockout Bracket Generator
  const generateKnockoutMatches = async (currentMatchList?: Match[]) => {
    if (deploying) return;
    setDeploying(true);
    try {
      const allActiveMatches = currentMatchList || matches;
      const groupRankings: Record<string, { rank1: { userId: string, name: string }, rank2: { userId: string, name: string } }> = {};

      const activeGroups = Array.from(new Set(participants.map(p => p.groupId).filter(Boolean))).sort() as string[];
      
      activeGroups.forEach(gId => {
        const table = calculateGroupTable(gId, allActiveMatches);
        if (table.length >= 2) {
          groupRankings[gId] = {
            rank1: { userId: table[0].userId, name: table[0].name },
            rank2: { userId: table[1].userId, name: table[1].name }
          };
        } else if (table.length === 1) {
          groupRankings[gId] = {
            rank1: { userId: table[0].userId, name: table[0].name },
            rank2: { userId: table[0].userId, name: table[0].name }
          };
        }
      });

      const rankedGroupKeys = Object.keys(groupRankings).sort();
      if (rankedGroupKeys.length === 0) {
        throw new Error("No active groups found. Please deploy groups first.");
      }

      let targetStage = 'R16';
      let pairings: { matchId: string; home: { userId: string, name: string }; away: { userId: string, name: string } }[] = [];

      const numGroups = rankedGroupKeys.length;

      // Deterministic World Cup Style pairing logic
      if (numGroups === 8) {
        targetStage = 'R16';
        const wc8 = [
          { m: 1, hG: 'A', hR: 1, aG: 'B', aR: 2 },
          { m: 2, hG: 'C', hR: 1, aG: 'D', aR: 2 },
          { m: 3, hG: 'E', hR: 1, aG: 'F', aR: 2 },
          { m: 4, hG: 'G', hR: 1, aG: 'H', aR: 2 },
          { m: 5, hG: 'B', hR: 1, aG: 'A', aR: 2 },
          { m: 6, hG: 'D', hR: 1, aG: 'C', aR: 2 },
          { m: 7, hG: 'F', hR: 1, aG: 'E', aR: 2 },
          { m: 8, hG: 'H', hR: 1, aG: 'G', aR: 2 },
        ];
        pairings = wc8.map(p => ({
          matchId: `R16_M${p.m}`,
          home: p.hR === 1 ? groupRankings[p.hG].rank1 : groupRankings[p.hG].rank2,
          away: p.aR === 1 ? groupRankings[p.aG].rank1 : groupRankings[p.aG].rank2,
        }));
      } else if (numGroups === 4) {
        targetStage = 'QTR';
        const wc4 = [
          { m: 1, hG: 'A', hR: 1, aG: 'B', aR: 2 },
          { m: 2, hG: 'C', hR: 1, aG: 'D', aR: 2 },
          { m: 3, hG: 'B', hR: 1, aG: 'A', aR: 2 },
          { m: 4, hG: 'D', hR: 1, aG: 'C', aR: 2 },
        ];
        pairings = wc4.map(p => ({
          matchId: `QTR_M${p.m}`,
          home: p.hR === 1 ? groupRankings[p.hG].rank1 : groupRankings[p.hG].rank2,
          away: p.aR === 1 ? groupRankings[p.aG].rank1 : groupRankings[p.aG].rank2,
        }));
      } else if (numGroups === 2) {
        targetStage = 'SEMI';
        pairings = [
          { matchId: 'SEMI_M1', home: groupRankings['A'].rank1, away: groupRankings['B'].rank2 },
          { matchId: 'SEMI_M2', home: groupRankings['B'].rank1, away: groupRankings['A'].rank2 }
        ];
      } else if (numGroups === 1) {
        targetStage = 'FINAL';
        pairings = [
          { matchId: 'FINAL_M1', home: groupRankings[rankedGroupKeys[0]].rank1, away: groupRankings[rankedGroupKeys[0]].rank2 }
        ];
      } else {
        // Fallback for non-standard group counts
        const totalAdvancing = numGroups * 2;
        targetStage = totalAdvancing <= 2 ? 'FINAL' : totalAdvancing <= 4 ? 'SEMI' : totalAdvancing <= 8 ? 'QTR' : 'R16';
        
        for (let i = 0; i < numGroups; i++) {
          const g1 = rankedGroupKeys[i];
          const g2 = rankedGroupKeys[(i + 1) % numGroups];
          pairings.push({
            matchId: `${targetStage}_M${i + 1}`,
            home: groupRankings[g1].rank1,
            away: groupRankings[g2].rank2
          });
        }
      }

      await Promise.all(pairings.map(p => upsertStageMatch(allActiveMatches, p.matchId, targetStage, p.home, p.away)));

      setActiveTab('knockout');
      setActiveKnockoutStage(targetStage as any);
      setAutoMatchToast({
        title: 'KNOCKOUT BRACKET UPDATED',
        subtitle: `Group stage standings processed! Top players advanced to ${targetStage}.`
      });
    } catch (err: any) {
      console.error('Error generating knockout matches:', err);
      if (!isDemo) handleFirestoreError(err, OperationType.WRITE, 'matches');
    } finally {
      setDeploying(false);
    }
  };


  const advanceStage = async (currentStage: string, nextStage: string, allMatches: Match[]) => {
    const currentStageMatches = allMatches
      .filter(m => m.stage === currentStage && m.status !== 'draft' && m.homePlayerId && m.awayPlayerId)
      .sort((a, b) => {
        const aNum = parseInt(a.matchId?.split('_M')[1] || '0');
        const bNum = parseInt(b.matchId?.split('_M')[1] || '0');
        return aNum - bNum;
      });

    if (currentStageMatches.length === 0) return;

    const winners: { userId: string, name: string }[] = [];
    const losers: { userId: string, name: string }[] = [];

    currentStageMatches.forEach(m => {
      if (m.status !== 'completed') return;
      const wId = getWinnerId(m);
      const lId = getLoserId(m);
      if (wId) {
        winners.push({
          userId: wId,
          name: (wId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[wId]?.inGameName || 'Player'
        });
      }
      if (lId) {
        losers.push({
          userId: lId,
          name: (lId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[lId]?.inGameName || 'Player'
        });
      }
    });

    if (winners.length < 2) return;

    const updates = [];
    if (nextStage === 'FINAL' && winners.length >= 2) {
      updates.push(upsertStageMatch(allMatches, 'FINAL_M1', 'FINAL', winners[0], winners[1]));
      if (losers.length >= 2) {
        updates.push(upsertStageMatch(allMatches, '3RD_PLACE_M1', '3RD_PLACE', losers[0], losers[1]));
      }
    } else {
      for (let i = 0; i < winners.length - 1; i += 2) {
        const matchNum = (i / 2) + 1;
        updates.push(upsertStageMatch(allMatches, `${nextStage}_M${matchNum}`, nextStage, winners[i], winners[i + 1]));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      setActiveTab('knockout');
      setActiveKnockoutStage(nextStage as any);
      setAutoMatchToast({
        title: `${nextStage} UNLOCKED`,
        subtitle: `Qualified players from ${currentStage} have advanced to ${nextStage}!`
      });
    }
  };

  const handleConfirmResult = async (match: Match) => {
    const isKnockout = match.stage !== 'group' || (tournament as any)?.format === 'knockout' || match.groupId === 'knockout';
    const homeScore = match.homeScore || 0;
    const awayScore = match.awayScore || 0;

    if (isKnockout && homeScore === awayScore && !match.penaltyWinnerId) {
      alert('Knockout matches cannot end in a draw without a penalty winner! Please ensure a winner is selected before confirming.');
      return;
    }

    try {
      if (isDemo) {
        updateDemoMatch(tournament.id, match.id, {
          status: 'completed'
        });
      } else {
        await updateDoc(doc(db, 'matches', match.id), {
          status: 'completed',
          updatedAt: Timestamp.now()
        });
      }

      // Updated match list with this match set to completed
      const updatedMatches = matches.map(m => m.id === match.id ? { ...m, status: 'completed' as const } : m);

      if (isDemo) {
        setMatches(updatedMatches);
      }

      // Notify both players about confirmed match result
      const winnerName = homeScore > awayScore 
        ? match.homePlayerName 
        : awayScore > homeScore 
          ? match.awayPlayerName 
          : match.penaltyWinnerId === match.homePlayerId ? match.homePlayerName : match.awayPlayerName;

      notifyMatchParticipants({
        homePlayerId: match.homePlayerId,
        awayPlayerId: match.awayPlayerId,
        title: '🏆 Match Result Confirmed!',
        message: `${match.homePlayerName} (${homeScore}) - (${awayScore}) ${match.awayPlayerName}. Winner: ${winnerName}!`,
        type: 'match_result',
        tournamentId: tournament.id,
        matchId: match.id
      }).catch(err => console.warn('Match result notification failed:', err));

      alert('Result confirmed!');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    }
  };

  const handleApproveRegistration = async (regId: string) => {
    try {
      if (isDemo) {
        updateDemoParticipant(tournament.id, regId, { status: 'approved' });
        const updatedParticipants = participants.map(p => p.id === regId ? { ...p, status: 'approved' } : p);
        setParticipants(updatedParticipants);
        
        const newFilled = (currentTournament?.filledSlots || 0) + 1;
        updateDemoTournament(tournament.id, { filledSlots: newFilled });
        setCurrentTournament((prev: any) => ({ ...prev, filledSlots: newFilled }));
      } else {
        await updateDoc(doc(db, 'registrations', regId), {
          status: 'approved',
          updatedAt: Timestamp.now()
        });
        // Also update tournament filledSlots
        const tRef = doc(db, 'tournaments', tournament.id);
        const tSnap = await getDoc(tRef);
        const currentFilled = tSnap.data()?.filledSlots || 0;
        await updateDoc(tRef, {
          filledSlots: currentFilled + 1
        });
      }
      alert('Player approved!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutoDeploy = async () => {
    if (matches.length > 0) return alert('Matches have already been deployed for this tournament! If you wish to redeploy, please use Emergency Reset first.');
    const approvedPlayers = participants.filter(p => p.status === 'approved');
    if (approvedPlayers.length < 8) return alert('Need at least 8 approved players for auto-deploy');
    if (approvedPlayers.length % 4 !== 0) {
       if (!confirm(`Currently have ${approvedPlayers.length} players. Groups usually have 4 players. Continue?`)) return;
    }

      setDeploying(true);
    try {
      // 1. Shuffle players
      const shuffled = [...approvedPlayers].sort(() => Math.random() - 0.5);
      
      // 2. Assign to groups (4 per group)
      const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      
      if (isDemo) {
        const updatedParticipants = shuffled.map((p, i) => {
          const groupIdx = Math.floor(i / 4);
          const group = groups[groupIdx] || 'H';
          return { ...p, groupId: group };
        });
        saveDemoParticipants(tournament.id, updatedParticipants as any);
        setParticipants(updatedParticipants);
      } else {
        const batchUpdates = [];
        for (let i = 0; i < shuffled.length; i++) {
          const groupIdx = Math.floor(i / 4);
          const group = groups[groupIdx] || 'H';
          batchUpdates.push(updateDoc(doc(db, 'registrations', shuffled[i].id), {
            groupId: group,
            updatedAt: Timestamp.now()
          }));
        }
        await Promise.all(batchUpdates);
      }

      // 3. Generate matches for each group (Home & Away)
      const groupNames = Array.from(new Set(shuffled.map((_, i) => groups[Math.floor(i / 4)] || 'H')));
      const newMatches: any[] = [];

      for (const gName of groupNames) {
        const gPlayers = shuffled.filter((_, i) => (groups[Math.floor(i / 4)] || 'H') === gName);
        if (gPlayers.length < 2) continue;

        // Generate Home & Away matches
        for (let i = 0; i < gPlayers.length; i++) {
          for (let j = 0; j < gPlayers.length; j++) {
            if (i === j) continue;
            newMatches.push({
              tournamentId: tournament.id,
              matchId: generateMatchId(),
              homePlayerId: gPlayers[i].userId,
              awayPlayerId: gPlayers[j].userId,
              participants: [gPlayers[i].userId, gPlayers[j].userId],
              homePlayerName: gPlayers[i].gameName,
              awayPlayerName: gPlayers[j].gameName,
              status: 'scheduled',
              groupId: gName,
              stage: 'group',
              publisherId: tournament.publisherId,
              scheduledTime: isDemo ? { toMillis: () => Date.now() } : Timestamp.now(),
              createdAt: isDemo ? Date.now() : Timestamp.now()
            });
          }
        }
      }

      if (isDemo) {
        const demoMatches = newMatches.map(m => ({ ...m, id: `demo_m_${Math.random().toString(36).substr(2, 9)}` }));
        saveDemoMatches(tournament.id, demoMatches);
        setMatches(demoMatches as any);
        
        updateDemoTournament(tournament.id, { status: 'ongoing' });
        setCurrentTournament((prev: any) => ({ ...prev, status: 'ongoing' }));
      } else {
        await Promise.all(newMatches.map(m => addDoc(collection(db, 'matches'), m)));
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          status: 'ongoing',
          updatedAt: Timestamp.now()
        });
      }

      alert('Tournament deployed successfully! Groups and matches created.');
      setActiveTab('group');
    } catch (err) {
      console.error(err);
      alert('Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  const handleManualAssign = async (regId: string, group: string) => {
    try {
      if (isDemo) {
        updateDemoParticipant(tournament.id, regId, { groupId: group });
        setParticipants(prev => prev.map(p => p.id === regId ? { ...p, groupId: group } : p));
      } else {
        await updateDoc(doc(db, 'registrations', regId), {
          groupId: group,
          updatedAt: Timestamp.now()
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetTournament = () => {
    if (!isAdminUser) {
      alert('Only tournament hosts and admins can reset this tournament.');
      return;
    }
    setConfirmAction({
      type: 'reset',
      title: 'Confirm Tournament Reset',
      description: 'Are you sure you want to reset this tournament? All played matches and fixtures will be deleted from the database, but all registered players will remain intact in the roster.',
      confirmLabel: 'Yes, Reset Tournament'
    });
  };

  const handleDeleteTournament = () => {
    if (!isAdminUser) {
      alert('Only tournament hosts and admins can delete this tournament.');
      return;
    }
    setConfirmAction({
      type: 'delete',
      title: 'Permanently Delete Tournament',
      description: 'Warning: Are you sure you want to completely delete this tournament? All fixtures, player registrations, and tournament data will be permanently removed from the database.',
      confirmLabel: 'Yes, Delete Tournament'
    });
  };

  const executeResetTournament = async () => {
    setIsResettingTournament(true);
    try {
      // 1. Delete all matches of this tournament
      if (isDemo) {
        saveDemoMatches(tournament.id, []);
      } else {
        const matchQuery = query(collection(db, 'matches'), where('tournamentId', '==', tournament.id));
        const matchSnap = await getDocs(matchQuery);
        await Promise.all(matchSnap.docs.map(d => deleteDoc(doc(db, 'matches', d.id))));

        // 2. Clear match room chat messages
        const msgQuery = query(collection(db, 'messages'), where('tournamentId', '==', tournament.id));
        const msgSnap = await getDocs(msgQuery);
        const matchMsgDeletions = msgSnap.docs
          .filter(d => d.data().chatId !== tournament.id)
          .map(d => deleteDoc(doc(db, 'messages', d.id)));
        await Promise.all(matchMsgDeletions);
      }

      // 3. Clear group & stage assignments from registrations
      if (isDemo) {
        const updatedParticipants = participants.map(p => ({
          ...p,
          groupId: '',
          stage: ''
        }));
        saveDemoParticipants(tournament.id, updatedParticipants as any);
        setParticipants(updatedParticipants);
      } else {
        const regQuery = query(collection(db, 'registrations'), where('tournamentId', '==', tournament.id));
        const regSnap = await getDocs(regQuery);
        await Promise.all(regSnap.docs.map(d => updateDoc(doc(db, 'registrations', d.id), { 
          groupId: null,
          stage: null 
        })));
      }

      // 4. Reset tournament status
      if (isDemo) {
        updateDemoTournament(tournament.id, {
          status: 'open',
          winnerId: '',
          winnerText: ''
        });
        setCurrentTournament((prev: any) => ({
          ...prev,
          status: 'open',
          winnerId: '',
          winnerText: ''
        }));
      } else {
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          status: 'open',
          winnerId: null,
          winnerText: null,
          updatedAt: Timestamp.now()
        });
      }

      // 5. Update local state
      setMatches([]);
      setLocalGroupSetupDone(false);
      setLocalMatchDeployDone(false);
      setSlotAssignModal(null);
      setConfirmAction(null);
      setAutoMatchToast({
        title: 'TOURNAMENT RESET SUCCESSFUL',
        subtitle: 'All fixtures and scores cleared. Player roster preserved for new matchups.'
      });
    } catch (err) {
      console.error('Reset tournament error:', err);
      handleFirestoreError(err, OperationType.DELETE, 'matches');
    } finally {
      setIsResettingTournament(false);
    }
  };

  const handleToggleResultUploadType = async () => {
    setActionLoading(true);
    try {
      const current = (currentTournament?.resultUploadType || tournament.resultUploadType || 'players');
      const nextVal = current === 'players' ? 'publisher' : 'players';
      if (isDemo) {
        updateDemoTournament(tournament.id, { resultUploadType: nextVal });
      } else {
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          resultUploadType: nextVal,
          updatedAt: Timestamp.now()
        });
      }
      setCurrentTournament((prev: any) => prev ? { ...prev, resultUploadType: nextVal } : prev);
      alert(`Match Result Upload Type changed to: ${nextVal === 'players' ? 'Players & Publisher' : 'Publisher Only'}`);
    } catch (err) {
      console.error('Error toggling result upload type:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'tournaments');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleAutoMatchDeploy = async () => {
    setActionLoading(true);
    try {
      const nextVal = !(currentTournament?.autoMatchDeploy ?? tournament.autoMatchDeploy);
      if (isDemo) {
        updateDemoTournament(tournament.id, { autoMatchDeploy: nextVal });
      } else {
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          autoMatchDeploy: nextVal,
          updatedAt: Timestamp.now()
        });
      }
      setCurrentTournament((prev: any) => prev ? { ...prev, autoMatchDeploy: nextVal } : prev);
      alert(`Auto Match Deploy is now: ${nextVal ? 'ENABLED' : 'DISABLED'}`);
    } catch (err) {
      console.error('Error toggling auto match deploy:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'tournaments');
    } finally {
      setActionLoading(false);
    }
  };

  const executeDeleteTournament = async () => {
    setIsDeletingTournament(true);
    try {
      if (isDemo) {
        // Handle Demo Deletion
        import('@/src/lib/localTournaments').then(({ deleteDemoTournament }) => {
          deleteDemoTournament(tournament.id);
        });
      } else {
        // 1. Delete all matches of this tournament
        const matchQuery = query(collection(db, 'matches'), where('tournamentId', '==', tournament.id));
        const matchSnap = await getDocs(matchQuery);
        await Promise.all(matchSnap.docs.map(d => deleteDoc(doc(db, 'matches', d.id))));

        // 2. Delete all player registrations
        const regQuery = query(collection(db, 'registrations'), where('tournamentId', '==', tournament.id));
        const regSnap = await getDocs(regQuery);
        await Promise.all(regSnap.docs.map(d => deleteDoc(doc(db, 'registrations', d.id))));

        // 3. Delete all chat messages
        const msgQuery = query(collection(db, 'messages'), where('tournamentId', '==', tournament.id));
        const msgSnap = await getDocs(msgQuery);
        await Promise.all(msgSnap.docs.map(d => deleteDoc(doc(db, 'messages', d.id))));

        // 4. Delete the tournament document itself
        await deleteDoc(doc(db, 'tournaments', tournament.id));
      }

      setConfirmAction(null);
      onBack();
    } catch (err) {
      console.error('Delete tournament error:', err);
      handleFirestoreError(err, OperationType.DELETE, 'tournaments');
    } finally {
      setIsDeletingTournament(false);
    }
  };

  const [showManualAssign, setShowManualAssign] = useState(false);

  const renderManageTab = () => {
    const approved = participants.filter(p => p.status === 'approved');
    const pending = participants.filter(p => p.status === 'pending');
    const hasMatches = matches.length > 0;
    
    // Status helpers
    const isAutoProgressionActive = currentTournament?.autoKnockout ?? tournament.autoKnockout;
    const isStep1Done = (approved.length > 0 && approved.every(p => !!p.groupId)) || localGroupSetupDone;
    const isStep2Done = matches.length > 0 || localMatchDeployDone;
    const currentUploadType = currentTournament?.resultUploadType || tournament.resultUploadType || 'players';

    return (
      <div className="space-y-10 pb-20">
        {/* Header Summary */}
        <div className="flex flex-col items-center text-center space-y-3">
           <div className="w-16 h-16 rounded-[2rem] nm-flat flex items-center justify-center text-indigo-500 border border-white/50 mb-2">
             <Settings size={32} />
           </div>
           <h3 className="text-xl font-black text-fc-dark uppercase italic leading-none">Tournament Command</h3>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">
             Control the arena, manage players, <br /> and deploy match fixtures
           </p>
        </div>

        {/* Action Center - 6 Deployment & Control Sections */}
        <div className="space-y-6">
          <div className="px-4 flex items-center gap-3">
             <div className="h-px flex-1 bg-slate-200" />
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deployment Control</span>
             <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
            {/* 1. Auto-Progression (Manual Round Advancement) */}
            <div 
              onClick={handleOpenProgressionModal}
              className="p-6 nm-flat rounded-[2rem] space-y-4 cursor-pointer hover:border-indigo-200 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-fc-dark uppercase block">1. AUTO-PROGRESSION</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Advance Qualified Players</span>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenProgressionModal();
                  }}
                  disabled={actionLoading}
                  className="h-8 px-4 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border shadow-sm bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 active:scale-95"
                >
                  ADVANCE
                </button>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed italic">
                Click to detect the current active round (Group Stage or Knockout) and advance qualified players to the next round.
              </p>
            </div>

            {/* 2. Auto Group Setup */}
            <button 
              onClick={handleAutoGroupSetup}
              disabled={actionLoading || isStep1Done || isStep2Done}
              className={cn(
                "p-6 rounded-[2rem] nm-flat transition-all flex flex-col items-start gap-4 text-left",
                (isStep1Done || isStep2Done) ? "opacity-60" : "hover:border-indigo-200"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isStep1Done ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600")}>
                    {isStep1Done ? <CheckCircle size={20} /> : <Users size={20} />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-fc-dark uppercase block">2. AUTO GROUP SETUP</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Auto Group Setup</span>
                  </div>
                </div>
                {isStep1Done && <span className="text-[9px] font-black text-emerald-600 uppercase italic">Done</span>}
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                Automatically distribute players from the list into groups. (4 players per group)
              </p>
            </button>

            {/* 3. Auto Match Deploy */}
            <button 
              onClick={handleAutoMatchDeploy}
              disabled={actionLoading || isStep2Done || (!isKnockoutOnly && !isStep1Done)}
              className={cn(
                "p-6 rounded-[2rem] nm-flat transition-all flex flex-col items-start gap-4 text-left",
                isStep2Done ? "opacity-60" : (!isKnockoutOnly && !isStep1Done) ? "opacity-40 grayscale" : "hover:border-emerald-200"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isStep2Done ? "bg-emerald-100 text-emerald-600" : "bg-emerald-100 text-emerald-600")}>
                    {isStep2Done ? <CheckCircle size={20} /> : <Zap size={20} />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-fc-dark uppercase block">3. AUTO MATCH DEPLOY</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Auto Match Deploy</span>
                  </div>
                </div>
                {isStep2Done && <span className="text-[9px] font-black text-emerald-600 uppercase italic">Done</span>}
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                Generate all group and knockout stage matches automatically based on assignments.
              </p>
            </button>

            {/* 4. Manual Group Setup */}
            <button 
              onClick={() => setShowManualGroupModal(true)}
              disabled={actionLoading || isStep2Done}
              className={cn(
                "p-6 rounded-[2rem] nm-flat transition-all flex flex-col items-start gap-4 text-left bg-white",
                isStep2Done && "opacity-60"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Edit3 size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black text-fc-dark uppercase block">4. MANUAL GROUP SETUP</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Manual Group Setup</span>
                </div>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                Host can manually select and assign a group for every registered player.
              </p>
            </button>

            {/* 5. Manual Match Deploy */}
            <button 
              onClick={() => setShowManualMatchModal(true)}
              disabled={actionLoading}
              className="p-6 rounded-[2rem] nm-flat transition-all flex flex-col items-start gap-4 text-left bg-white"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Plus size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black text-fc-dark uppercase block">5. MANUAL MATCH DEPLOY</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Manual Match Creation</span>
                </div>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                Host can manually create custom matches between any two specific players.
              </p>
            </button>

            {/* 6. Match Result Upload Type */}
            <div className="p-6 nm-flat rounded-[2rem] space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-900 uppercase">6. RESULT UPLOAD TYPE</span>
                <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Result Upload Authority</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => currentUploadType !== 'players' && handleToggleResultUploadType()}
                  className={cn(
                    "py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border",
                    currentUploadType === 'players' ? "bg-white border-indigo-200 text-indigo-600 shadow-sm" : "bg-transparent border-transparent text-slate-400"
                  )}
                >
                  PLAYER UPLOAD
                </button>
                <button 
                  onClick={() => currentUploadType !== 'publisher' && handleToggleResultUploadType()}
                  className={cn(
                    "py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border",
                    currentUploadType === 'publisher' ? "bg-white border-indigo-200 text-indigo-600 shadow-sm" : "bg-transparent border-transparent text-slate-400"
                  )}
                >
                  ONLY PUBLISHER
                </button>
              </div>
              <p className="text-[8px] font-bold text-indigo-400/80 uppercase text-center">
                {currentUploadType === 'players' ? "Players are allowed to report their own match scores directly." : "Only the tournament host has authority to record match results."}
              </p>
            </div>
          </div>

          {/* Invitation Key (If invited) */}
          {(currentTournament?.entryType === 'invited') && (
            <div className="mx-2 p-6 rounded-[2rem] bg-amber-50 border-2 border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Lock size={20} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-amber-900 uppercase">Invitation Join Key</span>
                  <div className="text-lg font-black text-amber-600 tracking-widest">{currentTournament?.invitationKey || tournament.invitationKey}</div>
                </div>
              </div>
              <button 
                onClick={() => {
                  const key = currentTournament?.invitationKey || tournament.invitationKey;
                  if (key) { navigator.clipboard.writeText(key); alert('Key copied!'); }
                }}
                className="h-10 px-6 rounded-2xl bg-white border border-amber-200 text-[9px] font-black text-amber-600 uppercase shadow-sm active:scale-95"
              >
                Copy Key
              </button>
            </div>
          )}

          {/* Reported / Pending Match Results Portal in Manage Tab */}
          {matches.filter(m => m.status === 'disputed' || m.status === 'reported').length > 0 && (
            <div className="mx-2 p-6 rounded-[2.5rem] bg-white border-2 border-amber-200 space-y-4 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase italic">Reported & Pending Results</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      Admin & Publisher Verification Portal
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-[8px] font-black uppercase tracking-widest">
                  {matches.filter(m => m.status === 'disputed' || m.status === 'reported').length} Action Needed
                </span>
              </div>

              <div className="space-y-3">
                {matches
                  .filter(m => m.status === 'disputed' || m.status === 'reported')
                  .map(m => (
                    <div key={m.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          {m.stage === 'group' ? `Group ${m.groupId}` : m.stage} {m.matchId ? `· ID: ${m.matchId}` : ''}
                        </span>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-md text-[7.5px] font-black uppercase tracking-widest border",
                          m.status === 'disputed'
                            ? "bg-rose-50 text-rose-600 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {m.status === 'disputed' ? 'REPORTED BY OPPONENT' : 'PENDING CONFIRMATION'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-white border border-slate-100">
                        <span className="text-[10px] font-black text-slate-800 uppercase italic truncate flex-1 text-left">
                          {m.homePlayerName}
                        </span>
                        <span className="text-base font-black text-indigo-600 italic px-3">
                          {m.homeScore ?? 0} - {m.awayScore ?? 0}
                        </span>
                        <span className="text-[10px] font-black text-slate-800 uppercase italic truncate flex-1 text-right">
                          {m.awayPlayerName}
                        </span>
                      </div>

                      {m.disputeReason && m.status === 'disputed' && (
                        <p className="text-[8.5px] font-bold text-rose-700 bg-rose-50/80 border border-rose-200/70 rounded-xl px-3 py-2">
                          Report Note: {m.disputeReason}
                        </p>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleAdminResolve(m, 'approve')}
                          className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                        >
                          <CheckCircle size={11} /> Confirm Result
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUploadResult(m)}
                          className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                        >
                          <Edit3 size={11} /> Edit Result
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminResolve(m, 'reset')}
                          className="h-9 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
                        >
                          <RotateCcw size={11} /> Reset Match
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tournament Control (Reset / Delete) */}
          {hasMatches && (
            <div className="mx-2 p-8 rounded-[2.5rem] bg-emerald-50 border-2 border-emerald-100 text-center space-y-4 shadow-sm">
               <div className="w-16 h-16 rounded-[2rem] bg-white border-2 border-emerald-200 flex items-center justify-center text-emerald-500 mx-auto shadow-sm">
                 <CheckCircle size={32} />
               </div>
               <div>
                 <h4 className="text-sm font-black text-emerald-900 uppercase italic">Tournament Deployed</h4>
                 <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
                   {matches.length} matches are currently live and active
                 </p>
               </div>
               <div className="pt-4 border-t border-emerald-200/50 space-y-3">
                 <button 
                   onClick={handleResetTournament}
                   className="w-full py-4 rounded-2xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                 >
                   Emergency Reset (Tournament Reset)
                 </button>
                 <p className="text-[7px] font-bold text-slate-400 uppercase px-4">
                   Clears all matches and scores while keeping the player roster intact
                 </p>
               </div>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="px-2 pt-6 border-t border-slate-100">
          <div className="p-8 rounded-[2.5rem] bg-rose-50 border-2 border-rose-100 space-y-5 shadow-sm">
             <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-rose-500" />
                <span className="text-[10px] font-black text-rose-900 uppercase tracking-widest italic">Danger Zone</span>
             </div>
             <button 
               onClick={handleDeleteTournament}
               disabled={isDeletingTournament}
               className="w-full py-4 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all"
             >
               {isDeletingTournament ? 'Deleting...' : 'Permanently Delete Tournament'}
             </button>
             <p className="text-[8px] font-bold text-rose-400 uppercase text-center leading-relaxed">
               This action is irreversible. All data, matches, and registrations will be lost forever.
             </p>
          </div>
        </div>
      </div>
    );
  };

  const handleRejectRegistration = async (regId: string, regUserId?: string, regGameName?: string) => {
    if (!confirm('Are you sure you want to reject this player?')) return;
    try {
      if (isDemo) {
        updateDemoParticipant(tournament.id, regId, { status: 'rejected' });
        setParticipants(prev => prev.map(p => p.id === regId ? { ...p, status: 'rejected' } : p));
      } else {
        await updateDoc(doc(db, 'registrations', regId), {
          status: 'rejected',
          updatedAt: Timestamp.now()
        });
      }

      alert('Player rejected.');
    } catch (err) {
      console.error(err);
      alert('Failed to reject registration');
    }
  };

  const handleRemoveParticipant = async (reg: any) => {
    if (!confirm(`DANGER: Are you sure you want to PERMANENTLY REMOVE ${reg.gameName || 'this player'} from the tournament? This will delete their registration record and clear them from any assigned matches.`)) return;
    
    try {
      if (isDemo) {
        const updatedParticipants = participants.filter(p => p.id !== reg.id);
        saveDemoParticipants(tournament.id, updatedParticipants as any);
        setParticipants(updatedParticipants);
        
        setMatches(prev => {
          const updated = prev.map(m => {
            const up: any = {};
            if (m.homePlayerId === reg.userId) { up.homePlayerId = ''; up.homePlayerName = ''; }
            if (m.awayPlayerId === reg.userId) { up.awayPlayerId = ''; up.awayPlayerName = ''; }
            if (Object.keys(up).length > 0) return { ...m, ...up };
            return m;
          });
          saveDemoMatches(tournament.id, updated as any);
          return updated;
        });

        // Decrement filledSlots
        const newFilled = Math.max(0, (currentTournament?.filledSlots || 0) - 1);
        updateDemoTournament(tournament.id, { filledSlots: newFilled });
        setCurrentTournament((prev: any) => ({ ...prev, filledSlots: newFilled }));
      } else {
        // 1. Delete the registration
        await deleteDoc(doc(db, 'registrations', reg.id));
        
        // 2. Clear from matches where they are assigned
        const matchQueries = [
          query(collection(db, 'matches'), where('tournamentId', '==', tournament.id), where('homePlayerId', '==', reg.userId)),
          query(collection(db, 'matches'), where('tournamentId', '==', tournament.id), where('awayPlayerId', '==', reg.userId))
        ];

        for (const q of matchQueries) {
          const snap = await getDocs(q);
          for (const matchDoc of snap.docs) {
            const mData = matchDoc.data();
            const update: any = {};
            if (mData.homePlayerId === reg.userId) {
              update.homePlayerId = '';
              update.homePlayerName = '';
            }
            if (mData.awayPlayerId === reg.userId) {
              update.awayPlayerId = '';
              update.awayPlayerName = '';
            }
            if (Object.keys(update).length > 0) {
              await updateDoc(matchDoc.ref, update);
            }
          }
        }

        // 3. If the player was approved, decrement filledSlots
        if (reg.status === 'approved') {
          const tRef = doc(db, 'tournaments', tournament.id);
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) {
            const currentFilled = tSnap.data()?.filledSlots || 0;
            await updateDoc(tRef, {
              filledSlots: Math.max(0, currentFilled - 1)
            });
          }
        }
      }
      
      alert('Player permanently removed and cleared from matches.');
    } catch (err) {
      console.error('Error removing player:', err);
      alert('Failed to remove player.');
    }
  };

  const renderPlayerModal = () => {
    if (!selectedPlayerProfile) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-slate-900/40 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-0 overflow-hidden border-2 border-white shadow-2xl">
          <div className="relative h-32 bg-fc-dark overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-fc-green/40 to-transparent" />
            <button 
              onClick={() => setSelectedPlayerProfile(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center  active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="px-8 pb-10 -mt-12 relative z-10">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-white p-1 shadow-xl border-4 border-white flex items-center justify-center">
                <UserIcon size={40} className="text-slate-300" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight leading-none">
                  {selectedPlayerProfile.inGameName}
                </h3>
                {(profile?.role === 'admin' || selectedPlayerProfile.email === auth.currentUser?.email) && (
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedPlayerProfile.email}</span>
                )}
              </div>

              <div className="w-full grid grid-cols-1 gap-3">
                <div className="nm-inset rounded-2xl p-4 bg-slate-50 border border-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">In-Game ID</span>
                    <span className="text-xs font-black text-slate-800">{selectedPlayerProfile.inGameUID}</span>
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
      </div>,
      document.body
    );
  };

  const tabs = [
    ...(!isKnockoutOnly ? [{ id: 'group' as ArenaTab, icon: LayoutGrid, label: 'Groups' }] : []),
    { id: 'knockout' as ArenaTab, icon: GitPullRequest, label: 'Brackets' },
    { id: 'players' as ArenaTab, icon: List, label: 'Players' },
    { id: 'rules' as ArenaTab, icon: FileText, label: 'Rules' },
    { id: 'support' as ArenaTab, icon: CircleHelp, label: 'Support' },
    ...(isAdminUser ? [{ id: 'manage' as ArenaTab, icon: Settings, label: 'Manage' }] : []),
  ];




  const renderMatchCard = (match: Match) => {
    const homeProfile = profiles[match.homePlayerId];
    const awayProfile = profiles[match.awayPlayerId];
    const isHome = auth.currentUser?.uid === match.homePlayerId;
    const isAway = auth.currentUser?.uid === match.awayPlayerId;
    const isParticipant = isHome || isAway;
    const canAccessMatchChat = isHome || isAway || isAdminUser || isPublisher;
    const currentUploadType = currentTournament?.resultUploadType || tournament.resultUploadType || 'players';

    const homeWin = (match.homeScore || 0) > (match.awayScore || 0);
    const awayWin = (match.awayScore || 0) > (match.homeScore || 0);
    const isCompleted = match.status === 'completed';

    const getStageLabel = () => {
      if (match.stage === 'group') return `Group Stage · Group ${match.groupId}`;
      if (match.stage === 'R32') return 'Knockout · Round of 32';
      if (match.stage === 'R16') return 'Knockout · Round of 16';
      if (match.stage === 'QTR') return 'Knockout · Quarter Final';
      if (match.stage === 'SEMI') return 'Knockout · Semi Final';
      if (match.stage === 'FINAL') return 'Knockout · Grand Final';
      if (match.stage === '3RD_PLACE') return 'Knockout · 3rd Place Match';
      return match.stage;
    };

    return (
      <div key={match.id} className="nm-flat rounded-[2.5rem] p-0 border-2 border-white bg-white text-fc-dark space-y-0 relative overflow-hidden group transition-all hover:scale-[1.01] shadow-xl">
        {/* Background faint logo */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] grayscale pointer-events-none -mr-16 -mt-16">
           <Trophy size={120} />
        </div>

        <div className="p-4 sm:p-8 space-y-4 sm:space-y-8 relative z-10">
          <div className="flex items-center justify-between relative z-10">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isCompleted ? "bg-emerald-500 shadow-md" : "bg-amber-500 ")} />
                  <span className="text-[8.5px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{getStageLabel()}</span>
                </div>
                {match.matchId && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-bold text-slate-400">ID: {match.matchId}</span>
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
                {isAdminUser && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUploadResult(match);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 text-[8px] sm:text-[9px] font-black uppercase tracking-widest shadow-xs active:scale-95 transition-all"
                    title="Edit Match Result"
                  >
                    <Edit3 size={12} />
                    <span>EDIT</span>
                  </button>
                )}
                {isCompleted && (
                  <span className="text-[8px] sm:text-[9px] font-black text-white uppercase tracking-[0.2em] bg-fc-dark px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg shadow-md">RESULT FINAL</span>
                )}
                {match.status === 'reported' && (
                  <span className="text-[8px] sm:text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] bg-amber-50 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg border border-amber-200">PENDING VERIFICATION</span>
                )}
                {match.status === 'disputed' && (
                  <span className="text-[8px] sm:text-[9px] font-black text-red-500 uppercase tracking-[0.2em] bg-red-50 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg border border-red-200 ">DISPUTED</span>
                )}
              </div>
          </div>



          <div className="flex items-center justify-between px-0 relative z-10 gap-1.5 sm:gap-2">
            {/* Home Player */}
            <div className={cn(
              "flex flex-col items-center gap-2.5 sm:gap-4 flex-1 transition-all",
              isCompleted && awayWin ? "opacity-60 scale-95" : ""
            )}>
              <div className="flex flex-col items-center gap-1 min-h-[26px] sm:min-h-[32px]">
                <span className={cn("text-[8.5px] sm:text-[10px] font-black uppercase tracking-[0.2em]", homeWin ? "text-amber-500 font-black" : "text-slate-400")}>HOME</span>
              </div>
              <div className={cn(
                "w-14 h-14 xs:w-16 xs:h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2.5rem] bg-slate-900 border-2 sm:border-4 flex items-center justify-center overflow-hidden transition-all duration-700 shadow-xl relative",
                isCompleted && homeWin ? "border-amber-400 ring-2 sm:ring-4 ring-amber-400/80 shadow-md scale-105" : "border-white/50"
              )}>
                 <UserIcon size={24} className="text-slate-700 sm:w-8 sm:h-8" />
                 <div className="absolute inset-0 border border-white/10 rounded-[1.4rem] sm:rounded-[2.3rem] pointer-events-none" />
              </div>
              <div className="text-center">
                <h5 className={cn(
                  "text-xs sm:text-sm font-black uppercase italic tracking-tight transition-colors truncate max-w-[85px] sm:max-w-[130px]",
                  homeWin && isCompleted ? "text-amber-600 font-black" : homeWin ? "text-fc-dark" : "text-slate-500"
                )}>
                  {homeProfile?.inGameName || match.homePlayerName || 'Loading...'}
                </h5>
              </div>
            </div>

            {/* Score Box */}
            <div className="flex flex-col items-center gap-2 sm:gap-4 px-1 sm:px-2">
               {isCompleted || match.status === 'reported' || match.status === 'disputed' ? (
                 <div className="flex items-center gap-2 sm:gap-4">
                     <span 
                       className={cn(
                         "text-3xl xs:text-4xl sm:text-5xl font-black italic tracking-tighter",
                         homeWin && isCompleted ? "text-amber-500 drop-shadow-xs" : homeWin ? "text-fc-dark" : "text-slate-300"
                       )}
                     >
                       {match.homeScore || 0}
                     </span>
                     <div className="w-2.5 sm:w-4 h-0.5 sm:h-1 bg-slate-200 rounded-full" />
                     <span 
                       className={cn(
                         "text-3xl xs:text-4xl sm:text-5xl font-black italic tracking-tighter",
                         awayWin && isCompleted ? "text-amber-500 drop-shadow-xs" : awayWin ? "text-fc-dark" : "text-slate-300"
                       )}
                     >
                       {match.awayScore || 0}
                     </span>
                 </div>
               ) : (
                 <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-fc-dark border-2 border-white flex items-center justify-center shadow-md">
                   <span className="text-sm sm:text-lg font-black text-white italic">VS</span>
                 </div>
               )}
               <div className="bg-slate-50 px-2.5 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl border border-slate-100">
                  {match.status === 'scheduled' && match.scheduledTime ? (
                    <CountdownTimer targetTime={match.scheduledTime} />
                  ) : (
                    <span className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest italic">{match.status === 'reported' ? 'VERIFYING' : 'ARCHIVED'}</span>
                  )}
               </div>
            </div>

            {/* Away Player */}
            <div className={cn(
              "flex flex-col items-center gap-2.5 sm:gap-4 flex-1 transition-all",
              isCompleted && homeWin ? "opacity-60 scale-95" : ""
            )}>
              <div className="flex flex-col items-center gap-1 min-h-[26px] sm:min-h-[32px]">
                <span className={cn("text-[8.5px] sm:text-[10px] font-black uppercase tracking-[0.2em]", awayWin ? "text-amber-500 font-black" : "text-slate-400")}>AWAY</span>
                {isCompleted && awayWin && (
                  <div className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-300">
                    <Trophy size={9} fill="currentColor" />
                    <span className="text-[6.5px] sm:text-[7.5px] uppercase tracking-wider">Winner</span>
                  </div>
                )}
              </div>
              <div className={cn(
                "w-14 h-14 xs:w-16 xs:h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2.5rem] bg-slate-900 border-2 sm:border-4 flex items-center justify-center overflow-hidden transition-all duration-700 shadow-xl relative",
                isCompleted && awayWin ? "border-amber-400 ring-2 sm:ring-4 ring-amber-400/80 shadow-md scale-105" : "border-white/50"
              )}>
                 <UserIcon size={24} className="text-slate-700 sm:w-8 sm:h-8" />
                 <div className="absolute inset-0 border border-white/10 rounded-[1.4rem] sm:rounded-[2.3rem] pointer-events-none" />
              </div>
              <div className="text-center">
                <h5 className={cn(
                  "text-xs sm:text-sm font-black uppercase italic tracking-tight transition-colors truncate max-w-[85px] sm:max-w-[130px]",
                  awayWin && isCompleted ? "text-amber-600 font-black" : awayWin ? "text-fc-dark" : "text-slate-500"
                )}>
                  {awayProfile?.inGameName || match.awayPlayerName || 'Loading...'}
                </h5>
              </div>
            </div>
          </div>

          {/* Action Buttons & Two-Step Verification */}
          <div className="flex flex-wrap gap-3 pt-4 relative z-10 border-t border-slate-50">
            {/* Opponent Messenger Quick Contact */}
            {isParticipant && !isAdminUser && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const opponentProfile = isHome ? awayProfile : homeProfile;
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

            {/* Step 1: Scheduled Match - Home Player gets Upload Result button; Away Player sees waiting message */}
            {match.status === 'scheduled' && (
              <>
                {((isHome && currentUploadType === 'players') || isAdminUser) && (
                  <button 
                    onClick={() => handleUploadResult(match)}
                    className={cn(
                      "flex-1 min-w-[140px] h-12 rounded-xl text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform",
                      isAdminUser && !isHome ? "bg-fc-dark shadow-fc-dark/20" : "bg-fc-green shadow-fc-green/20"
                    )}
                  >
                    <Upload size={14} /> {isHome ? 'Upload Match Result' : 'Admin: Upload Result'}
                  </button>
                )}

                {isAway && !isAdminUser && currentUploadType === 'players' && (
                  <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                    <Clock size={14} className="text-amber-600 shrink-0 animate-pulse" />
                    <span>Waiting for opponent's update</span>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Home Player uploaded result (Pending) -> Home sees Pending status; Away sees Confirm Result & Report Result */}
            {match.status === 'reported' && !isAdminUser && (
              <>
                {isHome && (
                  <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                    <Clock size={14} className="text-amber-600 shrink-0 animate-pulse" />
                    <span>Pending Opponent Confirmation</span>
                  </div>
                )}

                {isAway && (
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

            {/* Step 2b: Disputed Status Banner for Players */}
            {match.status === 'disputed' && isParticipant && !isAdminUser && (
              <div className="flex-1 min-w-[160px] h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 px-4 text-center">
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span>Reported to Admin & Publisher for Review</span>
              </div>
            )}

            {/* Step 3: Admin & Publisher Resolution Portal (Confirm Result, Edit Result, Reset Match) */}
            {isAdminUser && (match.status === 'reported' || match.status === 'disputed') && (
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
                    onClick={() => handleUploadResult(match)}
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
      </div>
    );
  };

  const renderBracketSide = (side: 'left' | 'right', count: number) => {
    const stageMatches = matches.filter(m => m.stage === activeKnockoutStage);
    
    return (
      <div className="flex flex-col gap-2 xs:gap-2.5 sm:gap-4 justify-center w-[126px] xs:w-[145px] sm:w-[195px] md:w-[210px] shrink-0">
        {[...Array(count)].map((_, matchIdx) => {
          const actualIdx = side === 'left' ? matchIdx : (matchIdx + count);
          const matchNumber = actualIdx + 1;
          const matchSlotId = `${activeKnockoutStage}_M${matchNumber}`;
          const match = stageMatches.find(m => m.matchId === matchSlotId) || 
            stageMatches.find(m => !m.matchId && stageMatches.indexOf(m) === actualIdx);

          const homeProfile = match?.homePlayerId ? profiles[match.homePlayerId] : null;
          const awayProfile = match?.awayPlayerId ? profiles[match.awayPlayerId] : null;
          const homePlayerName = homeProfile?.inGameName || match?.homePlayerName || '';
          const awayPlayerName = awayProfile?.inGameName || match?.awayPlayerName || '';
          const isCompleted = match?.status === 'completed';
          const homeScore = match?.homeScore ?? 0;
          const awayScore = match?.awayScore ?? 0;
          const isHomeWinner = isCompleted && homeScore > awayScore;
          const isAwayWinner = isCompleted && awayScore > homeScore;

          return (
            <div key={matchIdx} className="space-y-0.5 group/fixture relative">
              {/* Home Player Box */}
              <div 
                onClick={() => handleSlotClick(matchSlotId, 'home', matchNumber, match)}
                title={isAdminUser ? "Click to assign or change Home Player" : undefined}
                className={cn(
                  "w-full h-7 xs:h-8 sm:h-9 md:h-10 flex items-center justify-between border transition-all shadow-xs select-none",
                  isAdminUser ? "cursor-pointer active:scale-[0.98] transition-transform" : "",
                  match?.homePlayerId 
                    ? (isHomeWinner
                        ? "bg-gradient-to-r from-slate-900 via-amber-950/70 to-slate-900 border-amber-400 shadow-md ring-1 sm:ring-1.5 ring-amber-400 text-white font-black"
                        : isAwayWinner
                          ? "bg-slate-950/75 border-slate-800/80 text-slate-500 opacity-55"
                          : "bg-slate-900 border-slate-800 text-white")
                    : (isAdminUser 
                        ? "bg-emerald-50/70 border-dashed border-emerald-400 hover:border-emerald-600 hover:bg-emerald-100/70" 
                        : "bg-slate-50 border-slate-200"),
                  side === 'left' ? "rounded-l-full rounded-r-md sm:rounded-r-xl pr-0.5 sm:pr-1 pl-1 xs:pl-1.5 sm:pl-3" : "rounded-r-full rounded-l-md sm:rounded-l-xl pl-0.5 sm:pl-1 pr-1 xs:pr-1.5 sm:pr-3"
                )}
              >
                {side === 'left' ? (
                  <>
                    <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 overflow-hidden flex-1 min-w-0">
                      <span className="text-[5.5px] xs:text-[6px] sm:text-[7px] font-black uppercase tracking-wider px-0.5 xs:px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                        HOME
                      </span>
                      {match?.homePlayerId ? (
                        <>
                          <div className={cn(
                            "w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden bg-slate-800 border shrink-0 flex items-center justify-center",
                            isHomeWinner ? "border-amber-400 ring-1 sm:ring-2 ring-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "border-white/20"
                          )}>
                            <span className="text-[6.5px] xs:text-[7px] sm:text-[8px] font-black text-white">{homePlayerName.charAt(0) || 'H'}</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-0.5 xs:gap-1 min-w-0">
                              <span className={cn(
                                "text-[7.5px] xs:text-[8.5px] sm:text-[10px] font-black uppercase tracking-tight italic truncate",
                                isHomeWinner ? "text-amber-300 drop-shadow-xs font-black" : isAwayWinner ? "text-slate-400" : "text-white"
                              )}>
                                {homePlayerName}
                              </span>
                              {isHomeWinner && (
                                <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 text-[5px] xs:text-[5.5px] sm:text-[6.5px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5 shadow-xs">
                                  <Trophy size={6} fill="currentColor" /> WIN
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className={cn(
                          "text-[7px] xs:text-[8px] sm:text-[9px] font-black uppercase tracking-wider italic truncate flex items-center gap-1",
                          isAdminUser ? "text-emerald-700 font-bold" : "text-slate-400"
                        )}>
                          {isAdminUser ? "+ Home" : "TBD"}
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      "w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-[9px] xs:text-[10px] sm:text-xs font-black italic shrink-0 transition-colors",
                      isHomeWinner 
                        ? "bg-gradient-to-tr from-amber-400 to-amber-300 text-slate-950 font-black shadow-md ring-1 ring-amber-300"
                        : isAwayWinner 
                          ? "bg-slate-900/60 text-slate-500 font-bold"
                          : match?.homePlayerId 
                            ? "bg-slate-800 text-amber-400" 
                            : "bg-slate-100 text-slate-400"
                    )}>
                      {isCompleted || match?.homeScore !== undefined 
                        ? (match?.homeScore ?? '-') 
                        : (isAdminUser && !match?.homePlayerId ? <Plus size={10} className="text-emerald-600" /> : '-')}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-[9px] xs:text-[10px] sm:text-xs font-black italic shrink-0 transition-colors",
                      isHomeWinner 
                        ? "bg-gradient-to-tr from-amber-400 to-amber-300 text-slate-950 font-black shadow-md ring-1 ring-amber-300"
                        : isAwayWinner 
                          ? "bg-slate-900/60 text-slate-500 font-bold"
                          : match?.homePlayerId 
                            ? "bg-slate-800 text-amber-400" 
                            : "bg-slate-100 text-slate-400"
                    )}>
                      {isCompleted || match?.homeScore !== undefined 
                        ? (match?.homeScore ?? '-') 
                        : (isAdminUser && !match?.homePlayerId ? <Plus size={10} className="text-emerald-600" /> : '-')}
                    </div>
                    <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 overflow-hidden flex-1 min-w-0 justify-end">
                      {match?.homePlayerId ? (
                        <>
                          <div className="flex flex-col min-w-0 text-right">
                            <div className="flex items-center gap-0.5 xs:gap-1 justify-end min-w-0">
                              {isHomeWinner && (
                                <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 text-[5px] xs:text-[5.5px] sm:text-[6.5px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5 shadow-xs">
                                  <Trophy size={6} fill="currentColor" /> WIN
                                </span>
                              )}
                              <span className={cn(
                                "text-[7.5px] xs:text-[8.5px] sm:text-[10px] font-black uppercase tracking-tight italic truncate",
                                isHomeWinner ? "text-amber-300 drop-shadow-xs font-black" : isAwayWinner ? "text-slate-400" : "text-white"
                              )}>
                                {homePlayerName}
                              </span>
                            </div>
                          </div>
                          <div className={cn(
                            "w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden bg-slate-800 border shrink-0 flex items-center justify-center",
                            isHomeWinner ? "border-amber-400 ring-1 sm:ring-2 ring-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "border-white/20"
                          )}>
                            <span className="text-[6.5px] xs:text-[7px] sm:text-[8px] font-black text-white">{homePlayerName.charAt(0) || 'H'}</span>
                          </div>
                        </>
                      ) : (
                        <span className={cn(
                          "text-[7px] xs:text-[8px] sm:text-[9px] font-black uppercase tracking-wider italic truncate flex items-center gap-1",
                          isAdminUser ? "text-emerald-700 font-bold" : "text-slate-400"
                        )}>
                          {isAdminUser ? "+ Home" : "TBD"}
                        </span>
                      )}
                      <span className="text-[5.5px] xs:text-[6px] sm:text-[7px] font-black uppercase tracking-wider px-0.5 xs:px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                        HOME
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Away Player Box */}
              <div 
                onClick={() => handleSlotClick(matchSlotId, 'away', matchNumber, match)}
                title={isAdminUser ? "Click to assign or change Away Player" : undefined}
                className={cn(
                  "w-full h-7 xs:h-8 sm:h-9 md:h-10 flex items-center justify-between border transition-all shadow-xs select-none",
                  isAdminUser ? "cursor-pointer active:scale-[0.98] transition-transform" : "",
                  match?.awayPlayerId 
                    ? (isAwayWinner
                        ? "bg-gradient-to-r from-slate-900 via-amber-950/70 to-slate-900 border-amber-400 shadow-md ring-1 sm:ring-1.5 ring-amber-400 text-white font-black"
                        : isHomeWinner
                          ? "bg-slate-950/75 border-slate-800/80 text-slate-500 opacity-55"
                          : "bg-slate-900 border-slate-800 text-white")
                    : (isAdminUser 
                        ? "bg-amber-50/70 border-dashed border-amber-400 hover:border-amber-600 hover:bg-amber-100/70" 
                        : "bg-slate-50 border-slate-200"),
                  side === 'left' ? "rounded-l-full rounded-r-md sm:rounded-r-xl pr-0.5 sm:pr-1 pl-1 xs:pl-1.5 sm:pl-3" : "rounded-r-full rounded-l-md sm:rounded-l-xl pl-0.5 sm:pl-1 pr-1 xs:pr-1.5 sm:pr-3"
                )}
              >
                {side === 'left' ? (
                  <>
                    <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 overflow-hidden flex-1 min-w-0">
                      <span className="text-[5.5px] xs:text-[6px] sm:text-[7px] font-black uppercase tracking-wider px-0.5 xs:px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                        AWAY
                      </span>
                      {match?.awayPlayerId ? (
                        <>
                          <div className={cn(
                            "w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden bg-slate-800 border shrink-0 flex items-center justify-center",
                            isAwayWinner ? "border-amber-400 ring-1 sm:ring-2 ring-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "border-white/20"
                          )}>
                            <span className="text-[6.5px] xs:text-[7px] sm:text-[8px] font-black text-white">{awayPlayerName.charAt(0) || 'A'}</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-0.5 xs:gap-1 min-w-0">
                              <span className={cn(
                                "text-[7.5px] xs:text-[8.5px] sm:text-[10px] font-black uppercase tracking-tight italic truncate",
                                isAwayWinner ? "text-amber-300 drop-shadow-xs font-black" : isHomeWinner ? "text-slate-400" : "text-white"
                              )}>
                                {awayPlayerName}
                              </span>
                              {isAwayWinner && (
                                <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 text-[5px] xs:text-[5.5px] sm:text-[6.5px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5 shadow-xs">
                                  <Trophy size={6} fill="currentColor" /> WIN
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className={cn(
                          "text-[7px] xs:text-[8px] sm:text-[9px] font-black uppercase tracking-wider italic truncate flex items-center gap-1",
                          isAdminUser ? "text-amber-700 font-bold" : "text-slate-400"
                        )}>
                          {isAdminUser ? "+ Away" : "TBD"}
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      "w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-[9px] xs:text-[10px] sm:text-xs font-black italic shrink-0 transition-colors",
                      isAwayWinner 
                        ? "bg-gradient-to-tr from-amber-400 to-amber-300 text-slate-950 font-black shadow-md ring-1 ring-amber-300"
                        : isHomeWinner 
                          ? "bg-slate-900/60 text-slate-500 font-bold"
                          : match?.awayPlayerId 
                            ? "bg-slate-800 text-amber-400" 
                            : "bg-slate-100 text-slate-400"
                    )}>
                      {isCompleted || match?.awayScore !== undefined 
                        ? (match?.awayScore ?? '-') 
                        : (isAdminUser && !match?.awayPlayerId ? <Plus size={10} className="text-amber-600" /> : '-')}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-[9px] xs:text-[10px] sm:text-xs font-black italic shrink-0 transition-colors",
                      isAwayWinner 
                        ? "bg-gradient-to-tr from-amber-400 to-amber-300 text-slate-950 font-black shadow-md ring-1 ring-amber-300"
                        : isHomeWinner 
                          ? "bg-slate-900/60 text-slate-500 font-bold"
                          : match?.awayPlayerId 
                            ? "bg-slate-800 text-amber-400" 
                            : "bg-slate-100 text-slate-400"
                    )}>
                      {isCompleted || match?.awayScore !== undefined 
                        ? (match?.awayScore ?? '-') 
                        : (isAdminUser && !match?.awayPlayerId ? <Plus size={10} className="text-amber-600" /> : '-')}
                    </div>
                    <div className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 overflow-hidden flex-1 min-w-0 justify-end">
                      {match?.awayPlayerId ? (
                        <>
                          <div className="flex flex-col min-w-0 text-right">
                            <div className="flex items-center gap-0.5 xs:gap-1 justify-end min-w-0">
                              {isAwayWinner && (
                                <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 text-[5px] xs:text-[5.5px] sm:text-[6.5px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5 shadow-xs">
                                  <Trophy size={6} fill="currentColor" /> WIN
                                </span>
                              )}
                              <span className={cn(
                                "text-[7.5px] xs:text-[8.5px] sm:text-[10px] font-black uppercase tracking-tight italic truncate",
                                isAwayWinner ? "text-amber-300 drop-shadow-xs font-black" : isHomeWinner ? "text-slate-400" : "text-white"
                              )}>
                                {awayPlayerName}
                              </span>
                            </div>
                          </div>
                          <div className={cn(
                            "w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden bg-slate-800 border shrink-0 flex items-center justify-center",
                            isAwayWinner ? "border-amber-400 ring-1 sm:ring-2 ring-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "border-white/20"
                          )}>
                            <span className="text-[6.5px] xs:text-[7px] sm:text-[8px] font-black text-white">{awayPlayerName.charAt(0) || 'A'}</span>
                          </div>
                        </>
                      ) : (
                        <span className={cn(
                          "text-[7px] xs:text-[8px] sm:text-[9px] font-black uppercase tracking-wider italic truncate flex items-center gap-1",
                          isAdminUser ? "text-amber-700 font-bold" : "text-slate-400"
                        )}>
                          {isAdminUser ? "+ Away" : "TBD"}
                        </span>
                      )}
                      <span className="text-[5.5px] xs:text-[6px] sm:text-[7px] font-black uppercase tracking-wider px-0.5 xs:px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                        AWAY
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSlotAssignModal = () => {
    if (!slotAssignModal) return null;
    const { stage, matchSlotId, role, matchNumber } = slotAssignModal;
    const currentMatchDoc = matches.find(m => m.matchId === matchSlotId || (slotAssignModal.existingMatch && m.id === slotAssignModal.existingMatch.id)) || slotAssignModal.existingMatch;

    const currentHome = currentMatchDoc?.homePlayerId ? {
      id: currentMatchDoc.homePlayerId,
      name: currentMatchDoc.homePlayerName,
      profile: profiles[currentMatchDoc.homePlayerId]
    } : null;

    const currentAway = currentMatchDoc?.awayPlayerId ? {
      id: currentMatchDoc.awayPlayerId,
      name: currentMatchDoc.awayPlayerName,
      profile: profiles[currentMatchDoc.awayPlayerId]
    } : null;

    const qualifiedIds = getQualifiedPlayerIds(stage);
    const approvedPlayers = participants.filter(p => p.status === 'approved');

    const matchesSearch = (p: any) => {
      const prof = profiles[p.userId];
      const name = (prof?.inGameName || p.gameName || '').toLowerCase();
      const q = playerSearchQuery.toLowerCase().trim();
      return !q || name.includes(q) || (prof?.inGameUID || p.gameUid || '').toLowerCase().includes(q);
    };

    const qualifiedPlayers = approvedPlayers.filter(p => {
      const isQual = !qualifiedIds || qualifiedIds.includes(p.userId);
      return isQual && matchesSearch(p);
    });

    const reservePlayers = approvedPlayers.filter(p => {
      const isReserve = Boolean(qualifiedIds && !qualifiedIds.includes(p.userId));
      return isReserve && matchesSearch(p);
    });

    const stageLabel = stage === 'R16' ? 'Round of 16' : 
                       stage === 'QTR' ? 'Quarter Final' : 
                       stage === 'SEMI' ? 'Semi Final' : 
                       stage === 'FINAL' ? 'Grand Final' : stage;

    const hasBoth = Boolean(currentHome?.id && currentAway?.id);
    const isReplacingSlot = Boolean((role === 'home' && currentHome?.id) || (role === 'away' && currentAway?.id));
    const stageMatches = matches.filter(m => m.stage === stage);

    const renderPlayerAssignRow = (p: any, isReservePlayer: boolean) => {
      const prof = profiles[p.userId];
      const displayName = prof?.inGameName || p.gameName || 'Player';
      const isSelectedForThisRole = (role === 'home' && currentHome?.id === p.userId) || 
                                    (role === 'away' && currentAway?.id === p.userId);
      const isSelectedForOtherRole = (role === 'home' && currentAway?.id === p.userId) || 
                                     (role === 'away' && currentHome?.id === p.userId);
      const assignedMatchInStage = stageMatches.find(
        m => m.homePlayerId === p.userId || m.awayPlayerId === p.userId
      );
      const assignedFixtureNum = assignedMatchInStage?.matchId?.split('_M')[1];

      return (
        <div 
          key={p.id}
          className={cn(
            "flex items-center justify-between p-3 rounded-2xl border transition-all",
            isSelectedForThisRole 
              ? (role === 'home' ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300")
              : isReservePlayer
                ? "bg-amber-50/30 border-amber-100/80 hover:bg-amber-50/60 hover:border-amber-200"
                : "bg-slate-50/70 border-slate-100 hover:bg-slate-100/70 hover:border-slate-200"
          )}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
            <div className={cn(
              "w-10 h-10 rounded-xl overflow-hidden border shrink-0 flex items-center justify-center",
              isReservePlayer ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-500"
            )}>
              <span className="text-xs font-black">{displayName.charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black uppercase italic text-slate-800 truncate">
                  {displayName}
                </span>
                <span className={cn(
                  "text-[6.5px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0",
                  isReservePlayer
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                )}>
                  {isReservePlayer ? 'Reserve' : 'Qualified'}
                </span>
                {p.groupId && p.groupId !== 'knockout' && (
                  <span className="text-[6.5px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 shrink-0">
                    Grp {p.groupId}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[8px] font-bold text-slate-400 uppercase">
                  UID: {prof?.inGameUID || p.gameUid || '-'}
                </span>
                {isSelectedForOtherRole && (
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">
                    Currently {role === 'home' ? 'Away' : 'Home'}
                  </span>
                )}
                {!isSelectedForThisRole && !isSelectedForOtherRole && assignedMatchInStage && (
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">
                    In Fixture #{assignedFixtureNum || '?'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleAssignPlayerToSlot(p)}
            disabled={actionLoading || isSelectedForThisRole || isSelectedForOtherRole}
            className={cn(
              "px-3.5 py-2 rounded-xl text-[8.5px] font-black uppercase tracking-wider shrink-0 transition-all",
              isSelectedForThisRole || isSelectedForOtherRole
                ? "bg-slate-200 text-slate-500 cursor-default"
                : (role === 'home' 
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95" 
                    : "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 active:scale-95")
            )}
          >
            {isSelectedForThisRole 
              ? 'Assigned' 
              : isSelectedForOtherRole
                ? `In ${role === 'home' ? 'AWAY' : 'HOME'}`
                : isReplacingSlot
                  ? `Replace ${role.toUpperCase()}`
                  : `Select as ${role.toUpperCase()}`}
          </button>
        </div>
      );
    };

    return createPortal(
      <div className="fixed inset-0 z-[9000] bg-slate-900/60 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl border-2 border-white/40 overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shadow-md",
                role === 'home' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
              )}>
                <UserPlus size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {stageLabel} · Fixture #{matchNumber}
                  </span>
                  <span className={cn(
                    "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                    role === 'home' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {isReplacingSlot ? `Replacing ${role.toUpperCase()}` : `Assigning ${role.toUpperCase()}`}
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight mt-0.5">
                  {isReplacingSlot 
                    ? `Change ${role === 'home' ? 'Home Player' : 'Away Player'}`
                    : `Assign ${role === 'home' ? 'Home Player' : 'Away Player'}`}
                </h3>
              </div>
            </div>
            <button 
              onClick={() => setSlotAssignModal(null)}
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Current Matchup Status Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-[8px] font-black uppercase text-slate-400 tracking-wider">
              <span>Fixture Pairing (Click slot to switch)</span>
              {hasBoth ? (
                <span className="text-emerald-600 flex items-center gap-1 font-black">
                  <CheckCircle size={10} /> Match Active · Select player below to replace
                </span>
              ) : (
                <span className="text-indigo-600 font-bold">
                  {currentHome || currentAway ? 'Add 2nd player to auto-create match' : 'Empty Fixture'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Home Slot Summary */}
              <button
                type="button"
                onClick={() => setSlotAssignModal({ ...slotAssignModal, role: 'home' })}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all flex items-center gap-2.5",
                  role === 'home' 
                    ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20" 
                    : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                  {currentHome?.name?.charAt(0) || 'H'}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[7px] font-black uppercase text-emerald-600 tracking-wider block">Home Player</span>
                  <span className="text-xs font-black uppercase italic text-slate-800 truncate block">
                    {currentHome?.name || '+ Assign Home'}
                  </span>
                </div>
              </button>

              {/* Away Slot Summary */}
              <button
                type="button"
                onClick={() => setSlotAssignModal({ ...slotAssignModal, role: 'away' })}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all flex items-center gap-2.5",
                  role === 'away' 
                    ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20" 
                    : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
                  {currentAway?.name?.charAt(0) || 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[7px] font-black uppercase text-amber-600 tracking-wider block">Away Player</span>
                  <span className="text-xs font-black uppercase italic text-slate-800 truncate block">
                    {currentAway?.name || '+ Assign Away'}
                  </span>
                </div>
              </button>
            </div>

            {hasBoth && (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleSwapHomeAway}
                  disabled={actionLoading}
                  className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-1.5"
                >
                  <ArrowLeftRight size={12} /> Swap Home & Away
                </button>
                <button
                  type="button"
                  onClick={handleDeleteMatchFixture}
                  disabled={actionLoading}
                  className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline flex items-center gap-1"
                >
                  <Trash2 size={12} /> Delete Match Fixture
                </button>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder={`Search qualified or reserve players for ${role.toUpperCase()} slot...`}
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
            {playerSearchQuery && (
              <button 
                onClick={() => setPlayerSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Scrollable Players Container: Qualified Players + Reserve Players List */}
          <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar min-h-[240px] max-h-[380px]">
            {/* Section 1: Qualified Players */}
            <div className="space-y-2">
              <div className="px-3 py-2 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy size={13} className="text-emerald-600 shrink-0" />
                  <span className="text-[8.5px] font-black text-emerald-800 uppercase tracking-widest">
                    Qualified Players ({stageLabel})
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200 text-[7.5px] font-black uppercase tracking-wider">
                  {qualifiedPlayers.length} Players
                </span>
              </div>

              {qualifiedPlayers.length === 0 ? (
                <div className="text-center py-6 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400">
                    No qualified players found
                  </p>
                  <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
                    You can assign or replace using the Reserve Players List below
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {qualifiedPlayers.map(p => renderPlayerAssignRow(p, false))}
                </div>
              )}
            </div>

            {/* Section 2: Reserve Players List (Non-Qualified Players) */}
            {qualifiedIds && (
              <div className="space-y-2 pt-2 border-t border-slate-200/80">
                <div className="px-3 py-2.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users size={14} className="text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[8.5px] font-black text-amber-900 uppercase tracking-widest block">
                        Reserve Players List
                      </span>
                      <span className="text-[7.5px] font-bold text-amber-700/90 uppercase tracking-wider block truncate">
                        Non-qualified players · Add to slot or replace a qualified player
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200 text-[7.5px] font-black uppercase tracking-wider shrink-0">
                    {reservePlayers.length} Reserve
                  </span>
                </div>

                {reservePlayers.length === 0 ? (
                  <div className="text-center py-6 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                    <p className="text-[9.5px] font-black uppercase text-slate-400">
                      No reserve players matching search
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reservePlayers.map(p => renderPlayerAssignRow(p, true))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {((role === 'home' && currentHome) || (role === 'away' && currentAway)) ? (
              <button
                type="button"
                onClick={handleClearSlotPlayer}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-[9px] font-black text-rose-600 hover:bg-rose-50 border border-rose-200 uppercase tracking-widest transition-all"
              >
                Clear {role.toUpperCase()} Slot
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={() => setSlotAssignModal(null)}
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderAutoMatchToast = () => {
    if (!autoMatchToast) return null;
    return createPortal(
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-4 shadow-2xl flex items-center justify-between text-white">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-500/40">
              <CheckCircle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-400 block">
                {autoMatchToast.title}
              </span>
              <p className="text-xs font-black uppercase italic text-white truncate">
                {autoMatchToast.subtitle}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setAutoMatchToast(null)}
            className="w-8 h-8 rounded-full bg-white/10 text-slate-300 hover:text-white flex items-center justify-center shrink-0 ml-2"
          >
            <X size={14} />
          </button>
        </div>
      </div>,
      document.body
    );
  };

  const renderDangerConfirmModal = () => {
    if (!confirmAction) return null;

    const isDelete = confirmAction.type === 'delete';

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-slate-900/60  flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] p-7 space-y-6 shadow-2xl border-2 border-white/40 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg",
              isDelete ? "bg-rose-600 shadow-rose-600/30" : "bg-amber-500 shadow-amber-500/30"
            )}>
              {isDelete ? <Trash2 size={26} /> : <RotateCcw size={26} />}
            </div>
            <div>
              <span className={cn(
                "text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider",
                isDelete ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
              )}>
                {isDelete ? 'PERMANENT DELETION' : 'TOURNAMENT RESET'}
              </span>
              <h3 className="text-base font-black text-slate-900 uppercase italic tracking-tight mt-1">
                {confirmAction.title}
              </h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-slate-600 text-xs font-semibold leading-relaxed">
            <p>{confirmAction.description}</p>
            {isDelete ? (
              <ul className="text-[11px] space-y-1 text-slate-500 pt-2 border-t border-slate-200/60 list-disc list-inside">
                <li>Tournament record will be completely deleted</li>
                <li>All fixtures, matches and scores will be erased</li>
                <li>Player registrations will be removed</li>
                <li>Tournament room chat history will be cleared</li>
              </ul>
            ) : (
              <ul className="text-[11px] space-y-1 text-slate-500 pt-2 border-t border-slate-200/60 list-disc list-inside">
                <li>All scheduled/played fixtures and scores will be erased</li>
                <li>Group or knockout player pairings will be reset</li>
                <li><strong className="text-slate-800">Player roster is preserved</strong> and ready for new match generation</li>
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={isResettingTournament || isDeletingTournament}
              className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (isDelete) {
                  await executeDeleteTournament();
                } else {
                  await executeResetTournament();
                }
              }}
              disabled={isResettingTournament || isDeletingTournament}
              className={cn(
                "flex-1 py-3.5 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50",
                isDelete ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30" : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30"
              )}
            >
              {(isResettingTournament || isDeletingTournament) ? (
                <>Processing...</>
              ) : (
                <>{confirmAction.confirmLabel}</>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderProgressionConfirmModal = () => {
    if (!progressionModal) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] p-7 space-y-6 shadow-2xl border-2 border-white/40 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/30">
                <Trophy size={26} />
              </div>
              <div>
                <span className="text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider bg-indigo-100 text-indigo-700">
                  ROUND PROGRESSION
                </span>
                <h3 className="text-base font-black text-slate-900 uppercase italic tracking-tight mt-1">
                  Advance to Next Round
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setProgressionModal(null)}
              disabled={isAdvancingRound}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 text-slate-700">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider border-b border-slate-200/70 pb-2.5">
              <span className="text-slate-400">Active Round</span>
              <span className="text-indigo-600">{progressionModal.currentStageLabel}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider border-b border-slate-200/70 pb-2.5">
              <span className="text-slate-400">Next Round</span>
              <span className="text-emerald-600">{progressionModal.nextStageLabel}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Matches Completed: {progressionModal.completedCount}/{progressionModal.totalCount}</span>
              <span>Qualified Players: {progressionModal.qualifiedCount}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-center">
            <p className="text-xs font-bold text-slate-800 leading-relaxed">
              Do you want to advance the qualified players of this round ({progressionModal.currentStageLabel}) in your tournament to the next round ({progressionModal.nextStageLabel})?
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setProgressionModal(null)}
              disabled={isAdvancingRound}
              className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmProgression}
              disabled={isAdvancingRound}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              {isAdvancingRound ? 'Advancing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderThirdPlaceMatch = () => {
    const match = matches.find(m => m.stage === '3RD_PLACE' || m.matchId === '3RD_PLACE_M1') || 
                  matches.find(m => m.stage === 'FINAL' && m.matchId === 'FINAL_M2');
    
    // Fallback match object for UI purposes if not found in DB
    const displayMatch = match || {
      stage: '3RD_PLACE',
      matchId: '3RD_PLACE_M1',
      status: 'draft',
      homePlayerId: '',
      awayPlayerId: '',
      homePlayerName: 'TBD',
      awayPlayerName: 'TBD',
      homeScore: 0,
      awayScore: 0
    };

    const homeProfile = displayMatch.homePlayerId ? profiles[displayMatch.homePlayerId] : null;
    const awayProfile = displayMatch.awayPlayerId ? profiles[displayMatch.awayPlayerId] : null;
    const homePlayerName = homeProfile?.inGameName || displayMatch.homePlayerName || 'TBD';
    const awayPlayerName = awayProfile?.inGameName || displayMatch.awayPlayerName || 'TBD';
    const isCompleted = displayMatch.status === 'completed';
    const homeScore = displayMatch.homeScore ?? 0;
    const awayScore = displayMatch.awayScore ?? 0;
    const isHomeWinner = isCompleted && homeScore > awayScore;
    const isAwayWinner = isCompleted && awayScore > homeScore;

    return (
      <div className="pt-16 border-t border-slate-100 mt-16 space-y-10 flex flex-col items-center">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-4">
             <div className="h-px w-10 bg-slate-200" />
             <h4 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] italic">3rd Place Match</h4>
             <div className="h-px w-10 bg-slate-200" />
          </div>
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Bronze Medal Battle</span>
        </div>
        
        <div className="w-[280px] xs:w-[320px] sm:w-[380px] nm-flat bg-white/50 p-6 rounded-[2.5rem] border-2 border-white/40 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Trophy size={48} className="text-indigo-400" />
          </div>
          
          <div className="space-y-3 relative z-10">
            {/* Home Player */}
            <div 
              onClick={() => handleSlotClick('3RD_PLACE_M1', 'home', 1, match, '3RD_PLACE')}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border transition-all select-none",
                isAdminUser ? "cursor-pointer hover:border-indigo-300 active:scale-95" : "",
                isHomeWinner ? "bg-amber-50 border-amber-200 shadow-sm" : "bg-white/80 border-slate-100"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center border-2",
                  isHomeWinner ? "bg-amber-500 text-white border-white" : 
                  (isAdminUser && !displayMatch.homePlayerId ? "bg-emerald-50 text-emerald-500 border-emerald-100" : "bg-slate-100 text-slate-400 border-white")
                )}>
                  {isAdminUser && !displayMatch.homePlayerId ? <Plus size={16} /> : <UserIcon size={16} />}
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">HOME</span>
                  <span className={cn(
                    "text-xs font-black uppercase italic truncate max-w-[120px]",
                    isHomeWinner ? "text-amber-700" : 
                    (!displayMatch.homePlayerId && isAdminUser ? "text-emerald-600" : "text-slate-700")
                  )}>
                    {!displayMatch.homePlayerId && isAdminUser ? "Assign Player" : homePlayerName}
                  </span>
                </div>
              </div>
              <div className={cn(
                "w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-sm font-black italic",
                isHomeWinner ? "bg-amber-100 text-amber-600 border-amber-200" : "bg-slate-50 text-slate-400"
              )}>
                {displayMatch.homeScore ?? '-'}
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center gap-2 py-1">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[8px] font-black text-slate-300 italic uppercase">VS</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* Away Player */}
            <div 
              onClick={() => handleSlotClick('3RD_PLACE_M1', 'away', 1, match, '3RD_PLACE')}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border transition-all select-none",
                isAdminUser ? "cursor-pointer hover:border-indigo-300 active:scale-95" : "",
                isAwayWinner ? "bg-amber-50 border-amber-200 shadow-sm" : "bg-white/80 border-slate-100"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center border-2",
                  isAwayWinner ? "bg-amber-500 text-white border-white" : 
                  (isAdminUser && !displayMatch.awayPlayerId ? "bg-emerald-50 text-emerald-500 border-emerald-100" : "bg-slate-100 text-slate-400 border-white")
                )}>
                  {isAdminUser && !displayMatch.awayPlayerId ? <Plus size={16} /> : <UserIcon size={16} />}
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">AWAY</span>
                  <span className={cn(
                    "text-xs font-black uppercase italic truncate max-w-[120px]",
                    isAwayWinner ? "text-amber-700" : 
                    (!displayMatch.awayPlayerId && isAdminUser ? "text-emerald-600" : "text-slate-700")
                  )}>
                    {!displayMatch.awayPlayerId && isAdminUser ? "Assign Player" : awayPlayerName}
                  </span>
                </div>
              </div>
              <div className={cn(
                "w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-sm font-black italic",
                isAwayWinner ? "bg-amber-100 text-amber-600 border-amber-200" : "bg-slate-50 text-slate-400"
              )}>
                {displayMatch.awayScore ?? '-'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleUpdatePlayerGroup = async (registrationId: string, newGroup: string) => {
    try {
      if (isDemo) {
        updateDemoParticipant(tournament.id, registrationId, { groupId: newGroup });
        setParticipants(prev => prev.map(p => p.id === registrationId ? { ...p, groupId: newGroup } : p));
      } else {
        await updateDoc(doc(db, 'registrations', registrationId), {
          groupId: newGroup
        });
      }
    } catch (err) {
      console.error('Error updating player group:', err);
      alert('Failed to update group');
    }
  };

  const renderParticipantsList = () => {
    return (
      <div className="space-y-6 ">
        <div className="grid grid-cols-1 gap-4">
          {participants.length === 0 ? (
            <div className="nm-flat rounded-[2.5rem] p-12 text-center border-2 border-white/20">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic">No players joined yet</p>
            </div>
          ) : (
            participants.map((reg) => {
              const p = profiles[reg.userId];
              return (
                <Card key={reg.id} className="p-6 border-none overflow-visible">
                  <div className="flex items-center justify-between gap-2">
                    <button 
                      onClick={() => p && setSelectedPlayerProfile(p)}
                      className="flex items-center gap-4 text-left group flex-1 min-w-0"
                    >
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-[1.2rem] nm-inset flex items-center justify-center border-2 border-white/40 overflow-hidden bg-slate-900 shadow-[0_0_15px_rgba(79,70,229,0.1)] group-hover:shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all duration-300">
                           <UserIcon size={24} className="text-slate-700" />
                           <div className="absolute inset-0 border border-indigo-500/20 rounded-[1.1rem] pointer-events-none" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-fc-green rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                          <Zap size={8} className="text-white fill-current" />
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-slate-800 uppercase italic group-hover:text-indigo-600 transition-colors truncate tracking-tight">{p?.inGameName || reg.gameName}</span>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <div className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                            reg.status === 'approved' ? "bg-emerald-50 text-emerald-600" : 
                            reg.status === 'rejected' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {reg.status}
                          </div>
                          {reg.groupId && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest border border-indigo-100">
                              Group {reg.groupId}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                       {isAdminUser && (
                         <div className="relative">
                           <select
                             value={reg.groupId || ''}
                             onChange={(e) => handleUpdatePlayerGroup(reg.id, e.target.value)}
                             className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer border border-slate-200 shadow-sm transition-all"
                           >
                             <option value="" disabled>Select Group</option>
                             {groups.map((g) => (
                               <option key={g} value={g}>Group {g}</option>
                             ))}
                           </select>
                         </div>
                       )}

                       {isAdminUser && (
                         <button 
                           onClick={() => handleRemoveParticipant(reg)}
                           className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100 hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                           title="Permanently Remove Player"
                         >
                           <Trash2 size={18} />
                         </button>
                       )}

                       {isPublisher && reg.status === 'pending' && (
                          <div className="flex gap-2">
                           <button 
                            onClick={() => handleApproveRegistration(reg.id)}
                            className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg active:scale-90"
                           >
                            <CheckCircle size={18} />
                           </button>
                           <button 
                            onClick={() => handleRejectRegistration(reg.id, reg.userId, reg.gameName)}
                            className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-90"
                           >
                            <X size={18} />
                           </button>
                         </div>
                       )}
                       {!isAdminUser && (
                         <div className="nm-flat w-12 h-12 rounded-xl flex items-center justify-center text-indigo-500 border border-white/40">
                           <Trophy size={18} />
                         </div>
                       )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'group':
        return (
          <div className="space-y-4 sm:space-y-6 ">
            {/* Group Selector */}
            <div className="flex overflow-x-auto gap-2 sm:gap-3 pb-2 no-scrollbar px-1">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={cn(
                    "min-w-[68px] sm:min-w-[80px] h-10 sm:h-12 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest transition-all border border-slate-200",
                    activeGroup === g 
                      ? "bg-slate-900 text-white shadow-md font-black" 
                      : "nm-flat text-black font-black bg-white hover:bg-slate-50"
                  )}
                >
                  Group {g}
                </button>
              ))}
            </div>

            {/* Group Header Info */}
            <div className="flex flex-col items-center justify-center gap-1 py-2">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em]">Active Tournament Group</span>
              <AnimatePresence mode="wait">
                <motion.h3
                  key={activeGroup}
                  initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter"
                >
                  Group {activeGroup}
                </motion.h3>
              </AnimatePresence>
              <div className="w-12 h-1 bg-red-600 rounded-full mt-1 opacity-20" />
            </div>

            {/* Points Table */}
            <div className="nm-flat rounded-2xl sm:rounded-[2rem] border sm:border-2 border-white/60 overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto no-scrollbar">
                <div className="min-w-[310px] sm:min-w-0">
                  {/* Table Header */}
                  <div className="bg-slate-50/90 px-1.5 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">
                    <div className="px-2 sm:px-3 flex items-center justify-between text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-slate-400">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 pr-1.5">
                        <span className="w-4 sm:w-5 text-center shrink-0">#</span>
                        <span className="truncate">ELITE PLAYER</span>
                      </div>
                      <div className="flex items-center text-center shrink-0 font-mono">
                        <span className="w-5 sm:w-6 text-center">P</span>
                        <span className="w-5 sm:w-6 text-center">W</span>
                        <span className="w-5 sm:w-6 text-center">D</span>
                        <span className="w-5 sm:w-6 text-center">L</span>
                        <span className="w-6 sm:w-7 text-center">GD</span>
                        <span className="w-7 sm:w-8 text-center text-slate-900 font-black">PTS</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-1.5 sm:px-3 py-1.5 sm:py-2 space-y-0.5 sm:space-y-1">
                  {participants.filter(r => r.groupId === activeGroup).length === 0 ? (
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] italic leading-loose text-center py-8">
                      NO PARTICIPANTS IN THIS GROUP YET
                    </p>
                  ) : (
                    calculateGroupTable(activeGroup).map((row, i) => {
                      const p = profiles[row.userId];
                      return (
                        <div 
                          key={row.userId} 
                          className={cn(
                            "flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all border",
                            i < 2 
                              ? "bg-indigo-50/40 border-indigo-100/60 hover:bg-indigo-50/70" 
                              : "bg-white border-transparent hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 pr-1.5">
                            <span className={cn(
                              "w-4 sm:w-5 text-center text-[9px] sm:text-[10px] font-black shrink-0 font-mono",
                              i < 2 ? "text-indigo-600" : "text-slate-300"
                            )}>
                              {i < 9 ? `0${i+1}` : i+1}
                            </span>
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                               <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200/50 shadow-xs flex items-center justify-center">
                                 <span className="text-[9px] font-black text-slate-400 uppercase">
                                   {(p?.inGameName || row.name || 'P').charAt(0)}
                                 </span>
                               </div>
                               <span className="text-[11px] sm:text-xs font-black text-slate-800 uppercase italic truncate tracking-tight">
                                 {p?.inGameName || row.name || `Player ${i + 1}`}
                               </span>
                            </div>
                          </div>
                          {/* Right: Exactly Aligned Stats Columns */}
                          <div className="flex items-center text-center shrink-0 font-mono text-[9px] sm:text-[10px] font-black">
                            <span className="w-5 sm:w-6 text-center text-slate-500">{row.played}</span>
                            <span className="w-5 sm:w-6 text-center text-slate-500">{row.won}</span>
                            <span className="w-5 sm:w-6 text-center text-slate-500">{row.drawn}</span>
                            <span className="w-5 sm:w-6 text-center text-slate-500">{row.lost}</span>
                            <span className={cn(
                              "w-6 sm:w-7 text-center font-bold",
                              row.gd > 0 ? "text-emerald-600" : row.gd < 0 ? "text-rose-500" : "text-slate-400"
                            )}>
                              {row.gd > 0 ? `+${row.gd}` : row.gd}
                            </span>
                            <span className="w-7 sm:w-8 text-center text-slate-900 font-black text-[10px] sm:text-xs">
                              {row.pts}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Table Footnote / Legend for Mobile */}
                <div className="px-3 py-1.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[7px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    Top 2 Qualify for Knockout
                  </span>
                  <span className="font-mono">P · W · D · L · GD · PTS</span>
                </div>
              </div>
            </div>
          </div>

            <div className="px-2 pt-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] italic">GROUP FIXTURES</h4>
              <div className="space-y-4 pt-6">
                 {matches
                   .filter(m => m.stage === 'group' && m.groupId === activeGroup)
                   .filter(m => !matchSearchQuery || (m.matchId && m.matchId.toUpperCase().includes(matchSearchQuery.toUpperCase())))
                   .map(renderMatchCard)}
              </div>
            </div>
          </div>
        );
      case 'knockout':
        return (
          <div className="space-y-6 sm:space-y-8  pb-8">
            {/* Stage Header Info */}
            <div className="flex items-center justify-center px-1">
              <div className="nm-inset rounded-2xl p-1 flex items-center gap-1 border border-white/20">
                 {knockoutStages.map((stage, idx) => (
                   <React.Fragment key={stage}>
                     <button 
                       onClick={() => setActiveKnockoutStage(stage)}
                       className={cn(
                        "px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-300",
                        activeKnockoutStage === stage 
                          ? "nm-flat bg-slate-900 text-red-600 shadow-md scale-105 font-black ring-2 ring-red-500/20" 
                          : "text-slate-900 font-black hover:bg-white/90 bg-white"
                      )}>
                       {stage === 'QTR' ? 'Quarter' : stage === 'SEMI' ? 'Semi' : stage === 'FINAL' ? 'Final' : stage}
                     </button>
                     {idx < knockoutStages.length - 1 && <div className="w-1 h-1 rounded-full bg-slate-200 mx-0.5" />}
                   </React.Fragment>
                 ))}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-1 mt-2">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em]">Current Tournament Stage</span>
              <AnimatePresence mode="wait">
                <motion.h3
                  key={activeKnockoutStage}
                  initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter"
                >
                  {activeKnockoutStage === 'R32' ? 'Round of 32' :
                   activeKnockoutStage === 'R16' ? 'Round of 16' :
                   activeKnockoutStage === 'QTR' ? 'Quarter Finals' :
                   activeKnockoutStage === 'SEMI' ? 'Semi Finals' :
                   activeKnockoutStage === 'FINAL' ? 'Grand Final' : 
                   activeKnockoutStage}
                </motion.h3>
              </AnimatePresence>
              <div className="w-12 h-1 bg-indigo-500 rounded-full mt-1 opacity-20" />
            </div>

            <div className="overflow-x-auto no-scrollbar pb-3">
              <div className={cn(
                "relative min-w-[320px] xs:min-w-[360px] sm:min-w-[500px] flex items-center min-h-[400px] sm:min-h-[500px] pt-2 sm:pt-6 px-0.5 sm:px-1",
                activeKnockoutStage === 'FINAL' ? "justify-center gap-6 sm:gap-12" : "justify-between"
              )}>
                {/* Left Bracket */}
                {renderBracketSide('left', 
                  activeKnockoutStage === 'R32' ? 8 :
                  activeKnockoutStage === 'R16' ? 4 : 
                  activeKnockoutStage === 'QTR' ? 2 : 1
                )}

                {/* Center Trophy / Final Placeholder */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center py-2 sm:py-4 px-1 sm:px-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl sm:blur-2xl rounded-full " />
                    <div className="w-20 xs:w-24 sm:w-34 md:w-36 h-36 xs:h-44 sm:h-56 md:h-60 nm-flat rounded-xl xs:rounded-2xl sm:rounded-[2.5rem] border-2 sm:border-4 border-white/50 flex flex-col items-center justify-center gap-1.5 sm:gap-3.5 relative z-10 bg-white/70  p-1.5 sm:p-3 shadow-xs">
                      <div className={cn(
                        "transition-all duration-1000",
                        activeKnockoutStage === 'FINAL' || tournament.status === 'finished' ? "scale-110 rotate-[360deg]" : ""
                      )}>
                        <Trophy strokeWidth={1.2} className={cn(
                          "transition-all duration-700 w-7 h-7 xs:w-9 xs:h-9 sm:w-11 sm:h-11",
                          tournament.status === 'finished' ? "text-amber-500" : "text-slate-300"
                        )} />
                      </div>
                      <div className="text-center px-0.5 sm:px-1 space-y-1 sm:space-y-1.5">
                        <span className="text-[7px] xs:text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] text-slate-400 block">
                          {tournament.status === 'finished' ? 'CHAMPION' : (activeKnockoutStage === 'FINAL' ? 'FINAL BATTLE' : 'GLORY')}
                        </span>
                        <div className="h-px w-6 sm:w-8 bg-slate-200 mx-auto" />
                        {tournament.status === 'finished' && (
                          <div className="pt-0.5 sm:pt-1">
                             <span className="text-[8.5px] xs:text-[10px] sm:text-xs font-black text-indigo-600 uppercase italic tracking-tight block truncate max-w-[70px] xs:max-w-[85px] sm:max-w-[120px]">
                               {tournament.winnerText || 'ELITE PLAYER'}
                             </span>
                             <div className="mt-1 sm:mt-1.5 w-8 h-8 xs:w-10 xs:h-10 sm:w-13 sm:h-13 rounded-lg sm:rounded-xl nm-inset mx-auto overflow-hidden border border-white/50 shadow-xs flex items-center justify-center">
                                <UserIcon size={16} className="text-slate-300 sm:w-5 sm:h-5" />
                             </div>
                          </div>
                        )}
                        {activeKnockoutStage === 'FINAL' && tournament.status !== 'finished' && (
                          <div className="pt-0.5 sm:pt-1 ">
                             <span className="text-[6.5px] sm:text-[7px] font-black text-indigo-500 uppercase tracking-widest">LIVE SOON</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Bracket */}
                {activeKnockoutStage !== 'FINAL' && renderBracketSide('right', 
                  activeKnockoutStage === 'R32' ? 8 :
                  activeKnockoutStage === 'R16' ? 4 : 
                  activeKnockoutStage === 'QTR' ? 2 : 1
                )}
              </div>
            </div>

            {/* Third Place Match Section */}
            {activeKnockoutStage === 'FINAL' && renderThirdPlaceMatch()}

            {/* Match Result Cards for Active Knockout Stage */}
            <div className="px-2 pt-12 border-t border-slate-100">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] italic mb-6">
                 {activeKnockoutStage} FIXTURES & RESULTS
               </h4>
               <div className="space-y-6">
                    {matches.filter(m => {
                      if (m.status === 'draft' || !m.homePlayerId || !m.awayPlayerId) return false;
                      if (activeKnockoutStage === 'FINAL') {
                        const isGrandFinal = m.stage === 'FINAL' && (m.matchId === 'FINAL_M1' || !m.matchId);
                        const isThirdPlace = m.stage === '3RD_PLACE' || m.matchId === '3RD_PLACE_M1' || (m.stage === 'FINAL' && m.matchId === 'FINAL_M2');
                        if (!isGrandFinal && !isThirdPlace) return false;
                      } else if (m.stage !== activeKnockoutStage) {
                        return false;
                      }
                      if (matchSearchQuery && (!m.matchId || !m.matchId.toUpperCase().includes(matchSearchQuery.toUpperCase()))) return false;
                      return true;
                    }).length === 0 ? (
                    <div className="nm-flat rounded-[2.5rem] p-12 text-center border-2 border-white/20">
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic">No matches scheduled for this stage</p>
                    </div>
                  ) : (
                    matches.filter(m => {
                      if (m.status === 'draft' || !m.homePlayerId || !m.awayPlayerId) return false;
                      if (activeKnockoutStage === 'FINAL') {
                        const isGrandFinal = m.stage === 'FINAL' && (m.matchId === 'FINAL_M1' || !m.matchId);
                        const isThirdPlace = m.stage === '3RD_PLACE' || m.matchId === '3RD_PLACE_M1' || (m.stage === 'FINAL' && m.matchId === 'FINAL_M2');
                        if (!isGrandFinal && !isThirdPlace) return false;
                      } else if (m.stage !== activeKnockoutStage) {
                        return false;
                      }
                      if (matchSearchQuery && (!m.matchId || !m.matchId.toUpperCase().includes(matchSearchQuery.toUpperCase()))) return false;
                      return true;
                    }).map(m => renderMatchCard(m))
                  )}
               </div>
            </div>
          </div>
        );

      case 'players':
        return renderParticipantsList();
      case 'rules':
        const displayRules = (currentTournament?.rules && currentTournament.rules.length > 0) 
          ? currentTournament.rules 
          : DEFAULT_RULES;

        return (
          <div className="nm-flat rounded-[2.5rem] p-8 border-4 border-white/40 space-y-6  bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase italic">Tournament Rules</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Official Guidelines & Regulations</p>
              </div>
              {isAdminUser && !editingRules && (
                <button
                  onClick={() => {
                    setEditableRules([...displayRules]);
                    setEditingRules(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 flex items-center gap-2 transition-all"
                >
                  <Edit3 size={14} /> Edit Rules
                </button>
              )}
            </div>

            {editingRules ? (
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Modify or add rules for this tournament:
                </p>
                {editableRules.map((rule, idx) => (
                  <div key={`rule-edit-${idx}`} className="flex items-center gap-2">
                    <span className="text-xs font-black text-indigo-500 w-6">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => {
                        const updated = [...editableRules];
                        updated[idx] = e.target.value;
                        setEditableRules(updated);
                      }}
                      placeholder={`Rule ${idx + 1}`}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500 bg-slate-50/50"
                    />
                    <button
                      onClick={() => {
                        const updated = editableRules.filter((_, i) => i !== idx);
                        setEditableRules(updated);
                      }}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      title="Remove Rule"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setEditableRules([...editableRules, ''])}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-slate-200 transition-all"
                  >
                    <Plus size={14} /> Add Rule
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingRules(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveRules}
                      disabled={savingRules}
                      className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      <Save size={14} /> {savingRules ? 'Saving...' : 'Save Rules'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {displayRules.map((ruleText: string, i: number) => (
                  <div key={i} className="flex gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-black text-indigo-500 min-w-[24px]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                      {ruleText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'support':
        const faqs = [
          {
            q: "How to deploy matches in a tournament?",
            a: "As a host, go to the 'Manage' tab. First, ensure you have enough approved players. Use 'Auto Group Setup' to distribute players into groups, and then click 'Auto Match Deploy' to generate the fixtures. You can also manually create matches if needed."
          },
          {
            q: "How do players advance to the next round?",
            a: "In 'Auto-Progression' mode, winners of group stages and subsequent knockout matches are automatically promoted to the next stage once all matches in the current stage are completed. Ensure 'Auto-Progression' is active in the Manage tab."
          },
          {
            q: "Who can report match results?",
            a: "By default, both players in a match can report the score. The opponent must then confirm the result. Alternatively, the host can change the setting in the Manage tab to 'Only Publisher' so only the tournament organizer can record scores."
          },
          {
            q: "What happens in case of a draw in knockout rounds?",
            a: "Knockout matches cannot end in a draw. If the score is tied, the app will prompt you to select a penalty shootout winner. The selected player will advance to the next round."
          },
          {
            q: "How to join a tournament?",
            a: "Find the tournament in the Arena list. If it's a public tournament, click 'Join Arena'. If it's private, you will need an Invitation Key provided by the host. Once your registration is approved by the host, you can participate in matches."
          },
          {
            q: "How to contact my opponent?",
            a: "Each match card has a Messenger icon. Clicking it will open the opponent's linked social profile for quick coordination. We also recommend joining the tournament's Messenger group link provided on the main banner."
          }
        ];

        return (
          <div className="space-y-6 pb-20">
            <div className="flex flex-col items-center text-center space-y-3">
               <div className="w-16 h-16 rounded-[2rem] nm-flat flex items-center justify-center text-emerald-500 border border-white/50 mb-2">
                 <CircleHelp size={32} />
               </div>
               <h3 className="text-xl font-black text-fc-dark uppercase italic leading-none">Support System</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose text-center max-w-xs">
                 Everything you need to know about <br /> competing in the Arena
               </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="nm-flat rounded-3xl p-6 bg-white border border-slate-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black italic">Q</span>
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight italic">{faq.q}</h4>
                  </div>
                  <div className="flex gap-3 pl-1">
                    <div className="w-8 h-px bg-slate-100 mt-2.5 shrink-0" />
                    <p className="text-[11px] font-bold text-slate-500 leading-relaxed uppercase">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 rounded-[2.5rem] bg-indigo-50 border-2 border-indigo-100 text-center space-y-4">
               <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-indigo-500 mx-auto shadow-sm">
                 <MessageSquare size={24} />
               </div>
               <div>
                 <h4 className="text-xs font-black text-indigo-900 uppercase italic">Still Need Help?</h4>
                 <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest mt-1">
                   Contact the Arena Administrators
                 </p>
               </div>
               <button 
                 onClick={() => window.open('https://t.me/your_admin_telegram', '_blank')}
                 className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
               >
                 Contact Support Team
               </button>
            </div>
          </div>
        );
      case 'manage':
        return renderManageTab();
      default:
        return null;
    }
  };

  const renderStatusBadge = () => {
    const t = currentTournament || tournament;
    const isFinished = t.status === 'finished' || t.status === 'completed';
    const isLive = t.status === 'ongoing' || (t.filledSlots !== undefined && t.totalSlots !== undefined && t.filledSlots >= t.totalSlots && !isFinished);

    if (isFinished) {
      return (
        <div className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-[8px] font-black uppercase tracking-widest border border-slate-700 flex items-center gap-2 shadow-sm ">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          END
        </div>
      );
    }

    if (isLive) {
      return (
        <div className="px-3.5 py-1.5 rounded-full bg-rose-500/30 text-rose-300 text-[8px] font-black uppercase tracking-widest border border-rose-500/40 flex items-center gap-2 shadow-sm ">
          <span className="w-2 h-2 rounded-full bg-rose-500  shadow-md" />
          LIVE
        </div>
      );
    }

    return (
      <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/30 text-emerald-300 text-[8px] font-black uppercase tracking-widest border border-emerald-500/40 flex items-center gap-2 shadow-sm ">
        <span className="relative flex h-2 w-2">
          <span className=" absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-md"></span>
        </span>
        UPCOMING
      </div>
    );
  };

  const publisherId = currentTournament?.publisherId || tournament.publisherId;
  const publisherProfile = publisherId ? profiles[publisherId] : null;
  const organizerDisplayName = 
    currentTournament?.organizerName || 
    currentTournament?.organizationName || 
    currentTournament?.publisherName || 
    tournament.organizerName || 
    tournament.organizationName || 
    tournament.publisherName || 
    publisherProfile?.inGameName || 
    publisherProfile?.leagueName || 
    'Official FC Host';

  return (
    <div className="min-h-screen bg-soft-bg pb-32 relative ">
      {renderReportResultModal()}

      {renderPlayerModal()}
      {renderSlotAssignModal()}
      {renderAutoMatchToast()}
      {renderDangerConfirmModal()}
      {renderProgressionConfirmModal()}
      
      {/* Professional Gaming Header */}
      <div className="flex items-center justify-between px-6 py-8">
        <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-fc-dark active:scale-90 transition-transform">
           <LayoutGrid size={20} className="rotate-45" />
        </button>
        <div className="flex flex-col items-center">
           <span className="text-[8px] font-black text-fc-green uppercase tracking-[0.4em] mb-1">PRO SERIES</span>
           <h2 className="text-xl font-black text-fc-dark uppercase italic tracking-tighter">TOURNAMENT HUB</h2>
        </div>
        <div className="flex gap-3">
          <button className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-fc-dark active:scale-90 transition-transform">
             <Clock size={20} />
          </button>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-6 space-y-10">
        {/* Tournament Identity Card / Banner */}
        <div className="nm-flat rounded-[3rem] p-3 border-2 border-white shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-fc-green/5 rounded-full -mr-16 -mt-16 blur-3xl" />
           <div className="relative min-h-[17.5rem] rounded-[2.5rem] overflow-hidden bg-fc-dark flex flex-col justify-between p-7 sm:p-8">
              {/* Card background image */}
              <div className="absolute inset-0 opacity-40 grayscale group-hover:scale-105 transition-transform duration-1000 pointer-events-none">
                 <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-fc-dark via-fc-dark/50 to-transparent pointer-events-none" />
              
              {/* Top Banner Row: Badges and Arena Chat button */}
              <div className="relative z-10 flex items-start justify-between gap-3">
                 <div className="flex flex-col gap-2.5">
                   <div className="flex items-center gap-2 flex-wrap">
                      {renderStatusBadge()}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(tournament.id);
                          alert('Tournament ID copied to clipboard!');
                        }}
                        className="px-3 py-1 rounded-full bg-white/10 text-[7px] font-black text-white uppercase tracking-widest border border-white/20 hover:bg-white/20 active:scale-95 transition-all flex items-center gap-1.5"
                        title="Copy Full ID"
                      >
                        <Copy size={8} />
                        ID: {tournament.id.slice(0, 8)}
                      </button>
                      <div className="px-3 py-1 rounded-full bg-white/10 text-[7px] font-black text-amber-300 uppercase tracking-widest border border-white/20">
                        {isKnockoutOnly ? 'Knockout' : 'Group + Knockout'}
                      </div>
                   </div>

                   {/* ORGANIZER / CREATOR BADGE ON BANNER */}
                   <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60  border border-white/20 text-white shadow-lg w-fit">
                     <div className="w-5 h-5 rounded-full bg-fc-green/20 border border-fc-green/40 flex items-center justify-center shrink-0">
                       <Shield size={11} className="text-fc-green" />
                     </div>
                     <span className="text-[8px] font-black tracking-widest text-slate-300 uppercase shrink-0">ORGANIZER:</span>
                     <span className="text-[10px] font-black text-fc-green uppercase tracking-wider truncate max-w-[180px] sm:max-w-xs">
                       {organizerDisplayName}
                     </span>
                     <span className="w-1.5 h-1.5 rounded-full bg-fc-green  shrink-0" />
                   </div>
                 </div>

                 {/* Messenger Group Link Button */}
                 {(isAdminUser || (registration && registration.status === 'approved')) && (currentTournament?.messengerGroupLink || tournament.messengerGroupLink) && (
                   <button 
                     onClick={() => window.open(currentTournament?.messengerGroupLink || tournament.messengerGroupLink, '_blank')}
                     className="w-12 h-12 rounded-2xl bg-[#00B2FF] text-white flex items-center justify-center shadow-lg active:scale-95 transition-all hover:scale-105 shrink-0"
                     title="Join Messenger Group"
                   >
                     <MessageCircle size={24} fill="white" />
                   </button>
                 )}
              </div>

              {/* Bottom Banner Row: Title and Participants/Join */}
              <div className="relative z-10 pt-4">
                 <h1 className="text-3xl sm:text-4xl font-black text-white uppercase italic leading-none tracking-tighter mb-4">{currentTournament?.title || tournament.title}</h1>
                 <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Participants</span>
                       <div className="flex items-center gap-2">
                          <Users size={12} className="text-fc-green" />
                          <span className="text-lg font-black text-white">{currentTournament?.filledSlots ?? tournament.filledSlots}/{currentTournament?.totalSlots ?? tournament.totalSlots}</span>
                       </div>
                    </div>
                    {registration ? (
                      <div className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                         <CheckCircle size={14} className="text-fc-green" /> Registered
                      </div>
                    ) : (
                      <button 
                        onClick={handleJoin}
                        className="px-8 py-3 rounded-xl bg-fc-green text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-fc-green/40 active:scale-95 transition-transform"
                      >
                         Join Arena
                      </button>
                    )}
                 </div>
              </div>
           </div>
        </div>

        {/* Tournament Stats Overview - Only visible to Admins/Publishers */}
        {isAdminUser && (
          <div className="grid grid-cols-2 gap-4">
            <div className="nm-flat rounded-[2rem] p-6 border-2 border-white bg-white/50  space-y-4">
               <div className="flex items-center justify-between">
                  <Users size={16} className="text-fc-green" />
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Players</span>
               </div>
               <div className="flex flex-col">
                  <div className="flex items-baseline gap-1.5">
                     <span className="text-xl font-black text-fc-dark">{participants.filter(p => p.status === 'approved').length}</span>
                     <span className="text-[10px] font-bold text-slate-400">APPROVED</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 opacity-60">
                     <span className="text-sm font-black text-amber-600">{participants.filter(p => p.status === 'pending').length}</span>
                     <span className="text-[8px] font-bold text-slate-400">PENDING</span>
                  </div>
               </div>
            </div>

            <div className="nm-flat rounded-[2rem] p-6 border-2 border-white bg-white/50  space-y-4">
               <div className="flex items-center justify-between">
                  <Clock size={16} className="text-indigo-500" />
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Matches</span>
               </div>
               <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                     <span className="text-[8px] font-bold text-slate-500">ONGOING</span>
                     <span className="text-sm font-black text-fc-dark">{matches.filter(m => m.status === 'scheduled').length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-[8px] font-bold text-slate-500">COMPLETED</span>
                     <span className="text-sm font-black text-fc-green">{matches.filter(m => m.status === 'completed').length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-[8px] font-bold text-slate-500">RESULT PENDING</span>
                     <span className="text-sm font-black text-amber-500">{matches.filter(m => m.status === 'reported' || m.status === 'disputed').length}</span>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* Tab Navigation - Professional Style */}
        <div className="flex items-center justify-between nm-inset rounded-[1.8rem] p-1.5 border-2 border-white shadow-inner bg-[#e6e6e9]">
           {tabs.map((tab) => {
             const Icon = tab.icon;
             const active = activeTab === tab.id;
             return (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={cn(
                   "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all duration-300",
                   active ? "bg-slate-900 text-white shadow-lg font-black" : "text-slate-600 hover:text-slate-900 font-black hover:bg-white/60"
                 )}
               >
                 <Icon size={18} className={active ? "text-white" : "text-slate-700"} />
                 <span className={cn("text-[8px] font-black uppercase tracking-tighter", active ? "text-white" : "text-slate-700")}>{tab.label}</span>
               </button>
             );
           })}
        </div>

        {/* Match Search Bar */}
        {(activeTab === 'group' || activeTab === 'knockout') && (
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <Search size={18} />
            </div>
            <input 
              type="text"
              placeholder="Search by Match ID..."
              value={matchSearchQuery}
              onChange={(e) => setMatchSearchQuery(e.target.value)}
              className="w-full h-14 pl-14 pr-6 rounded-2xl bg-white border-2 border-slate-100 focus:border-indigo-500 outline-none text-sm font-bold text-slate-700 transition-all shadow-sm placeholder:text-slate-400"
            />
            {matchSearchQuery && (
              <button 
                onClick={() => setMatchSearchQuery('')}
                className="absolute inset-y-0 right-5 flex items-center text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <div className="min-h-[400px]">
           {renderContent()}
        </div>
      </main>

      {/* Mode 3: Manual Group Setup Modal */}
      {showManualGroupModal && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/60  flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 space-y-6 max-h-[85vh] flex flex-col shadow-2xl border-2 border-white/20">
             <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                   <h3 className="text-sm font-black text-slate-900 uppercase italic">3. MANUAL GROUP SETUP</h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Assign players to groups manually</p>
                </div>
                <button onClick={() => setShowManualGroupModal(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors">
                  <X size={16} />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {participants.filter(p => p.status === 'approved').length === 0 ? (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-8 uppercase tracking-widest">No approved players found in this tournament.</p>
                ) : (
                  participants.filter(p => p.status === 'approved').map(p => {
                    const prof = profiles[p.userId];
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                         <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-white nm-inset overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                               <UserIcon size={20} className="text-slate-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                               <span className="text-xs font-black text-slate-900 uppercase italic block truncate">{prof?.inGameName || p.gameName}</span>
                            </div>
                         </div>
                         <select
                           value={p.groupId || ''}
                           onChange={(e) => handleUpdatePlayerGroup(p.id, e.target.value)}
                           className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-indigo-600 outline-none shadow-sm cursor-pointer"
                         >
                            <option value="" disabled>Select Group</option>
                            {groups.map(g => (
                              <option key={g} value={g}>Group {g}</option>
                            ))}
                         </select>
                      </div>
                    );
                  })
                )}
             </div>

             <Button onClick={() => setShowManualGroupModal(false)} className="w-full h-12 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                Save & Close Group Setup
             </Button>
          </div>
        </div>
      )}

      {/* Mode 4: Manual Match Deploy Modal */}
      {showManualMatchModal && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/60  flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 space-y-5 max-h-[85vh] flex flex-col overflow-y-auto shadow-2xl border-2 border-white/20">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                   <h3 className="text-sm font-black text-slate-900 uppercase italic">4. MANUAL MATCH DEPLOY</h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Create custom match fixture manually</p>
                </div>
                <button onClick={() => setShowManualMatchModal(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors">
                  <X size={16} />
                </button>
             </div>

             <div className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Home Player (Player 1)</label>
                   <select 
                     value={manualMatchForm.homeUserId}
                     onChange={(e) => setManualMatchForm({...manualMatchForm, homeUserId: e.target.value})}
                     className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black uppercase text-slate-800 outline-none"
                   >
                     <option value="">Select Home Player</option>
                     {participants.filter(p => p.status === 'approved').map(p => {
                       const prof = profiles[p.userId];
                       return (
                         <option key={p.userId} value={p.userId}>
                           {prof?.inGameName || p.gameName} (Group {p.groupId || '-'})
                         </option>
                       );
                     })}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Away Player (Player 2)</label>
                   <select 
                     value={manualMatchForm.awayUserId}
                     onChange={(e) => setManualMatchForm({...manualMatchForm, awayUserId: e.target.value})}
                     className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black uppercase text-slate-800 outline-none"
                   >
                     <option value="">Select Away Player</option>
                     {participants.filter(p => p.status === 'approved').map(p => {
                       const prof = profiles[p.userId];
                       return (
                         <option key={p.userId} value={p.userId}>
                           {prof?.inGameName || p.gameName} (Group {p.groupId || '-'})
                         </option>
                       );
                     })}
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Stage</label>
                      <select 
                        value={manualMatchForm.stage}
                        onChange={(e) => setManualMatchForm({...manualMatchForm, stage: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black uppercase text-slate-800 outline-none"
                      >
                        <option value="group">Group Stage</option>
                        <option value="R16">Round of 16</option>
                        <option value="QTR">Quarter Final</option>
                        <option value="SEMI">Semi Final</option>
                        <option value="FINAL">Final</option>
                      </select>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Group</label>
                      <select 
                        value={manualMatchForm.groupId}
                        onChange={(e) => setManualMatchForm({...manualMatchForm, groupId: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black uppercase text-slate-800 outline-none"
                      >
                        {groups.map(g => (
                          <option key={g} value={g}>Group {g}</option>
                        ))}
                      </select>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Date</label>
                      <input 
                        type="date" 
                        value={manualMatchForm.scheduledDate}
                        onChange={(e) => setManualMatchForm({...manualMatchForm, scheduledDate: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-2">Time</label>
                      <input 
                        type="time" 
                        value={manualMatchForm.scheduledTime}
                        onChange={(e) => setManualMatchForm({...manualMatchForm, scheduledTime: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                      />
                   </div>
                </div>

                <Button 
                  onClick={handleCreateManualMatch} 
                  disabled={actionLoading}
                  className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest mt-2 shadow-lg"
                >
                  {actionLoading ? 'Deploying...' : 'Deploy Custom Match Fixture'}
                </Button>
             </div>
          </div>
        </div>
      )}
      {/* Join Key Verification Modal */}
      {renderJoinKeyModal()}
    </div>
  );
};
