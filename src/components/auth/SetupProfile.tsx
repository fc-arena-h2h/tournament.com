import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import {
  Shield,
  ArrowRight,
  Phone,
  User,
  Hash,
  Award,
  Facebook,
  MessageSquare,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { auth } from '@/src/lib/firebase';
import {
  saveUserProfileToDb,
  isSystemAdminEmail,
  getSavedUserRole,
  setCachedUserProfile
} from '@/src/lib/userDbManager';
import type { UserProfile } from '@/src/hooks/useAuth';
import { signOut } from 'firebase/auth';

interface SetupProfileProps {
  user: any;
  profile?: UserProfile | null;
}

export const SetupProfile = ({ user, profile }: SetupProfileProps) => {
  // Automatically lock to the role the user selected when creating their account
  const resolvedRole: 'player' | 'publisher' | 'admin' = isSystemAdminEmail(user?.email)
    ? 'admin'
    : profile?.role || getSavedUserRole(user?.uid, user?.email);

  const [formData, setFormData] = useState({
    inGameName: profile?.inGameName || '',
    inGameUID: profile?.inGameUID || '',
    ovr: profile?.ovr || '',
    fbUrl: profile?.fbUrl || '',
    leagueMessengerGroupLink: profile?.leagueMessengerGroupLink || '',
    phone: profile?.whatsappNumber || profile?.phone || '',
    leagueName:
      profile?.leagueName || (resolvedRole === 'admin' ? 'FC Arena Official' : ''),
  });

  const [uidHint, setUidHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateFacebookLink = (rawUrl: string): { valid: boolean; message: string } => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { valid: false, message: 'Facebook profile or Messenger link is required.' };
    }
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('https://')) {
      return {
        valid: false,
        message: 'Link must start with https:// (e.g., https://facebook.com/username)'
      };
    }
    const hasFbDomain =
      lower.includes('facebook.com/') ||
      lower.includes('fb.com/') ||
      lower.includes('fb.me/') ||
      lower.includes('m.me/') ||
      lower.includes('messenger.com/');
    if (!hasFbDomain) {
      return {
        valid: false,
        message: 'Link must contain facebook.com or m.me (e.g., https://facebook.com/username)'
      };
    }
    return { valid: true, message: 'Valid link' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.inGameName.trim()) {
      setError(
        resolvedRole === 'player'
          ? 'Please enter your In-Game Name.'
          : resolvedRole === 'publisher'
          ? 'Please enter your Host / Organizer Name.'
          : 'Please enter your Admin Display Name.'
      );
      return;
    }

    if (resolvedRole === 'player') {
      const cleanUid = formData.inGameUID.trim();
      if (!cleanUid || !/^\d+$/.test(cleanUid)) {
        setError('In-Game UID must contain numbers only (0-9).');
        return;
      }
    }

    if (resolvedRole === 'publisher' && !formData.leagueName.trim()) {
      setError('Please enter your Organization or League Name.');
      return;
    }

    const fbValidation = validateFacebookLink(formData.fbUrl);
    if (!fbValidation.valid) {
      setError(fbValidation.message);
      return;
    }

    setLoading(true);
    try {
      const isSystemAdmin = resolvedRole === 'admin' || isSystemAdminEmail(user?.email);
      const finalRole: 'player' | 'publisher' | 'admin' = isSystemAdmin
        ? 'admin'
        : resolvedRole;

      const updatedProfile: UserProfile = {
        uid: user.uid,
        email: (user.email || profile?.email || '').toLowerCase(),
        role: finalRole,
        inGameName: formData.inGameName.trim(),
        inGameUID:
          finalRole === 'player'
            ? formData.inGameUID.trim().replace(/\D/g, '')
            : '',
        ovr:
          finalRole === 'player'
            ? formData.ovr.trim().replace(/\D/g, '').slice(0, 3)
            : '',
        clubId: profile?.clubId || '',
        fbUrl: formData.fbUrl.trim(),
        messengerLink: formData.fbUrl.trim(),
        leagueMessengerGroupLink:
          finalRole === 'publisher' ? formData.leagueMessengerGroupLink.trim() : '',
        phone: formData.phone.trim(),
        whatsappNumber: formData.phone.trim(),
        leagueName:
          finalRole === 'publisher'
            ? formData.leagueName.trim()
            : finalRole === 'admin'
            ? formData.leagueName.trim() || 'FC Arena Official'
            : '',
        profileCompleted: true,
        createdAt: profile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Update local cache immediately so the app transitions smoothly
      setCachedUserProfile(user.uid, updatedProfile);
      try {
        sessionStorage.removeItem('fc_arena_open_profile_after_signup');
      } catch {}

      await saveUserProfileToDb(user.uid, updatedProfile, {
        isAdmin: isSystemAdmin,
        email: user.email,
        merge: true
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleBadgeLabel =
    resolvedRole === 'admin'
      ? 'System Admin Profile'
      : resolvedRole === 'publisher'
      ? 'Host / Publisher Profile'
      : 'Player Profile';

  const roleSubtitle =
    resolvedRole === 'admin'
      ? 'Complete your administrator details'
      : resolvedRole === 'publisher'
      ? 'Set up your tournament organizer identity'
      : 'Register your FC Mobile player identity';

  return (
    <div className="min-h-screen bg-soft-bg p-4 sm:p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-7 my-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-[2rem] nm-flat flex items-center justify-center text-indigo-500">
            <Shield size={34} />
          </div>
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-cyan-400">
              <CheckCircle2 size={12} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                {roleBadgeLabel}
              </span>
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">
              Complete Setup
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {roleSubtitle}
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="nm-inset p-3.5 rounded-2xl border border-rose-200 text-rose-600 dark:text-rose-400 text-[10px] font-bold text-center flex items-center justify-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Name Field (Role-specific label) */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                <User size={12} className="text-indigo-500" />
                {resolvedRole === 'player'
                  ? 'Your In-Game Name'
                  : resolvedRole === 'publisher'
                  ? 'Your Name (Host Name)'
                  : 'Admin Display Name'}
              </label>
              <Input
                placeholder={
                  resolvedRole === 'player'
                    ? 'Enter your FC Mobile In-Game Name'
                    : resolvedRole === 'publisher'
                    ? 'Enter your full name or host handle'
                    : 'Enter admin display name'
                }
                required
                value={formData.inGameName}
                onChange={(e) => setFormData({ ...formData, inGameName: e.target.value })}
              />
            </div>

            {/* Role-Specific Primary Field: Numeric UID + OVR for Player OR Organization/League Name for Host/Admin */}
            {resolvedRole === 'player' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                    <Hash size={12} className="text-emerald-500" />
                    In-Game UID (Numbers Only)
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Numeric FC Mobile UID"
                    required
                    value={formData.inGameUID}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digitsOnly = raw.replace(/\D/g, '');
                      if (raw !== digitsOnly) {
                        setUidHint('Only numbers (0-9) are allowed in Game UID.');
                      } else {
                        setUidHint('');
                      }
                      setFormData({ ...formData, inGameUID: digitsOnly });
                    }}
                  />
                  {uidHint && (
                    <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider ml-4">
                      {uidHint}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                    Team OVR
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="e.g. 108"
                    value={formData.ovr}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setFormData({ ...formData, ovr: digitsOnly });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                  <Award size={12} className="text-emerald-500" />
                  {resolvedRole === 'publisher'
                    ? 'Organization / League Name'
                    : 'Official Organization Title'}
                </label>
                <Input
                  placeholder={
                    resolvedRole === 'publisher'
                      ? 'Enter your League or Club Name'
                      : 'FC Arena Official'
                  }
                  required={resolvedRole === 'publisher'}
                  value={formData.leagueName}
                  onChange={(e) => setFormData({ ...formData, leagueName: e.target.value })}
                />
              </div>
            )}

            {/* Facebook / Messenger Profile Link (Required for all roles for match/tournament contact) */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                <Facebook size={12} className="text-blue-500" />
                {resolvedRole === 'publisher'
                  ? 'Facebook Profile / Page URL'
                  : 'Facebook Profile / Messenger URL'}
              </label>
              <Input
                type="url"
                placeholder="https://facebook.com/your.profile"
                required
                value={formData.fbUrl}
                onChange={(e) => setFormData({ ...formData, fbUrl: e.target.value })}
              />
            </div>

            {/* Optional League Messenger Group Link for Publishers */}
            {resolvedRole === 'publisher' && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-indigo-500" />
                  League Messenger Group Link (Optional)
                </label>
                <Input
                  type="url"
                  placeholder="https://m.me/j/..."
                  value={formData.leagueMessengerGroupLink}
                  onChange={(e) =>
                    setFormData({ ...formData, leagueMessengerGroupLink: e.target.value })
                  }
                />
              </div>
            )}

            {/* Mobile / WhatsApp Number */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                <Phone size={12} className="text-emerald-500" />
                Mobile / WhatsApp Number (Optional)
              </label>
              <Input
                type="tel"
                placeholder="017XXXXXXXX or +880..."
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-16 rounded-[2.2rem] mt-4 font-black uppercase text-[11px]"
            >
              {loading ? 'Saving Profile...' : 'Complete Profile'}
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={async () => {
                await signOut(auth);
                window.location.reload();
              }}
              className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
            >
              Cancel and Sign Out
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

