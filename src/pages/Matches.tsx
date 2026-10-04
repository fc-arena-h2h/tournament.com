import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp, addDoc, deleteDoc, deleteField, getDoc, orderBy, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, Clock, CheckCircle, AlertCircle, Camera, Swords, Plus, User, ArrowRight, Zap, Trash2, X, MessageSquare, XCircle, UserPlus, Search, User as UserIcon, Upload, Send, Lock, Copy } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Reveal } from '@/src/components/ui/Reveal';
import { UserProfile } from '@/src/hooks/useAuth';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { logPointTransaction } from '@/src/lib/points';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMessageTimestamp, cleanupOldMessages } from '@/src/lib/chatUtils';

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
  scheduledTime?: Timestamp;
}

interface Challenge {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  creatorOvr: number;
  opponentId?: string;
  opponentName?: string;
  opponentAvatar?: string;
  opponentOvr?: number;
  status: 'waiting' | 'accepted' | 'reported' | 'completed' | 'disputed' | 'expired';
  entryFee: number;
  pot: number;
  minOvr?: number;
  maxOvr?: number;
  matchId?: string;
  expiresAt: Timestamp;
  winnerId?: string;
  homeScore?: number;
  awayScore?: number;
  screenshotUrl?: string;
  timestamp: Timestamp;
}

export const MatchesPage = ({ profile }: { profile: UserProfile | null }) => {
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'challenges'>('matches');
  const [matches, setMatches] = useState<Match[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [tournaments, setTournaments] = useState<Record<string, any>>({});
  const [activeMatchChat, setActiveMatchChat] = useState<Match | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<UserProfile | null>(null);
  const [reportingMatch, setReportingMatch] = useState<Match | null>(null);
  const [reportFormData, setReportFormData] = useState({ home: 0, away: 0, screenshot: '' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [nowTime, setNowTime] = useState<number>(Date.now());
  
  // Creation Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (expiresAt: Timestamp | undefined) => {
    if (!expiresAt) return { expired: true, text: '00:00', totalSeconds: 0 };
    const targetMs = expiresAt.toDate ? expiresAt.toDate().getTime() : 0;
    const diffMs = targetMs - nowTime;
    if (diffMs <= 0) return { expired: true, text: '00:00', totalSeconds: 0 };

    const totalSeconds = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return {
      expired: false,
      text: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      totalSeconds
    };
  };

  const [formData, setFormData] = useState({
    minOvr: 100,
    maxOvr: 150,
    duration: 5, // minutes
    matchId: ''
  });

  const isAdmin = profile?.role === 'admin';

  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (err) => reject(err);
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const base64 = await compressImageFile(file);
      setSelectedScreenshot(base64);
      setActionError(null);
    } catch (err) {
      console.error(err);
      setActionError('Failed to process screenshot.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleReportChallenge = async (challengeId: string) => {
    if (!selectedScreenshot) {
      setActionError('Match screenshot proof is required!');
      return;
    }

    try {
      await updateDoc(doc(db, 'challenges', challengeId), {
        homeScore: reportData.home,
        awayScore: reportData.away,
        screenshotUrl: selectedScreenshot,
        status: 'reported',
        reportedAt: Timestamp.now(),
        reporterId: auth.currentUser?.uid,
        updatedAt: Timestamp.now()
      });
      setReportingChallengeId(null);
      setSelectedScreenshot(null);
      setActionError(null);
    } catch (error: any) {
      console.error(error);
      setActionError(error?.message || 'Failed to submit result.');
    }
  };

  const handleOpponentConfirmResult = async (challenge: Challenge) => {
    try {
      const home = challenge.homeScore || 0;
      const away = challenge.awayScore || 0;
      let winnerId = '';
      let isDraw = false;

      if (home > away) {
        winnerId = challenge.creatorId;
      } else if (away > home) {
        winnerId = challenge.opponentId!;
      } else {
        isDraw = true;
      }

      // Distribute pot (200 points)
      if (isDraw) {
        // Refund 100 to creator
        const cRef = doc(db, 'users', challenge.creatorId);
        const cSnap = await getDoc(cRef);
        await updateDoc(cRef, { eliteScore: (cSnap.data()?.eliteScore || 0) + 100 });

        // Refund 100 to opponent
        if (challenge.opponentId) {
          const oRef = doc(db, 'users', challenge.opponentId);
          const oSnap = await getDoc(oRef);
          await updateDoc(oRef, { eliteScore: (oSnap.data()?.eliteScore || 0) + 100 });
        }
      } else if (winnerId) {
        const wRef = doc(db, 'users', winnerId);
        const wSnap = await getDoc(wRef);
        await updateDoc(wRef, { eliteScore: (wSnap.data()?.eliteScore || 0) + (challenge.pot || 200) });
      }

      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: isDraw ? 'draw' : winnerId,
        confirmedByOpponent: true,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (error: any) {
      console.error(error);
      setActionError(error?.message || 'Failed to confirm result.');
    }
  };

  const handleOpponentDisputeResult = async (challenge: Challenge) => {
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'disputed',
        disputedAt: Timestamp.now(),
        disputedBy: auth.currentUser?.uid,
        updatedAt: Timestamp.now()
      });
    } catch (error: any) {
      console.error(error);
      setActionError(error?.message || 'Failed to dispute match.');
    }
  };

  const handleAdminResolveChallenge = async (challenge: Challenge, winnerId: string) => {
    if (!isAdmin) return;
    try {
      const wRef = doc(db, 'users', winnerId);
      const wSnap = await getDoc(wRef);
      await updateDoc(wRef, {
        eliteScore: (wSnap.data()?.eliteScore || 0) + (challenge.pot || 200)
      });

      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: winnerId,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAdminPunishFake = async (challenge: Challenge) => {
    if (!isAdmin) return;
    try {
      // Creator uploaded fake submission penalty:
      // Creator gets 0 points refund (100 points entry fee forfeited).
      // Opponent gets only their 100 points entry fee refunded.
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
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      alert('Creator penalized 100 points for fake submission. Opponent refunded 100 points.');
    } catch (error) {
      console.error(error);
      alert('Failed to apply penalty.');
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch personal tournament matches
    const matchesQ = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );
    const unsubMatches = onSnapshot(matchesQ, async (snap) => {
      const matchData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchData);

      // Fetch tournament details
      const tIds = Array.from(new Set(matchData.map(m => m.tournamentId)));
      const tData = { ...tournaments };
      let tChanged = false;
      await Promise.all(tIds.map(async (tId) => {
        if (!tData[tId]) {
          const tSnap = await getDoc(doc(db, 'tournaments', tId));
          if (tSnap.exists()) {
            tData[tId] = { id: tSnap.id, ...tSnap.data() };
            tChanged = true;
          }
        }
      }));
      if (tChanged) setTournaments(tData);

      // Fetch player profiles
      const uids = new Set<string>();
      matchData.forEach(m => {
        uids.add(m.homePlayerId);
        uids.add(m.awayPlayerId);
      });
      const missing = Array.from(uids).filter(uid => !profiles[uid]);
      if (missing.length > 0) {
        const pData = { ...profiles };
        let pChanged = false;
        await Promise.all(missing.map(async (uid) => {
          const pSnap = await getDoc(doc(db, 'users', uid));
          if (pSnap.exists()) {
            pData[uid] = pSnap.data() as UserProfile;
            pChanged = true;
          }
        }));
        if (pChanged) setProfiles(pData);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'matches');
    });

    // Listen to challenges
    const cq = query(
      collection(db, 'challenges'),
      orderBy('timestamp', 'desc')
    );

    const unsubChallenges = onSnapshot(cq, (snapshot) => {
      const challengeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge));
      setChallenges(challengeData);
      if (activeSubTab === 'challenges') setLoading(false);

      // Auto-delete verified screenshots after 24 hours to save storage
      const nowMs = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        // 1. Auto-expire waiting challenges when timer runs out & refund entry fee
        if (data.status === 'waiting' && data.expiresAt) {
          const expMs = data.expiresAt.toDate ? data.expiresAt.toDate().getTime() : 0;
          if (expMs > 0 && nowMs >= expMs) {
            updateDoc(doc(db, 'challenges', docSnap.id), {
              status: 'expired',
              expiredAt: Timestamp.now()
            }).then(async () => {
              if (data.creatorId) {
                const cRef = doc(db, 'users', data.creatorId);
                const cSnap = await getDoc(cRef);
                if (cSnap.exists()) {
                  await updateDoc(cRef, { eliteScore: (cSnap.data()?.eliteScore || 0) + 100 });
                  await logPointTransaction(data.creatorId, 'refunded', 100, 'Expired Challenge Refund', '100 points entry fee refunded because no opponent joined in time');
                }
              }
            }).catch(err => console.error("Auto expire challenge error:", err));
          }
        }

        // 2. Auto-delete verified screenshots after 24 hours to save storage
        if (data.status === 'completed' && data.screenshotUrl) {
          const completedTime = data.completedAt ? data.completedAt.toDate().getTime() : (data.updatedAt ? data.updatedAt.toDate().getTime() : 0);
          if (completedTime > 0 && (nowMs - completedTime > twentyFourHoursMs)) {
            updateDoc(doc(db, 'challenges', docSnap.id), {
              screenshotUrl: deleteField(),
              screenshotCleared: true
            }).catch(err => console.error("Auto cleanup screenshot error:", err));
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'challenges');
    });

    // Initial loading state
    setTimeout(() => setLoading(false), 1000);

    return () => {
      unsubMatches();
      unsubChallenges();
    };
  }, [activeSubTab, auth.currentUser?.uid]);

  // Chat Effect
  useEffect(() => {
    if (!activeMatchChat) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', activeMatchChat.id)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const sorted = msgs.sort((a: any, b: any) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setMessages(sorted);

      // Seen status update
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        sorted.forEach(msg => {
          if (msg.senderId !== currentUid && (!msg.seenBy || !msg.seenBy.includes(currentUid))) {
            updateDoc(doc(db, 'messages', msg.id), {
              seenBy: arrayUnion(currentUid)
            }).catch(e => console.error("Seen update failed", e));
          }
        });
      }
    });

    return () => unsubscribe();
  }, [activeMatchChat]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeMatchChat) return;

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: activeMatchChat.id,
        tournamentId: activeMatchChat.tournamentId,
        senderId: auth.currentUser?.uid || '',
        senderName: profile?.inGameName || 'Player',
        senderAvatar: profile?.avatar || '',
        text: newMessage,
        timestamp: Timestamp.now(),
        reactions: {},
        seenBy: [auth.currentUser?.uid]
      });
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'messages', msgId));
      setActiveMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `messages/${msgId}`);
    }
  };

  const reactToMessage = async (msgId: string, emoji: string) => {
    if (!auth.currentUser) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const userReactions = msg.reactions?.[emoji] || [];
    const hasReacted = userReactions.includes(auth.currentUser.uid);

    try {
      await updateDoc(doc(db, 'messages', msgId), {
        [`reactions.${emoji}`]: hasReacted ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
      });
      setActiveMenu(null);
    } catch (error) {
      console.error("Reaction failed", error);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 720;
          if (width > height) {
            if (width > max) {
              height = Math.round((height * max) / width);
              width = max;
            }
          } else {
            if (height > max) {
              width = Math.round((width * max) / height);
              height = max;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
      };
    });
  };

  const handleUploadResult = (match: Match) => {
    setReportingMatch(match);
    setReportFormData({ home: 0, away: 0, screenshot: '' });
  };

  const submitFinalReport = async () => {
    if (!reportingMatch) return;
    if (!reportFormData.screenshot) return alert('Please upload match result screenshot');

    setIsSubmittingReport(true);
    try {
      await updateDoc(doc(db, 'matches', reportingMatch.id), {
        homeScore: reportFormData.home,
        awayScore: reportFormData.away,
        status: 'reported',
        reporterId: auth.currentUser?.uid,
        screenshotUrl: reportFormData.screenshot,
        updatedAt: Timestamp.now()
      });
      alert('Result reported! Waiting for opponent to confirm.');
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

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const base64 = await compressImage(file);
      setReportFormData({ ...reportFormData, screenshot: base64 });
    };

    return createPortal(
      <div className="fixed inset-0 z-[8000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
        <div className="w-full max-w-md bg-[#1a1f2e] rounded-[2.5rem] border-2 border-slate-800 overflow-hidden shadow-2xl relative">
          <div className="p-8 flex items-center justify-between border-b border-white/5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                   <Upload size={20} className="text-amber-500" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">REPORT RESULT</h3>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Submit proof and final scoreline</p>
                </div>
             </div>
             <button 
               onClick={() => setReportingMatch(null)}
               className="w-10 h-10 rounded-full bg-white/5 text-slate-400 flex items-center justify-center active:scale-95"
             >
               <X size={20} />
             </button>
          </div>

          <div className="p-8 space-y-8">
             <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-3">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] text-center block truncate w-full px-2">{homeName}</label>
                   <input 
                     type="number"
                     value={reportFormData.home}
                     onChange={(e) => setReportFormData({...reportFormData, home: parseInt(e.target.value) || 0})}
                     className="w-full h-20 rounded-3xl bg-slate-900/50 border-2 border-white/5 text-3xl font-black text-center text-white focus:border-indigo-500 outline-none transition-all"
                   />
                </div>
                <span className="text-xl font-black text-slate-700 italic pt-6">VS</span>
                <div className="flex-1 space-y-3">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] text-center block truncate w-full px-2">{awayName}</label>
                   <input 
                     type="number"
                     value={reportFormData.away}
                     onChange={(e) => setReportFormData({...reportFormData, away: parseInt(e.target.value) || 0})}
                     className="w-full h-20 rounded-3xl bg-slate-900/50 border-2 border-white/5 text-3xl font-black text-center text-white focus:border-indigo-500 outline-none transition-all"
                   />
                </div>
             </div>

             <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Evidence Screenshot (HD AUTO-OPTIMIZATION)</label>
                <div className="relative group">
                   <input 
                     type="file" 
                     accept="image/*" 
                     onChange={handleFile}
                     className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
                   />
                   <div className={cn(
                     "w-full aspect-video rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center transition-all relative overflow-hidden",
                     reportFormData.screenshot ? "border-emerald-500 bg-emerald-500/5" : "border-slate-800 bg-slate-900/30 hover:border-indigo-500/50"
                   )}>
                      {reportFormData.screenshot ? (
                        <>
                          <img src={reportFormData.screenshot} className="w-full h-full object-cover opacity-40 blur-[2px]" alt="" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                             <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <CheckCircle size={24} className="text-white" />
                             </div>
                             <span className="text-[10px] font-black text-white uppercase tracking-widest">IMAGE OPTIMIZED & SCANNED</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Camera size={32} className="text-slate-700 mb-4" />
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tap to upload proof</span>
                        </>
                      )}
                   </div>
                </div>
             </div>

             <button 
               onClick={submitFinalReport}
               disabled={isSubmittingReport || !reportFormData.screenshot}
               className={cn(
                 "w-full h-20 rounded-[2rem] flex items-center justify-center text-[13px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-2xl",
                 isSubmittingReport || !reportFormData.screenshot 
                   ? "bg-slate-800 text-slate-600 grayscale cursor-not-allowed" 
                   : "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 shadow-orange-500/20"
               )}
             >
                {isSubmittingReport ? 'DEPLOYING...' : 'DEPLOY FINAL RESULT'}
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

  const handleConfirmResult = async (match: Match) => {
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        updatedAt: Timestamp.now()
      });
      
      const homeScore = match.homeScore || 0;
      const awayScore = match.awayScore || 0;
      
      if (homeScore > awayScore) {
        await updateDoc(doc(db, 'users', match.homePlayerId), { eliteScore: (profiles[match.homePlayerId]?.eliteScore || 0) + 100 });
      } else if (awayScore > homeScore) {
        await updateDoc(doc(db, 'users', match.awayPlayerId), { eliteScore: (profiles[match.awayPlayerId]?.eliteScore || 0) + 100 });
      } else {
        await updateDoc(doc(db, 'users', match.homePlayerId), { eliteScore: (profiles[match.homePlayerId]?.eliteScore || 0) + 25 });
        await updateDoc(doc(db, 'users', match.awayPlayerId), { eliteScore: (profiles[match.awayPlayerId]?.eliteScore || 0) + 25 });
      }

      alert('Result confirmed! Points updated.');
    } catch (err) {
      console.error(err);
    }
  };

  const renderPlayerModal = () => {
    if (!selectedPlayerProfile) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
        <Card className="w-full max-w-sm p-0 overflow-hidden border-2 border-white shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="relative h-32 bg-fc-dark overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-fc-green/40 to-transparent" />
            <button 
              onClick={() => setSelectedPlayerProfile(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="px-8 pb-10 -mt-12 relative z-10">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-white p-1 shadow-xl border-4 border-white">
                <img 
                  src={selectedPlayerProfile.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"} 
                  className="w-full h-full object-cover rounded-[1.8rem]" 
                  alt="" 
                />
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
                <div className="nm-inset rounded-2xl p-4 bg-slate-50 border border-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OVR Rating</span>
                    <span className="text-xs font-black text-fc-green">{selectedPlayerProfile.ovr || 0}</span>
                  </div>
                </div>
                
                {selectedPlayerProfile.fbUrl && (
                  <a href={selectedPlayerProfile.fbUrl} target="_blank" rel="noopener noreferrer" className="w-full h-14 rounded-2xl nm-flat bg-white flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-50 transition-colors">
                    <Facebook size={18} className="text-blue-600" />
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Facebook Profile</span>
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

  const renderMatchChat = () => {
    if (!activeMatchChat) return null;

    const copyMessage = (text: string) => {
      navigator.clipboard.writeText(text);
      setActiveMenu(null);
    };

    return createPortal(
      <div className="fixed inset-0 z-[9000] bg-white flex flex-col animate-in fade-in slide-in-from-right duration-500">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc] pt-12">
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-black uppercase tracking-widest">MATCH CHAT</span>
             <h3 className="text-sm font-black uppercase italic text-black truncate max-w-[200px]">
               {activeMatchChat.homePlayerName} vs {activeMatchChat.awayPlayerName}
             </h3>
           </div>
           <button 
             onClick={() => { setActiveMatchChat(null); setActiveMenu(null); setMessages([]); }}
             className="w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-400"
           >
             <XCircle size={20} />
           </button>
        </div>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-[#f8fafc] scroll-smooth"
        >
           {messages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <MessageSquare size={48} className="text-slate-300 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">No messages yet</p>
             </div>
           ) : (
             messages.map((m, idx) => {
               const isMe = m.senderId === auth.currentUser?.uid;
               const showMenu = activeMenu === m.id;
               const seenCount = (m.seenBy?.length || 0) - (isMe ? 1 : 0);
               const prevMsg = idx > 0 ? messages[idx - 1] : null;
               const isFirstInGroup = !prevMsg || prevMsg.senderId !== m.senderId;

               return (
                <div key={m.id} className={cn(
                  "flex gap-2 max-w-[92%] group relative",
                  isMe ? "ml-auto flex-row-reverse" : "flex-row",
                  isFirstInGroup ? "mt-4" : "mt-0.5"
                )}>
                  <div className="flex-shrink-0 w-8">
                    {isFirstInGroup && (
                      <button 
                        onClick={() => !isMe && setSelectedPlayerProfile(profiles[m.senderId])}
                        className="active:scale-90 transition-transform"
                      >
                        {m.senderAvatar ? (
                          <img src={m.senderAvatar} className="w-8 h-8 rounded-full border-2 border-white shadow-md object-cover" alt="" />
                        ) : (
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-md uppercase",
                            getUserIdColor(m.senderId)
                          )}>
                            {m.senderName?.charAt(0) || '?'}
                          </div>
                        )}
                      </button>
                    )}
                  </div>

                  <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                    {isFirstInGroup && (
                      <span className="text-[8px] font-black text-black uppercase tracking-widest px-2 mb-1">
                        {m.senderName}
                      </span>
                    )}

                    <div className="relative group/bubble">
                      <div 
                        onClick={() => setActiveMenu(showMenu ? null : m.id)}
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed border transition-all break-all whitespace-pre-wrap cursor-pointer select-none shadow-sm",
                          isMe 
                            ? "bg-fc-dark text-white border-slate-700 rounded-tr-sm" 
                            : cn("text-white border-transparent rounded-tl-sm", getUserIdColor(m.senderId))
                        )}
                      >
                        {m.text}
                      </div>

                      {m.reactions && Object.entries(m.reactions).some(([_, users]) => (users as string[]).length > 0) && (
                        <div className={cn(
                          "absolute -bottom-2.5 flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-slate-100 shadow-sm z-10",
                          isMe ? "right-1" : "left-1"
                        )}>
                          {Object.entries(m.reactions).map(([emoji, users]) => {
                            if ((users as string[]).length === 0) return null;
                            return (
                              <span key={emoji} className="text-[10px] flex items-center gap-0.5 leading-none">
                                {emoji} <span className="text-[7px] font-black text-slate-400">{(users as string[]).length > 1 ? (users as string[]).length : ''}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {(idx === messages.length - 1 || messages[idx + 1].senderId !== m.senderId || showMenu) && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[7px] text-black font-bold uppercase tracking-tighter">
                          {formatMessageTimestamp(m.timestamp)}
                        </span>
                        {isMe && seenCount > 0 && (
                          <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter">
                            Seen by {seenCount}
                          </span>
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {showMenu && (
                        <>
                          <div className="fixed inset-0 z-[3200]" onClick={() => setActiveMenu(null)} />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className={cn(
                              "absolute z-[3300] bottom-full mb-2 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 min-w-[160px]",
                              isMe ? "right-0" : "left-0"
                            )}
                          >
                            <div className="flex items-center justify-around pb-2 border-b border-slate-50 mb-2">
                              {REACTIONS.map(emoji => (
                                <button 
                                  key={emoji} 
                                  onClick={() => reactToMessage(m.id, emoji)}
                                  className="text-lg hover:scale-125 transition-transform p-1"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <div className="space-y-1">
                              <button 
                                onClick={() => copyMessage(m.text)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest transition-colors"
                              >
                                <Copy size={14} className="text-slate-400" /> Copy Text
                              </button>
                              {isMe && (
                                <button 
                                  onClick={() => deleteMessage(m.id)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 rounded-xl text-[10px] font-black text-rose-500 uppercase tracking-widest transition-colors"
                                >
                                  <Trash2 size={14} className="text-rose-400" /> Delete
                                </button>
                              )}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
               );
             })
           )}
        </div>

        <div className="p-6 border-t border-slate-200 bg-white pb-10">
          <div className="flex gap-3 nm-flat rounded-[2rem] p-2 bg-slate-50 border border-slate-300 shadow-md">
            <input 
              type="text"
              placeholder="Type private message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 h-14 rounded-[1.5rem] bg-white px-6 text-sm font-bold outline-none border border-slate-200 focus:border-indigo-500 transition-all text-slate-900"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              className="w-14 h-14 rounded-[1.5rem] bg-indigo-600 text-white flex items-center justify-center shadow-2xl active:scale-95 disabled:opacity-50 transition-transform shrink-0"
            >
              <Send size={24} />
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderMatchCard = (match: Match) => {
    const homeProfile = profiles[match.homePlayerId];
    const awayProfile = profiles[match.awayPlayerId];
    const isHome = auth.currentUser?.uid === match.homePlayerId;
    const isAway = auth.currentUser?.uid === match.awayPlayerId;
    const isParticipant = isHome || isAway;
    const isAdminUser = profile?.role === 'admin';
    const canAccessMatchChat = isParticipant || isAdminUser;

    const homeWin = (match.homeScore || 0) > (match.awayScore || 0);
    const awayWin = (match.awayScore || 0) > (match.homeScore || 0);
    const isCompleted = match.status === 'completed';

    const tournamentTitle = tournaments[match.tournamentId]?.title || 'Tournament';

    const getStageLabel = () => {
      if (match.stage === 'group') return `Group Stage · Group ${match.groupId}`;
      if (match.stage === 'R16') return 'Knockout · Round of 16';
      if (match.stage === 'QTR') return 'Knockout · Quarter Final';
      if (match.stage === 'SEMI') return 'Knockout · Semi Final';
      if (match.stage === 'FINAL') return 'Knockout · Grand Final';
      if (match.stage === '3RD_PLACE') return 'Knockout · 3rd Place Match';
      return match.stage || 'Match';
    };

    return (
      <div key={match.id} className="nm-flat rounded-[2.5rem] p-0 border-2 border-white bg-white text-fc-dark space-y-0 relative overflow-hidden group transition-all hover:scale-[1.01] shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] grayscale pointer-events-none -mr-16 -mt-16">
           <Trophy size={120} />
        </div>

        <div className="p-8 space-y-8 relative z-10">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">{tournamentTitle}</span>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isCompleted ? "bg-fc-green shadow-[0_0_10px_rgba(72,195,75,0.6)]" : "bg-amber-500 animate-pulse")} />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getStageLabel()}</span>
               </div>
               {isCompleted && (
                 <span className="text-[9px] font-black text-white uppercase tracking-[0.2em] bg-fc-dark px-5 py-2 rounded-lg shadow-xl">RESULT FINAL</span>
               )}
               {match.status === 'reported' && (
                 <span className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] bg-amber-50 px-5 py-2 rounded-lg border border-amber-200">PENDING VERIFICATION</span>
               )}
               {match.status === 'disputed' && (
                 <span className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em] bg-red-50 px-5 py-2 rounded-lg border border-red-200 animate-pulse">DISPUTED</span>
               )}
            </div>
          </div>

          {match.screenshotUrl && (
            <div className="px-0">
              <div className="relative group/img aspect-video rounded-[2rem] overflow-hidden bg-fc-dark border border-slate-100 shadow-inner">
                 <img src={match.screenshotUrl} alt="Match Proof" className="w-full h-full object-cover opacity-80 group-hover/img:opacity-100 transition-opacity" />
                 <div className="absolute inset-0 bg-gradient-to-t from-fc-dark/80 to-transparent flex items-end p-6 pointer-events-none group-hover/img:opacity-0 transition-opacity">
                    <div className="flex items-center gap-2">
                      <Upload size={14} className="text-fc-green" />
                      <span className="text-[8px] font-black text-white uppercase tracking-[0.3em]">Match Evidence Attached</span>
                    </div>
                 </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-0 relative z-10 gap-2">
            <div className="flex flex-col items-center gap-4 flex-1">
              <div className="flex flex-col items-center gap-1.5 min-h-[32px]">
                <span className={cn("text-[10px] font-black uppercase tracking-[0.25em]", homeWin ? "text-fc-green" : "text-slate-400")}>HOME</span>
                {isCompleted && homeWin && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-fc-green/10 border border-fc-green/20 animate-in zoom-in-50 duration-500">
                    <Trophy size={8} className="text-fc-green" fill="currentColor" />
                    <span className="text-[7px] font-black text-fc-green uppercase">Winner</span>
                  </div>
                )}
              </div>
              <div className={cn(
                "w-24 h-24 rounded-[2.5rem] bg-slate-50 border-4 flex items-center justify-center overflow-hidden transition-all duration-700 shadow-md",
                isCompleted && homeWin ? "border-fc-green scale-105" : "border-white"
              )}>
                 {homeProfile?.avatar ? (
                   <img src={homeProfile.avatar} alt="" className="w-full h-full object-cover" />
                 ) : (
                   <UserIcon size={32} className="text-slate-200" />
                 )}
              </div>
              <div className="text-center">
                <h5 className={cn("text-sm font-black uppercase italic tracking-tight transition-colors truncate max-w-[80px]", homeWin ? "text-fc-dark" : "text-slate-400")}>
                  {homeProfile?.inGameName || match.homePlayerName || 'Loading...'}
                </h5>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{homeProfile?.ovr || 0} OVR</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 px-2">
               {match.status !== 'scheduled' ? (
                 <div className="flex items-center gap-4">
                    <span className={cn("text-5xl font-black italic tracking-tighter", homeWin ? "text-fc-dark" : "text-slate-300")}>{match.homeScore || 0}</span>
                    <div className="w-4 h-1 bg-slate-200 rounded-full" />
                    <span className={cn("text-5xl font-black italic tracking-tighter", awayWin ? "text-fc-dark" : "text-slate-300")}>{match.awayScore || 0}</span>
                 </div>
               ) : (
                 <div className="w-14 h-14 rounded-2xl bg-fc-dark border-2 border-white flex items-center justify-center shadow-xl">
                   <span className="text-lg font-black text-white italic">VS</span>
                 </div>
               )}
               <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                  {match.status === 'scheduled' && match.scheduledTime ? (
                    <CountdownTimer targetTime={match.scheduledTime} />
                  ) : (
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic tracking-[0.2em]">{match.status === 'reported' ? 'VERIFYING' : 'ARCHIVED'}</span>
                  )}
               </div>
            </div>

            <div className="flex flex-col items-center gap-4 flex-1">
              <div className="flex flex-col items-center gap-1.5 min-h-[32px]">
                <span className={cn("text-[10px] font-black uppercase tracking-[0.25em]", awayWin ? "text-fc-green" : "text-slate-400")}>AWAY</span>
                {isCompleted && awayWin && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-fc-green/10 border border-fc-green/20 animate-in zoom-in-50 duration-500">
                    <Trophy size={8} className="text-fc-green" fill="currentColor" />
                    <span className="text-[7px] font-black text-fc-green uppercase">Winner</span>
                  </div>
                )}
              </div>
              <div className={cn(
                "w-24 h-24 rounded-[2.5rem] bg-slate-50 border-4 flex items-center justify-center overflow-hidden transition-all duration-700 shadow-md",
                isCompleted && awayWin ? "border-fc-green scale-105" : "border-white"
              )}>
                 {awayProfile?.avatar ? (
                   <img src={awayProfile.avatar} alt="" className="w-full h-full object-cover" />
                 ) : (
                   <UserIcon size={32} className="text-slate-200" />
                 )}
              </div>
              <div className="text-center">
                <h5 className={cn("text-sm font-black uppercase italic tracking-tight transition-colors truncate max-w-[80px]", awayWin ? "text-fc-dark" : "text-slate-400")}>
                  {awayProfile?.inGameName || match.awayPlayerName || 'Loading...'}
                </h5>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{awayProfile?.ovr || 0} OVR</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-4 relative z-10 border-t border-slate-50">
            {isHome && match.status === 'scheduled' && (
              <button 
                onClick={() => handleUploadResult(match)}
                className="flex-1 min-w-[140px] h-12 rounded-xl bg-fc-green text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-fc-green/20 active:scale-95 transition-transform"
              >
                <Upload size={14} /> Step 1: Upload Score & Proof
              </button>
            )}
            
            {match.status === 'reported' && (isAway || isAdminUser) && match.reporterId !== auth.currentUser?.uid && (
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

            {isAdminUser && (match.status === 'reported' || match.status === 'disputed') && (
              <div className="w-full flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Admin Resolution</span>
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

            {canAccessMatchChat && (
              <button 
                onClick={() => setActiveMatchChat(match)}
                className="flex-1 min-w-[120px] h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 active:scale-95 transition-transform"
              >
                <MessageSquare size={14} className="text-amber-300" />
                <span>Match Room Chat</span>
                <span className="text-[7px] bg-white/20 px-2 py-0.5 rounded-full font-bold">PRIVATE</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleCreateChallenge = async () => {
    if (!profile || (profile.eliteScore || 0) < 100) {
      alert('You need at least 100 points to create a challenge!');
      return;
    }

    if (!formData.matchId.trim()) {
      alert('Please enter a Match ID');
      return;
    }

    setCreatingChallenge(true);
    try {
      // 1. Deduct points
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        eliteScore: (profile.eliteScore || 0) - 100
      });

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + formData.duration);

      // 2. Create challenge doc
      await addDoc(collection(db, 'challenges'), {
        creatorId: auth.currentUser!.uid,
        creatorName: profile.inGameName || 'Player',
        creatorAvatar: profile.avatar || '',
        creatorOvr: profile.ovr || 0,
        status: 'waiting',
        entryFee: 100,
        pot: 200,
        minOvr: formData.minOvr,
        maxOvr: formData.maxOvr,
        matchId: formData.matchId,
        expiresAt: Timestamp.fromDate(expiresAt),
        timestamp: Timestamp.now()
      });

      setShowCreateModal(false);
      setFormData({ minOvr: 100, maxOvr: 150, duration: 5, matchId: '' });
      alert('Challenge created! Waiting for an opponent.');
    } catch (error) {
      console.error(error);
      alert('Failed to create challenge.');
    } finally {
      setCreatingChallenge(false);
    }
  };

  const handleReclaimPoints = async (challenge: Challenge) => {
    if (challenge.creatorId !== auth.currentUser?.uid) return;
    if (challenge.pointsReclaimed) {
      alert('Points have already been reclaimed for this challenge.');
      return;
    }

    try {
      // 1. Refund points
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const currentPoints = userSnap.data()?.eliteScore || 0;
      
      await updateDoc(userRef, {
        eliteScore: currentPoints + 100
      });

      await logPointTransaction(auth.currentUser.uid, 'refunded', 100, 'Reclaimed Challenge Fee', '100 points entry fee reclaimed for expired challenge');

      // 2. Mark as expired with pointsReclaimed = true
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'expired',
        pointsReclaimed: true,
        reclaimedAt: Timestamp.now()
      });

      alert('100 Points collected successfully! Status marked as COMPLETED.');
    } catch (error) {
      console.error(error);
      alert('Failed to reclaim points.');
    }
  };

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [confirmingAcceptId, setConfirmingAcceptId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAcceptChallenge = async (challenge: Challenge) => {
    setActionError(null);
    const userOvr = profile?.ovr ?? 100;
    const userPoints = profile?.eliteScore ?? 0;

    if (!profile || userPoints < 100) {
      setActionError('You need at least 100 points to accept this challenge!');
      return;
    }

    if (challenge.creatorId === auth.currentUser?.uid) {
      setActionError('You cannot accept your own challenge!');
      return;
    }

    const now = new Date();
    if (now > challenge.expiresAt.toDate()) {
      setActionError('This challenge has expired!');
      return;
    }

    if (userOvr < (challenge.minOvr || 0) || userOvr > (challenge.maxOvr || 999)) {
      setActionError(`Your OVR (${userOvr}) does not match requirements (${challenge.minOvr}-${challenge.maxOvr})`);
      return;
    }

    setAcceptingId(challenge.id);
    setConfirmingAcceptId(null);

    try {
      // 1. Deduct points
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        eliteScore: userPoints - 100
      });

      await logPointTransaction(
        auth.currentUser!.uid,
        'spent',
        100,
        'Accepted 1v1 Battle',
        `Accepted challenge vs ${challenge.creatorName} (Room ID: ${challenge.matchId})`
      );

      // 2. Update challenge
      await updateDoc(doc(db, 'challenges', challenge.id), {
        opponentId: auth.currentUser!.uid,
        opponentName: profile.inGameName || 'Player',
        opponentAvatar: profile.avatar || '',
        opponentOvr: userOvr,
        status: 'accepted',
        updatedAt: Timestamp.now()
      });
    } catch (error: any) {
      console.error(error);
      setActionError(error?.message || 'Failed to accept challenge.');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleResolveChallenge = async (challenge: Challenge, winnerId: string) => {
    if (!isAdmin) return;
    if (!confirm(`Confirm ${winnerId === challenge.creatorId ? challenge.creatorName : challenge.opponentName} as the winner and award 200 points?`)) return;

    try {
      // 1. Award points to winner
      const winnerRef = doc(db, 'users', winnerId);
      const winnerSnap = await getDoc(winnerRef);
      const currentPoints = winnerSnap.data()?.eliteScore || 0;
      await updateDoc(winnerRef, {
        eliteScore: currentPoints + challenge.pot
      });

      // 2. Mark challenge as completed
      await updateDoc(doc(db, 'challenges', challenge.id), {
        status: 'completed',
        winnerId: winnerId,
        updatedAt: Timestamp.now()
      });

      alert('Challenge resolved and points awarded!');
    } catch (error) {
      console.error(error);
      alert('Failed to resolve challenge.');
    }
  };

  const deleteChallenge = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('Delete this challenge?')) return;
    try {
      await deleteDoc(doc(db, 'challenges', id));
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="SYNCING FIELD..." />;

  return (
    <div className="space-y-8 pt-4">
      {renderReportResultModal()}
      {renderMatchChat()}
      {renderPlayerModal()}
      <Reveal direction="left">
        <div className="flex flex-col gap-2 px-4">
          <h2 className="text-3xl font-black text-slate-900 uppercase italic leading-none">MY FIELD</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">OPERATIONS & BATTLES</p>
        </div>
      </Reveal>

      {/* Tabs */}
      <div className="flex nm-inset p-2 rounded-[2rem] border-2 border-white/20 bg-[#e6e6e9] h-20 mx-2">
        <button 
          onClick={() => setActiveSubTab('matches')}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 rounded-[1.8rem] transition-all",
            activeSubTab === 'matches' ? "nm-flat text-black bg-white shadow-xl" : "text-black"
          )}
        >
          <Trophy size={18} className="text-black" />
          <span className="text-[8px] font-black uppercase tracking-widest text-black">My Matches</span>
        </button>
        <button 
          onClick={() => setActiveSubTab('challenges')}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 rounded-[1.8rem] transition-all",
            activeSubTab === 'challenges' ? "nm-flat text-black bg-white shadow-xl" : "text-black"
          )}
        >
          <Swords size={18} className="text-black" />
          <span className="text-[8px] font-black uppercase tracking-widest text-black">1 vs 1 Challenge</span>
        </button>
      </div>

      <div className="space-y-6">
        {activeSubTab === 'matches' ? (
          matches.length === 0 ? (
            <Reveal direction="up">
              <Card className="text-center py-24 bg-white/50 backdrop-blur-md">
                <Clock size={48} className="mx-auto text-slate-200 mb-6" />
                <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] italic">No Tournament Matches</p>
              </Card>
            </Reveal>
          ) : (
            <div className="space-y-6 px-2">
              {matches.map(renderMatchCard)}
            </div>
          )
        ) : (
          <div className="space-y-6 px-2 pb-10">
            {/* Create Challenge Button */}
            <Reveal direction="down">
              <button 
                onClick={() => setShowCreateModal(true)}
                disabled={creatingChallenge}
                className="w-full group relative nm-flat rounded-[2.5rem] p-8 border-4 border-white overflow-hidden bg-white active:scale-95 transition-all shadow-2xl"
              >
                 <div className="absolute top-0 right-0 w-40 h-40 bg-slate-900/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-slate-900/10 transition-colors" />
                 <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-3xl nm-flat bg-white text-black border-2 border-slate-200 flex items-center justify-center shadow-xl">
                       <Plus size={32} className="text-black stroke-[3]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-black uppercase italic tracking-tighter">CREATE 1 VS 1 CHALLENGE</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Cost: 100 Points · Winner gets 200</p>
                    </div>
                    <div className="px-6 py-2.5 rounded-full bg-slate-100 border border-slate-200 text-black text-[10px] font-black uppercase tracking-widest group-hover:bg-black group-hover:text-white transition-all">
                       {creatingChallenge ? 'Initializing...' : 'START NEW BATTLE'}
                    </div>
                 </div>
              </button>
            </Reveal>

            {/* Creation Modal */}
            {showCreateModal && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="w-full max-w-sm nm-flat rounded-[3rem] bg-[#f8fafc] p-10 space-y-8 border-4 border-white shadow-2xl relative">
                  <button 
                    onClick={() => setShowCreateModal(false)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full nm-flat flex items-center justify-center text-slate-400 bg-white"
                  >
                    <X size={20} />
                  </button>

                  <div className="text-center space-y-2 pt-2">
                    <h3 className="text-2xl font-black text-black uppercase italic tracking-tighter">BATTLE CONFIG</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Set your match requirements</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Match ID (Room ID)</label>
                       <Input 
                         placeholder="Enter In-Game Match ID"
                         value={formData.matchId}
                         onChange={(e) => setFormData({...formData, matchId: e.target.value})}
                         className="h-16 px-6 text-sm font-black rounded-2xl bg-white border-2 border-slate-100 focus:border-indigo-500 transition-all text-slate-900"
                       />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Min OVR</label>
                         <Input 
                           type="number"
                           value={formData.minOvr}
                           onChange={(e) => setFormData({...formData, minOvr: parseInt(e.target.value) || 0})}
                           className="h-14 text-center text-lg font-black rounded-2xl bg-white border-2 border-slate-100 text-slate-900"
                         />
                       </div>
                       <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Max OVR</label>
                         <Input 
                           type="number"
                           value={formData.maxOvr}
                           onChange={(e) => setFormData({...formData, maxOvr: parseInt(e.target.value) || 0})}
                           className="h-14 text-center text-lg font-black rounded-2xl bg-white border-2 border-slate-100 text-slate-900"
                         />
                       </div>
                    </div>

                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Duration (Minutes)</label>
                       <div className="grid grid-cols-3 gap-3">
                          {[2, 5, 10].map(m => (
                            <button 
                              key={m}
                              onClick={() => setFormData({...formData, duration: m})}
                              className={cn(
                                "py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2",
                                formData.duration === m ? "bg-black text-white border-black shadow-xl scale-[1.05]" : "bg-white text-slate-400 border-slate-100"
                              )}
                            >
                              {m}m
                            </button>
                          ))}
                       </div>
                    </div>

                    <Button 
                      onClick={handleCreateChallenge}
                      disabled={creatingChallenge}
                      className="w-full h-20 rounded-[2.5rem] bg-[#00ff9d] text-black text-[13px] font-black uppercase tracking-widest shadow-2xl shadow-emerald-200/50 mt-4 active:scale-95 transition-transform border-2 border-black"
                    >
                      <span className="text-black font-black">{creatingChallenge ? 'Processing...' : 'LAUNCH CHALLENGE'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Challenges List */}
            <div className="space-y-4">
               <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] ml-2">Available Battles</h4>
               
               {challenges.length === 0 ? (
                 <div className="py-20 text-center opacity-30">
                    <Swords size={40} className="mx-auto mb-4 text-slate-900" />
                    <p className="text-[9px] font-black uppercase tracking-widest italic text-slate-900">No active challenges found</p>
                 </div>
               ) : (
                 challenges.map((c, i) => {
                   const isCreator = c.creatorId === auth.currentUser?.uid;
                   const isOpponent = c.opponentId === auth.currentUser?.uid;
                   const isParticipant = isCreator || isOpponent;
                   
                   const timer = formatCountdown(c.expiresAt);
                   const isExpired = c.status === 'expired' || (c.status === 'waiting' && timer.expired);
                   
                   return (
                     <Reveal key={c.id} direction="up" delay={i * 50}>
                       <div className={cn(
                         "nm-flat rounded-[2.5rem] p-6 border-2 border-white relative overflow-hidden group shadow-lg",
                         isExpired ? "opacity-60 bg-slate-50" : "bg-white/80 backdrop-blur-sm"
                       )}>
                          {isAdmin && (
                            <button 
                              onClick={() => deleteChallenge(c.id)}
                              className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 p-2 z-20"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}

                          <div className="absolute top-4 right-6 flex items-center gap-2">
                             {c.status === 'waiting' && !timer.expired ? (
                               <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900 text-[#00ff9d] border border-[#00ff9d]/40 text-[9px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(0,255,157,0.3)] animate-pulse">
                                  <Clock size={12} className="text-[#00ff9d] animate-spin" />
                                  <span>COOLDOWN {timer.text}</span>
                               </div>
                             ) : isExpired ? (
                               <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-500 text-[8px] font-black uppercase tracking-widest border border-rose-200">
                                 EXPIRED (REFUNDED)
                               </span>
                             ) : (
                               <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-widest border border-slate-200">
                                 {c.status.toUpperCase()}
                               </span>
                             )}
                          </div>
                          
                          <div className="flex items-center justify-between gap-4 relative z-10 pt-4">
                             {/* Creator */}
                             <div className="flex flex-col items-center gap-2 flex-1">
                                <div className="relative">
                                  <div className="w-14 h-14 rounded-2xl nm-inset bg-white p-1 border border-slate-100 overflow-hidden">
                                     {c.creatorAvatar ? <img src={c.creatorAvatar} className="w-full h-full object-cover rounded-xl" /> : <User className="w-full h-full p-2 text-slate-400" />}
                                  </div>
                                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[7px] font-black border-2 border-white">
                                     {c.creatorOvr}
                                  </div>
                                </div>
                                <span className="text-[8px] font-black text-slate-900 uppercase truncate max-w-[60px]">{c.creatorName}</span>
                             </div>

                             <div className="flex flex-col items-center gap-2">
                                <div className="flex flex-col items-center">
                                   <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">OVR Range</span>
                                   <span className="text-[10px] font-black text-slate-900 uppercase italic">{c.minOvr}-{c.maxOvr}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                   <div className="w-8 h-8 rounded-full nm-flat bg-white flex items-center justify-center text-[10px] font-black text-slate-400 italic">VS</div>
                                </div>
                                <div className="flex items-center gap-1 text-emerald-600 font-black text-[10px]">
                                   <Zap size={10} fill="currentColor" /> 200
                                </div>
                             </div>

                             {/* Opponent / Invitation */}
                             <div className="flex flex-col items-center gap-2 flex-1">
                                {c.opponentId ? (
                                  <>
                                    <div className="relative">
                                      <div className="w-14 h-14 rounded-2xl nm-inset bg-white p-1 border border-slate-100 overflow-hidden">
                                         {c.opponentAvatar ? <img src={c.opponentAvatar} className="w-full h-full object-cover rounded-xl" /> : <User className="w-full h-full p-2 text-slate-400" />}
                                      </div>
                                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[7px] font-black border-2 border-white">
                                         {c.opponentOvr}
                                      </div>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-900 uppercase truncate max-w-[60px]">{c.opponentName}</span>
                                  </>
                                ) : (
                                  <div className="w-14 h-14 rounded-2xl nm-inset border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                                     <User size={24} className="opacity-40" />
                                  </div>
                                )}
                             </div>
                          </div>

                          {/* Match ID Display - Only visible to participants after acceptance */}
                          {c.status !== 'waiting' && c.status !== 'expired' && isParticipant && (
                            <div className="mt-6 p-5 rounded-[2rem] nm-inset bg-white border-2 border-slate-100 flex flex-col items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">BATTLE ROOM ID</span>
                               <div className="flex items-center gap-4">
                                  <span className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{c.matchId}</span>
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(c.matchId || '');
                                      alert('Match ID copied!');
                                    }}
                                    className="w-10 h-10 rounded-xl nm-flat bg-white flex items-center justify-center text-indigo-600 active:scale-90 transition-transform shadow-sm"
                                  >
                                    <Clock size={16} />
                                  </button>
                               </div>
                               <p className="text-[8px] font-bold text-slate-400 uppercase">Use this ID to find the match in-game</p>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                             {actionError && (
                               <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-[9px] font-black uppercase text-center">
                                 {actionError}
                               </div>
                             )}

                             {c.status === 'waiting' && !isCreator && !isExpired && (
                               confirmingAcceptId === c.id ? (
                                 <div className="space-y-2 animate-in fade-in duration-200">
                                   <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black uppercase text-center">
                                     Accepting costs 100 Points. Confirm?
                                   </div>
                                   <div className="flex gap-2">
                                     <button
                                       onClick={() => setConfirmingAcceptId(null)}
                                       className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider"
                                     >
                                       Cancel
                                     </button>
                                     <button 
                                       onClick={() => handleAcceptChallenge(c)}
                                       disabled={acceptingId === c.id}
                                       className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                                     >
                                       {acceptingId === c.id ? (
                                         <span className="animate-pulse">Processing...</span>
                                       ) : (
                                         <>
                                           <Zap size={14} fill="currentColor" /> Confirm & Pay 100 Pts
                                         </>
                                       )}
                                     </button>
                                   </div>
                                 </div>
                               ) : (
                                 <button 
                                   onClick={() => {
                                     setActionError(null);
                                     setConfirmingAcceptId(c.id);
                                   }}
                                   disabled={!!acceptingId}
                                   className="w-full py-5 rounded-[2rem] bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-2xl disabled:opacity-50"
                                 >
                                   <Swords size={18} className="text-rose-500" /> 
                                   ACCEPT CHALLENGE
                                 </button>
                               )
                             )}

                             {isCreator && isExpired && (
                               c.pointsReclaimed ? (
                                 <div className="w-full py-4 rounded-2xl bg-emerald-100 border-2 border-emerald-400 text-emerald-800 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-md">
                                   <CheckCircle size={16} className="text-emerald-600" />
                                   <span>COMPLETED (100 PTS COLLECTED)</span>
                                 </div>
                               ) : (
                                 <button 
                                   onClick={() => handleReclaimPoints(c)}
                                   className="w-full py-4 rounded-2xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl hover:bg-emerald-600"
                                 >
                                    <Zap size={16} fill="currentColor" /> COLLECT 100 POINTS
                                 </button>
                               )
                             )}

                             {/* Result Submission - Only creator can submit result */}
                             {c.status === 'accepted' && isParticipant && (
                                isCreator ? (
                                  reportingChallengeId === c.id ? (
                                    <div className="space-y-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                                       <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block text-center">Submit Match Score & Screenshot</span>
                                       <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase text-center block">{c.creatorName} (Home)</label>
                                            <Input 
                                              type="number" 
                                              className="h-12 text-center text-lg font-black rounded-xl bg-white"
                                              value={reportData.home}
                                              onChange={(e) => setReportData({...reportData, home: parseInt(e.target.value) || 0})}
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase text-center block">{c.opponentName} (Away)</label>
                                            <Input 
                                              type="number" 
                                              className="h-12 text-center text-lg font-black rounded-xl bg-white"
                                              value={reportData.away}
                                              onChange={(e) => setReportData({...reportData, away: parseInt(e.target.value) || 0})}
                                            />
                                          </div>
                                       </div>

                                       {/* Screenshot Upload Input */}
                                       <div className="space-y-2">
                                         <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Match Screenshot Proof (Required)</label>
                                         <div className="relative">
                                           <input 
                                             type="file" 
                                             accept="image/*"
                                             onChange={handleFileChange}
                                             className="hidden" 
                                             id={`screenshot-upload-${c.id}`} 
                                           />
                                           <label 
                                             htmlFor={`screenshot-upload-${c.id}`}
                                             className="w-full py-3 px-4 rounded-xl bg-white border-2 border-dashed border-indigo-200 flex items-center justify-center gap-2 cursor-pointer hover:bg-indigo-50/50 transition-colors text-indigo-600 text-[9px] font-black uppercase tracking-wider"
                                           >
                                             <Camera size={16} />
                                             {isUploadingImage ? 'Processing Image...' : (selectedScreenshot ? 'Change Screenshot' : 'Upload Match Screenshot')}
                                           </label>
                                         </div>

                                         {selectedScreenshot && (
                                           <div className="relative w-full h-32 rounded-xl overflow-hidden border border-indigo-200 mt-2 bg-slate-900 group">
                                             <img src={selectedScreenshot} className="w-full h-full object-cover" />
                                             <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                               <button 
                                                 onClick={() => setPreviewImageModal(selectedScreenshot)}
                                                 className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-[8px] font-black uppercase tracking-wider"
                                               >
                                                 Preview Full Image
                                               </button>
                                             </div>
                                           </div>
                                         )}
                                       </div>

                                       <div className="flex gap-2 pt-2">
                                          <Button variant="outline" className="flex-1 h-12 rounded-xl text-[9px]" onClick={() => {
                                            setReportingChallengeId(null);
                                            setSelectedScreenshot(null);
                                          }}>Cancel</Button>
                                          <Button 
                                            disabled={!selectedScreenshot || isUploadingImage}
                                            className="flex-1 h-12 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider disabled:opacity-50" 
                                            onClick={() => handleReportChallenge(c.id)}
                                          >
                                            Submit Match Result
                                          </Button>
                                       </div>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setReportingChallengeId(c.id);
                                        setReportData({ home: 0, away: 0 });
                                        setSelectedScreenshot(null);
                                      }}
                                      className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2"
                                    >
                                       <Camera size={16} /> SUBMIT MATCH RESULT & SCREENSHOT
                                    </button>
                                  )
                                ) : (
                                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-500 text-[9px] font-black uppercase tracking-wider">
                                    Waiting for match creator ({c.creatorName}) to submit result & screenshot...
                                  </div>
                                )
                             )}

                             {/* Reported State - Opponent Verification or Admin Review */}
                             {(c.status === 'reported' || c.status === 'disputed') && (
                                <div className="space-y-4 p-4 rounded-2xl bg-amber-50/60 border border-amber-200">
                                   <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                                      <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">
                                        {c.status === 'disputed' ? 'DISPUTED MATCH' : 'REPORTED MATCH RESULT'}
                                      </span>
                                      <span className="text-[8px] font-black px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 uppercase tracking-widest">
                                        {c.homeScore} - {c.awayScore}
                                      </span>
                                   </div>

                                   {/* Screenshot Display */}
                                   {c.screenshotUrl && (
                                     <div className="space-y-1.5">
                                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Submitted Screenshot Proof</span>
                                       <div 
                                         onClick={() => setPreviewImageModal(c.screenshotUrl!)}
                                         className="relative w-full h-36 rounded-xl overflow-hidden border-2 border-amber-200 bg-slate-900 cursor-pointer group"
                                       >
                                         <img src={c.screenshotUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-black uppercase tracking-widest gap-2">
                                           <Camera size={16} /> View Screenshot
                                         </div>
                                       </div>
                                     </div>
                                   )}

                                   {/* Opponent Verification Actions */}
                                   {c.status === 'reported' && isOpponent && (
                                     <div className="space-y-2 pt-2 border-t border-amber-200/60">
                                       <p className="text-[8px] font-bold text-amber-800 uppercase text-center">Verify the screenshot above. Does the result match?</p>
                                       <div className="grid grid-cols-2 gap-2">
                                         <button 
                                           onClick={() => handleOpponentConfirmResult(c)}
                                           className="py-3.5 px-2 rounded-xl bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                                         >
                                           <CheckCircle size={12} /> Confirm & Accept Result
                                         </button>
                                         <button 
                                           onClick={() => handleOpponentDisputeResult(c)}
                                           className="py-3.5 px-2 rounded-xl bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                                         >
                                           <AlertCircle size={12} /> Dispute / Report to Admin
                                         </button>
                                       </div>
                                     </div>
                                   )}

                                   {/* Creator Waiting State */}
                                   {c.status === 'reported' && isCreator && (
                                     <p className="text-[8px] font-black text-amber-700 uppercase text-center tracking-widest animate-pulse">
                                       Result submitted! Waiting for Opponent ({c.opponentName}) to verify...
                                     </p>
                                   )}

                                   {/* Admin Resolution & Fake Penalty Controls */}
                                   {isAdmin && (
                                     <div className="space-y-2 pt-3 border-t border-amber-200">
                                       <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block text-center">Admin Controls & Verification</span>
                                       <div className="grid grid-cols-2 gap-2">
                                          <button 
                                            onClick={() => handleAdminResolveChallenge(c, c.creatorId)}
                                            className="py-3 rounded-xl bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest"
                                          >
                                             Confirm {c.creatorName} Won
                                          </button>
                                          <button 
                                            onClick={() => handleAdminResolveChallenge(c, c.opponentId!)}
                                            className="py-3 rounded-xl bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest"
                                          >
                                             Confirm {c.opponentName} Won
                                          </button>
                                       </div>
                                       <button 
                                         onClick={() => handleAdminPunishFake(c)}
                                         className="w-full py-3 rounded-xl bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md"
                                       >
                                          <AlertCircle size={12} /> PUNISH FAKE RESULT (Creator Forfeit)
                                       </button>
                                     </div>
                                   )}
                                </div>
                             )}

                             {c.status === 'completed' && (
                                <div className="flex flex-col items-center gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                                   <div className="flex items-center gap-4">
                                      <div className={cn("text-xl font-black", c.winnerId === c.creatorId ? "text-emerald-600" : "text-slate-400")}>{c.homeScore}</div>
                                      <span className="text-slate-300 font-bold">-</span>
                                      <div className={cn("text-xl font-black", c.winnerId === c.opponentId ? "text-emerald-600" : "text-slate-400")}>{c.awayScore}</div>
                                   </div>

                                   {c.screenshotUrl ? (
                                     <div className="space-y-1 text-center">
                                       <button 
                                         onClick={() => setPreviewImageModal(c.screenshotUrl!)}
                                         className="text-[8px] font-black text-indigo-600 uppercase tracking-widest flex items-center justify-center gap-1 hover:underline mx-auto"
                                       >
                                         <Camera size={12} /> View Match Screenshot Proof
                                       </button>
                                       <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-center gap-1">
                                         <Clock size={10} className="text-amber-500 shrink-0" /> Screenshot proof will be deleted within 24 hours after result confirmation.
                                       </p>
                                     </div>
                                   ) : (
                                     <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
                                       <CheckCircle size={10} className="text-emerald-500" /> Proof Screenshot Archived (Auto-cleared after 24h)
                                     </p>
                                   )}

                                   <div className="px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-widest flex items-center gap-2">
                                      <CheckCircle size={12} /> {c.winnerId === 'draw' ? 'Draw Match' : `${c.winnerId === c.creatorId ? c.creatorName : c.opponentName} Won (+200 Pts)`}
                                   </div>

                                   {c.penalizedCreatorId && (
                                     <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">
                                       Creator penalized for fake result submission
                                     </span>
                                   )}
                                </div>
                             )}
                          </div>
                       </div>
                     </Reveal>
                   );
                 })
               )}
            </div>
          </div>
        )}
      </div>

      {/* Screenshot Lightbox Modal */}
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
    </div>
  );
};
