import React, { useState, useEffect } from 'react';
import { 
  User, Facebook, Phone, Trophy, Star, Shield, LogOut, Edit3, X, 
  Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle, ShieldCheck, 
  Languages, Bell, BellRing, Settings, ExternalLink, MessageCircle,
  Camera, ChevronRight, Mail, Hash, MessageSquare, Award
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { useI18n } from '@/src/lib/i18n';
import { Capacitor } from '@capacitor/core';
import { requestPushNotificationToken } from '@/src/lib/fcm';
import { sendTestPhoneNotification, registerPushNotifications } from '@/src/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_VERSION } from '@/src/lib/constants';

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
    <div className="min-h-screen bg-[#f0f1f5] pb-32 pt-6 px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto space-y-8"
      >
        {/* Header Section */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">
            Profile <span className="text-fc-green">Identity</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
            Professional Arena Profile
          </p>
        </div>

        {/* Main Identity Card */}
        <div className="nm-flat rounded-[3rem] p-10 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-fc-green/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
          
          <div className="flex flex-col items-center">
            {/* Avatar Section */}
            <div className="relative mb-6">
              <div className="w-40 h-40 rounded-[3.5rem] nm-flat p-2 flex items-center justify-center bg-white/50">
                <div className="w-full h-full rounded-[3rem] nm-inset flex items-center justify-center text-slate-300">
                  <User size={64} />
                </div>
              </div>
              <button 
                onClick={handleEditClick}
                className="absolute -bottom-2 -right-2 w-12 h-12 rounded-2xl nm-flat bg-white flex items-center justify-center text-fc-green shadow-xl active:nm-pressed"
              >
                <Camera size={20} />
              </button>
            </div>

            {/* Profile Info */}
            <div className="text-center space-y-3 w-full">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl nm-inset bg-white/30 mb-2">
                <ShieldCheck size={12} className="text-fc-green" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Verified {profile?.role || 'Player'}
                </span>
              </div>
              
              <h2 className="text-4xl font-black text-slate-900 uppercase italic leading-none tracking-tighter drop-shadow-sm">
                {profile?.inGameName || 'Recruit'}
              </h2>
              
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-slate-400">
                  <Mail size={12} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{profile?.email}</span>
                </div>
                {profile?.leagueName && (
                  <div className="flex items-center gap-2 text-fc-green">
                    <Award size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest italic">{profile.leagueName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats/Actions */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleEditClick}
              className="nm-flat h-16 rounded-2xl flex items-center justify-center gap-3 text-slate-600 font-black text-[10px] uppercase tracking-widest active:nm-pressed"
            >
              <Edit3 size={16} /> MODIFY PROFILE
            </button>
            <button 
              onClick={async () => {
                await signOut(auth);
                window.location.reload();
              }}
              className="nm-flat h-16 rounded-2xl flex items-center justify-center gap-3 text-rose-500 font-black text-[10px] uppercase tracking-widest active:nm-pressed"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>

        {/* Detailed Info Sections */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-black text-slate-900 uppercase italic tracking-widest">DIGITAL CHANNELS</h3>
            <div className="w-12 h-1 bg-fc-green/20 rounded-full" />
          </div>

          <div className="nm-flat rounded-[2.5rem] overflow-hidden">
            <div className="divide-y divide-white/20">
              <div className="p-6 flex items-center justify-between hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-blue-600">
                    <Facebook size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Facebook</span>
                    <span className="text-sm font-bold text-slate-700">{profile?.fbUrl ? 'Connected' : 'Not Linked'}</span>
                  </div>
                </div>
                {profile?.fbUrl && (
                  <button onClick={() => window.open(profile.fbUrl)} className="text-fc-green p-2"><ExternalLink size={18} /></button>
                )}
              </div>

              <div className="p-6 flex items-center justify-between hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-emerald-500">
                    <MessageSquare size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</span>
                    <span className="text-sm font-bold text-slate-700">{profile?.whatsappNumber || 'Not Linked'}</span>
                  </div>
                </div>
                {profile?.whatsappNumber && (
                  <button onClick={() => window.open(`https://wa.me/${profile.whatsappNumber?.replace(/\D/g, '')}`)} className="text-emerald-500 p-2"><ChevronRight size={18} /></button>
                )}
              </div>

              <div className="p-6 flex items-center justify-between hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-sky-500">
                    <MessageCircle size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Messenger</span>
                    <span className="text-sm font-bold text-slate-700">{profile?.messengerLink ? 'Connected' : 'Not Linked'}</span>
                  </div>
                </div>
                {profile?.messengerLink && (
                  <button onClick={() => window.open(profile.messengerLink)} className="text-sky-500 p-2"><ExternalLink size={18} /></button>
                )}
              </div>

              <div className="p-6 flex items-center justify-between hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-indigo-500">
                    <Hash size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{profile?.role === 'player' ? 'In Game UID' : 'League Code'}</span>
                    <span className="text-sm font-mono font-bold text-slate-700">{profile?.role === 'player' ? (profile?.inGameUID || 'Pending') : (profile?.leagueName || 'Verified')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-black text-slate-900 uppercase italic tracking-widest">GLOBAL ALERTS</h3>
          </div>
          
          <div className="nm-flat rounded-[2rem] p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl nm-inset flex items-center justify-center text-amber-500">
                <BellRing size={20} className={profile?.pushEnabled ? "animate-pulse" : ""} />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Notifications</span>
                <span className="text-sm font-bold text-slate-700">{profile?.pushEnabled ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
            
            <button
              onClick={async () => {
                setPushLoading(true);
                try {
                  if (Capacitor.isNativePlatform()) {
                    await registerPushNotifications(user?.uid);
                  } else {
                    const res = await requestPushNotificationToken(user?.uid);
                    if (!res.success) {
                      alert(res.error || 'Permission Denied');
                    }
                  }
                  await sendTestPhoneNotification();
                } finally {
                  setPushLoading(false);
                }
              }}
              disabled={pushLoading}
              className={cn(
                "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                profile?.pushEnabled ? "nm-inset text-slate-400" : "nm-flat text-fc-green active:nm-pressed"
              )}
            >
              {pushLoading ? '...' : (profile?.pushEnabled ? 'Test' : 'Enable')}
            </button>
          </div>
        </div>

        {/* Version Info */}
        <div className="text-center pt-4">
          <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em]">FC Arena Protocol v{APP_VERSION}</p>
        </div>
      </motion.div>

      {/* Edit Overlay */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="nm-flat rounded-[3rem] w-full max-w-lg overflow-hidden bg-[#f0f1f5]"
            >
              <div className="p-8 border-b border-white/20 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-fc-green uppercase tracking-[0.3em] mb-1">Identity Management</p>
                  <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Modify Profile</h2>
                </div>
                <button onClick={() => setIsEditing(false)} className="w-12 h-12 rounded-2xl nm-flat flex items-center justify-center text-slate-400 active:nm-pressed">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Handle</label>
                  <input 
                    value={editData.inGameName} 
                    onChange={(e) => setEditData({...editData, inGameName: e.target.value})}
                    className="w-full h-14 px-6 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">
                    {profile?.role === 'player' ? 'In-Game UID' : 'League Name'}
                  </label>
                  <input 
                    value={profile?.role === 'player' ? editData.inGameUID : editData.leagueName}
                    onChange={(e) => {
                      if (profile?.role === 'player') setEditData({...editData, inGameUID: e.target.value});
                      else setEditData({...editData, leagueName: e.target.value});
                    }}
                    className="w-full h-14 px-6 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Facebook URL</label>
                  <input 
                    value={editData.fbUrl} 
                    onChange={(e) => setEditData({...editData, fbUrl: e.target.value})}
                    className="w-full h-14 px-6 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Messenger</label>
                     <input 
                       value={editData.messengerLink} 
                       onChange={(e) => setEditData({...editData, messengerLink: e.target.value})}
                       className="w-full h-14 px-4 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp</label>
                     <input 
                       value={editData.whatsappNumber} 
                       onChange={(e) => setEditData({...editData, whatsappNumber: e.target.value})}
                       className="w-full h-14 px-4 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                     />
                   </div>
                </div>

                {profile?.role === 'publisher' && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-fc-green uppercase tracking-widest ml-4">League Group Link</label>
                    <input 
                      value={editData.leagueMessengerGroupLink} 
                      onChange={(e) => setEditData({...editData, leagueMessengerGroupLink: e.target.value})}
                      className="w-full h-14 px-6 nm-inset rounded-2xl text-slate-700 font-bold focus:outline-none" 
                    />
                  </div>
                )}
              </div>

              <div className="p-8 bg-white/10 border-t border-white/20">
                <button 
                  onClick={handleSave} 
                  className="w-full h-16 nm-flat bg-fc-green rounded-[1.5rem] text-white font-black uppercase tracking-[0.2em] italic active:nm-pressed"
                >
                  Confirm Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
