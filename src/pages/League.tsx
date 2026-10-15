import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, Timestamp, getDocs, getDoc, runTransaction, orderBy, limit, arrayUnion } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { logPointTransaction } from '@/src/lib/points';
import { Users, Shield, Plus, Search, Globe, Trophy, ChevronRight, X, AlertCircle, MessageSquare, Send, Clock, User as UserIcon, Camera } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMessageTimestamp } from '@/src/lib/chatUtils';
import { createPortal } from 'react-dom';

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

interface League {
  id: string;
  name: string;
  description: string;
  country: string;
  minOvr: number;
  maxOvr: number;
  creatorId: string;
  admins: string[];
  memberCount: number;
  maxMembers: number;
  createdAt: Timestamp;
}

interface LeagueMembership {
  id: string;
  leagueId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'approved';
  joinedAt: Timestamp;
}

const COUNTRIES = [
  "Bangladesh", "India", "Pakistan", "United Kingdom", "United States", 
  "Germany", "France", "Spain", "Italy", "Brazil", "Argentina", 
  "Global", "Other"
];

export const LeaguePage = ({ profile }: { profile: UserProfile | null }) => {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    country: 'Bangladesh',
    minOvr: 80,
    maxOvr: 150
  });

  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedLeagueMembers, setSelectedLeagueMembers] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<(UserProfile & { membershipId: string })[]>([]);
  const [showLeagueChat, setShowLeagueChat] = useState(false);
  const [myMembership, setMyMembership] = useState<LeagueMembership | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedLeague || !auth.currentUser) {
      setSelectedLeagueMembers([]);
      setPendingRequests([]);
      setMyMembership(null);
      return;
    }

    // Fetch my membership for this league
    const unsubMyMem = onSnapshot(doc(db, 'leagueMemberships', `${selectedLeague.id}_${auth.currentUser.uid}`), (snap) => {
      if (snap.exists()) {
        setMyMembership({ id: snap.id, ...snap.data() } as LeagueMembership);
      } else {
        setMyMembership(null);
      }
    });

    // Fetch approved members
    const membersQ = query(
      collection(db, 'leagueMemberships'), 
      where('leagueId', '==', selectedLeague.id),
      where('status', '==', 'approved')
    );
    
    const unsubMembers = onSnapshot(membersQ, async (snap) => {
      const uids = snap.docs.map(doc => doc.data().userId);
      const profiles: UserProfile[] = [];
      for (const uid of uids) {
        const pSnap = await getDoc(doc(db, 'users', uid));
        if (pSnap.exists()) {
          profiles.push({ uid: pSnap.id, ...pSnap.data() } as UserProfile);
        }
      }
      profiles.sort((a, b) => (b.eliteScore || 0) - (a.eliteScore || 0));
      setSelectedLeagueMembers(profiles);
    });

    // Fetch pending requests if I'm admin/owner
    const unsubRequests = onSnapshot(doc(db, 'leagueMemberships', `${selectedLeague.id}_${auth.currentUser.uid}`), (mSnap) => {
      if (mSnap.exists()) {
        const mData = mSnap.data() as LeagueMembership;
        if (mData.role === 'owner' || mData.role === 'admin') {
          const reqQ = query(
            collection(db, 'leagueMemberships'),
            where('leagueId', '==', selectedLeague.id),
            where('status', '==', 'pending')
          );
          
          return onSnapshot(reqQ, async (rSnap) => {
            const reqs: (UserProfile & { membershipId: string })[] = [];
            for (const rDoc of rSnap.docs) {
              const rData = rDoc.data();
              const pSnap = await getDoc(doc(db, 'users', rData.userId));
              if (pSnap.exists()) {
                reqs.push({ uid: pSnap.id, membershipId: rDoc.id, ...pSnap.data() } as any);
              }
            }
            setPendingRequests(reqs);
          });
        } else {
          setPendingRequests([]);
        }
      }
    });

    return () => {
      unsubMyMem();
      unsubMembers();
      unsubRequests();
    };
  }, [selectedLeague]);

  useEffect(() => {
    if (!showLeagueChat || !selectedLeague) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', `league_${selectedLeague.id}`),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setMessages(msgData);

      // Seen status update
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        msgData.forEach((msg: any) => {
          if (msg.senderId !== currentUid && (!msg.seenBy || !msg.seenBy.includes(currentUid))) {
            updateDoc(doc(db, 'messages', msg.id), {
              seenBy: arrayUnion(currentUid)
            }).catch(e => console.error("Seen update failed", e));
          }
        });
      }

      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    });

    return () => unsub();
  }, [showLeagueChat, selectedLeague]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch all leagues
    const lQ = query(collection(db, 'leagues'));
    const unsubLeagues = onSnapshot(lQ, (snap) => {
      setLeagues(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as League)));
    });

    // Fetch my memberships (approved only)
    const mQ = query(
      collection(db, 'leagueMemberships'), 
      where('userId', '==', auth.currentUser.uid),
      where('status', '==', 'approved')
    );
    const unsubMemberships = onSnapshot(mQ, async (snap) => {
      const myLeagueIds = snap.docs.map(doc => doc.data().leagueId);
      if (myLeagueIds.length > 0) {
        // Fetch full league data for my leagues
        const fullMyLeagues: League[] = [];
        for (const id of myLeagueIds) {
          const lSnap = await getDoc(doc(db, 'leagues', id));
          if (lSnap.exists()) {
            fullMyLeagues.push({ id: lSnap.id, ...lSnap.data() } as League);
          }
        }
        setMyLeagues(fullMyLeagues);
      } else {
        setMyLeagues([]);
      }
      setLoading(false);
    });

    return () => {
      unsubLeagues();
      unsubMemberships();
    };
  }, []);

  const handleCreateLeague = async () => {
    if (!profile || !auth.currentUser) return;
    if (!formData.name.trim()) return alert('Please enter league name');
    
    // Check points
    const currentPoints = profile.eliteScore || 0;
    if (currentPoints < 200) {
      return alert('You need 200 Elite Points to create a league.');
    }

    // Role check (publisher or admin)
    if (profile.role !== 'publisher' && profile.role !== 'admin') {
      return alert('Only Tournament Hoststars can create a league.');
    }

    setIsCreating(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', auth.currentUser!.uid);
        const userSnap = await transaction.get(userRef);
        
        if (!userSnap.exists()) throw new Error("User does not exist!");
        
        const userData = userSnap.data();
        if ((userData.eliteScore || 0) < 200) throw new Error("Insufficient points!");

        // Deduct points
        transaction.update(userRef, {
          eliteScore: (userData.eliteScore || 0) - 200
        });

        // Create League
        const leagueRef = doc(collection(db, 'leagues'));
        const leagueData = {
          name: formData.name,
          description: formData.description,
          country: formData.country,
          minOvr: formData.minOvr,
          maxOvr: formData.maxOvr,
          creatorId: auth.currentUser!.uid,
          admins: [auth.currentUser!.uid],
          memberCount: 1,
          maxMembers: 100,
          createdAt: Timestamp.now()
        };
        transaction.set(leagueRef, leagueData);

        // Create Membership
        const membershipRef = doc(db, 'leagueMemberships', `${leagueRef.id}_${auth.currentUser!.uid}`);
        transaction.set(membershipRef, {
          leagueId: leagueRef.id,
          userId: auth.currentUser!.uid,
          role: 'owner',
          status: 'approved',
          joinedAt: Timestamp.now()
        });
      });

      // Log points transaction
      await logPointTransaction(
        auth.currentUser!.uid,
        'spent',
        200,
        'League Creation Fee',
        `Created league "${formData.name}" (-200 Points)`
      );

      alert('League created successfully!');
      setShowCreateModal(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create league');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinLeague = async (league: League) => {
    if (!profile || !auth.currentUser) return;

    // Check if already in a membership (pending or approved)
    const existingQ = query(
      collection(db, 'leagueMemberships'), 
      where('userId', '==', auth.currentUser.uid),
      where('leagueId', '==', league.id)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      return alert('You already have a request or membership in this league.');
    }

    // Check OVR
    if (profile.ovr && (profile.ovr < league.minOvr || profile.ovr > league.maxOvr)) {
      return alert(`Your OVR (${profile.ovr}) does not meet the requirements (${league.minOvr}-${league.maxOvr})`);
    }

    // Check capacity
    if (league.memberCount >= league.maxMembers) {
      return alert('League is full!');
    }

    // Check if already in another approved league
    if (myLeagues.length > 0) {
      return alert('You are already in a league.');
    }

    try {
      const membershipRef = doc(db, 'leagueMemberships', `${league.id}_${auth.currentUser!.uid}`);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(membershipRef, {
        leagueId: league.id,
        userId: auth.currentUser!.uid,
        role: 'member',
        status: 'pending',
        joinedAt: Timestamp.now()
      });

      alert('Request sent! Wait for admin approval.');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to send join request');
    }
  };

  const handlePromoteToAdmin = async (memberUid: string) => {
    if (!selectedLeague || !auth.currentUser) return;
    if (selectedLeague.creatorId !== auth.currentUser.uid) return alert('Only the owner can promote members.');
    
    // Check current admin count (creator + others)
    const currentAdmins = selectedLeague.admins || [];
    if (currentAdmins.length >= 4) {
      return alert('Maximum of 4 admins reached (1 Owner + 3 Admins).');
    }

    try {
      await runTransaction(db, async (transaction) => {
        const lRef = doc(db, 'leagues', selectedLeague.id);
        const mRef = doc(db, 'leagueMemberships', `${selectedLeague.id}_${memberUid}`);
        
        transaction.update(mRef, { role: 'admin' });
        transaction.update(lRef, {
          admins: arrayUnion(memberUid)
        });
      });
      alert('Member promoted to admin!');
    } catch (err) {
      console.error(err);
      alert('Promotion failed');
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="FETCHING LEAGUES..." />;

  const filteredLeagues = leagues.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedLeague || !profile) return;
    try {
      await addDoc(collection(db, 'messages'), {
        chatId: `league_${selectedLeague.id}`,
        senderId: auth.currentUser?.uid,
        senderName: profile.inGameName,
        senderAvatar: profile.avatar || '',
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

  const calculateLeagueWinRate = () => {
    if (selectedLeagueMembers.length === 0) return '0%';
    let totalPlayed = 0;
    let totalWon = 0;
    selectedLeagueMembers.forEach(m => {
      totalPlayed += m.stats?.played || 0;
      totalWon += m.stats?.won || 0;
    });
    if (totalPlayed === 0) return '0%';
    return `${Math.round((totalWon / totalPlayed) * 100)}%`;
  };

  const renderLeagueChat = () => {
    if (!showLeagueChat || !selectedLeague) return null;

    return createPortal(
      <div className="fixed inset-0 z-[6000] bg-white flex flex-col animate-in fade-in slide-in-from-right duration-500">
        <div className="p-8 pt-16 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc] shrink-0">
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">LEAGUE COMMS</span>
             <h3 className="text-xl font-black uppercase italic text-slate-900">{selectedLeague.name}</h3>
           </div>
           <button 
             onClick={() => setShowLeagueChat(false)}
             className="w-12 h-12 rounded-full nm-flat flex items-center justify-center text-slate-400 active:nm-pressed"
           >
             <X size={24} />
           </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar pb-32 bg-[#f8fafc]">
           {messages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <MessageSquare size={48} className="text-slate-300 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">No messages in league yet</p>
             </div>
           ) : (
             messages.map((m, idx) => {
               const isMe = m.senderId === auth.currentUser?.uid;
               return (
                <div key={m.id} className={cn("flex gap-2 max-w-[90%]", isMe ? "ml-auto flex-row-reverse" : "flex-row")}>
                  <div className="flex-shrink-0 w-8">
                     <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-md uppercase", getUserIdColor(m.senderId))}>
                        {m.senderName?.charAt(0) || '?'}
                     </div>
                  </div>
                  <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{m.senderName}</span>
                    <div className={cn("px-4 py-2.5 rounded-2xl text-sm font-semibold leading-relaxed shadow-sm", isMe ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-white text-slate-800 rounded-tl-sm border border-slate-100")}>
                      {m.text}
                    </div>
                    <span className="text-[7px] text-slate-300 font-bold uppercase mt-1">{formatMessageTimestamp(m.timestamp)}</span>
                  </div>
                </div>
               );
             })
           )}
        </div>

        <div className="p-6 border-t border-slate-200 bg-white pb-10">
          <div className="flex gap-3 nm-flat rounded-[2rem] p-2 bg-slate-50 border border-slate-300">
            <input 
              type="text"
              placeholder="Message your squad..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 h-14 rounded-[1.5rem] bg-white px-6 text-sm font-bold outline-none border border-slate-200 focus:border-indigo-500 transition-all text-slate-900"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              className="w-14 h-14 rounded-[1.5rem] bg-indigo-600 text-white flex items-center justify-center shadow-2xl active:scale-95 disabled:opacity-50 shrink-0"
            >
              <Send size={24} />
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const handleRequestAction = async (membershipId: string, action: 'approve' | 'reject') => {
    if (!selectedLeague) return;
    try {
      if (action === 'approve') {
        await runTransaction(db, async (transaction) => {
          const leagueRef = doc(db, 'leagues', selectedLeague.id);
          const lSnap = await transaction.get(leagueRef);
          if (!lSnap.exists()) throw new Error("League doesn't exist");
          
          const memRef = doc(db, 'leagueMemberships', membershipId);
          transaction.update(memRef, { status: 'approved' });
          transaction.update(leagueRef, {
            memberCount: (lSnap.data().memberCount || 0) + 1
          });
        });
        alert('Member approved!');
      } else {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'leagueMemberships', membershipId));
        alert('Request rejected.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to process request');
    }
  };

  const renderLeagueDetail = () => {
    if (!selectedLeague) return null;

    const isApprovedMember = myMembership?.status === 'approved';
    const isPending = myMembership?.status === 'pending';
    const isAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin';

    return createPortal(
      <div className="fixed inset-0 z-[5000] bg-slate-900 flex flex-col animate-in fade-in duration-300">
        <div className="w-full h-full bg-[#f8fafc] flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="relative h-64 bg-indigo-600 p-10 flex flex-col justify-end text-white overflow-hidden shrink-0">
             <div className="absolute top-0 right-0 p-8 opacity-10">
               <Shield size={240} />
             </div>
             <button 
               onClick={() => setSelectedLeague(null)}
               className="absolute top-12 right-8 w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 transition-all flex items-center justify-center z-20 active:scale-90"
             >
               <X size={28} />
             </button>
             <div className="space-y-3 relative z-10">
               <div className="flex items-center gap-4 flex-wrap">
                 <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-tight drop-shadow-lg">{selectedLeague.name}</h2>
                 <div className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-inner">
                   <Globe size={12} /> {selectedLeague.country}
                 </div>
               </div>
               <p className="text-white/80 text-sm font-bold uppercase tracking-widest italic max-w-md">{selectedLeague.description || 'Join the ultimate FC competition'}</p>
             </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 border-b border-slate-100">
               <div className="p-8 text-center">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">MEMBERS</span>
                 <span className="text-2xl font-black text-slate-900">{selectedLeague.memberCount} / {selectedLeague.maxMembers}</span>
               </div>
               <div className="p-8 text-center">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WIN RATE</span>
                 <span className="text-2xl font-black text-indigo-600">{calculateLeagueWinRate()}</span>
               </div>
               <div className="p-8 text-center">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">OVR REQ</span>
                 <span className="text-2xl font-black text-slate-900">{selectedLeague.minOvr}+</span>
               </div>
            </div>

            {/* Main CTA Section */}
            <div className="p-10 border-b border-slate-100 bg-white">
              {isApprovedMember ? (
                <button 
                  onClick={() => setShowLeagueChat(true)}
                  className="w-full h-20 rounded-[2rem] bg-indigo-600 text-white font-black uppercase tracking-widest flex items-center justify-center gap-4 shadow-2xl shadow-indigo-200 active:scale-95 transition-all hover:bg-indigo-700"
                >
                  <MessageSquare size={24} /> LEAGUE CHATROOM
                </button>
              ) : isPending ? (
                <div className="w-full h-20 rounded-[2rem] bg-amber-50 border-2 border-amber-200 text-amber-600 font-black uppercase tracking-widest flex items-center justify-center gap-4">
                  <Clock size={24} /> REQUEST PENDING
                </div>
              ) : (
                <button 
                  onClick={() => handleJoinLeague(selectedLeague)}
                  className="w-full h-20 rounded-[2rem] bg-fc-green text-white font-black uppercase tracking-widest flex items-center justify-center gap-4 shadow-2xl shadow-emerald-200 active:scale-95 transition-all hover:bg-emerald-600"
                >
                  <Users size={24} /> SEND JOIN REQUEST
                </button>
              )}
            </div>

            {/* Pending Requests (Admin Only) */}
            {isAdmin && pendingRequests.length > 0 && (
              <div className="p-10 bg-amber-50/50 space-y-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                   <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest">New Join Requests ({pendingRequests.length})</h3>
                </div>
                <div className="space-y-4">
                   {pendingRequests.map(req => (
                     <div key={req.membershipId} className="flex items-center justify-between p-5 bg-white rounded-3xl border border-amber-200 shadow-sm">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl nm-inset bg-slate-50 flex items-center justify-center text-amber-500 font-black">
                              {req.inGameName?.charAt(0)}
                           </div>
                           <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-800 uppercase italic">{req.inGameName}</span>
                              <span className="text-[10px] font-bold text-slate-400">OVR {req.ovr} · {req.eliteScore} PTS</span>
                           </div>
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={() => handleRequestAction(req.membershipId, 'approve')}
                             className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
                           >
                              <Shield size={18} />
                           </button>
                           <button 
                             onClick={() => handleRequestAction(req.membershipId, 'reject')}
                             className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-colors"
                           >
                              <X size={18} />
                           </button>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {/* Member List */}
            <div className="p-10 space-y-8 pb-40">
               <div className="flex items-center justify-between">
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Squad Members</h3>
                 <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{selectedLeagueMembers.length} ACTIVE</span>
               </div>
               <div className="space-y-4">
                 {selectedLeagueMembers.map((member, idx) => (
                   <div key={member.uid} className="flex items-center justify-between p-5 nm-flat rounded-3xl border border-slate-50 group hover:nm-pressed transition-all">
                      <div className="flex items-center gap-5">
                         <span className="text-sm font-black text-slate-300 italic w-6">{idx + 1}</span>
                         <div className="w-14 h-14 rounded-2xl nm-inset bg-white overflow-hidden border border-slate-100 shadow-inner">
                            {member.avatar ? (
                              <img src={member.avatar} className="w-full h-full object-cover" />
                            ) : (
                              <div className={cn("w-full h-full flex items-center justify-center text-white text-xs font-black uppercase", getUserIdColor(member.uid))}>
                                 {member.inGameName?.charAt(0)}
                              </div>
                            )}
                         </div>
                         <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black text-slate-800 uppercase italic truncate max-w-[150px]">{member.inGameName}</span>
                              {selectedLeague.creatorId === member.uid && <Shield size={14} className="text-indigo-500" />}
                              {selectedLeague.admins?.includes(member.uid) && selectedLeague.creatorId !== member.uid && <Shield size={14} className="text-slate-400" />}
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OVR {member.ovr} · WIN RATE {member.stats?.played ? Math.round(((member.stats?.won || 0) / member.stats.played) * 100) : 0}%</span>
                         </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                         <div className="flex flex-col items-end">
                            <span className="text-lg font-black text-indigo-600 tracking-tighter">{member.eliteScore?.toLocaleString() || 0}</span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">RANK PTS</span>
                         </div>
                         {selectedLeague.creatorId === auth.currentUser?.uid && member.uid !== auth.currentUser?.uid && !selectedLeague.admins?.includes(member.uid) && (
                           <button 
                             onClick={() => handlePromoteToAdmin(member.uid)}
                             className="text-[7px] font-black text-indigo-500 uppercase tracking-widest border border-indigo-100 px-2 py-1 rounded-md hover:bg-indigo-50"
                           >
                             Promote to Admin
                           </button>
                         )}
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
        {showLeagueChat && renderLeagueChat()}
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-8 pb-32 pt-4">
      <div className="flex items-center justify-between px-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">
            League Hub
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Join forces and dominate
          </p>
        </div>
        {(profile?.role === 'publisher' || profile?.role === 'admin') && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="w-14 h-14 rounded-2xl nm-flat text-indigo-500 flex items-center justify-center border border-white/50 active:nm-pressed transition-all"
          >
            <Plus size={24} />
          </button>
        )}
      </div>

      {myLeagues.length > 0 && (
        <div className="space-y-4 px-2">
          <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] px-4">My League</h3>
          {myLeagues.map(l => (
            <Card 
              key={l.id} 
              className="p-6 rounded-[2.2rem] bg-white border-2 border-slate-200/80 shadow-xl relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all hover:border-slate-300 hover:shadow-2xl" 
              onClick={() => setSelectedLeague(l)}
            >
              <div className="absolute top-0 right-0 p-4 text-slate-100 group-hover:text-slate-200/80 transition-colors pointer-events-none">
                <Shield size={96} strokeWidth={1.5} />
              </div>
              <div className="relative z-10 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xl sm:text-2xl font-black uppercase italic text-black tracking-tight">{l.name}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-wider border border-emerald-200">
                        Active
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-black/80 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                      <Globe size={12} className="text-black" /> {l.country}
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-black flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <Users size={22} className="text-black" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="rounded-2xl p-3.5 bg-slate-50 border border-slate-200/90 shadow-inner">
                    <span className="text-[8px] font-black text-black/70 uppercase block tracking-wider">Members</span>
                    <span className="text-base font-black text-black tracking-tight">{l.memberCount} / {l.maxMembers}</span>
                  </div>
                  <div className="rounded-2xl p-3.5 bg-slate-50 border border-slate-200/90 shadow-inner">
                    <span className="text-[8px] font-black text-black/70 uppercase block tracking-wider">OVR Req</span>
                    <span className="text-base font-black text-black tracking-tight">{l.minOvr} - {l.maxOvr}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-6 px-2">
        <div className="flex items-center justify-between px-4">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Browse Leagues</h3>
           <div className="flex-1 max-w-[180px] h-10 nm-inset rounded-xl border border-white/20 bg-slate-100 flex items-center px-4 gap-2">
              <Search size={14} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-600 w-full"
              />
           </div>
        </div>

        {filteredLeagues.length === 0 ? (
          <div className="nm-inset p-10 rounded-[2.5rem] text-center border border-white/20 mx-2 flex flex-col items-center gap-4 opacity-40">
            <Globe size={32} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No leagues found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLeagues.map(l => (
              <Card key={l.id} className="p-5 border-none mx-2 group hover:nm-inset transition-all cursor-pointer" onClick={() => setSelectedLeague(l)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[1.2rem] nm-inset flex items-center justify-center text-indigo-500 font-black italic border border-white/30 group-hover:bg-white group-hover:shadow-lg transition-all">
                      {l.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-800 uppercase italic group-hover:text-indigo-600 transition-colors">{l.name}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {l.country} · {l.memberCount}/{l.maxMembers} MEMBERS
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[8px] font-black text-slate-400">
                      OVR {l.minOvr}+
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {renderLeagueDetail()}

      {showCreateModal && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <Card className="w-full max-w-sm p-8 space-y-6 relative border-none">
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-rose-500 transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800 uppercase italic">Create League</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost: 200 Points</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">League Name</label>
                <input 
                  type="text"
                  maxLength={30}
                  className="w-full h-12 px-4 nm-inset rounded-xl text-xs font-bold text-slate-700 outline-none border border-white/20 focus:border-indigo-300 transition-all"
                  placeholder="The Elite Fighters"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">League Description</label>
                <textarea 
                  maxLength={150}
                  className="w-full h-20 p-4 nm-inset rounded-xl text-xs font-bold text-slate-700 outline-none border border-white/20 focus:border-indigo-300 transition-all resize-none"
                  placeholder="Tell pro players about your squad..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Region / Country</label>
                <select 
                  className="w-full h-12 px-4 nm-inset rounded-xl text-xs font-bold text-slate-700 outline-none border border-white/20 focus:border-indigo-300 transition-all appearance-none"
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Min OVR</label>
                  <input 
                    type="number"
                    className="w-full h-12 px-4 nm-inset rounded-xl text-xs font-bold text-slate-700 outline-none border border-white/20 focus:border-indigo-300 transition-all"
                    value={formData.minOvr}
                    onChange={(e) => setFormData({...formData, minOvr: parseInt(e.target.value)})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Max OVR</label>
                  <input 
                    type="number"
                    className="w-full h-12 px-4 nm-inset rounded-xl text-xs font-bold text-slate-700 outline-none border border-white/20 focus:border-indigo-300 transition-all"
                    value={formData.maxOvr}
                    onChange={(e) => setFormData({...formData, maxOvr: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-start gap-3">
              <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[9px] font-bold text-amber-700 leading-relaxed uppercase italic">
                Creation costs 200 Elite Points. You will be assigned as the League Owner.
              </p>
            </div>

            <Button 
              onClick={handleCreateLeague}
              disabled={isCreating}
              className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {isCreating ? 'PROCESSING...' : 'CONFIRM & CREATE'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};
