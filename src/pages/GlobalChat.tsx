import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, query, orderBy, limit, onSnapshot, addDoc, Timestamp, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Send, User as UserIcon, MessageSquare, ArrowRight, Trash2, Copy, Smile, CheckCircle2, MoreVertical } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { Reveal } from '@/src/components/ui/Reveal';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMessageTimestamp, cleanupOldMessages } from '@/src/lib/chatUtils';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: Timestamp;
  reactions?: Record<string, string[]>; // emoji -> [userIds]
  seenBy?: string[]; // [userIds]
}

const REACTIONS = ['❤️', '👍', '🔥', '😂', '😮', '😢'];

const BUBBLE_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-rose-500', 'bg-amber-500', 
  'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-orange-500'
];

const getUserIdColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BUBBLE_COLORS[Math.abs(hash) % BUBBLE_COLORS.length];
};

export const GlobalChatPage = ({ profile }: { profile: UserProfile | null }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Periodically cleanup messages older than 15 days
    cleanupOldMessages();

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', 'global'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgData);
      setLoading(false);
      
      // Mark as seen logic
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        msgData.forEach(msg => {
          if (msg.senderId !== currentUid && (!msg.seenBy || !msg.seenBy.includes(currentUid))) {
            updateDoc(doc(db, 'messages', msg.id), {
              seenBy: arrayUnion(currentUid)
            }).catch(e => console.error("Seen update failed", e));
          }
        });
      }

      // Auto scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => unsubscribe();
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: 'global',
        senderId: auth.currentUser?.uid || '',
        senderName: profile.inGameName || 'Player',
        senderAvatar: profile.avatar || '',
        text: newMessage,
        timestamp: Timestamp.now(),
        reactions: {},
        seenBy: [auth.currentUser?.uid]
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
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

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setActiveMenu(null);
    // Simple notification could be added here
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

  const openPrivateMessage = (player: any) => {
    // This could redirect to a private chat or messenger link
    if (player.messengerLink) {
      window.open(player.messengerLink, '_blank');
    } else if (player.fbUrl) {
      window.open(player.fbUrl, '_blank');
    } else {
      alert(`Contacting ${player.inGameName} via field comms... (Direct Messaging coming soon)`);
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="LOADING COMMS..." />;

  return (
    <div className="flex flex-col space-y-6 pb-32">
      <Reveal direction="left">
        <div className="flex flex-col gap-1 px-4">
          <h2 className="text-xl font-black text-black uppercase italic leading-none">ARENA CHAT</h2>
          <p className="text-[9px] font-black text-black uppercase tracking-widest">GLOBAL FIELD COMMS</p>
        </div>
      </Reveal>

      <Reveal direction="left" delay={100} className="flex-1">
        <div className="nm-flat rounded-[3rem] p-3 border-4 border-white/40 flex flex-col h-[65vh] min-h-[500px] overflow-hidden">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 px-4 custom-scrollbar py-6 scroll-smooth"
          >
            {messages.map((msg, idx) => {
              const isMe = msg.senderId === auth.currentUser?.uid;
              const showMenu = activeMenu === msg.id;
              const seenCount = (msg.seenBy?.length || 0) - (isMe ? 1 : 0);
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId;
              
              return (
                <div key={msg.id} className={cn(
                  "flex gap-2 max-w-[92%] group relative",
                  isMe ? "ml-auto flex-row-reverse" : "flex-row",
                  isFirstInGroup ? "mt-4" : "mt-0.5"
                )}>
                  {/* Avatar - Only show for first message in a cluster */}
                  <div className="flex-shrink-0 w-8">
                    {isFirstInGroup && (
                      <button 
                        onClick={() => !isMe && openPrivateMessage({ inGameName: msg.senderName, avatar: msg.senderAvatar })}
                        className="active:scale-90 transition-transform"
                      >
                        {msg.senderAvatar ? (
                          <img src={msg.senderAvatar} className="w-8 h-8 rounded-full border-2 border-white shadow-md object-cover" alt="" />
                        ) : (
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-md uppercase",
                            getUserIdColor(msg.senderId)
                          )}>
                            {msg.senderName.charAt(0)}
                          </div>
                        )}
                      </button>
                    )}
                  </div>

                  <div className={cn(
                    "flex flex-col",
                    isMe ? "items-end" : "items-start"
                  )}>
                    {/* Name - Only show for first message in a cluster */}
                    {isFirstInGroup && (
                      <span className="text-[8px] font-black text-black uppercase tracking-widest px-2 mb-1">
                        {msg.senderName}
                      </span>
                    )}

                    {/* Message Bubble */}
                    <div className="relative group/bubble max-w-full">
                      <motion.div 
                        layoutId={msg.id}
                        onClick={() => setActiveMenu(showMenu ? null : msg.id)}
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-sm font-semibold leading-relaxed border transition-all break-all whitespace-pre-wrap cursor-pointer select-none shadow-sm",
                          isMe 
                            ? "bg-indigo-600 text-white border-indigo-500 rounded-tr-sm" 
                            : cn("text-white border-transparent rounded-tl-sm", getUserIdColor(msg.senderId))
                        )}
                      >
                        {msg.text}
                      </motion.div>

                      {/* Reactions Overlay */}
                      {msg.reactions && Object.entries(msg.reactions).some(([_, users]) => users.length > 0) && (
                        <div className={cn(
                          "absolute -bottom-2.5 flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-slate-100 shadow-sm z-10",
                          isMe ? "right-1" : "left-1"
                        )}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => {
                            if (users.length === 0) return null;
                            return (
                              <span key={emoji} className="text-[10px] flex items-center gap-0.5 leading-none">
                                {emoji} <span className="text-[7px] font-black text-slate-400">{users.length > 1 ? users.length : ''}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Quick Action Trigger (Three dots) */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(showMenu ? null : msg.id); }}
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-slate-300 hover:text-slate-500",
                          isMe ? "-left-8" : "-right-8"
                        )}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>

                    {/* Footer: Timestamp & Seen Status */}
                    {(idx === messages.length - 1 || messages[idx + 1].senderId !== msg.senderId || showMenu) && (
                      <div className="flex items-center gap-2 mt-1 px-1 min-h-[12px]">
                        <span className="text-[7px] text-black font-bold uppercase tracking-tighter">
                          {formatMessageTimestamp(msg.timestamp)}
                        </span>
                        {isMe && (
                          <div className="flex items-center gap-1">
                            {seenCount > 0 ? (
                              <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter flex items-center gap-1">
                                <CheckCircle2 size={8} /> Seen by {seenCount}
                              </span>
                            ) : (
                              <span className="text-[7px] font-bold text-slate-200 uppercase tracking-tighter">Sent</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interaction Modal */}
                    <AnimatePresence>
                      {showMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className={cn(
                              "absolute z-50 bottom-full mb-2 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 p-2 min-w-[180px]",
                              isMe ? "right-0" : "left-0"
                            )}
                          >
                            <div className="flex items-center justify-around pb-2 border-b border-slate-50 mb-2">
                              {REACTIONS.map(emoji => (
                                <button 
                                  key={emoji} 
                                  onClick={() => reactToMessage(msg.id, emoji)}
                                  className="text-xl hover:scale-125 transition-transform p-1 filter drop-shadow-sm"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <div className="space-y-1">
                              <button 
                                onClick={() => copyMessage(msg.text)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest transition-colors"
                              >
                                <Copy size={14} className="text-slate-400" /> Copy Text
                              </button>
                              {!isMe && (
                                <button 
                                  onClick={() => openPrivateMessage({ inGameName: msg.senderName, avatar: msg.senderAvatar })}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest transition-colors"
                                >
                                  <MessageSquare size={14} className="text-indigo-400" /> Message Player
                                </button>
                              )}
                              {isMe && (
                                <button 
                                  onClick={() => deleteMessage(msg.id)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 rounded-xl text-[10px] font-black text-rose-500 uppercase tracking-widest transition-colors"
                                >
                                  <Trash2 size={14} className="text-rose-400" /> Delete Message
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
            })}
            
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-60 opacity-40">
                 <div className="w-20 h-20 rounded-[2.5rem] nm-flat flex items-center justify-center text-indigo-500 mb-6">
                    <MessageSquare size={32} />
                 </div>
                 <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 italic">No arena reports yet</span>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      <Reveal direction="left" delay={200}>
        <div className="sticky bottom-36 left-0 right-0 z-30 pt-4 bg-soft-bg/80 backdrop-blur-sm px-1">
          <form onSubmit={sendMessage} className="relative flex items-center gap-3">
            <div className="flex-1 relative">
              <Input 
                placeholder="Message the field..." 
                className="h-16 pr-12 text-sm rounded-[2rem] nm-inset border-2 border-white/20 bg-[#e6e6e9]/40 placeholder:text-slate-400 placeholder:italic font-semibold"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button 
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
              >
                <Smile size={20} />
              </button>
            </div>
            <button 
              type="submit"
              disabled={!newMessage.trim()}
              className="w-16 h-16 rounded-[1.8rem] bg-indigo-600 text-white flex items-center justify-center active:scale-95 disabled:opacity-50 transition-all shadow-xl shadow-indigo-200 flex-shrink-0"
            >
              <Send size={24} />
            </button>
          </form>
        </div>
      </Reveal>
    </div>
  );
};

