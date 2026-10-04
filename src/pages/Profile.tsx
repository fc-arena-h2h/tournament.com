import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { User, Camera, Facebook, Phone, Trophy, Star, Shield, LogOut, Edit3, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { doc, onSnapshot, updateDoc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import imageCompression from 'browser-image-compression';

interface ProfileProps {
  user: any;
  profile: UserProfile | null;
}

export const ProfilePage = ({ user, profile: initialProfile }: ProfileProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editData, setEditData] = useState({
    inGameName: '',
    inGameUID: '',
    ovr: 100,
    fbUrl: '',
    messengerLink: '',
    phone: '',
    whatsappNumber: '',
  });

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [user]);

  const handleEditClick = () => {
    if (profile) {
      setEditData({
        inGameName: profile.inGameName || '',
        inGameUID: profile.inGameUID || '',
        ovr: profile.ovr || 100,
        fbUrl: profile.fbUrl || '',
        messengerLink: profile.messengerLink || '',
        phone: profile.phone || '',
        whatsappNumber: profile.whatsappNumber || '',
      });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), editData, { merge: true });
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Failed to update profile');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 400,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      const base64 = await imageCompression.getDataUrlFromFile(compressedFile);
      
      await updateDoc(doc(db, 'users', user.uid), {
        avatar: base64
      });
    } catch (err) {
      console.error('Error uploading avatar:', err);
      alert('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const stats = profile?.stats || { played: 0, won: 0, drawn: 0, lost: 0 };
  const totalMatches = (stats.played || 0);
  const winRatio = totalMatches > 0 ? Math.round(((stats.won || 0) / totalMatches) * 100) : 0;

  const seedDemoTournament = async () => {
    if (profile?.email !== 'sperkplay@gmail.com') return;
    setUploading(true);
    try {
      // 1. Create Tournament
      const tournamentRef = await addDoc(collection(db, 'tournaments'), {
        title: 'ELITE 32 DEMO ARENA',
        description: '32 Player Professional Prototype Tournament - Group Stage & Knockout Path',
        publisherId: user.uid,
        filledSlots: 32,
        totalSlots: 32,
        status: 'ongoing',
        createdAt: Timestamp.now()
      });
      const tid = tournamentRef.id;

      // 2. Create 32 Dummy Users and Registrations
      const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const dummyPlayers = [];

      for (let i = 0; i < 32; i++) {
        const dummyUid = `demo_user_${tid}_${i}`;
        const groupIdx = Math.floor(i / 4);
        const group = groups[groupIdx];
        const pName = `Elite Player ${i + 1}`;
        
        const playerProfile = {
          uid: dummyUid,
          email: `player${i + 1}@demo.com`,
          role: 'player',
          inGameName: pName,
          inGameUID: `ID-${1000 + i}`,
          ovr: 100 + (i % 15),
          stats: { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 4, globalRank: i + 1 },
          eliteScore: 400 + (i * 10),
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${pName}`
        };

        await setDoc(doc(db, 'users', dummyUid), playerProfile);
        await addDoc(collection(db, 'registrations'), {
          tournamentId: tid,
          userId: dummyUid,
          status: 'approved',
          gameName: pName,
          gameUid: playerProfile.inGameUID,
          ovr: playerProfile.ovr,
          groupId: group,
          createdAt: Timestamp.now()
        });
        
        dummyPlayers.push({ ...playerProfile, group });
      }

      // Add Admin (you) to the registrations so it shows up in "My Arena"
      await addDoc(collection(db, 'registrations'), {
        tournamentId: tid,
        userId: user.uid,
        status: 'approved',
        gameName: profile?.inGameName || 'ADMIN',
        gameUid: profile?.inGameUID || 'ADMIN-ID',
        ovr: profile?.ovr || 100,
        groupId: 'A', // Just put admin in Group A as a viewer/participant
        createdAt: Timestamp.now()
      });

      // 3. Create Group Stage Matches (Round Robin for each group)
      const groupWinners: Record<string, any[]> = {};
      
      for (let g = 0; g < 8; g++) {
        const group = groups[g];
        const players = dummyPlayers.filter(p => p.group === group);
        groupWinners[group] = players.slice(0, 2); // Simplified: first 2 are winners
        
        const matchPairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
        for (const [p1Idx, p2Idx] of matchPairs) {
          const p1 = players[p1Idx];
          const p2 = players[p2Idx];
          
          await addDoc(collection(db, 'matches'), {
            tournamentId: tid,
            homePlayerId: p1.uid,
            awayPlayerId: p2.uid,
            homePlayerName: p1.inGameName,
            awayPlayerName: p2.inGameName,
            homeScore: Math.floor(Math.random() * 4),
            awayScore: Math.floor(Math.random() * 4),
            status: 'completed',
            groupId: group,
            stage: 'group',
            scheduledTime: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
        }
      }

      // 4. Knockout Stages (Simulated Path)
      const stages = [
        { key: 'R16', count: 8 },
        { key: 'QTR', count: 4 },
        { key: 'SEMI', count: 2 },
        { key: 'FINAL', count: 1 }
      ];

      let currentStagePlayers = [];
      // Initial R16 players (Top 2 from each group A-H)
      groups.forEach(g => {
        const playersInGroup = dummyPlayers.filter(p => p.group === g);
        if (playersInGroup.length >= 2) {
          currentStagePlayers.push(playersInGroup[0], playersInGroup[1]);
        }
      });

      for (const stage of stages) {
        const nextStagePlayers = [];
        const losers = [];
        for (let i = 0; i < stage.count; i++) {
          const p1 = currentStagePlayers[i * 2];
          const p2 = currentStagePlayers[i * 2 + 1];
          
          if (!p1 || !p2) continue;

          const hScore = Math.floor(Math.random() * 3) + 1;
          const aScore = Math.floor(Math.random() * 3);
          
          const winner = hScore > aScore ? p1 : p2;
          const loser = hScore > aScore ? p2 : p1;
          nextStagePlayers.push(winner);
          losers.push(loser);

          await addDoc(collection(db, 'matches'), {
            tournamentId: tid,
            homePlayerId: p1.uid,
            awayPlayerId: p2.uid,
            homePlayerName: p1.inGameName,
            awayPlayerName: p2.inGameName,
            homeScore: hScore,
            awayScore: aScore,
            status: 'completed',
            stage: stage.key,
            matchId: `${stage.key}_M${i+1}`,
            scheduledTime: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
        }

        // Special case: Create 3rd Place Match after Semi-Finals
        if (stage.key === 'SEMI' && losers.length === 2) {
          const p1 = losers[0];
          const p2 = losers[1];
          const hScore = Math.floor(Math.random() * 3) + 1;
          const aScore = Math.floor(Math.random() * 3);
          
          await addDoc(collection(db, 'matches'), {
            tournamentId: tid,
            homePlayerId: p1.uid,
            awayPlayerId: p2.uid,
            homePlayerName: p1.inGameName,
            awayPlayerName: p2.inGameName,
            homeScore: hScore,
            awayScore: aScore,
            status: 'completed',
            stage: '3RD_PLACE', // This is for internal identification
            displayStage: 'FINAL', // So it shows up when FINAL tab is selected
            matchId: `3RD_PLACE_M1`,
            scheduledTime: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
        }

        currentStagePlayers = nextStagePlayers;
        
        if (stage.key === 'FINAL') {
          const champion = currentStagePlayers[0];
          if (champion) {
            await updateDoc(doc(db, 'tournaments', tid), {
              status: 'finished',
              winnerId: champion.uid,
              winnerText: champion.inGameName
            });
          }
        }
      }

      alert('ELITE 32 Full Arena Seeded! Please look for a new tournament in the Arena list.');
    } catch (err) {
      console.error(err);
      alert('Seeding failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-12 animate-slide-up pb-20">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-6 px-4">
        <div className="relative group">
          <div className="w-32 h-32 rounded-[3rem] nm-flat p-1 border-4 border-white/50 overflow-hidden bg-slate-100 flex items-center justify-center">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover rounded-[2.8rem]" />
            ) : (
              <User size={48} className="text-slate-300" />
            )}
            {uploading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-[3rem]">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <label className="absolute -bottom-2 -right-2 w-12 h-12 rounded-2xl nm-flat bg-white border border-slate-100 flex items-center justify-center cursor-pointer hover:text-indigo-500 transition-all active:scale-90">
            <Camera size={20} />
            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} disabled={uploading} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic leading-none">{profile?.inGameName || 'Recruit'}</h2>
             <span className="nm-inset px-3 py-1 rounded-lg text-[10px] font-black text-indigo-500 uppercase">OVR {profile?.ovr || 0}</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className={cn(
              "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border",
              profile?.role === 'admin' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
              profile?.role === 'publisher' ? "bg-amber-50 text-amber-600 border-amber-100" :
              "bg-emerald-50 text-emerald-600 border-emerald-100"
            )}>
              {profile?.role === 'admin' ? 'Elite Admin' : 
               profile?.role === 'publisher' ? 'Official Host' : 
               'Pro Player'}
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">{profile?.email}</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handleEditClick}
            className="px-8 h-14 rounded-2xl nm-flat bg-white border border-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-indigo-500 transition-all active:nm-pressed"
          >
            <Edit3 size={16} /> Edit Profile
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="w-14 h-14 rounded-2xl nm-flat bg-white border border-white/40 text-rose-500 flex items-center justify-center transition-all active:nm-pressed"
          >
            <LogOut size={20} />
          </button>
        </div>

        {profile?.email === 'sperkplay@gmail.com' && (
          <div className="pt-4 w-full px-8">
            <button 
              onClick={seedDemoTournament}
              disabled={uploading}
              className="w-full h-14 rounded-2xl nm-flat bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 active:nm-pressed disabled:opacity-50"
            >
              <Trophy size={16} className="text-amber-500" />
              {uploading ? 'Seeding...' : 'Seed 32-Player Demo Arena'}
            </button>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2">Admin Only: Generate full tournament structure</p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-6 px-4">
        <div className="nm-flat rounded-[2.5rem] p-6 border border-white/40 space-y-4">
          <div className="flex items-center gap-3 text-indigo-500">
             <Trophy size={18} />
             <span className="text-[10px] font-black uppercase tracking-widest">Career Stats</span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block leading-none">Played</span>
              <span className="text-xl font-black text-slate-800 italic">{totalMatches}</span>
            </div>
            <div className="space-y-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block leading-none">Ratio</span>
              <span className="text-xl font-black text-indigo-500 italic">{winRatio}%</span>
            </div>
          </div>
        </div>

        <div className="nm-flat rounded-[2.5rem] p-6 border border-white/40 space-y-4">
          <div className="flex items-center gap-3 text-amber-500">
             <Star size={18} />
             <span className="text-[10px] font-black uppercase tracking-widest">Elite Score</span>
          </div>
          <div className="space-y-1 pt-2">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block leading-none">Current</span>
            <span className="text-xl font-black text-slate-800 italic">{profile?.eliteScore || 0} PTS</span>
          </div>
        </div>
      </div>

      {/* Contact & Links */}
      <div className="px-4 space-y-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Verified Channels</h3>
        <Card className="p-8 border-none space-y-8">
           <div className="flex items-center justify-between group">
             <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-indigo-600 border border-white/20">
                 <Facebook size={24} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Facebook</span>
                 <span className="text-xs font-bold text-slate-800 truncate max-w-[140px]">{profile?.fbUrl ? 'Linked' : 'Not Set'}</span>
               </div>
             </div>
             {profile?.fbUrl && (
               <button onClick={() => window.open(profile.fbUrl)} className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:underline">View</button>
             )}
           </div>

           <div className="flex items-center justify-between group">
             <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-emerald-500 border border-white/20">
                 <Phone size={24} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp / Phone</span>
                 <span className="text-xs font-bold text-slate-800">{profile?.phone || 'Not Set'}</span>
               </div>
             </div>
             {profile?.phone && (
               <button onClick={() => window.open(`tel:${profile.phone}`)} className="text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:underline">Call</button>
             )}
           </div>

           <div className="flex items-center justify-between group">
             <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-slate-800 border border-white/20">
                 <Shield size={24} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In-Game UID</span>
                 <span className="text-xs font-bold text-slate-800 font-mono tracking-wider">{profile?.inGameUID || 'Pending'}</span>
               </div>
             </div>
           </div>
        </Card>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[200] bg-white/95 backdrop-blur-md flex flex-col animate-in fade-in zoom-in-95 duration-300">
           <div className="p-8 border-b border-slate-100 flex items-center justify-between pt-16">
             <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Configuration</span>
               <h2 className="text-2xl font-black text-slate-900 uppercase italic">Edit Details</h2>
             </div>
             <button onClick={() => setIsEditing(false)} className="w-12 h-12 rounded-full nm-flat flex items-center justify-center text-slate-400 active:nm-pressed">
               <X size={24} />
             </button>
           </div>

           <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar pb-32">
             <div className="space-y-4">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">In-Game Name</label>
               <Input 
                 value={editData.inGameName}
                 onChange={(e) => setEditData({...editData, inGameName: e.target.value})}
               />
             </div>
             <div className="grid grid-cols-2 gap-6">
               <div className="space-y-4">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">In-Game UID</label>
                 <Input 
                   value={editData.inGameUID}
                   onChange={(e) => setEditData({...editData, inGameUID: e.target.value})}
                 />
               </div>
               <div className="space-y-4">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">OVR</label>
                 <Input 
                   type="number"
                   value={editData.ovr}
                   onChange={(e) => setEditData({...editData, ovr: parseInt(e.target.value) || 0})}
                 />
               </div>
             </div>
             <div className="space-y-4">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Facebook Profile URL</label>
               <Input 
                 value={editData.fbUrl}
                 onChange={(e) => setEditData({...editData, fbUrl: e.target.value})}
               />
             </div>
             <div className="space-y-4">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Messenger Link</label>
               <Input 
                 value={editData.messengerLink}
                 onChange={(e) => setEditData({...editData, messengerLink: e.target.value})}
               />
             </div>
             <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone Number</label>
                  <Input 
                    value={editData.phone}
                    onChange={(e) => setEditData({...editData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp</label>
                  <Input 
                    value={editData.whatsappNumber}
                    onChange={(e) => setEditData({...editData, whatsappNumber: e.target.value})}
                  />
                </div>
             </div>
           </div>

           <div className="p-8 border-t border-slate-100 bg-white">
             <Button onClick={handleSave} className="w-full h-18 rounded-[2.5rem] text-indigo-600">
               Save Changes
             </Button>
           </div>
        </div>
      )}
    </div>
  );
};
