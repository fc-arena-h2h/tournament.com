import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { requestPushNotificationToken } from '@/src/lib/fcm';
import { sendTestPhoneNotification } from '@/src/lib/notifications';
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
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), editData, { merge: true });
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Failed to update profile');
    } finally {
      setIsSaving(false);
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
                  const res = await requestPushNotificationToken(user?.uid);
                  if (!res.success) {
                    alert(res.error || 'Permission Denied');
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

      {/* Redesigned Modify Profile Modal */}
      {isEditing && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-md bg-white rounded-[2.5rem] border-2 border-white shadow-[0_25px_70px_-15px_rgba(15,23,42,0.4)] overflow-hidden flex flex-col max-h-[90vh] my-auto"
          >
            {/* Top Modal Header */}
            <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25 shrink-0">
                  <Edit3 size={20} />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[8px] font-black text-emerald-700 uppercase tracking-widest">
                    <ShieldCheck size={10} /> Identity Management
                  </span>
                  <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight mt-0.5">
                    Modify Profile
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center active:scale-95 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              {/* Live Identity Preview Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center gap-3.5 shadow-md border border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 shrink-0">
                  <div className="w-full h-full rounded-[0.9rem] bg-slate-950 flex items-center justify-center text-white font-black text-base uppercase italic">
                    {(editData.inGameName || profile?.inGameName || 'P').charAt(0)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black uppercase italic tracking-tight text-white truncate">
                      {editData.inGameName || 'Your Handle'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[7px] font-black uppercase tracking-wider shrink-0">
                      {profile?.role || 'Player'}
                    </span>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 truncate mt-0.5">
                    {profile?.role === 'player'
                      ? `UID: ${editData.inGameUID || 'Not set'}`
                      : `League: ${editData.leagueName || 'Official Host'}`}
                  </p>
                </div>
              </div>

              {/* Section 1: Core Identity */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Core Identity
                  </span>
                </div>

                {/* Full Handle */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 block">
                    Full Handle (In-Game Name)
                  </label>
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      placeholder="Enter your in-game name..."
                      value={editData.inGameName}
                      onChange={(e) => setEditData({ ...editData, inGameName: e.target.value })}
                      className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-indigo-600 focus:bg-white text-xs sm:text-sm font-black text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* In-Game UID / League Name */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 block">
                    {profile?.role === 'player' ? 'In-Game UID' : 'League Name'}
                  </label>
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {profile?.role === 'player' ? <Hash size={16} /> : <Award size={16} />}
                    </div>
                    <input
                      type="text"
                      placeholder={profile?.role === 'player' ? 'Enter your FC Mobile UID...' : 'Enter your League / Org name...'}
                      value={profile?.role === 'player' ? editData.inGameUID : editData.leagueName}
                      onChange={(e) => {
                        if (profile?.role === 'player') setEditData({ ...editData, inGameUID: e.target.value });
                        else setEditData({ ...editData, leagueName: e.target.value });
                      }}
                      className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-indigo-600 focus:bg-white text-xs sm:text-sm font-black text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Social & Match Coordination Channels */}
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Digital Contact Channels
                  </span>
                </div>

                {/* Facebook URL */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 block">
                    Facebook Profile URL
                  </label>
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Facebook size={16} />
                    </div>
                    <input
                      type="url"
                      placeholder="https://facebook.com/your.profile"
                      value={editData.fbUrl}
                      onChange={(e) => setEditData({ ...editData, fbUrl: e.target.value })}
                      className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-blue-600 focus:bg-white text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Messenger & WhatsApp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 block">
                      Messenger Link
                    </label>
                    <div className="relative">
                      <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <MessageCircle size={16} />
                      </div>
                      <input
                        type="text"
                        placeholder="https://m.me/username"
                        value={editData.messengerLink}
                        onChange={(e) => setEditData({ ...editData, messengerLink: e.target.value })}
                        className="w-full h-13 pl-14 pr-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-sky-500 focus:bg-white text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1 block">
                      WhatsApp Number
                    </label>
                    <div className="relative">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Phone size={16} />
                      </div>
                      <input
                        type="tel"
                        placeholder="+8801XXXXXXXXX"
                        value={editData.whatsappNumber}
                        onChange={(e) => setEditData({ ...editData, whatsappNumber: e.target.value })}
                        className="w-full h-13 pl-14 pr-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-emerald-600 focus:bg-white text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {profile?.role === 'publisher' && (
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest ml-1 block">
                      League Messenger Group Link
                    </label>
                    <div className="relative">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <MessageSquare size={16} />
                      </div>
                      <input
                        type="url"
                        placeholder="https://m.me/j/..."
                        value={editData.leagueMessengerGroupLink}
                        onChange={(e) => setEditData({ ...editData, leagueMessengerGroupLink: e.target.value })}
                        className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-indigo-600 focus:bg-white text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="flex-1 h-13 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[1.6] h-13 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 hover:from-indigo-700 hover:to-slate-950 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em] italic shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
              >
                <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                <span>{isSaving ? 'Saving...' : 'Confirm Changes'}</span>
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
};
