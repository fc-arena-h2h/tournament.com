import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, Facebook, Phone, ShieldCheck, LogOut, Edit3, X, 
  CheckCircle, BellRing, ExternalLink, MessageCircle,
  Camera, ChevronRight, Mail, Hash, MessageSquare, Award, Sun, Moon, Sparkles, Palette, AlertCircle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { auth } from '@/src/lib/firebase';
import {
  subscribeToUserProfile,
  saveUserProfileToDb,
  getSavedUserRole
} from '@/src/lib/userDbManager';
import { signOut } from 'firebase/auth';
import { useI18n } from '@/src/lib/i18n';
import { useTheme } from '@/src/lib/theme';
import { requestPushNotificationToken } from '@/src/lib/fcm';
import { sendTestPhoneNotification } from '@/src/lib/notifications';
import { motion } from 'framer-motion';
import { APP_VERSION } from '@/src/lib/constants';

interface ProfileProps {
  user: any;
  profile: UserProfile | null;
}

export const ProfilePage = ({ user, profile: initialProfile }: ProfileProps) => {
  const { t } = useI18n();
  const { theme, isDark, setTheme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uidHint, setUidHint] = useState('');
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
    const unsub = subscribeToUserProfile(user.uid, user.email, (pData) => {
      if (pData) {
        setProfile(pData);
      }
    });
    return () => unsub();
  }, [user]);

  const effectiveRole: 'player' | 'publisher' | 'admin' =
    profile?.role || getSavedUserRole(user?.uid, user?.email);

  const isProfileIncomplete =
    Boolean(profile) &&
    (!profile?.inGameName?.trim() ||
      !profile?.fbUrl?.trim() ||
      (effectiveRole === 'player' && !profile?.inGameUID?.trim()) ||
      (effectiveRole === 'publisher' && !profile?.leagueName?.trim()));

  // Auto-open Edit Profile modal right after new account registration
  useEffect(() => {
    if (!profile) return;
    try {
      const shouldOpen = sessionStorage.getItem('fc_arena_open_profile_after_signup');
      if (shouldOpen === '1') {
        sessionStorage.removeItem('fc_arena_open_profile_after_signup');
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
        setSaveError('');
        setUidHint('');
        setIsEditing(true);
      }
    } catch {}
  }, [profile]);

  const validateFacebookLink = (rawUrl: string): { valid: boolean; message: string } => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { valid: false, message: 'Facebook profile or Messenger link is required.' };
    }
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('https://')) {
      return { valid: false, message: 'Link must start with https:// (e.g., https://facebook.com/username)' };
    }
    const hasFbDomain =
      lower.includes('facebook.com/') ||
      lower.includes('fb.com/') ||
      lower.includes('fb.me/') ||
      lower.includes('m.me/') ||
      lower.includes('messenger.com/');
    if (!hasFbDomain) {
      return { valid: false, message: 'Link must contain facebook.com or m.me (e.g., https://facebook.com/username)' };
    }
    return { valid: true, message: 'Valid Facebook / Messenger link' };
  };

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
      setSaveError('');
      setUidHint('');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaveError('');

    if (!editData.inGameName.trim()) {
      setSaveError(
        effectiveRole === 'player'
          ? 'Please enter your in game name.'
          : 'Please enter your name.'
      );
      return;
    }

    if (effectiveRole === 'player') {
      const cleanUid = editData.inGameUID.trim();
      if (!cleanUid || !/^\d+$/.test(cleanUid)) {
        setSaveError('In-Game UID must contain numbers only (no letters or words allowed).');
        return;
      }
    }

    if (effectiveRole === 'publisher' && !editData.leagueName.trim()) {
      setSaveError('Please enter your Organization or League Name.');
      return;
    }

    const fbCheck = validateFacebookLink(editData.fbUrl);
    if (!fbCheck.valid) {
      setSaveError(fbCheck.message);
      return;
    }

    setIsSaving(true);
    try {
      const normalizedFb = editData.fbUrl.trim();
      const normalizedMessenger = editData.messengerLink.trim() || normalizedFb;

      await saveUserProfileToDb(
        user.uid,
        {
          uid: user.uid,
          email: profile?.email || user.email || '',
          role: effectiveRole,
          inGameName: editData.inGameName.trim(),
          inGameUID: editData.inGameUID.trim().replace(/\D/g, ''),
          fbUrl: normalizedFb,
          messengerLink: normalizedMessenger,
          leagueMessengerGroupLink: editData.leagueMessengerGroupLink.trim(),
          phone: editData.phone.trim(),
          whatsappNumber: editData.whatsappNumber.trim(),
          leagueName: editData.leagueName.trim(),
          profileCompleted: true
        },
        {
          isAdmin: effectiveRole === 'admin',
          email: profile?.email || user.email,
          merge: true
        }
      );
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
      setSaveError('Failed to update profile. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayName = profile?.inGameName || 'Recruit';
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'FC';

  return (
    <div className="space-y-7 pt-2 pb-10">
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-7"
      >
        {isProfileIncomplete && (
          <div className="p-4 sm:p-5 rounded-3xl bg-amber-50 dark:bg-amber-500/15 border-2 border-amber-300/80 dark:border-amber-400/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase italic tracking-wide">
                  Complete Your Arena Profile
                </h4>
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                  {profile?.role === 'player'
                    ? 'Please add your In-Game Name, numeric FC Mobile UID, and Facebook link to join tournaments.'
                    : 'Please add your Name, League/Organization Name, and Facebook link to host tournaments.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEditClick}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[9.5px] uppercase tracking-widest shrink-0 shadow-sm active:scale-95 transition-all"
            >
              Complete Now
            </button>
          </div>
        )}

        {/* Main Identity Hero Card */}
        <div className="nm-flat rounded-[2.5rem] p-6 sm:p-8 space-y-7 relative overflow-hidden border border-white/60 dark:border-white/15">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-bl from-indigo-500/15 via-purple-500/10 to-transparent dark:from-[#ff7a45]/25 dark:via-[#a855f7]/20 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-gradient-to-tr from-emerald-500/10 via-sky-500/10 to-transparent dark:from-[#38bdf8]/15 blur-2xl pointer-events-none" />

          {/* Top Bar inside Hero Card */}
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-[0.22em]">
              Professional Arena Profile
            </span>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={12} />
              <span className="text-[8.5px] font-black uppercase tracking-widest">
                Verified {profile?.role || 'Player'}
              </span>
            </div>
          </div>

          {/* Center Avatar & Player Identity */}
          <div className="flex flex-col items-center text-center space-y-4 relative z-10">
            <div className="relative">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-[2.4rem] p-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-400 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] shadow-xl shadow-indigo-500/15 dark:shadow-purple-500/20">
                <div className="w-full h-full rounded-[2.15rem] bg-gradient-to-b from-white to-slate-100 dark:from-[#2b3052] dark:to-[#1e223d] flex flex-col items-center justify-center relative overflow-hidden border border-white/80 dark:border-white/15">
                  <span className="text-3xl sm:text-4xl font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-600 to-slate-900 dark:from-white dark: via-orange-100 dark:to-[#ff7a45]">
                    {initials}
                  </span>
                  <span className="text-[7px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-300 mt-0.5">
                    FC ARENA
                  </span>
                </div>
              </div>
              <button 
                onClick={handleEditClick}
                title="Edit Profile"
                className="absolute -bottom-1.5 -right-1.5 w-10 h-10 rounded-xl bg-white dark:bg-[#31365c] border border-slate-200 dark:border-white/20 flex items-center justify-center text-indigo-600 dark:text-[#ff7a45] shadow-lg active:scale-95 transition-transform"
              >
                <Camera size={17} />
              </button>
            </div>

            <div className="space-y-1.5 w-full">
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white uppercase italic leading-none tracking-tighter">
                {displayName}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-slate-500 dark:text-slate-300">
                {profile?.email && (
                  <div className="inline-flex items-center gap-1.5">
                    <Mail size={12} className="text-slate-400" />
                    <span className="text-[10.5px] font-bold uppercase tracking-wider">{profile.email}</span>
                  </div>
                )}
                {profile?.leagueName && (
                  <div className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-[#ff7a45]">
                    <Award size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest italic">{profile.leagueName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-3.5 relative z-10 pt-1">
            <button 
              onClick={handleEditClick}
              className="h-14 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/20 dark:shadow-orange-500/20 active:scale-95 transition-all"
            >
              <Edit3 size={15} />
              <span>Modify Profile</span>
            </button>
            <button 
              onClick={async () => {
                await signOut(auth);
                window.location.reload();
              }}
              className="h-14 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2.5 active:scale-95 transition-all"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Digital Channels Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase italic tracking-widest">
              DIGITAL CHANNELS
            </h3>
            <button
              type="button"
              onClick={handleEditClick}
              className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-[#ff7a45] hover:underline"
            >
              Update Links
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Facebook Card */}
            <div className="nm-flat rounded-3xl p-4.5 flex items-center justify-between border border-white/60 dark:border-white/12">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <Facebook size={19} />
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">Facebook</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                    {profile?.fbUrl ? 'Connected' : 'Not Linked'}
                  </span>
                </div>
              </div>
              {profile?.fbUrl ? (
                <button
                  onClick={() => window.open(profile.fbUrl)}
                  className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-500/20 transition-colors shrink-0"
                >
                  <ExternalLink size={16} />
                </button>
              ) : (
                <button
                  onClick={handleEditClick}
                  className="px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 text-[8px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
                >
                  Link
                </button>
              )}
            </div>

            {/* WhatsApp Card */}
            <div className="nm-flat rounded-3xl p-4.5 flex items-center justify-between border border-white/60 dark:border-white/12">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <MessageSquare size={19} />
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">WhatsApp</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                    {profile?.whatsappNumber || 'Not Linked'}
                  </span>
                </div>
              </div>
              {profile?.whatsappNumber ? (
                <button
                  onClick={() => window.open(`https://wa.me/${profile.whatsappNumber?.replace(/\D/g, '')}`)}
                  className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20 transition-colors shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={handleEditClick}
                  className="px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 text-[8px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
                >
                  Link
                </button>
              )}
            </div>

            {/* Messenger Card */}
            <div className="nm-flat rounded-3xl p-4.5 flex items-center justify-between border border-white/60 dark:border-white/12">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/12 border border-sky-500/25 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <MessageCircle size={19} />
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">Messenger</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                    {profile?.messengerLink ? 'Connected' : 'Not Linked'}
                  </span>
                </div>
              </div>
              {profile?.messengerLink ? (
                <button
                  onClick={() => window.open(profile.messengerLink)}
                  className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center hover:bg-sky-500/20 transition-colors shrink-0"
                >
                  <ExternalLink size={16} />
                </button>
              ) : (
                <button
                  onClick={handleEditClick}
                  className="px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 text-[8px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
                >
                  Link
                </button>
              )}
            </div>

            {/* UID / League Code Card */}
            <div className="nm-flat rounded-3xl p-4.5 flex items-center justify-between border border-white/60 dark:border-white/12">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-purple-500/12 border border-purple-500/25 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                  <Hash size={19} />
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
                    {profile?.role === 'player' ? 'In-Game UID' : 'League Code'}
                  </span>
                  <span className="text-xs font-mono font-black text-slate-800 dark:text-white truncate block">
                    {profile?.role === 'player' ? (profile?.inGameUID || 'Pending') : (profile?.leagueName || 'Verified')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Alerts Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase italic tracking-widest">
              GLOBAL ALERTS
            </h3>
          </div>
          
          <div className="nm-flat rounded-3xl p-5 flex items-center justify-between border border-white/60 dark:border-white/12">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/12 border border-amber-500/25 flex items-center justify-center text-amber-500">
                <BellRing size={19} className={profile?.pushEnabled ? "animate-pulse" : ""} />
              </div>
              <div className="flex flex-col">
                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Notifications</span>
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  {profile?.pushEnabled ? 'Active & Receiving Alerts' : 'Push Alerts Disabled'}
                </span>
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
                "px-5 py-2.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all active:scale-95",
                profile?.pushEnabled
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/20"
              )}
            >
              {pushLoading ? '...' : (profile?.pushEnabled ? 'Test Alert' : 'Enable')}
            </button>
          </div>
        </div>

        {/* Appearance & Theme Switcher Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase italic tracking-widest">
              APPEARANCE & THEME
            </h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-purple-300">
              {isDark ? 'Dark Glass Active' : 'Light Mode Active'}
            </span>
          </div>

          <div className="nm-flat rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden border border-white/60 dark:border-white/12">
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/12 dark:bg-[#ff7a45]/15 border border-indigo-500/25 dark:border-[#ff7a45]/30 flex items-center justify-center text-indigo-600 dark:text-[#ff7a45]">
                  {isDark ? <Sparkles size={19} className="text-[#ff7a45]" /> : <Palette size={19} />}
                </div>
                <div className="flex flex-col">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Interface Mode</span>
                  <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-white uppercase italic tracking-tight">
                    {isDark ? 'Dark Glassmorphic UI' : 'Soft Neumorphic Light'}
                  </span>
                </div>
              </div>
            </div>

            {/* Clean Dual Segmented Theme Switcher (Without dark black inset box) */}
            <div className="grid grid-cols-2 gap-3 p-1.5 rounded-2xl bg-slate-200/70 dark:bg-white/8 border border-slate-300/60 dark:border-white/12 relative z-10">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  "h-12 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                  theme === 'light'
                    ? "bg-white text-slate-900 shadow-md border border-slate-200/80"
                    : "text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Sun size={15} className={cn(theme === 'light' ? "text-amber-500 fill-amber-500/20" : "text-slate-400")} />
                <span>Light Mode</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  "h-12 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                  theme === 'dark'
                    ? "bg-gradient-to-r from-[#ff7a45] via-[#ec4899] to-[#8b5cf6] text-white shadow-[0_8px_20px_-4px_rgba(255,122,69,0.5)] border border-white/25"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Moon size={15} className={cn(theme === 'dark' ? "text-white fill-white/20" : "text-indigo-500")} />
                <span>Dark Glass</span>
              </button>
            </div>
          </div>
        </div>

        {/* Version Info */}
        <div className="text-center pt-2">
          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.45em]">
            FC Arena Protocol v{APP_VERSION}
          </p>
        </div>
      </motion.div>

      {/* Solid Opaque Modify Profile Modal */}
      {isEditing && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-md solid-modal-surface bg-white rounded-[2.5rem] border border-slate-200 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[90vh] my-auto"
          >
            {/* Top Modal Header */}
            <div className="px-6 pt-6 pb-4 solid-modal-header bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 dark:from-[#ff7a45] dark:to-[#8b5cf6] text-white flex items-center justify-center shadow-lg shadow-indigo-600/25 shrink-0">
                  <Edit3 size={20} />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[8px] font-black text-emerald-700 uppercase tracking-widest">
                    <ShieldCheck size={10} /> Identity Management
                  </span>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight mt-0.5">
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
              <div className="p-3.5 rounded-2xl bg-slate-900 dark:bg-[#141729] text-white flex items-center gap-3.5 shadow-md border border-slate-800 dark:border-white/12">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 dark:from-[#ff7a45] dark:to-[#a855f7] p-0.5 shrink-0">
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

              {saveError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-400/30 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Section 1: Core Identity */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-[#ff7a45]" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Core Identity
                  </span>
                </div>

                {/* Full Handle */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1 block">
                    {profile?.role === 'player' ? 'Your in game name' : 'Your Name'}
                  </label>
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      placeholder={profile?.role === 'player' ? 'Your in game name' : 'Your Name'}
                      value={editData.inGameName}
                      onChange={(e) => setEditData({ ...editData, inGameName: e.target.value })}
                      className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-indigo-600 focus:bg-white text-xs sm:text-sm font-black text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* In-Game UID / League Name */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1 block">
                    {profile?.role === 'player' ? 'In-Game UID' : 'Organization/League Name'}
                  </label>
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {profile?.role === 'player' ? <Hash size={16} /> : <Award size={16} />}
                    </div>
                    <input
                      type="text"
                      inputMode={profile?.role === 'player' ? 'numeric' : 'text'}
                      pattern={profile?.role === 'player' ? '[0-9]*' : undefined}
                      placeholder={profile?.role === 'player' ? 'FC Mobile UID' : 'Official Title'}
                      value={profile?.role === 'player' ? editData.inGameUID : editData.leagueName}
                      onChange={(e) => {
                        if (profile?.role === 'player') {
                          const raw = e.target.value;
                          const digitsOnly = raw.replace(/\D/g, '');
                          if (raw !== digitsOnly) {
                            setUidHint('Only numbers (0-9) are allowed in Game UID.');
                          } else {
                            setUidHint('');
                          }
                          setEditData({ ...editData, inGameUID: digitsOnly });
                        } else {
                          setEditData({ ...editData, leagueName: e.target.value });
                        }
                      }}
                      className="w-full h-13 pl-14 pr-4 rounded-2xl bg-slate-50 border-2 border-slate-200/90 focus:border-indigo-600 focus:bg-white text-xs sm:text-sm font-black text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                  {profile?.role === 'player' && uidHint && (
                    <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                      <AlertCircle size={11} /> {uidHint}
                    </p>
                  )}
                </div>
              </div>

              {/* Section 2: Social & Match Coordination Channels */}
              <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Digital Contact Channels
                  </span>
                </div>

                {/* Facebook URL */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1 block">
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
                    <label className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1 block">
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
                    <label className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1 block">
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
            <div className="p-5 solid-modal-header bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="flex-1 h-13 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[1.6] h-13 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] text-white text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em] italic shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
              >
                <CheckCircle size={15} className="text-emerald-400 dark:text-white shrink-0" />
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
