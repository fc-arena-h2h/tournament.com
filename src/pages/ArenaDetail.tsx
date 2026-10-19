import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { Trophy, LayoutGrid, List, FileText, GitPullRequest, Copy, UserPlus, Search, User as UserIcon, MessageSquare, Clock, Facebook, MessageCircle, Upload, CheckCircle, XCircle, X, Users, Settings, Zap, Edit3, Trash2, Save, Plus, Send, Lock, Camera, ArrowLeftRight, Shield, RotateCcw, AlertTriangle, AlertCircle, Phone } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, getDocs, deleteDoc, arrayRemove, runTransaction, Timestamp, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { sendAppNotification, notifyMatchParticipants } from '@/src/lib/notifications';



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

type ArenaTab = 'group' | 'knockout' | 'players' | 'rules' | 'manage';

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

  const isPublisher = (currentTournament?.publisherId || tournament.publisherId) === auth.currentUser?.uid;
  const isAdminUser = profile?.role === 'admin' || isPublisher;

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

  useEffect(() => {
    if (autoMatchToast) {
      const timer = setTimeout(() => setAutoMatchToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [autoMatchToast]);

  const handleSlotClick = (matchSlotId: string, role: 'home' | 'away', matchNumber: number, existingMatch?: Match) => {
    if (!isAdminUser) {
      const playerId = role === 'home' ? existingMatch?.homePlayerId : existingMatch?.awayPlayerId;
      if (playerId && profiles[playerId]) {
        setSelectedPlayerProfile(profiles[playerId]);
      }
      return;
    }

    setSlotAssignModal({
      stage: activeKnockoutStage,
      matchSlotId,
      role,
      matchNumber,
      existingMatch
    });
    setPlayerSearchQuery('');
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

        // Prompt to select the other player right away
        const nextRole: 'home' | 'away' = role === 'home' ? 'away' : 'home';
        setSlotAssignModal({
          stage,
          matchSlotId,
          role: nextRole,
          matchNumber,
          existingMatch: {
            id: newDocRef.id,
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
        await deleteDoc(doc(db, 'matches', currentMatchDoc.id));
      } else {
        await updateDoc(doc(db, 'matches', currentMatchDoc.id), {
          [role === 'home' ? 'homePlayerId' : 'awayPlayerId']: '',
          [role === 'home' ? 'homePlayerName' : 'awayPlayerName']: '',
          participants: [remainingId],
          status: 'draft',
          updatedAt: Timestamp.now()
        });
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
      await updateDoc(doc(db, 'matches', currentMatchDoc.id), {
        homePlayerId: currentMatchDoc.awayPlayerId || '',
        homePlayerName: currentMatchDoc.awayPlayerName || '',
        awayPlayerId: currentMatchDoc.homePlayerId || '',
        awayPlayerName: currentMatchDoc.homePlayerName || '',
        updatedAt: Timestamp.now()
      });
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
      await deleteDoc(doc(db, 'matches', currentMatchDoc.id));
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

          newMatches.push({
            tournamentId: tournament.id,
            matchId: `${stage}_M${Math.floor(i / 2) + 1}`,
            homePlayerId: p1.userId,
            awayPlayerId: p2.userId,
            homePlayerName: p1Profile?.inGameName || p1.gameName || 'Player 1',
            awayPlayerName: p2Profile?.inGameName || p2.gameName || 'Player 2',
            participants: [p1.userId, p2.userId],
            status: 'scheduled',
            stage: stage,
            groupId: 'knockout',
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
          for (let i = 0; i < gPlayers.length; i++) {
            for (let j = i + 1; j < gPlayers.length; j++) {
              const p1 = gPlayers[i];
              const p2 = gPlayers[j];
              const p1Profile = profiles[p1.userId];
              const p2Profile = profiles[p2.userId];

              newMatches.push({
                tournamentId: tournament.id,
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
            }
          }
        });
      }

      if (newMatches.length > 0) {
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

      const matchRef = await addDoc(collection(db, 'matches'), {
        tournamentId: tournament.id,
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

  const handleToggleAutoKnockout = async () => {
    setActionLoading(true);
    try {
      const nextVal = !(currentTournament?.autoKnockout ?? tournament.autoKnockout);
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        autoKnockout: nextVal,
        updatedAt: Timestamp.now()
      });
      setCurrentTournament((prev: any) => prev ? { ...prev, autoKnockout: nextVal } : prev);
      if (nextVal) {
        setTimeout(() => {
          evaluateAutoProgression();
        }, 200);
      }
    } catch (err) {
      console.error('Error toggling auto knockout:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'tournaments');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const cleanRules = editableRules.map(r => r.trim()).filter(r => r.length > 0);
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        rules: cleanRules,
        updatedAt: Timestamp.now()
      });
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

    // Combined Tournament & Match & Regs Listener
    // Idea 3: Real-time listeners only where necessary. 
    // Here we need tournament status, matches, and my own registration live.
    
    // Fetch user's registration for this tournament
    // Idea 3: Using a direct doc listener instead of query for better performance and deterministic ID
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
    const playersQ = query(
      collection(db, 'registrations'),
      where('tournamentId', '==', tournament.id)
    );

    let unsubPlayers: () => void;
    if (tournament.status === 'finished' || tournament.status === 'completed') {
      // One-time fetch for finished tournaments
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
  }, [tournament.id, auth.currentUser?.uid, tournament.status]);

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
      if (pubId && typeof pubId === 'string' && pubId.trim()) {
        uids.add(pubId.trim());
      }

      const missing = Array.from(uids).filter(uid => Boolean(uid) && !profiles[uid]);
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
      <div className="fixed inset-0 z-[9000] bg-slate-900/60 flex items-center justify-center p-6">
        <div className="w-full max-w-md nm-flat rounded-[2.5rem] border-2 border-white overflow-hidden shadow-2xl relative">
          {/* Header */}
          <div className="p-8 flex items-center justify-between border-b border-white/5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                   <Lock size={20} className="text-indigo-500" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-fc-dark uppercase italic tracking-tighter">INVITED ONLY</h3>
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
               className="w-10 h-10 rounded-full bg-white/5 text-slate-400 flex items-center justify-center active:scale-95"
             >
               <X size={20} />
             </button>
          </div>

          <div className="p-8 space-y-6">
             <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
               <p className="text-[10px] font-bold leading-relaxed">
                 This tournament is restricted to invited players only. Please enter the unique invitation key provided by the host to proceed with your join request.
               </p>
             </div>

             <div className="space-y-3">
               <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">Invitation Key</label>
               <input 
                 type="text"
                 placeholder="INV-XXXXXX"
                 value={enteredJoinKey}
                 onChange={(e) => setEnteredJoinKey(e.target.value.toUpperCase())}
                 className="w-full h-16 rounded-3xl bg-slate-900/50 border-2 border-white/5 focus:border-indigo-500 text-xl font-black text-center text-white outline-none transition-all uppercase"
               />
             </div>

             <button 
               onClick={verifyAndJoin}
               disabled={isVerifyingKey || !enteredJoinKey.trim()}
               className={cn(
                 "w-full h-18 rounded-[2rem] flex items-center justify-center text-[12px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-2xl",
                 isVerifyingKey || !enteredJoinKey.trim()
                   ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5" 
                   : "bg-gradient-to-r from-indigo-500 to-indigo-700 text-white shadow-indigo-500/20 hover:scale-[1.01]"
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



  const handleUploadResult = (match: Match) => {
    setReportingMatch(match);
    setReportFormData({ home: 0, away: 0, penaltyWinnerId: '' });
  };

  const submitFinalReport = async () => {
    if (!reportingMatch) return;


    // Knockout Stage: Draw is strictly prohibited (must have a decisive winner)
    const isKnockout = reportingMatch.stage !== 'group' || (tournament as any)?.format === 'knockout' || reportingMatch.groupId === 'knockout';
    if (isKnockout && reportFormData.home === reportFormData.away) {
      alert('Knockout matches cannot end in a draw! Extra time or penalties must decide a winner. Draw results cannot be submitted.');
      return;
    }

    setIsSubmittingReport(true);
    try {
      await updateDoc(doc(db, 'matches', reportingMatch.id), {
        homeScore: reportFormData.home,
        awayScore: reportFormData.away,
        penaltyWinnerId: reportFormData.penaltyWinnerId || null,
        status: isAdminUser ? 'completed' : 'reported',
        reporterId: auth.currentUser?.uid,
        updatedAt: Timestamp.now()
      });
      
      if (isAdminUser) {
        // Trigger automated progression immediately for admin reports
        const updatedMatches = matches.map(m => m.id === reportingMatch.id ? { 
          ...m, 
          status: 'completed' as const,
          homeScore: reportFormData.home,
          awayScore: reportFormData.away,
          penaltyWinnerId: reportFormData.penaltyWinnerId || null
        } : m);
        await evaluateAutoProgression(updatedMatches);
        alert('Match result recorded and finalized by Admin.');
      } else {
        alert('Result reported! Waiting for opponent to confirm.');
      }
      setReportingMatch(null);
    } catch (err) {
      console.error(err);
      alert('Error uploading result');
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



    return createPortal(
      <div className="fixed inset-0 z-[8000] bg-slate-900/60 flex items-center justify-center p-6">
        <div className="w-full max-w-md nm-flat rounded-[2.5rem] border-2 border-white overflow-hidden shadow-2xl relative">
          {/* Header */}
          <div className="p-8 flex items-center justify-between border-b border-white/5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                   <Upload size={20} className="text-amber-500" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">REPORT RESULT</h3>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                     {isKnockout ? 'Knockout Stage · Decisive Winner Required' : 'Submit proof and final scoreline'}
                   </p>
                </div>
             </div>
             <button 
               onClick={() => setReportingMatch(null)}
               className="w-10 h-10 rounded-full bg-white/5 text-slate-400 flex items-center justify-center active:scale-95"
             >
               <X size={20} />
             </button>
          </div>

          <div className="p-8 space-y-6">
             {/* Knockout Stage Rule Banner */}
             {isKnockout && (
               <div className={cn(
                 "p-3 rounded-2xl border text-center transition-all ",
                 isDraw 
                   ? "bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-md" 
                   : "bg-amber-500/10 border-amber-500/30 text-amber-300"
               )}>
                 <div className="flex items-center justify-center gap-2 mb-0.5">
                   {isDraw ? <AlertCircle size={14} className="text-rose-400" /> : <Trophy size={14} className="text-amber-400" />}
                   <span className="text-[9.5px] font-black uppercase tracking-wider">
                     {isDraw ? "Draw result is not permitted!" : "Knockout Stage: Winner Required"}
                   </span>
                 </div>
                 <p className="text-[8.5px] font-bold opacity-90 leading-relaxed">
                   {isDraw 
                     ? "Draw results cannot be submitted for knockout matches. Please record extra time or penalty shootout score in favor of the winner." 
                     : "Matches in this knockout stage cannot end in a draw. One player must advance as the winner."}
                 </p>
               </div>
             )}

             {/* Scores */}
             <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-3">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] text-center block truncate w-full px-2">{homeName}</label>
                   <input 
                     type="number"
                     min="0"
                     value={reportFormData.home}
                     onChange={(e) => setReportFormData({...reportFormData, home: Math.max(0, parseInt(e.target.value) || 0)})}
                     className={cn(
                       "w-full h-20 rounded-3xl bg-slate-900/50 border-2 text-3xl font-black text-center text-white outline-none transition-all",
                       isDrawBlocked ? "border-rose-500/40 focus:border-rose-500" : "border-white/5 focus:border-indigo-500"
                     )}
                   />
                </div>
                <span className="text-xl font-black text-slate-700 italic pt-6">VS</span>
                <div className="flex-1 space-y-3">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] text-center block truncate w-full px-2">{awayName}</label>
                   <input 
                     type="number"
                     min="0"
                     value={reportFormData.away}
                     onChange={(e) => setReportFormData({...reportFormData, away: Math.max(0, parseInt(e.target.value) || 0)})}
                     className={cn(
                       "w-full h-20 rounded-3xl bg-slate-900/50 border-2 text-3xl font-black text-center text-white outline-none transition-all",
                       isDrawBlocked ? "border-rose-500/40 focus:border-rose-500" : "border-white/5 focus:border-indigo-500"
                     )}
                   />
                </div>
             </div>



             {/* Penalty Winner Selection for Knockout Draws */}
             {isKnockout && isDraw && (
               <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                 <div className="flex flex-col items-center gap-2">
                   <div className="h-px w-full bg-slate-800" />
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4 bg-[#1a1f2e] -mt-3 relative z-10">Penalty Shootout Winner</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setReportFormData({...reportFormData, penaltyWinnerId: reportingMatch.homePlayerId})}
                     className={cn(
                       "h-12 rounded-2xl border-2 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                       reportFormData.penaltyWinnerId === reportingMatch.homePlayerId 
                         ? "bg-indigo-500/20 border-indigo-500 text-indigo-400 nm-inset" 
                         : "bg-slate-900/50 border-white/5 text-slate-400 hover:border-white/10"
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
                         ? "bg-indigo-500/20 border-indigo-500 text-indigo-400 nm-inset" 
                         : "bg-slate-900/50 border-white/5 text-slate-400 hover:border-white/10"
                     )}
                   >
                     {reportFormData.penaltyWinnerId === reportingMatch.awayPlayerId && <CheckCircle size={14} />}
                     {awayName}
                   </button>
                 </div>
               </div>
             )}

             {/* Deploy Button */}
             <button 
               onClick={submitFinalReport}
               disabled={isSubmittingReport || (isKnockout && isDraw && !reportFormData.penaltyWinnerId)}
               className={cn(
                 "w-full h-16 sm:h-20 rounded-[2rem] flex items-center justify-center text-[11px] sm:text-[13px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-2xl",
                 isSubmittingReport || (isKnockout && isDraw && !reportFormData.penaltyWinnerId)
                   ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5" 
                   : "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 shadow-orange-500/20 hover:scale-[1.01]"
               )}
             >
                {isSubmittingReport 
                  ? 'DEPLOYING...' 
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
    const reason = prompt('Why are you disputing this result? (Optional)');
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'disputed',
        disputeReason: reason || 'Incorrect score reported',
        updatedAt: Timestamp.now()
      });
      alert('Match disputed. An admin will review the result soon.');
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

          reporterId: null,
          updatedAt: Timestamp.now()
        });
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

  const upsertStageMatch = async (
    allActiveMatches: Match[],
    matchId: string,
    stage: string,
    homePlayer: { userId: string, name: string },
    awayPlayer: { userId: string, name: string }
  ) => {
    const existing = allActiveMatches.find(m => m.matchId === matchId || (m.stage === stage && m.matchId === matchId));
    if (existing) {
      await updateDoc(doc(db, 'matches', existing.id), {
        homePlayerId: homePlayer.userId,
        awayPlayerId: awayPlayer.userId,
        homePlayerName: homePlayer.name,
        awayPlayerName: awayPlayer.name,
        participants: [homePlayer.userId, awayPlayer.userId],
        status: 'scheduled',
        stage: stage,
        groupId: 'knockout',
        updatedAt: Timestamp.now()
      });
    } else {
      await addDoc(collection(db, 'matches'), {
        tournamentId: tournament.id,
        matchId: matchId,
        homePlayerId: homePlayer.userId,
        awayPlayerId: awayPlayer.userId,
        homePlayerName: homePlayer.name,
        awayPlayerName: awayPlayer.name,
        participants: [homePlayer.userId, awayPlayer.userId],
        status: 'scheduled',
        stage: stage,
        groupId: 'knockout',
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

      groups.forEach(gId => {
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
      if (rankedGroupKeys.length < 2) {
        throw new Error("Need at least 2 active groups with participants to generate knockout fixtures.");
      }

      let targetStage = 'R16';
      let pairings: { matchId: string; home: { userId: string, name: string }; away: { userId: string, name: string } }[] = [];

      // 8 Groups (A, B, C, D, E, F, G, H) -> FIFA World Cup Round of 16
      if (rankedGroupKeys.length >= 8 && ['A','B','C','D','E','F','G','H'].every(k => groupRankings[k])) {
        targetStage = 'R16';
        const wc8 = [
          { matchId: 'R16_M1', hG: 'A', hR: 1, aG: 'B', aR: 2 },
          { matchId: 'R16_M2', hG: 'C', hR: 1, aG: 'D', aR: 2 },
          { matchId: 'R16_M3', hG: 'E', hR: 1, aG: 'F', aR: 2 },
          { matchId: 'R16_M4', hG: 'G', hR: 1, aG: 'H', aR: 2 },
          { matchId: 'R16_M5', hG: 'B', hR: 1, aG: 'A', aR: 2 },
          { matchId: 'R16_M6', hG: 'D', hR: 1, aG: 'C', aR: 2 },
          { matchId: 'R16_M7', hG: 'F', hR: 1, aG: 'E', aR: 2 },
          { matchId: 'R16_M8', hG: 'H', hR: 1, aG: 'G', aR: 2 },
        ];
        pairings = wc8.map(p => ({
          matchId: p.matchId,
          home: p.hR === 1 ? groupRankings[p.hG].rank1 : groupRankings[p.hG].rank2,
          away: p.aR === 1 ? groupRankings[p.aG].rank1 : groupRankings[p.aG].rank2,
        }));
      } else if (rankedGroupKeys.length >= 4 && ['A','B','C','D'].every(k => groupRankings[k])) {
        // 4 Groups (A, B, C, D) -> Quarter Finals
        targetStage = 'QTR';
        const wc4 = [
          { matchId: 'QTR_M1', hG: 'A', hR: 1, aG: 'B', aR: 2 },
          { matchId: 'QTR_M2', hG: 'C', hR: 1, aG: 'D', aR: 2 },
          { matchId: 'QTR_M3', hG: 'B', hR: 1, aG: 'A', aR: 2 },
          { matchId: 'QTR_M4', hG: 'D', hR: 1, aG: 'C', aR: 2 },
        ];
        pairings = wc4.map(p => ({
          matchId: p.matchId,
          home: p.hR === 1 ? groupRankings[p.hG].rank1 : groupRankings[p.hG].rank2,
          away: p.aR === 1 ? groupRankings[p.aG].rank1 : groupRankings[p.aG].rank2,
        }));
      } else if (rankedGroupKeys.length >= 2 && ['A','B'].every(k => groupRankings[k])) {
        // 2 Groups (A, B) -> Semi Finals
        targetStage = 'SEMI';
        const wc2 = [
          { matchId: 'SEMI_M1', hG: 'A', hR: 1, aG: 'B', aR: 2 },
          { matchId: 'SEMI_M2', hG: 'B', hR: 1, aG: 'A', aR: 2 },
        ];
        pairings = wc2.map(p => ({
          matchId: p.matchId,
          home: p.hR === 1 ? groupRankings[p.hG].rank1 : groupRankings[p.hG].rank2,
          away: p.aR === 1 ? groupRankings[p.aG].rank1 : groupRankings[p.aG].rank2,
        }));
      } else {
        const totalQualifiers = rankedGroupKeys.length * 2;
        targetStage = totalQualifiers <= 2 ? 'FINAL' : totalQualifiers <= 4 ? 'SEMI' : totalQualifiers <= 8 ? 'QTR' : 'R16';
        for (let i = 0; i < rankedGroupKeys.length; i++) {
          const g1 = rankedGroupKeys[i];
          const g2 = rankedGroupKeys[(i + 1) % rankedGroupKeys.length];
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
        title: 'KNOCKOUT BRACKET ACTIVATED',
        subtitle: `Group stage concluded! Top 2 from each group advanced to ${targetStage} (World Cup format).`
      });
    } catch (err: any) {
      console.error('Error generating knockout matches:', err);
      handleFirestoreError(err, OperationType.WRITE, 'matches');
    } finally {
      setDeploying(false);
    }
  };

  // 0. Advance R32 -> R16
  const advanceR32ToR16 = async (r32Matches: Match[], allMatches: Match[]) => {
    const getWinner = (mNumber: number) => {
      const m = r32Matches.find(x => x.matchId === `R32_M${mNumber}`) || r32Matches[mNumber - 1];
      if (!m) return null;
      const wId = getWinnerId(m);
      if (!wId) return null;
      const name = (wId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[wId]?.inGameName || 'Player';
      return { userId: wId, name };
    };

    const pairs = [
      [1, 2], [3, 4], [5, 6], [7, 8],
      [9, 10], [11, 12], [13, 14], [15, 16]
    ];

    const updates = [];
    for (let i = 0; i < pairs.length; i++) {
      const h = getWinner(pairs[i][0]);
      const a = getWinner(pairs[i][1]);
      if (h && a) {
        updates.push(upsertStageMatch(allMatches, `R16_M${i + 1}`, 'R16', h, a));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      if (updates.length === 8) {
        setActiveTab('knockout');
        setActiveKnockoutStage('R16');
        setAutoMatchToast({
          title: 'ROUND OF 16 UNLOCKED',
          subtitle: 'Round of 32 completed! Winners have advanced to Round of 16.'
        });
      }
    }
  };

  // 1. Advance R16 -> QTR
  const advanceR16ToQTR = async (r16Matches: Match[], allMatches: Match[]) => {
    const getWinner = (mNumber: number) => {
      const m = r16Matches.find(x => x.matchId === `R16_M${mNumber}`) || r16Matches[mNumber - 1];
      if (!m) return null;
      const wId = getWinnerId(m);
      if (!wId) return null;
      const name = (wId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[wId]?.inGameName || 'Player';
      return { userId: wId, name };
    };

    const q1H = getWinner(1);
    const q1A = getWinner(2);
    const q2H = getWinner(3);
    const q2A = getWinner(4);
    const q3H = getWinner(5);
    const q3A = getWinner(6);
    const q4H = getWinner(7);
    const q4A = getWinner(8);

    if (q1H && q1A && q2H && q2A && q3H && q3A && q4H && q4A) {
      await Promise.all([
        upsertStageMatch(allMatches, 'QTR_M1', 'QTR', q1H, q1A),
        upsertStageMatch(allMatches, 'QTR_M2', 'QTR', q2H, q2A),
        upsertStageMatch(allMatches, 'QTR_M3', 'QTR', q3H, q3A),
        upsertStageMatch(allMatches, 'QTR_M4', 'QTR', q4H, q4A),
      ]);
      setActiveTab('knockout');
      setActiveKnockoutStage('QTR');
      setAutoMatchToast({
        title: 'QUARTER-FINALS UNLOCKED',
        subtitle: 'Round of 16 completed! Winners have advanced to Quarter-Finals.'
      });
    }
  };

  // 2. Advance QTR -> SEMI
  const advanceQTRToSEMI = async (qtrMatches: Match[], allMatches: Match[]) => {
    const getWinner = (mNumber: number) => {
      const m = qtrMatches.find(x => x.matchId === `QTR_M${mNumber}`) || qtrMatches[mNumber - 1];
      if (!m) return null;
      const wId = getWinnerId(m);
      if (!wId) return null;
      const name = (wId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[wId]?.inGameName || 'Player';
      return { userId: wId, name };
    };

    const s1H = getWinner(1);
    const s1A = getWinner(2);
    const s2H = getWinner(3);
    const s2A = getWinner(4);

    if (s1H && s1A && s2H && s2A) {
      await Promise.all([
        upsertStageMatch(allMatches, 'SEMI_M1', 'SEMI', s1H, s1A),
        upsertStageMatch(allMatches, 'SEMI_M2', 'SEMI', s2H, s2A),
      ]);
      setActiveTab('knockout');
      setActiveKnockoutStage('SEMI');
      setAutoMatchToast({
        title: 'SEMI-FINALS UNLOCKED',
        subtitle: 'Quarter-Finals completed! Winners have advanced to Semi-Finals.'
      });
    }
  };

  // 3. Advance SEMI -> FINAL & 3RD_PLACE
  const advanceSEMIToFINAL = async (semiMatches: Match[], allMatches: Match[]) => {
    const getWinnerAndLoser = (mNumber: number) => {
      const m = semiMatches.find(x => x.matchId === `SEMI_M${mNumber}`) || semiMatches[mNumber - 1];
      if (!m) return null;
      const wId = getWinnerId(m);
      const lId = getLoserId(m);
      if (!wId) return null;
      const wName = (wId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[wId]?.inGameName || 'Player';
      const lName = lId ? ((lId === m.homePlayerId ? m.homePlayerName : m.awayPlayerName) || profiles[lId]?.inGameName || 'Player') : '';
      return {
        winner: { userId: wId, name: wName },
        loser: lId ? { userId: lId, name: lName } : null
      };
    };

    const s1 = getWinnerAndLoser(1);
    const s2 = getWinnerAndLoser(2);

    if (s1 && s2) {
      const updates = [
        upsertStageMatch(allMatches, 'FINAL_M1', 'FINAL', s1.winner, s2.winner)
      ];
      if (s1.loser && s2.loser) {
        updates.push(
          upsertStageMatch(allMatches, '3RD_PLACE_M1', '3RD_PLACE', s1.loser, s2.loser)
        );
      }
      await Promise.all(updates);
      setActiveTab('knockout');
      setActiveKnockoutStage('FINAL');
      setAutoMatchToast({
        title: 'GRAND FINAL UNLOCKED',
        subtitle: 'Semi-Finals completed! Finalists are set for the championship match.'
      });
    }
  };

  // Automated Progression Evaluator
  const evaluateAutoProgression = async (providedMatches?: Match[]) => {
    const isAuto = currentTournament?.autoKnockout ?? tournament.autoKnockout;
    if (!isAuto) return;

    const currentList = providedMatches || matches;
    if (!currentList || currentList.length === 0) return;

    // 1. Group Stage -> Knockout
    const groupMatches = currentList.filter(m => m.stage === 'group');
    const knockoutMatches = currentList.filter(m => m.stage !== 'group' && m.status !== 'draft');

    if (groupMatches.length > 0 && groupMatches.every(m => m.status === 'completed')) {
      if (knockoutMatches.length === 0) {
        await generateKnockoutMatches(currentList);
        return;
      }
    }

    // 2. R32 -> R16
    const r32Matches = currentList.filter(m => m.stage === 'R32');
    if (r32Matches.length > 0 && r32Matches.every(m => m.status === 'completed')) {
      const r16Matches = currentList.filter(m => m.stage === 'R16');
      const r16NeedsUpdate = r16Matches.length === 0 || r16Matches.some(m => !m.homePlayerId || !m.awayPlayerId);
      if (r16NeedsUpdate) {
        await advanceR32ToR16(r32Matches, currentList);
        return;
      }
    }

    // 3. R16 -> QTR
    const r16Matches = currentList.filter(m => m.stage === 'R16');
    if (r16Matches.length > 0 && r16Matches.every(m => m.status === 'completed')) {
      const qtrMatches = currentList.filter(m => m.stage === 'QTR');
      const qtrNeedsUpdate = qtrMatches.length === 0 || qtrMatches.some(m => !m.homePlayerId || !m.awayPlayerId);
      if (qtrNeedsUpdate) {
        await advanceR16ToQTR(r16Matches, currentList);
        return;
      }
    }

    // 4. QTR -> SEMI
    const qtrMatches = currentList.filter(m => m.stage === 'QTR');
    if (qtrMatches.length > 0 && qtrMatches.every(m => m.status === 'completed')) {
      const semiMatches = currentList.filter(m => m.stage === 'SEMI');
      const semiNeedsUpdate = semiMatches.length === 0 || semiMatches.some(m => !m.homePlayerId || !m.awayPlayerId);
      if (semiNeedsUpdate) {
        await advanceQTRToSEMI(qtrMatches, currentList);
        return;
      }
    }

    // 5. SEMI -> FINAL
    const semiMatches = currentList.filter(m => m.stage === 'SEMI');
    if (semiMatches.length > 0 && semiMatches.every(m => m.status === 'completed')) {
      const finalMatches = currentList.filter(m => m.stage === 'FINAL' && m.matchId === 'FINAL_M1');
      const finalNeedsUpdate = finalMatches.length === 0 || finalMatches.some(m => !m.homePlayerId || !m.awayPlayerId);
      if (finalNeedsUpdate) {
        await advanceSEMIToFINAL(semiMatches, currentList);
        return;
      }
    }

    // 6. FINAL -> CHAMPION
    const finalMatch = currentList.find(m => m.stage === 'FINAL' && (m.matchId === 'FINAL_M1' || !m.matchId));
    if (finalMatch && finalMatch.status === 'completed') {
      const champId = getWinnerId(finalMatch);
      if (champId && (!currentTournament?.winnerId || currentTournament?.status !== 'finished')) {
        const champProfile = profiles[champId];
        const champName = champProfile?.inGameName || (champId === finalMatch.homePlayerId ? finalMatch.homePlayerName : finalMatch.awayPlayerName) || 'Champion';
        await updateDoc(doc(db, 'tournaments', tournament.id), {
          status: 'finished',
          winnerId: champId,
          winnerText: champName,
          updatedAt: Timestamp.now()
        });
        setAutoMatchToast({
          title: 'TOURNAMENT CHAMPION CROWNED!',
          subtitle: `${champName} is the Tournament Champion!`
        });
      }
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
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        updatedAt: Timestamp.now()
      });
      


      // Updated match list with this match set to completed
      const updatedMatches = matches.map(m => m.id === match.id ? { ...m, status: 'completed' as const } : m);

      // Trigger automated progression
      await evaluateAutoProgression(updatedMatches);

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

      // 3. Generate matches for each group (Home & Away)
      const groupNames = Array.from(new Set(shuffled.map((_, i) => groups[Math.floor(i / 4)] || 'H')));
      const matchBatch = [];

      for (const gName of groupNames) {
        const gPlayers = shuffled.filter((_, i) => (groups[Math.floor(i / 4)] || 'H') === gName);
        if (gPlayers.length < 2) continue;

        // Generate Home & Away matches
        for (let i = 0; i < gPlayers.length; i++) {
          for (let j = 0; j < gPlayers.length; j++) {
            if (i === j) continue;
            matchBatch.push(addDoc(collection(db, 'matches'), {
              tournamentId: tournament.id,
              homePlayerId: gPlayers[i].userId,
              awayPlayerId: gPlayers[j].userId,
              participants: [gPlayers[i].userId, gPlayers[j].userId],
              homePlayerName: gPlayers[i].gameName,
              awayPlayerName: gPlayers[j].gameName,
              status: 'scheduled',
              groupId: gName,
              stage: 'group',
              publisherId: tournament.publisherId,
              scheduledTime: Timestamp.now(),
              createdAt: Timestamp.now()
            }));
          }
        }
      }

      await Promise.all(matchBatch);

      // 4. Update tournament status
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        status: 'ongoing',
        updatedAt: Timestamp.now()
      });

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
      await updateDoc(doc(db, 'registrations', regId), {
        groupId: group,
        updatedAt: Timestamp.now()
      });
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

      // 3. Clear group & stage assignments from registrations, keeping players approved
      const regQuery = query(collection(db, 'registrations'), where('tournamentId', '==', tournament.id));
      const regSnap = await getDocs(regQuery);
      await Promise.all(regSnap.docs.map(d => updateDoc(doc(db, 'registrations', d.id), { 
        groupId: null,
        stage: null 
      })));

      // 4. Reset tournament status in Firestore
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        status: 'open',
        winnerId: null,
        winnerText: null,
        updatedAt: Timestamp.now()
      });

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
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        resultUploadType: nextVal,
        updatedAt: Timestamp.now()
      });
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
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        autoMatchDeploy: nextVal,
        updatedAt: Timestamp.now()
      });
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
            {/* 1. Auto-Progression (Auto Knockout) */}
            <div className="p-6 nm-flat rounded-[2rem] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-fc-dark uppercase block">১. অটো নকআউট প্রগ্রেস</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Auto-Progression System</span>
                  </div>
                </div>
                <button 
                  onClick={handleToggleAutoKnockout}
                  disabled={actionLoading}
                  className={cn(
                    "h-8 px-4 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border shadow-sm",
                    isAutoProgressionActive ? "bg-indigo-600 text-white border-indigo-700" : "bg-slate-100 text-slate-400 border-slate-200"
                  )}
                >
                  {isAutoProgressionActive ? "চালু আছে" : "বন্ধ আছে"}
                </button>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed italic">
                গ্রুপ পর্বের বিজয়ীরা স্বয়ংক্রিয়ভাবে নকআউট পর্বে যাবে এবং পরবর্তী রাউন্ডে অগ্রসর হবে।
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
                    <span className="text-[10px] font-black text-fc-dark uppercase block">২. অটোমেটিক গ্রুপ সেটাপ</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Auto Group Setup</span>
                  </div>
                </div>
                {isStep1Done && <span className="text-[9px] font-black text-emerald-600 uppercase italic">Done</span>}
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                প্লেয়ার লিস্টে থাকা প্লেয়ারদের স্বয়ংক্রিয়ভাবে গ্রুপে ভাগ করে দিবে। (প্রতি গ্রুপে ৪ জন)
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
                    <span className="text-[10px] font-black text-fc-dark uppercase block">৩. অটোমেটিক ম্যাচ ডিপ্লয়</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Auto Match Deploy</span>
                  </div>
                </div>
                {isStep2Done && <span className="text-[9px] font-black text-emerald-600 uppercase italic">Done</span>}
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                চালু করলে গ্রুপ ও নকআউট পর্বের ম্যাচগুলো অটোমেটিক তৈরি হবে।
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
                  <span className="text-[10px] font-black text-fc-dark uppercase block">৪. ম্যানুয়াল গ্রুপ সেটাপ</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Manual Group Setup</span>
                </div>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                পাবলিশার ম্যানুয়ালি প্রতিটি প্লেয়ারের গ্রুপ সিলেক্ট করে দিতে পারবেন।
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
                  <span className="text-[10px] font-black text-fc-dark uppercase block">৫. ম্যানুয়াল ম্যাচ ডিপ্লয়</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Manual Match Creation</span>
                </div>
              </div>
              <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed">
                পাবলিশার ম্যানুয়ালি যেকোনো দুটি প্লেয়ারের মধ্যে ম্যাচ তৈরি করতে পারবেন।
              </p>
            </button>

            {/* 6. Match Result Upload Type */}
            <div className="p-6 nm-flat rounded-[2rem] space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-900 uppercase">৬. ম্যাচ রেজাল্ট আপলোড টাইপ</span>
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
                  প্লেয়ার আপলোড
                </button>
                <button 
                  onClick={() => currentUploadType !== 'publisher' && handleToggleResultUploadType()}
                  className={cn(
                    "py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border",
                    currentUploadType === 'publisher' ? "bg-white border-indigo-200 text-indigo-600 shadow-sm" : "bg-transparent border-transparent text-slate-400"
                  )}
                >
                  অনলি পাবলিশার
                </button>
              </div>
              <p className="text-[8px] font-bold text-indigo-400/80 uppercase text-center">
                {currentUploadType === 'players' ? "প্লেয়াররা নিজেরাই ম্যাচ রেজাল্ট সাবমিট করতে পারবে।" : "শুধুমাত্র টুর্নামেন্ট পাবলিশার রেজাল্ট দিতে পারবেন।"}
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
                   Emergency Reset (টুর্নামেন্ট রিসেট)
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
                <span className="text-[10px] font-black text-rose-900 uppercase tracking-widest italic">Danger Zone (বিপদজনক এলাকা)</span>
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
      await updateDoc(doc(db, 'registrations', regId), {
        status: 'rejected',
        updatedAt: Timestamp.now()
      });

      alert('Player rejected.');
    } catch (err) {
      console.error(err);
      alert('Failed to reject registration');
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedPlayerProfile.email}</span>
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
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className={cn("w-2 h-2 rounded-full", isCompleted ? "bg-emerald-500 shadow-md" : "bg-amber-500 ")} />
                <span className="text-[8.5px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{getStageLabel()}</span>
             </div>
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
                  {homeProfile?.inGameName || 'Loading...'}
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
                  {awayProfile?.inGameName || 'Loading...'}
                </h5>
              </div>
            </div>
          </div>

          {/* Action Buttons & Two-Step Verification */}
          <div className="flex flex-wrap gap-3 pt-4 relative z-10 border-t border-slate-50">
            {/* Step 1: Upload Result (Any Participant can report) */}
            {/* Step 1: Upload Result (Participant or Admin depending on setting) */}
            {match.status === 'scheduled' && (
              (isParticipant && currentUploadType === 'players') || isAdminUser
            ) && (
              <button 
                onClick={() => handleUploadResult(match)}
                className={cn(
                  "flex-1 min-w-[140px] h-12 rounded-xl text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform",
                  isAdminUser ? "bg-fc-dark shadow-fc-dark/20" : "bg-fc-green shadow-fc-green/20"
                )}
              >
                <Upload size={14} /> {isAdminUser ? 'Admin: Report Result' : 'Step 1: Upload Score & Proof'}
              </button>
            )}
            
            {/* Step 2: Confirm or Dispute Result (Other Participant or Admin) */}
            {match.status === 'reported' && (isParticipant || isAdminUser) && match.reporterId !== auth.currentUser?.uid && (
              <>
                <button 
                  onClick={() => handleConfirmResult(match)}
                  className="flex-1 min-w-[120px] h-12 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
                >
                  <CheckCircle size={14} /> Step 2: Confirm Result
                </button>
                <button 
                  onClick={() => handleDisputeResult(match)}
                  className="flex-1 min-w-[100px] h-12 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
                >
                  <XCircle size={14} /> Dispute
                </button>
              </>
            )}

            {/* Admin Resolution */}
            {isAdminUser && (match.status === 'reported' || match.status === 'disputed') && (
              <div className="w-full flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Publisher / Admin Verification</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAdminResolve(match, 'approve')}
                    className="flex-1 h-9 rounded-lg bg-fc-dark text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle size={12} /> Confirm & Approve Result
                  </button>
                  <button 
                    onClick={() => handleAdminResolve(match, 'reset')}
                    className="flex-1 h-9 rounded-lg bg-white text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={12} /> Reset Match
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

    const approvedPlayers = participants.filter(p => p.status === 'approved');
    const filteredPlayers = approvedPlayers.filter(p => {
      const prof = profiles[p.userId];
      const name = (prof?.inGameName || p.gameName || '').toLowerCase();
      const q = playerSearchQuery.toLowerCase().trim();
      return !q || name.includes(q) || (prof?.inGameUID || '').toLowerCase().includes(q);
    });

    const stageLabel = stage === 'R16' ? 'Round of 16' : 
                       stage === 'QTR' ? 'Quarter Final' : 
                       stage === 'SEMI' ? 'Semi Final' : 
                       stage === 'FINAL' ? 'Grand Final' : stage;

    const hasBoth = Boolean(currentHome?.id && currentAway?.id);

    return createPortal(
      <div className="fixed inset-0 z-[9000] bg-slate-900/60  flex items-center justify-center p-4 ">
        <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-6 space-y-5 max-h-[90vh] flex flex-col shadow-2xl border-2 border-white/40 overflow-hidden">
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
                    Assigning {role.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight mt-0.5">
                  Assign {role === 'home' ? 'Home Player' : 'Away Player'}
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
              <span>Fixture Pairing</span>
              {hasBoth ? (
                <span className="text-emerald-600 flex items-center gap-1 font-black">
                  <CheckCircle size={10} /> Auto-Match Scheduled
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
              placeholder={`Search approved players for ${role.toUpperCase()} slot...`}
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
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

          {/* Approved Players List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[220px] max-h-[340px]">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Users size={32} className="text-slate-300 mx-auto" />
                <p className="text-xs font-black uppercase text-slate-400">No approved players found</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Approve player registrations in the Manage tab first
                </p>
              </div>
            ) : (
              filteredPlayers.map((p) => {
                const prof = profiles[p.userId];
                const displayName = prof?.inGameName || p.gameName || 'Player';
                const isSelectedForThisRole = (role === 'home' && currentHome?.id === p.userId) || 
                                              (role === 'away' && currentAway?.id === p.userId);
                const isSelectedForOtherRole = (role === 'home' && currentAway?.id === p.userId) || 
                                               (role === 'away' && currentHome?.id === p.userId);

                return (
                  <div 
                    key={p.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-2xl border transition-all",
                      isSelectedForThisRole 
                        ? (role === 'home' ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300")
                        : "bg-slate-50/70 border-slate-100 hover:bg-slate-100/70 hover:border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200 shrink-0 flex items-center justify-center">
                        <span className="text-xs font-black text-slate-400">{displayName.charAt(0)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase italic text-slate-800 truncate">
                            {displayName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">
                            UID: {prof?.inGameUID || p.gameUid || '-'}
                          </span>
                          {isSelectedForOtherRole && (
                            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">
                              Currently {role === 'home' ? 'Away' : 'Home'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAssignPlayerToSlot(p)}
                      disabled={actionLoading || isSelectedForThisRole}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0 transition-all",
                        isSelectedForThisRole 
                          ? "bg-slate-200 text-slate-500 cursor-default"
                          : (role === 'home' 
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95" 
                              : "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 active:scale-95")
                      )}
                    >
                      {isSelectedForThisRole ? 'Assigned' : `Select as ${role.toUpperCase()}`}
                    </button>
                  </div>
                );
              })
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

  const renderThirdPlaceMatch = () => {
    const match = matches.find(m => m.stage === '3RD_PLACE');
    if (!match) return null;

    return (
      <div className="pt-12 border-t border-slate-100 mt-12 space-y-8 ">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
             <div className="h-px w-8 bg-slate-200" />
             <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.25em] italic">3rd Place Match</h4>
             <div className="h-px w-8 bg-slate-200" />
          </div>
          <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Bronze Medal Battle</span>
        </div>
        <div className="px-4">
           {renderMatchCard(match)}
        </div>
      </div>
    );
  };

  const handleUpdatePlayerGroup = async (registrationId: string, newGroup: string) => {
    try {
      await updateDoc(doc(db, 'registrations', registrationId), {
        groupId: newGroup
      });
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
                 {matches.filter(m => m.stage === 'group' && m.groupId === activeGroup).map(renderMatchCard)}
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

            <div className="overflow-x-auto no-scrollbar pb-3">
              <div className="relative min-w-[320px] xs:min-w-[360px] sm:min-w-[500px] flex justify-between items-center min-h-[400px] sm:min-h-[500px] pt-2 sm:pt-6 px-0.5 sm:px-1">
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
                {renderBracketSide('right', 
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
                      return m.stage === 'FINAL'; // Only show Final in the bottom list if 3rd place has its own section
                    }
                    return m.stage === activeKnockoutStage;
                  }).length === 0 ? (
                    <div className="nm-flat rounded-[2.5rem] p-12 text-center border-2 border-white/20">
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic">No matches scheduled for this stage</p>
                    </div>
                  ) : (
                    matches.filter(m => {
                      if (m.status === 'draft' || !m.homePlayerId || !m.awayPlayerId) return false;
                      if (activeKnockoutStage === 'FINAL') return m.stage === 'FINAL';
                      return m.stage === activeKnockoutStage;
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
