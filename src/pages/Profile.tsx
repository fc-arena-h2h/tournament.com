import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { User, Facebook, Phone, Trophy, Star, Shield, LogOut, Edit3, X, Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle, ShieldCheck, Languages, Bell, BellRing } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { doc, onSnapshot, updateDoc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { useI18n } from '@/src/lib/i18n';
import { requestPushNotificationToken } from '@/src/lib/fcm';
import { sendTestPhoneNotification } from '@/src/lib/notifications';

interface ProfileProps {
  user: any;
  profile: UserProfile | null;
}

export const ProfilePage = ({ user, profile: initialProfile }: ProfileProps) => {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [editData, setEditData] = useState({
    inGameName: '',
    inGameUID: '',
    fbUrl: '',
    messengerLink: '',
    leagueMessengerGroupLink: '',
    phone: '',
    whatsappNumber: '',
    leagueName: '',
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
        fbUrl: profile.fbUrl || '',
        messengerLink: profile.messengerLink || '',
        leagueMessengerGroupLink: profile.leagueMessengerGroupLink || '',
        phone: profile.phone || '',
        whatsappNumber: profile.whatsappNumber || '',
        leagueName: profile.leagueName || '',
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

  return (
    <div className="space-y-12 animate-slide-up pb-20">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-6 px-4">
        <div className="relative group">
          <div className="w-32 h-32 rounded-[2.5rem] nm-flat p-1 border-4 border-white/50 overflow-hidden bg-slate-900 flex items-center justify-center relative shadow-[0_0_20px_rgba(79,70,229,0.3)] group-hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] transition-all duration-500">
            <User size={48} className="text-indigo-500" />
            
            {/* Pro Badge */}
            <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-lg border border-white/20 transform rotate-12 group-hover:rotate-0 transition-transform">
              Pro
            </div>
            
            {/* Neon Accent Line */}
            <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-[2.3rem] pointer-events-none" />
          </div>
          
          {/* Animated Glow Rings */}
          <div className="absolute -inset-4 bg-indigo-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 -z-10" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic leading-none">{profile?.inGameName || 'Recruit'}</h2>
             {profile?.role !== 'player' && (
               <span className="nm-inset px-3 py-1 rounded-lg text-[10px] font-black text-amber-500 uppercase">{profile?.leagueName || 'Official League'}</span>
             )}
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
            onClick={async () => {
              await signOut(auth);
              window.location.reload();
            }}
            className="w-14 h-14 rounded-2xl nm-flat bg-white border border-white/40 text-rose-500 flex items-center justify-center transition-all active:nm-pressed"
          >
            <LogOut size={20} />
          </button>
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
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</span>
                 <span className="text-xs font-bold text-slate-800">{profile?.whatsappNumber || 'Not Set'}</span>
               </div>
             </div>
             {profile?.whatsappNumber && (
               <button onClick={() => window.open(`https://wa.me/${profile.whatsappNumber?.replace(/\D/g, '')}`)} className="text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:underline">Message</button>
             )}
           </div>

           <div className="flex items-center justify-between group">
             <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-blue-500 border border-white/20">
                 <Shield size={24} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Messenger</span>
                 <span className="text-xs font-bold text-slate-800">{profile?.messengerLink ? 'Linked' : 'Not Set'}</span>
               </div>
             </div>
             {profile?.messengerLink && (
               <button onClick={() => window.open(profile.messengerLink)} className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:underline">Chat</button>
             )}
           </div>

           <div className="flex items-center justify-between group">
             <div className="flex items-center gap-5">
               <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-slate-800 border border-white/20">
                 <Shield size={24} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{profile?.role === 'player' ? 'In-Game UID' : 'League Title'}</span>
                 <span className="text-xs font-bold text-slate-800 font-mono tracking-wider">{profile?.role === 'player' ? (profile?.inGameUID || 'Pending') : (profile?.leagueName || 'Official Organizer')}</span>
               </div>
             </div>
           </div>

           {profile?.role === 'publisher' && profile?.leagueMessengerGroupLink && (
             <div className="flex items-center justify-between group">
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-blue-600 border border-white/20">
                   <Languages size={24} />
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">League Group</span>
                   <span className="text-xs font-bold text-slate-800">Messenger Community</span>
                 </div>
               </div>
               <button onClick={() => window.open(profile.leagueMessengerGroupLink)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">Join Group</button>
             </div>
           )}
        </Card>
      </div>

      {/* App Preferences & Settings (FCM Push Notifications) */}
      <div className="px-4 space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">
          App Notifications
        </h3>
        <Card className="p-6 border-none space-y-6">
          {/* FCM Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-amber-500 border border-white/20">
                <BellRing size={22} className="animate-wiggle" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Push Notifications (FCM)
                </span>
                <span className="text-xs font-black text-slate-800">
                  {profile?.pushEnabled 
                    ? 'Active on Device' 
                    : 'Match & tournament alerts'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setPushLoading(true);
                  try {
                    const res = await requestPushNotificationToken(user?.uid);
                    if (res.success) {
                      await sendTestPhoneNotification();
                      alert('Push notifications successfully activated!');
                    } else {
                      alert(res.error || 'Permission not granted');
                    }
                  } finally {
                    setPushLoading(false);
                  }
                }}
                disabled={pushLoading}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow-md disabled:opacity-50"
              >
                <Bell size={13} />
                <span>{pushLoading ? '...' : (profile?.pushEnabled ? 'Test Push' : 'Enable')}</span>
              </button>
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
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">{profile?.role === 'player' ? 'In-Game Name' : 'Name'}</label>
               <Input 
                 value={editData.inGameName}
                 onChange={(e) => setEditData({...editData, inGameName: e.target.value})}
               />
             </div>
             <div className="grid grid-cols-1 gap-6">
               <div className="space-y-4">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">{profile?.role === 'player' ? 'Game UID' : 'League Title'}</label>
                 <Input 
                   value={profile?.role === 'player' ? editData.inGameUID : editData.leagueName}
                   onChange={(e) => {
                     if (profile?.role === 'player') setEditData({...editData, inGameUID: e.target.value});
                     else setEditData({...editData, leagueName: e.target.value});
                   }}
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
             {profile?.role === 'publisher' && (
               <div className="space-y-4">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">League Messenger Group Link</label>
                 <Input 
                   value={editData.leagueMessengerGroupLink}
                   onChange={(e) => setEditData({...editData, leagueMessengerGroupLink: e.target.value})}
                 />
               </div>
             )}
                 <div className="space-y-4">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp (Optional)</label>
                   <Input 
                     value={editData.whatsappNumber}
                     onChange={(e) => setEditData({...editData, whatsappNumber: e.target.value})}
                   />
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
