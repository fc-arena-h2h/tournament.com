import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button } from '@/src/components/ui/Primitives';
import { Trophy, LayoutGrid, List, FileText, GitPullRequest, Copy, UserPlus, Search, User as UserIcon, MessageSquare, Clock, Facebook, MessageCircle, Upload, CheckCircle, XCircle, X, Users, Settings, Zap, Edit3, Trash2, Save, Plus, Send, Lock, Camera } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, updateDoc, Timestamp, arrayUnion, getDocs, deleteDoc, arrayRemove } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
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

const DEFAULT_RULES = [
  "Participants must be available during their scheduled match time. Failure to show up within 10 minutes results in a forfeit.",
  "Fair Play & Respect: Toxic behavior, cheating, or glitched gameplay will result in an immediate match loss and potential tournament ban.",
  "Match Verification: Both players must take a clear screenshot of the final match result screen and submit it in the Match Center for score verification."
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
  winnerText?: string;
  winnerId?: string;
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
  status: 'scheduled' | 'reported' | 'disputed' | 'completed';
  reporterId?: string;
  screenshotUrl?: string;
  disputeReason?: string;
  groupId: string;
  stage: string;
  scheduledTime?: Timestamp;
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

type ArenaTab = 'group' | 'knockout' | 'ranking' | 'players' | 'rules' | 'manage';

interface ArenaDetailProps {
  tournament: Tournament;
  profile: UserProfile | null;
  onBack: () => void;
}

export const ArenaDetail = ({ tournament, profile, onBack }: ArenaDetailProps) => {
  const [activeTab, setActiveTab] = useState<ArenaTab>('group');
  const [activeGroup, setActiveGroup] = useState('A');
  const [activeMatchChat, setActiveMatchChat] = useState<Match | null>(null);
  const [showArenaChat, setShowArenaChat] = useState(false);
  const [activeKnockoutStage, setActiveKnockoutStage] = useState('R16');
  const [registration, setRegistration] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<UserProfile | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [reportingMatch, setReportingMatch] = useState<Match | null>(null);
  const [reportFormData, setReportFormData] = useState({ home: 0, away: 0, screenshot: '' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [currentTournament, setCurrentTournament] = useState<any>(tournament);
  const [editingRules, setEditingRules] = useState(false);
  const [editableRules, setEditableRules] = useState<string[]>([]);
  const [savingRules, setSavingRules] = useState(false);

  // Publisher 4 Deployment Modes State
  const [actionLoading, setActionLoading] = useState(false);
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

  // 1. Automatic Group Setup
  const handleAutoGroupSetup = async () => {
    const approved = participants.filter(p => p.status === 'approved');
    if (approved.length === 0) {
      return alert('Please approve at least 1 player registration before running auto group setup!');
    }
    setActionLoading(true);
    try {
      const groupNames = ['A', 'B', 'C', 'D'];
      await Promise.all(approved.map((p, idx) => {
        const assignedGroup = groupNames[idx % groupNames.length];
        return updateDoc(doc(db, 'registrations', p.id), {
          groupId: assignedGroup
        });
      }));
      alert(`Automatic Group Setup Complete! ${approved.length} approved players distributed into Groups A, B, C, D.`);
    } catch (err) {
      console.error('Auto group setup error:', err);
      alert('Automatic Group Setup failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Automatic Match Deploy
  const handleAutoMatchDeploy = async () => {
    const approved = participants.filter(p => p.status === 'approved');
    if (approved.length < 2) {
      return alert('Need at least 2 approved players for automatic match deployment!');
    }
    setActionLoading(true);
    try {
      const newMatches: any[] = [];
      const groupNames = ['A', 'B', 'C', 'D'];

      groupNames.forEach(gName => {
        const gPlayers = approved.filter(p => p.groupId === gName || (!p.groupId && approved.length <= 4));
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
              scheduledTime: Timestamp.now(),
              createdAt: Timestamp.now()
            });
          }
        }
      });

      if (newMatches.length === 0) {
        for (let i = 0; i < approved.length - 1; i += 2) {
          const p1 = approved[i];
          const p2 = approved[i + 1];
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
            groupId: 'A',
            scheduledTime: Timestamp.now(),
            createdAt: Timestamp.now()
          });
        }
      }

      await Promise.all(newMatches.map(m => addDoc(collection(db, 'matches'), m)));
      alert(`Automatic Match Deploy Complete! ${newMatches.length} match fixtures created and deployed.`);
    } catch (err) {
      console.error('Auto match deploy error:', err);
      alert('Automatic Match Deploy failed.');
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

      await addDoc(collection(db, 'matches'), {
        tournamentId: tournament.id,
        homePlayerId: manualMatchForm.homeUserId,
        awayPlayerId: manualMatchForm.awayUserId,
        homePlayerName: p1Profile?.inGameName || p1Reg?.gameName || 'Player 1',
        awayPlayerName: p2Profile?.inGameName || p2Reg?.gameName || 'Player 2',
        participants: [manualMatchForm.homeUserId, manualMatchForm.awayUserId],
        status: 'scheduled',
        stage: manualMatchForm.stage,
        groupId: manualMatchForm.groupId,
        scheduledTime: scheduledTimestamp,
        createdAt: Timestamp.now()
      });

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

  useEffect(() => {
    const unsubTournament = onSnapshot(doc(db, 'tournaments', tournament.id), (snap) => {
      if (snap.exists()) {
        setCurrentTournament({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsubTournament();
  }, [tournament.id]);

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
    // Cleanup old messages once when arena detail opens
    cleanupOldMessages();

    if (!activeMatchChat && !showArenaChat) return;

    const chatId = showArenaChat ? tournament.id : activeMatchChat?.id;
    if (!chatId) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      where('tournamentId', '==', tournament.id)
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
  }, [activeMatchChat, showArenaChat, tournament.id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || (!activeMatchChat && !showArenaChat)) return;
    const chatId = showArenaChat ? tournament.id : activeMatchChat?.id;
    if (!chatId) return;

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: chatId,
        tournamentId: tournament.id,
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

  const renderArenaChat = () => {
    if (!showArenaChat) return null;

    const copyMessage = (text: string) => {
      navigator.clipboard.writeText(text);
      setActiveMenu(null);
    };

    return createPortal(
      <div className="fixed inset-0 z-[5000] bg-white flex flex-col animate-in fade-in slide-in-from-right duration-500">
        <div className="p-8 pt-16 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc]">
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-black uppercase tracking-widest">ARENA GLOBAL CHAT</span>
             <h3 className="text-xl font-black uppercase italic text-black">
               {tournament.title}
             </h3>
           </div>
           <button 
             onClick={() => { setShowArenaChat(false); setActiveMenu(null); setMessages([]); }}
             className="w-12 h-12 rounded-full nm-flat flex items-center justify-center text-slate-400 active:nm-pressed"
           >
             <XCircle size={24} />
           </button>
        </div>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar pb-32 bg-[#f8fafc] scroll-smooth"
        >
           {messages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <div className="w-20 h-20 rounded-3xl nm-flat flex items-center justify-center text-slate-300 mb-6">
                  <MessageSquare size={32} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 italic">No messages in arena yet</p>
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
                  "flex gap-2 max-w-[90%] group relative",
                  isMe ? "ml-auto flex-row-reverse" : "flex-row",
                  isFirstInGroup ? "mt-4" : "mt-0.5"
                )}>
                  {/* Avatar */}
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
                          "px-4 py-2.5 rounded-2xl text-sm font-semibold leading-relaxed border transition-all break-all whitespace-pre-wrap cursor-pointer select-none shadow-sm",
                          isMe 
                            ? "bg-fc-dark text-white border-slate-700 rounded-tr-sm" 
                            : cn("text-white border-transparent rounded-tl-sm", getUserIdColor(m.senderId))
                        )}
                      >
                        {m.text}
                      </div>

                      {/* Reactions Overlay */}
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

                    {/* Seen & Timestamp */}
                    {(idx === messages.length - 1 || messages[idx + 1].senderId !== m.senderId || showMenu) && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[7px] text-black font-bold uppercase tracking-tighter">
                          {formatMessageTimestamp(m.timestamp)}
                        </span>
                        {isMe && seenCount > 0 && (
                          <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter flex items-center gap-1">
                            Seen by {seenCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Interaction Modal */}
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
              placeholder="Type your message..."
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

  const renderMatchChat = () => {
    if (!activeMatchChat) return null;

    const currentUid = auth.currentUser?.uid;
    const canAccessChat = (
      currentUid === activeMatchChat.homePlayerId ||
      currentUid === activeMatchChat.awayPlayerId ||
      isAdminUser ||
      isPublisher
    );

    if (!canAccessChat) {
      return (
        <div className="fixed inset-0 z-[3500] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm text-center space-y-5 shadow-2xl border-2 border-white">
            <div className="w-16 h-16 rounded-3xl nm-flat bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
              <Lock size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black uppercase italic text-slate-900">Private Match Room</h3>
              <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                This chat is private. Only Player 1 ({activeMatchChat.homePlayerName}), Player 2 ({activeMatchChat.awayPlayerName}), and the Tournament Publisher can access this conversation.
              </p>
            </div>
            <Button 
              onClick={() => setActiveMatchChat(null)}
              className="w-full h-12 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
            >
              Close / Go Back
            </Button>
          </div>
        </div>
      );
    }

    const copyMessage = (text: string) => {
      navigator.clipboard.writeText(text);
      setActiveMenu(null);
    };

    return createPortal(
      <div className="fixed inset-0 z-[5000] bg-white flex flex-col animate-in fade-in slide-in-from-right duration-500">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc] pt-12">
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-black uppercase tracking-widest">MATCH CHAT</span>
             <h3 className="text-sm font-black uppercase italic text-black">
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
                  {/* Avatar */}
                  <div className="flex-shrink-0 w-8">
                    {isFirstInGroup && (
                      <div className={cn(
                        "w-8 h-8 rounded-full border-2 border-white shadow-md overflow-hidden flex items-center justify-center text-white text-[10px] font-black uppercase",
                        m.senderAvatar ? "bg-slate-200" : getUserIdColor(m.senderId)
                      )}>
                        {m.senderAvatar ? (
                          <img src={m.senderAvatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                          m.senderName?.charAt(0) || '?'
                        )}
                      </div>
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

                      {/* Reactions */}
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

                    {/* Seen & Timestamp */}
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

                    {/* Interaction Modal */}
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

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    // Fetch user's registration for this tournament
    const regQ = query(
      collection(db, 'registrations'), 
      where('tournamentId', '==', tournament.id),
      where('userId', '==', auth.currentUser.uid)
    );
    const unsubReg = onSnapshot(regQ, (snap) => {
      if (!snap.empty) {
        setRegistration({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setRegistration(null);
      }
    });

    // Fetch matches
    const matchesQ = query(
      collection(db, 'matches'),
      where('tournamentId', '==', tournament.id)
    );
    const unsubMatches = onSnapshot(matchesQ, (snap) => {
      setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    });

    // Fetch all registrations (participants)
    const playersQ = query(
      collection(db, 'registrations'),
      where('tournamentId', '==', tournament.id)
    );
    const unsubPlayers = onSnapshot(playersQ, (pSnap) => {
      const regs = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setParticipants(regs);
    });

    return () => {
      unsubReg();
      unsubMatches();
      unsubPlayers();
    };
  }, [tournament.id, auth.currentUser?.uid]);

  // Separate effect to fetch profiles for participants and matches
  useEffect(() => {
    const fetchMissing = async () => {
      const uids = new Set<string>();
      participants.forEach(p => uids.add(p.userId));
      matches.forEach(m => {
        uids.add(m.homePlayerId);
        uids.add(m.awayPlayerId);
      });

      const missing = Array.from(uids).filter(uid => !profiles[uid]);
      if (missing.length === 0) return;

      const newProfiles = { ...profiles };
      let changed = false;

      await Promise.all(missing.map(async (uid) => {
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
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
  }, [participants, matches]);

  const handleJoin = async () => {
    if (!profile) return alert('Please set up your profile first');
    
    // Profile Validation
    const isProfileComplete = profile.inGameName && profile.inGameUID && profile.ovr && profile.fbUrl;
    if (!isProfileComplete) {
      alert('Incomplete Profile! Please add your In-Game Name, UID, OVR, and Facebook Link in your profile settings.');
      return;
    }

    try {
      await addDoc(collection(db, 'registrations'), {
        tournamentId: tournament.id,
        userId: auth.currentUser?.uid,
        status: 'pending',
        gameName: profile.inGameName,
        gameUid: profile.inGameUID,
        ovr: profile.ovr || 0,
        createdAt: Timestamp.now()
      });
      alert('Request sent! Waiting for publisher approval.');
    } catch (err) {
      console.error(err);
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
          // Compress quality to 0.5 to guarantee size strictly under 100 KB
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
          {/* Header */}
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
             {/* Scores */}
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

             {/* Evidence */}
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

             {/* Deploy Button */}
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

  const handleAdminResolve = async (match: Match, action: 'approve' | 'reset') => {
    try {
      if (action === 'reset') {
        await updateDoc(doc(db, 'matches', match.id), {
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
          screenshotUrl: null,
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

  const handleConfirmResult = async (match: Match) => {
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        updatedAt: Timestamp.now()
      });
      
      // Basic points update logic (prototype)
      const homeScore = match.homeScore || 0;
      const awayScore = match.awayScore || 0;
      
      if (homeScore > awayScore) {
        // Home wins: +100 pts
        await updateDoc(doc(db, 'users', match.homePlayerId), { eliteScore: (profiles[match.homePlayerId]?.eliteScore || 0) + 100 });
      } else if (awayScore > homeScore) {
        // Away wins: +100 pts
        await updateDoc(doc(db, 'users', match.awayPlayerId), { eliteScore: (profiles[match.awayPlayerId]?.eliteScore || 0) + 100 });
      } else {
        // Draw: +25 pts each
        await updateDoc(doc(db, 'users', match.homePlayerId), { eliteScore: (profiles[match.homePlayerId]?.eliteScore || 0) + 25 });
        await updateDoc(doc(db, 'users', match.awayPlayerId), { eliteScore: (profiles[match.awayPlayerId]?.eliteScore || 0) + 25 });
      }

      alert('Result confirmed! Points updated.');
    } catch (err) {
      console.error(err);
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

  const handleResetTournament = async () => {
    if (!confirm('EXTREME DANGER: This will delete ALL matches and clear all group assignments. Continue?')) return;
    
    setDeploying(true);
    try {
      // 1. Delete all matches
      const matchQuery = query(collection(db, 'matches'), where('tournamentId', '==', tournament.id));
      const matchSnap = await getDocs(matchQuery);
      await Promise.all(matchSnap.docs.map(d => deleteDoc(doc(db, 'matches', d.id))));

      // 2. Clear group assignments
      const regQuery = query(collection(db, 'registrations'), where('tournamentId', '==', tournament.id));
      const regSnap = await getDocs(regQuery);
      await Promise.all(regSnap.docs.map(d => updateDoc(doc(db, 'registrations', d.id), { 
        groupId: null,
        stage: null 
      })));

      // 3. Reset tournament status
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        status: 'open',
        winnerId: null,
        winnerText: null
      });

      alert('Tournament reset successfully.');
    } catch (err) {
      console.error(err);
      alert('Reset failed');
    } finally {
      setDeploying(false);
    }
  };

  const [showManualAssign, setShowManualAssign] = useState(false);

  const renderManageTab = () => {
    const approved = participants.filter(p => p.status === 'approved');
    const pending = participants.filter(p => p.status === 'pending');
    const hasMatches = matches.length > 0;
    const groupsList = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center text-center space-y-3">
           <div className="w-16 h-16 rounded-[2rem] nm-flat flex items-center justify-center text-indigo-500 border border-white/50 mb-2">
             <Settings size={32} />
           </div>
           <h3 className="text-xl font-black text-slate-800 uppercase italic">Tournament Manager</h3>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">
             Control group assignments, match deployments, <br /> and overall tournament lifecycle
           </p>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-6">
           <div className="nm-flat rounded-[2.5rem] p-6 border-2 border-white space-y-2">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Players</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{approved.length}</span>
                <span className="text-[10px] font-bold text-slate-300">/ {tournament.totalSlots}</span>
              </div>
           </div>
           <div className="nm-flat rounded-[2.5rem] p-6 border-2 border-white space-y-2">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pending</span>
              <span className="text-2xl font-black text-amber-500 block">{pending.length}</span>
           </div>
        </div>

        {/* Action Center */}
        {!hasMatches ? (
          <Card className="p-8 border-none space-y-8 bg-slate-50/50">
             <div className="space-y-2 text-center">
                <h4 className="text-xs font-black text-slate-800 uppercase italic">Deployment Hub</h4>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Select your deployment strategy</p>
             </div>
             
             <div className="space-y-4">
                <button 
                  onClick={handleAutoDeploy}
                  disabled={deploying || approved.length < 2}
                  className="w-full py-5 rounded-[2rem] bg-fc-dark text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-50"
                >
                  <Zap size={18} fill="currentColor" className="text-amber-400" />
                  {deploying ? 'Deploying...' : 'Automatic Deployment'}
                </button>
                <p className="text-[7px] font-bold text-slate-400 uppercase text-center px-6">Shuffles approved players and creates group stages automatically (Home & Away)</p>
             </div>

             <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                <span className="relative px-4 bg-[#f8fafc] text-[8px] font-black text-slate-300 uppercase tracking-[0.3em]">OR</span>
             </div>

             <div className="space-y-4">
                <button 
                  onClick={() => setShowManualAssign(!showManualAssign)}
                  className={cn(
                    "w-full py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all",
                    showManualAssign ? "bg-indigo-100 text-indigo-600 border-indigo-200" : "bg-white border border-slate-200 text-slate-800"
                  )}
                >
                  <List size={18} className={showManualAssign ? "text-indigo-600" : "text-slate-400"} />
                  {showManualAssign ? 'Close Manual Setup' : 'Manual Group Setup'}
                </button>
                <p className="text-[7px] font-bold text-slate-400 uppercase text-center px-6">Assign players to groups manually before generating matches</p>
             </div>

             {showManualAssign && (
               <div className="pt-6 space-y-6 animate-in slide-in-from-top-4">
                 <div className="h-px bg-slate-200" />
                 <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Assign Players to Groups</h4>
                 <div className="space-y-3">
                   {approved.map(player => (
                     <div key={player.id} className="flex items-center justify-between p-3 nm-inset rounded-2xl bg-white">
                       <span className="text-[10px] font-bold text-slate-700 uppercase">{player.gameName}</span>
                       <select 
                         value={player.groupId || ''}
                         onChange={(e) => handleManualAssign(player.id, e.target.value)}
                         className="bg-transparent text-[10px] font-black text-indigo-500 uppercase outline-none"
                       >
                         <option value="">No Group</option>
                         {groupsList.map(g => <option key={g} value={g}>Group {g}</option>)}
                       </select>
                     </div>
                   ))}
                 </div>
                 <button 
                  onClick={async () => {
                    if (approved.some(p => !p.groupId)) {
                      alert('All approved players must be assigned to a group first.');
                      return;
                    }
                    // Reuse match generation logic from auto deploy but without shuffling
                    setDeploying(true);
                    try {
                      const matchBatch = [];
                      for (const gName of groupsList) {
                        const gPlayers = approved.filter(p => p.groupId === gName);
                        if (gPlayers.length < 2) continue;
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
                              scheduledTime: Timestamp.now(),
                              createdAt: Timestamp.now()
                            }));
                          }
                        }
                      }
                      await Promise.all(matchBatch);
                      await updateDoc(doc(db, 'tournaments', tournament.id), { status: 'ongoing' });
                      alert('Matches generated based on your assignments!');
                      setActiveTab('group');
                    } catch(err) { console.error(err); }
                    finally { setDeploying(false); }
                  }}
                  className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200"
                 >
                   Generate Matches
                 </button>
               </div>
             )}
          </Card>
        ) : (
          <div className="nm-inset rounded-[2.5rem] p-10 border border-white/50 bg-indigo-50/30 flex flex-col items-center gap-4 text-center">
             <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                <CheckCircle size={24} />
             </div>
             <div className="space-y-1">
                <span className="text-sm font-black text-slate-900 uppercase italic">Tournament Deployed</span>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active matches are now live for all players</p>
             </div>
             <button 
              onClick={handleResetTournament}
              className="mt-4 text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline"
             >
               Emergency Reset
             </button>
          </div>
        )}

        {/* Pending Approval List in Manage Tab too for convenience */}
        {pending.length > 0 && (
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Pending Approvals</h4>
            <div className="space-y-3">
              {pending.map(reg => (
                <Card key={reg.id} className="p-5 border-none">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center bg-slate-50 text-slate-300 font-black italic">
                        {reg.gameName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-800 uppercase italic">{reg.gameName}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">OVR {reg.ovr}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => handleApproveRegistration(reg.id)} className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-md"><CheckCircle size={16} /></button>
                       <button onClick={() => handleRejectRegistration(reg.id)} className="w-9 h-9 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-md"><X size={16} /></button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleRejectRegistration = async (regId: string) => {
    if (!confirm('Are you sure you want to reject this player?')) return;
    try {
      await updateDoc(doc(db, 'registrations', regId), {
        status: 'rejected',
        updatedAt: Timestamp.now()
      });
      alert('Player rejected.');
    } catch (err) {
      console.error(err);
    }
  };

  const renderPlayerModal = () => {
    if (!selectedPlayerProfile) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
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
                
                {selectedPlayerProfile.whatsappNumber && (
                  <a href={`https://wa.me/${selectedPlayerProfile.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="w-full h-14 rounded-2xl nm-flat bg-white flex items-center justify-center gap-3 border border-slate-100 hover:bg-slate-50 transition-colors">
                    <MessageCircle size={18} className="text-green-500" />
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
    { id: 'group' as ArenaTab, icon: LayoutGrid, label: 'Groups' },
    { id: 'knockout' as ArenaTab, icon: GitPullRequest, label: 'Brackets' },
    { id: 'ranking' as ArenaTab, icon: Trophy, label: 'Ranking' },
    { id: 'players' as ArenaTab, icon: List, label: 'Players' },
    { id: 'rules' as ArenaTab, icon: FileText, label: 'Rules' },
    ...(isAdminUser ? [{ id: 'manage' as ArenaTab, icon: Settings, label: 'Manage' }] : []),
  ];

  const numGroups = Math.max(4, Math.min(16, Math.ceil(((currentTournament?.totalSlots || tournament?.totalSlots || 16)) / 4)));
  const groups = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i));
  const knockoutStages = ['R16', 'QTR', 'SEMI', 'FINAL'];

  const calculateGroupTable = (groupId: string) => {
    const groupParticipants = participants.filter(p => p.groupId === groupId);
    const groupMatches = matches.filter(m => m.groupId === groupId && m.status === 'completed');

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
          else if ((m.homeScore || 0) === (m.awayScore || 0)) { stats.drawn++; stats.pts += 1; }
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

  const calculateOverallRanking = () => {
    const table = participants.map(p => {
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
        pts: 0,
        ovr: p.ovr || 0,
        rankPoints: 0 // FIFA-like performance index
      };

      const playerMatches = matches.filter(m => 
        (m.homePlayerId === p.userId || m.awayPlayerId === p.userId) && 
        m.status === 'completed'
      );

      playerMatches.forEach(m => {
        stats.played++;
        const isHome = m.homePlayerId === p.userId;
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;

        if (isHome) {
          stats.goalsFor += hScore;
          stats.goalsAgainst += aScore;
          if (hScore > aScore) { stats.won++; stats.pts += 3; stats.rankPoints += 50; }
          else if (hScore === aScore) { stats.drawn++; stats.pts += 1; stats.rankPoints += 20; }
          else { stats.lost++; stats.rankPoints += 5; }
        } else {
          stats.goalsFor += aScore;
          stats.goalsAgainst += hScore;
          if (aScore > hScore) { stats.won++; stats.pts += 3; stats.rankPoints += 50; }
          else if (aScore === hScore) { stats.drawn++; stats.pts += 1; stats.rankPoints += 20; }
          else { stats.lost++; stats.rankPoints += 5; }
        }
        
        // Bonus for goals
        stats.rankPoints += (isHome ? hScore : aScore) * 5;
        // Stage weight
        if (m.stage === 'FINAL') stats.rankPoints += 500;
        else if (m.stage === 'SEMI') stats.rankPoints += 250;
        else if (m.stage === 'QTR') stats.rankPoints += 150;
        else if (m.stage === 'R16') stats.rankPoints += 100;
        else stats.rankPoints += 20; // Group stage participation
      });

      stats.gd = stats.goalsFor - stats.goalsAgainst;
      return stats;
    });

    return table.sort((a, b) => {
      if (b.rankPoints !== a.rankPoints) return b.rankPoints - a.rankPoints;
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.goalsFor - a.goalsFor;
    });
  };

  const renderMatchCard = (match: Match) => {
    const homeProfile = profiles[match.homePlayerId];
    const awayProfile = profiles[match.awayPlayerId];
    const isHome = auth.currentUser?.uid === match.homePlayerId;
    const isAway = auth.currentUser?.uid === match.awayPlayerId;
    const isParticipant = isHome || isAway;
    const canAccessMatchChat = isHome || isAway || isAdminUser || isPublisher;

    const homeWin = (match.homeScore || 0) > (match.awayScore || 0);
    const awayWin = (match.awayScore || 0) > (match.homeScore || 0);
    const isCompleted = match.status === 'completed';

    const getStageLabel = () => {
      if (match.stage === 'group') return `Group Stage · Group ${match.groupId}`;
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

        <div className="p-8 space-y-8 relative z-10">
          <div className="flex items-center justify-between relative z-10">
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
            {/* Home Player */}
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
                  {homeProfile?.inGameName || 'Loading...'}
                </h5>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{homeProfile?.ovr || 0} OVR</span>
              </div>
            </div>

            {/* Score Box */}
            <div className="flex flex-col items-center gap-4 px-2">
               {isCompleted || match.status === 'reported' || match.status === 'disputed' ? (
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

            {/* Away Player */}
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
                  {awayProfile?.inGameName || 'Loading...'}
                </h5>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{awayProfile?.ovr || 0} OVR</span>
              </div>
            </div>
          </div>

          {/* Action Buttons & Two-Step Verification */}
          <div className="flex flex-wrap gap-3 pt-4 relative z-10 border-t border-slate-50">
            {/* Step 1: Upload Result (Only Home Player can report) */}
            {isHome && match.status === 'scheduled' && (
              <button 
                onClick={() => handleUploadResult(match)}
                className="flex-1 min-w-[140px] h-12 rounded-xl bg-fc-green text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-fc-green/20 active:scale-95 transition-transform"
              >
                <Upload size={14} /> Step 1: Upload Score & Proof
              </button>
            )}
            
            {/* Step 2: Confirm or Dispute Result (Only Away Player or Admin) */}
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

            {/* Private Tactical Match Chat - Authorized Only */}
            {canAccessMatchChat ? (
              <button 
                onClick={() => setActiveMatchChat(match)}
                className="flex-1 min-w-[120px] h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 active:scale-95 transition-transform"
              >
                <MessageSquare size={14} className="text-amber-300" />
                <span>Match Room Chat</span>
                <span className="text-[7px] bg-white/20 px-2 py-0.5 rounded-full font-bold">PRIVATE</span>
              </button>
            ) : (
              <button 
                onClick={() => setActiveMatchChat(match)}
                className="flex-1 min-w-[120px] h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 active:scale-95 transition-transform"
              >
                <Lock size={12} className="text-slate-400" />
                <span>Private Match Room</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBracketSide = (side: 'left' | 'right', count: number) => {
    const stageMatches = matches.filter(m => m.stage === activeKnockoutStage);
    
    return (
      <div className="flex-1 flex flex-col gap-10 justify-center">
        {[...Array(count)].map((_, matchIdx) => {
          const actualIdx = side === 'left' ? matchIdx : (matchIdx + count);
          const match = stageMatches.find(m => m.matchId === `${activeKnockoutStage}_M${actualIdx + 1}`);
          
          return (
            <div key={matchIdx} className="space-y-1.5">
              {/* Home Player Box */}
              <div className={cn(
                "w-full h-12 flex items-center justify-between border transition-all shadow-sm",
                match ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200",
                side === 'left' ? "rounded-l-full rounded-r-xl pr-1 pl-4" : "rounded-r-full rounded-l-xl pl-1 pr-4"
              )}>
                {side === 'left' ? (
                  <>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", match ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-slate-300")} />
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest italic truncate",
                        match ? "text-white" : "text-slate-400"
                      )}>
                        {match?.homePlayerName || 'TBD'}
                      </span>
                    </div>
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                      match ? "bg-slate-800 text-amber-400" : "bg-slate-100 text-slate-300"
                    )}>
                      {match?.homeScore ?? '-'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                      match ? "bg-slate-800 text-amber-400" : "bg-slate-100 text-slate-300"
                    )}>
                      {match?.homeScore ?? '-'}
                    </div>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest italic truncate",
                        match ? "text-white" : "text-slate-400"
                      )}>
                        {match?.homePlayerName || 'TBD'}
                      </span>
                      <div className={cn("w-2 h-2 rounded-full shrink-0", match ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-slate-300")} />
                    </div>
                  </>
                )}
              </div>

              {/* Away Player Box */}
              <div className={cn(
                "w-full h-12 flex items-center justify-between border transition-all shadow-sm",
                match ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200",
                side === 'left' ? "rounded-l-full rounded-r-xl pr-1 pl-4" : "rounded-r-full rounded-l-xl pl-1 pr-4"
              )}>
                {side === 'left' ? (
                  <>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", match ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-slate-300")} />
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest italic truncate",
                        match ? "text-white" : "text-slate-400"
                      )}>
                        {match?.awayPlayerName || 'TBD'}
                      </span>
                    </div>
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                      match ? "bg-slate-800 text-amber-400" : "bg-slate-100 text-slate-300"
                    )}>
                      {match?.awayScore ?? '-'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                      match ? "bg-slate-800 text-amber-400" : "bg-slate-100 text-slate-300"
                    )}>
                      {match?.awayScore ?? '-'}
                    </div>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest italic truncate",
                        match ? "text-white" : "text-slate-400"
                      )}>
                        {match?.awayPlayerName || 'TBD'}
                      </span>
                      <div className={cn("w-2 h-2 rounded-full shrink-0", match ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-slate-300")} />
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

  const renderThirdPlaceMatch = () => {
    const match = matches.find(m => m.stage === '3RD_PLACE');
    if (!match) return null;

    return (
      <div className="pt-12 border-t border-slate-100 mt-12 space-y-8 animate-in fade-in duration-700">
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
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                      <div className="w-14 h-14 rounded-2xl nm-inset flex items-center justify-center text-slate-800 font-black italic border border-white/30 overflow-hidden bg-slate-50 group-hover:scale-105 transition-transform flex-shrink-0">
                         {p?.avatar ? (
                           <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                         ) : (
                           <UserIcon size={24} className="text-slate-300" />
                         )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-slate-800 uppercase italic group-hover:text-fc-green transition-colors truncate">{p?.inGameName || reg.gameName}</span>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">OVR {p?.ovr || reg.ovr}</span>
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
                            onClick={() => handleRejectRegistration(reg.id)}
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
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Group Selector */}
            <div className="flex overflow-x-auto gap-3 pb-4 no-scrollbar px-2">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={cn(
                    "min-w-[80px] h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200",
                    activeGroup === g 
                      ? "bg-slate-900 text-white shadow-xl font-black" 
                      : "nm-flat text-black font-black bg-white"
                  )}
                >
                  Group {g}
                </button>
              ))}
            </div>

            {/* Points Table */}
            <div className="nm-flat rounded-[2.5rem] border-4 border-white/40 overflow-hidden">
              <div className="bg-slate-50/50 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-1">ELITE PLAYER</span>
                <div className="flex gap-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="w-5 text-center">P</span>
                  <span className="w-5 text-center">W</span>
                  <span className="w-5 text-center">D</span>
                  <span className="w-5 text-center">L</span>
                  <span className="w-7 text-center">GD</span>
                  <span className="w-9 text-center text-slate-800">PTS</span>
                </div>
              </div>
              <div className="p-8 space-y-2">
                  {participants.filter(r => r.groupId === activeGroup).length === 0 ? (
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] italic leading-loose text-center py-8">
                      NO PARTICIPANTS IN THIS GROUP YET
                    </p>
                  ) : (
                    calculateGroupTable(activeGroup).map((row, i) => {
                      const p = profiles[row.userId];
                      return (
                        <div key={row.userId} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 rounded-xl transition-colors">
                          <div className="flex items-center gap-3 flex-1">
                            <span className={cn(
                              "text-[10px] font-black",
                              i < 2 ? "text-indigo-500" : "text-slate-300"
                            )}>
                              {i < 9 ? `0${i+1}` : i+1}
                            </span>
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-lg bg-slate-100 overflow-hidden">
                                  {p?.avatar && <img src={p.avatar} alt="" className="w-full h-full object-cover" />}
                               </div>
                               <span className="text-xs font-black text-slate-800 uppercase italic truncate max-w-[100px]">{p?.inGameName || row.name}</span>
                            </div>
                          </div>
                          <div className="flex gap-5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            <span className="w-5 text-center">{row.played}</span>
                            <span className="w-5 text-center">{row.won}</span>
                            <span className="w-5 text-center">{row.drawn}</span>
                            <span className="w-5 text-center">{row.lost}</span>
                            <span className="w-7 text-center">{row.gd > 0 ? `+${row.gd}` : row.gd}</span>
                            <span className="w-9 text-center text-slate-900">{row.pts}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
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
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            {/* Stage Header Info */}
            <div className="flex items-center justify-center px-2">
              <div className="nm-inset rounded-2xl p-1.5 flex items-center gap-1 border border-white/20">
                 {knockoutStages.map((stage, idx) => (
                   <React.Fragment key={stage}>
                     <button 
                       onClick={() => setActiveKnockoutStage(stage)}
                       className={cn(
                        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                        activeKnockoutStage === stage 
                          ? "nm-flat bg-slate-900 text-white shadow-lg scale-105 font-black" 
                          : "text-black font-black hover:text-black bg-white"
                      )}>
                       {stage}
                     </button>
                     {idx < knockoutStages.length - 1 && <div className="w-1 h-1 rounded-full bg-slate-200 mx-1" />}
                   </React.Fragment>
                 ))}
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <div className="relative min-w-[600px] flex justify-between items-stretch min-h-[400px] pt-10">
                {/* Left Bracket */}
                {renderBracketSide('left', 
                  activeKnockoutStage === 'R16' ? 4 : 
                  activeKnockoutStage === 'QTR' ? 2 : 1
                )}

                {/* Center Trophy / Final Placeholder */}
                <div className="flex-1 flex flex-col items-center justify-center py-10 px-8">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse" />
                    <div className="w-40 h-72 nm-flat rounded-[3rem] border-4 border-white/40 flex flex-col items-center justify-center gap-6 relative z-10 bg-white/50 backdrop-blur-sm p-4">
                      <div className={cn(
                        "transition-all duration-1000",
                        activeKnockoutStage === 'FINAL' || tournament.status === 'finished' ? "scale-110 rotate-[360deg]" : ""
                      )}>
                        <Trophy size={activeKnockoutStage === 'FINAL' ? 80 : 64} strokeWidth={1} className={cn(
                          "transition-all duration-700",
                          tournament.status === 'finished' ? "text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" : "text-slate-200"
                        )} />
                      </div>
                      <div className="text-center px-4 space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 block">
                          {tournament.status === 'finished' ? 'CHAMPION' : (activeKnockoutStage === 'FINAL' ? 'FINAL BATTLE' : 'GLORY')}
                        </span>
                        <div className="h-px w-12 bg-slate-200 mx-auto" />
                        {tournament.status === 'finished' && (
                          <div className="pt-2">
                             <span className="text-xs font-black text-indigo-600 uppercase italic tracking-tight block">
                               {tournament.winnerText || 'ELITE PLAYER'}
                             </span>
                             <div className="mt-2 w-16 h-16 rounded-2xl nm-inset mx-auto overflow-hidden border border-white/50">
                                {tournament.winnerId && profiles[tournament.winnerId] && profiles[tournament.winnerId].avatar ? (
                                  <img src={profiles[tournament.winnerId].avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <UserIcon size={32} className="text-slate-300 m-auto mt-2" />
                                )}
                             </div>
                          </div>
                        )}
                        {activeKnockoutStage === 'FINAL' && tournament.status !== 'finished' && (
                          <div className="pt-2 animate-bounce">
                             <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">LIVE SOON</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Bracket */}
                {renderBracketSide('right', 
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
                      if (activeKnockoutStage === 'FINAL') return m.stage === 'FINAL';
                      return m.stage === activeKnockoutStage;
                    }).map(m => renderMatchCard(m))
                  )}
               </div>
            </div>
          </div>
        );
      case 'ranking':
        const rankings = calculateOverallRanking();
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center text-center space-y-2 mb-10">
               <div className="w-16 h-16 rounded-3xl nm-flat flex items-center justify-center text-amber-500 border border-white/50 mb-2">
                 <Trophy size={32} fill="currentColor" />
               </div>
               <h3 className="text-xl font-black text-slate-800 uppercase italic">Power Rankings</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">
                 Global standings based on <br /> match performance & stage progression
               </p>
            </div>

            <div className="nm-flat rounded-[2.5rem] border-4 border-white/40 overflow-hidden bg-white">
              <div className="bg-slate-50/50 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-1">ELITE CONTENDER</span>
                <div className="flex gap-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="w-12 text-center">RATING</span>
                  <span className="w-10 text-center">W/L</span>
                  <span className="w-10 text-center text-slate-800">POINTS</span>
                </div>
              </div>
              
              <div className="p-4 space-y-2">
                {rankings.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] italic">Tournament has not started yet</p>
                  </div>
                ) : (
                  rankings.map((row, i) => {
                    const p = profiles[row.userId];
                    const rank = i + 1;
                    return (
                      <div key={row.userId} className={cn(
                        "flex items-center justify-between px-6 py-5 rounded-[2rem] transition-all border",
                        rank === 1 ? "bg-slate-900 border-slate-800 shadow-xl scale-[1.02]" : "hover:bg-slate-50 border-transparent"
                      )}>
                        <div className="flex items-center gap-5 flex-1">
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black italic",
                            rank === 1 ? "bg-amber-400 text-slate-900" :
                            rank === 2 ? "bg-slate-200 text-slate-600" :
                            rank === 3 ? "bg-orange-100 text-orange-600" :
                            "bg-slate-50 text-slate-300"
                          )}>
                            {rank}
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl nm-inset bg-white overflow-hidden border border-white/20">
                                {p?.avatar && <img src={p.avatar} alt="" className="w-full h-full object-cover" />}
                             </div>
                             <div className="flex flex-col">
                               <span className={cn(
                                 "text-sm font-black uppercase italic tracking-tight",
                                 rank === 1 ? "text-white" : "text-slate-800"
                               )}>{p?.inGameName || row.name}</span>
                               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">OVR {row.ovr}</span>
                             </div>
                          </div>
                        </div>
                        <div className="flex gap-8 text-[11px] font-black uppercase tracking-tight">
                          <div className={cn(
                            "w-12 text-center flex flex-col items-center",
                            rank === 1 ? "text-amber-400" : "text-indigo-500"
                          )}>
                            <span>{row.rankPoints}</span>
                            <span className="text-[7px] opacity-60">PTS</span>
                          </div>
                          <span className={cn("w-10 text-center", rank === 1 ? "text-slate-400" : "text-slate-400")}>
                            {row.won}/{row.lost}
                          </span>
                          <span className={cn("w-10 text-center", rank === 1 ? "text-white" : "text-slate-900")}>
                            {row.pts}
                          </span>
                        </div>
                      </div>
                    );
                  })
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
          <div className="nm-flat rounded-[2.5rem] p-8 border-4 border-white/40 space-y-6 animate-in fade-in duration-500 bg-white">
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
                  <div key={idx} className="flex items-center gap-2">
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
        <div className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-[8px] font-black uppercase tracking-widest border border-slate-700 flex items-center gap-2 shadow-sm backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          END
        </div>
      );
    }

    if (isLive) {
      return (
        <div className="px-3.5 py-1.5 rounded-full bg-rose-500/30 text-rose-300 text-[8px] font-black uppercase tracking-widest border border-rose-500/40 flex items-center gap-2 shadow-sm backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.9)]" />
          LIVE
        </div>
      );
    }

    return (
      <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/30 text-emerald-300 text-[8px] font-black uppercase tracking-widest border border-emerald-500/40 flex items-center gap-2 shadow-sm backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]"></span>
        </span>
        UPCOMING
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-soft-bg pb-32 relative animate-fade-in">
      {renderReportResultModal()}
      {renderMatchChat()}
      {renderArenaChat()}
      {renderPlayerModal()}
      
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
        {/* Tournament Identity Card */}
        <div className="nm-flat rounded-[3rem] p-3 border-2 border-white shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-fc-green/5 rounded-full -mr-16 -mt-16 blur-3xl" />
           <div className="relative h-64 rounded-[2.5rem] overflow-hidden bg-fc-dark">
              {/* Card background image */}
              <div className="absolute inset-0 opacity-40 grayscale group-hover:scale-105 transition-transform duration-1000">
                 <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover" alt="" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-fc-dark via-fc-dark/40 to-transparent" />
              
              <button 
                onClick={() => setShowArenaChat(true)}
                className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-fc-green text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform z-20"
              >
                 <MessageSquare size={20} />
              </button>

              <div className="absolute bottom-8 left-8 right-8">
                 <div className="flex items-center gap-3 mb-4">
                    {renderStatusBadge()}
                    <div className="px-3 py-1 rounded-full bg-white/10 text-[7px] font-black text-white uppercase tracking-widest border border-white/20">
                      ID: {tournament.id.slice(0, 8)}
                    </div>
                 </div>
                 <h1 className="text-4xl font-black text-white uppercase italic leading-none tracking-tighter mb-4">{tournament.title}</h1>
                 <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Participants</span>
                       <div className="flex items-center gap-2">
                          <Users size={12} className="text-fc-green" />
                          <span className="text-lg font-black text-white">{tournament.filledSlots}/{tournament.totalSlots}</span>
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
            <div className="nm-flat rounded-[2rem] p-6 border-2 border-white bg-white/50 backdrop-blur-sm space-y-4">
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

            <div className="nm-flat rounded-[2rem] p-6 border-2 border-white bg-white/50 backdrop-blur-sm space-y-4">
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

        {/* Publisher 4 Management Modes */}
        {isAdminUser && (
          <div className="nm-flat rounded-[2.5rem] p-6 border-2 border-white bg-white/80 backdrop-blur-md space-y-4 shadow-xl">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                   <Settings size={18} className="text-indigo-600" />
                   <h3 className="text-xs font-black text-slate-900 uppercase italic tracking-tight">Publisher Control Modes</h3>
                </div>
                <span className="text-[8px] font-black px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 uppercase tracking-widest border border-indigo-100">4 Deployment Modes</span>
             </div>

             <div className="space-y-3">
                {/* Mode 1: Automatic Group Setup */}
                <button 
                  onClick={handleAutoGroupSetup}
                  disabled={actionLoading}
                  className="w-full py-4 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-between shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <Zap size={16} className="text-amber-300 animate-pulse" />
                    <span>1. AUTOMATIC GROUP SETUP</span>
                  </div>
                  <span className="text-[8px] bg-white/20 px-2.5 py-1 rounded-full font-black">RUN AUTO</span>
                </button>

                {/* Mode 2: Automatic Match Deploy */}
                <button 
                  onClick={handleAutoMatchDeploy}
                  disabled={actionLoading}
                  className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-between shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <Trophy size={16} className="text-emerald-200" />
                    <span>2. AUTOMATIC MATCH DEPLOY</span>
                  </div>
                  <span className="text-[8px] bg-white/20 px-2.5 py-1 rounded-full font-black">DEPLOY</span>
                </button>

                {/* Mode 3 & 4: Manual Controls */}
                <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button 
                    onClick={() => setShowManualGroupModal(true)}
                    className="py-3.5 px-4 rounded-2xl nm-inset bg-slate-100 hover:bg-slate-200 text-slate-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 transition-all active:scale-95"
                  >
                    <Edit3 size={14} className="text-indigo-500" />
                    <span>3. MANUAL GROUP SETUP</span>
                  </button>

                  <button 
                    onClick={() => setShowManualMatchModal(true)}
                    className="py-3.5 px-4 rounded-2xl nm-inset bg-slate-100 hover:bg-slate-200 text-slate-800 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 transition-all active:scale-95"
                  >
                    <Plus size={14} className="text-emerald-600" />
                    <span>4. MANUAL MATCH DEPLOY</span>
                  </button>
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
                   active ? "bg-slate-900 text-white shadow-lg font-black" : "text-black hover:text-black font-black"
                 )}
               >
                 <Icon size={18} className={active ? "text-white" : "text-black"} />
                 <span className={cn("text-[8px] font-black uppercase tracking-tighter", active ? "text-white" : "text-black")}>{tab.label}</span>
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
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 space-y-6 max-h-[85vh] flex flex-col shadow-2xl border-2 border-white/20">
             <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                   <h3 className="text-sm font-black text-slate-900 uppercase italic">3. MANUAL GROUP SETUP</h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Assign players to Group A, B, C, D manually</p>
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
                            <div className="w-10 h-10 rounded-xl bg-white nm-inset overflow-hidden border border-slate-200 shrink-0">
                               {prof?.avatar ? <img src={prof.avatar} className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-slate-300 m-auto mt-2" />}
                            </div>
                            <div className="min-w-0 flex-1">
                               <span className="text-xs font-black text-slate-900 uppercase italic block truncate">{prof?.inGameName || p.gameName}</span>
                               <span className="text-[8px] font-bold text-slate-400 uppercase">OVR {prof?.ovr || p.ovr}</span>
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
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
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
    </div>
  );
};
