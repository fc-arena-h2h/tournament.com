import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { 
  User, Facebook, Phone, Trophy, Star, Shield, LogOut, Edit3, X, 
  Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle, ShieldCheck, 
  Languages, Bell, BellRing, Settings, ExternalLink, MessageCircle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { doc, onSnapshot, updateDoc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { useI18n } from '@/src/lib/i18n';
import { requestPushNotificationToken } from '@/src/lib/fcm';
import { sendTestPhoneNotification } from '@/src/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';

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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10 pb-32 pt-4 px-3 max-w-2xl mx-auto"
    >
      {/* Profile Identity Card */}
      <Card className="p-10 border-white bg-white/90 shadow-2xl relative overflow-hidden" hover={false}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-36 h-36 rounded-[3rem] bg-slate-900 p-1.5 border-4 border-white shadow-2xl relative overflow-hidden flex items-center justify-center"
            >
              <User size={64} className="text-slate-700" />
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
            </motion.div>
            
            {/* Pro Badge */}
            <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-[10px] font-black px-4 py-1.5 rounded-2xl uppercase tracking-widest shadow-xl border-2 border-white">
              VERIFIED
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-4xl font-black text-slate-900 uppercase italic leading-none tracking-tighter">
              {profile?.inGameName || 'Recruit'}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <span className={cn(
                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                profile?.role === 'admin' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                profile?.role === 'publisher' ? "bg-amber-50 text-amber-600 border-amber-100" :
                "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}>
                {profile?.role === 'admin' ? 'SYSTEM COMMAND' : 
                 profile?.role === 'publisher' ? 'ARENA HOST' : 
                 'ELITE ATHLETE'}
              </span>
              {profile?.leagueName && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{profile.leagueName}</span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] pt-1">{profile?.email}</p>
          </div>

          <div className="flex gap-4 w-full pt-4">
            <Button 
              onClick={handleEditClick}
              className="flex-1 h-16 rounded-[1.5rem]"
              variant="outline"
            >
              <Edit3 size={18} className="mr-2" /> MODIFY PROFILE
            </Button>
            <Button 
              onClick={async () => {
                await signOut(auth);
                window.location.reload();
              }}
              className="w-16 h-16 rounded-[1.5rem]"
              variant="danger"
            >
              <LogOut size={22} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Connectivity Channels */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 px-4">
           <div className="w-2 h-6 bg-indigo-500 rounded-full" />
           <h3 className="text-xs font-black text-slate-900 uppercase italic tracking-widest">Digital Channels</h3>
        </div>
        
        <Card className="p-2 border-white/60 bg-white/40 shadow-xl" hover={false}>
          <div className="grid grid-cols-1 divide-y divide-slate-100">
            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600">
                  <Facebook size={26} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Global Identity</span>
                  <span className="text-sm font-black text-slate-800 uppercase italic">{profile?.fbUrl ? 'Connected' : 'Not Linked'}</span>
                </div>
              </div>
              {profile?.fbUrl && (
                <Button variant="ghost" size="sm" onClick={() => window.open(profile.fbUrl)} className="text-[10px] font-black tracking-widest text-indigo-600">
                   OPEN <ExternalLink size={14} className="ml-1.5" />
                </Button>
              )}
            </div>

            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-emerald-500">
                  <MessageCircle size={26} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">WhatsApp Protocol</span>
                  <span className="text-sm font-black text-slate-800">{profile?.whatsappNumber || 'OFFLINE'}</span>
                </div>
              </div>
              {profile?.whatsappNumber && (
                <Button variant="ghost" size="sm" onClick={() => window.open(`https://wa.me/${profile.whatsappNumber?.replace(/\D/g, '')}`)} className="text-[10px] font-black tracking-widest text-emerald-600">
                   MESSAGE
                </Button>
              )}
            </div>

            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-blue-500">
                  <ShieldCheck size={26} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{profile?.role === 'player' ? 'MATCH UID' : 'LEAGUE AUTH'}</span>
                  <span className="text-sm font-mono font-black text-slate-900 tracking-tight">{profile?.role === 'player' ? (profile?.inGameUID || 'PENDING') : (profile?.leagueName || 'CERTIFIED')}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Global Alerts */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 px-4">
           <div className="w-2 h-6 bg-amber-500 rounded-full" />
           <h3 className="text-xs font-black text-slate-900 uppercase italic tracking-widest">Global Alerts</h3>
        </div>
        
        <Card className="p-8 border-white bg-white/60 shadow-xl" hover={false}>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-amber-500 relative">
                <BellRing size={26} className={cn(profile?.pushEnabled && "animate-bounce")} />
                {profile?.pushEnabled && <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Real-time Push</span>
                <span className="text-sm font-black text-slate-800 uppercase italic">
                  {profile?.pushEnabled ? 'ACTIVE PROTOCOL' : 'ALERTS DISABLED'}
                </span>
              </div>
            </div>

            <Button
              onClick={async () => {
                setPushLoading(true);
                try {
                  const res = await requestPushNotificationToken(user?.uid);
                  if (res.success) {
                    await sendTestPhoneNotification();
                  } else {
                    alert(res.error || 'Access Denied');
                  }
                } finally {
                  setPushLoading(false);
                }
              }}
              disabled={pushLoading}
              variant={profile?.pushEnabled ? "outline" : "primary"}
              size="sm"
              className="rounded-xl h-12 px-6"
            >
              {pushLoading ? '...' : (profile?.pushEnabled ? 'TEST' : 'ACTIVATE')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Edit Overlay */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xl flex flex-col p-4 sm:p-10 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-xl mx-auto w-full bg-white rounded-[2.5rem] shadow-2xl border border-white flex flex-col min-h-[80vh]"
            >
              <div className="p-8 sm:p-10 border-b border-slate-100 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Profile Settings</span>
                  <h2 className="text-3xl font-black text-slate-900 uppercase italic leading-none tracking-tighter">Edit Identity</h2>
                </div>
                <button onClick={() => setIsEditing(false)} className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">
                  <X size={28} />
                </button>
              </div>

              <div className="flex-1 p-8 sm:p-10 space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Display Handle</label>
                    <Input value={editData.inGameName} onChange={(e) => setEditData({...editData, inGameName: e.target.value})} className="h-16" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">{profile?.role === 'player' ? 'Match UID' : 'League Name'}</label>
                    <Input 
                      value={profile?.role === 'player' ? editData.inGameUID : editData.leagueName}
                      onChange={(e) => {
                        if (profile?.role === 'player') setEditData({...editData, inGameUID: e.target.value});
                        else setEditData({...editData, leagueName: e.target.value});
                      }}
                      className="h-16"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Digital Signature (FB URL)</label>
                  <Input value={editData.fbUrl} onChange={(e) => setEditData({...editData, fbUrl: e.target.value})} className="h-16" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                   <div className="space-y-3">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Messenger Protocol</label>
                     <Input value={editData.messengerLink} onChange={(e) => setEditData({...editData, messengerLink: e.target.value})} className="h-16" />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">WhatsApp Contact</label>
                     <Input value={editData.whatsappNumber} onChange={(e) => setEditData({...editData, whatsappNumber: e.target.value})} className="h-16" />
                   </div>
                </div>

                {profile?.role === 'publisher' && (
                  <div className="space-y-3 pt-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 text-indigo-600">Community Channel (Group Link)</label>
                    <Input value={editData.leagueMessengerGroupLink} onChange={(e) => setEditData({...editData, leagueMessengerGroupLink: e.target.value})} className="h-16 border-indigo-100" />
                  </div>
                )}
              </div>

              <div className="p-8 sm:p-10 border-t border-slate-100 bg-slate-50/50 rounded-b-[2.5rem]">
                <Button onClick={handleSave} className="w-full h-18 rounded-[1.5rem] shadow-xl shadow-slate-900/10 text-base" variant="primary">
                  SYNCHRONIZE CHANGES
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
