import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { 
  Mail, Lock, Eye, EyeOff, Shield, KeyRound, CheckCircle2, Phone, CheckCircle,
  ArrowRight, Sparkles, ChevronRight, UserPlus, LogIn, Key, AlertCircle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { auth, db } from '@/src/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

export const AuthPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [role, setRole] = useState<'player' | 'publisher'>('player');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    inGameName: '',
    inGameUID: '',
    fbUrl: '',
    messengerLink: '',
    leagueMessengerGroupLink: '',
    whatsappNumber: '',
    leagueName: '',
  });
  const [uidHint, setUidHint] = useState('');
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);

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
    try {
      const parsed = new URL(trimmed);
      const cleanPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      if (!cleanPath && !parsed.searchParams.get('id')) {
        return { valid: false, message: 'Please enter your complete Facebook profile link, not just facebook.com' };
      }
    } catch {
      return { valid: false, message: 'Please enter a valid https://facebook.com/... URL.' };
    }
    return { valid: true, message: 'Valid Facebook / Messenger link' };
  };

  const handleToggleMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError('');
    setUidHint('');
    setSuccessInfo('');
    setFailedAttempts(0);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccessMessage('');
    if (!formData.email) {
      setError('Please provide your registered email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, formData.email.trim());
      setResetSent(true);
      setResetSuccessMessage(`Password reset link sent to ${formData.email}. Please check your inbox.`);
      setFailedAttempts(0); // Reset count on successful reset initiation
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address format.');
      } else {
        setError(err.message || 'Failed to send reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }

        if (!formData.inGameName.trim()) {
          throw new Error(role === 'player' ? 'Please enter your in game name.' : 'Please enter your name.');
        }

        if (role === 'player') {
          const cleanUid = formData.inGameUID.trim();
          if (!cleanUid || !/^\d+$/.test(cleanUid)) {
            throw new Error('In-Game UID must contain numbers only (no letters or words allowed).');
          }
        }

        const fbValidation = validateFacebookLink(formData.fbUrl);
        if (!fbValidation.valid) {
          throw new Error(fbValidation.message);
        }

        const userCredential = await createUserWithEmailAndPassword(auth, formData.email.trim(), formData.password);
        const user = userCredential.user;
        
        await sendEmailVerification(user).catch(() => {});
        
        const isSystemAdmin = formData.email.trim().toLowerCase() === 'sperkplay@gmail.com';
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email?.toLowerCase() || formData.email.trim().toLowerCase(),
          role: isSystemAdmin ? 'admin' : role,
          inGameName: formData.inGameName.trim(),
          inGameUID: formData.inGameUID.trim(),
          fbUrl: formData.fbUrl.trim(),
          messengerLink: formData.fbUrl.trim(),
          leagueMessengerGroupLink: formData.leagueMessengerGroupLink.trim(),
          whatsappNumber: formData.whatsappNumber.trim(),
          leagueName: formData.leagueName.trim(),
          createdAt: new Date().toISOString()
        });
      } else {
        if (!formData.email.trim() || !formData.password) {
          throw new Error('Please enter email and password.');
        }
        await signInWithEmailAndPassword(auth, formData.email.trim(), formData.password);
        setFailedAttempts(0); // Success, clear attempts
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/wrong-password') {
        const nextCount = failedAttempts + 1;
        setFailedAttempts(nextCount);
        
        if (nextCount >= 10) {
          setError('Security Alert: 10 failed attempts detected. For your safety, please reset your password.');
          setTimeout(() => {
            setIsForgotPassword(true);
            setError('');
          }, 3000);
        } else {
          setError(`Incorrect password. Attempt ${nextCount} of 10. Try again or reset.`);
        }
      } else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
        setError('Incorrect email or password. Verify credentials or sign up.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError(err?.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fbStatus = formData.fbUrl.trim() ? validateFacebookLink(formData.fbUrl) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f1d] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Decorative Background Elements & Subtle Dark-Mode RGB Aura */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40 dark:opacity-85">
        <div className="absolute -top-[10%] -left-[10%] w-[45%] h-[45%] bg-indigo-500/10 dark:bg-cyan-500/15 blur-[130px] rounded-full" />
        <div className="absolute top-[25%] -right-[12%] w-[42%] h-[42%] bg-purple-500/5 dark:bg-fuchsia-500/15 blur-[130px] rounded-full" />
        <div className="absolute top-[65%] left-[15%] w-[40%] h-[40%] bg-emerald-500/10 dark:bg-emerald-500/12 blur-[130px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8 z-10"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-24 h-24 rounded-[2.5rem] bg-slate-900 dark:bg-gradient-to-br dark:from-[#1b1f38] dark:to-[#0f1224] flex items-center justify-center text-white shadow-2xl shadow-slate-900/20 dark:shadow-[0_0_30px_-5px_rgba(168,85,247,0.4)] dark:border dark:border-white/15 relative overflow-hidden"
          >
             <div className="hidden dark:block absolute inset-0 bg-gradient-to-tr from-cyan-500/15 via-purple-500/15 to-pink-500/15 pointer-events-none" />
             <Shield size={44} fill="currentColor" className="opacity-90 relative z-10" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter leading-none">
              FC ARENA
            </h1>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
              <span>EST. 2024</span>
              <div className="w-1 h-1 rounded-full bg-indigo-500 dark:bg-cyan-400" />
              <span className="text-indigo-600 dark:bg-gradient-to-r dark:from-cyan-400 dark:via-purple-400 dark:to-pink-400 dark:bg-clip-text dark:text-transparent">
                Pro Esports Management
              </span>
            </div>
          </div>
        </div>

        <div className="auth-rgb-shell">
          <Card className="auth-rgb-card p-8 sm:p-10 shadow-2xl border-white bg-white/90 ring-1 ring-black/5 relative overflow-hidden" hover={false}>
            {/* Subtle top RGB light shimmer bar & corner ambient glow in Dark Mode */}
            <div className="hidden dark:block absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent pointer-events-none" />
            <div className="hidden dark:block absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-3xl rounded-full pointer-events-none" />
            <div className="hidden dark:block absolute -top-24 -right-24 w-48 h-48 bg-purple-500/12 blur-3xl rounded-full pointer-events-none" />
            <div className="hidden dark:block absolute -bottom-24 left-1/3 w-48 h-48 bg-pink-500/10 blur-3xl rounded-full pointer-events-none" />

            <AnimatePresence mode="wait">
              {isForgotPassword ? (
                <motion.div 
                  key="forgot"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 relative z-10"
                >
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 border border-indigo-100/50 shadow-inner">
                      <KeyRound size={26} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic leading-none">
                      Account Recovery
                    </h2>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                      Verify email to reset credentials
                    </p>
                  </div>

                  {resetSent ? (
                    <div className="space-y-8 py-4">
                      <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 flex flex-col items-center text-center gap-4">
                        <CheckCircle2 size={40} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-800 leading-relaxed uppercase tracking-wider">
                          {resetSuccessMessage}
                        </p>
                      </div>
                      <Button 
                        onClick={() => {
                          setIsForgotPassword(false);
                          setResetSent(false);
                          setError('');
                        }}
                        className="w-full h-16 rounded-[1.5rem]"
                      >
                        Return to Access Point
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-8 pt-4">
                      {error && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest text-center shadow-sm">
                          <AlertCircle size={16} className="mx-auto mb-2" />
                          {error}
                        </motion.div>
                      )}

                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Registered Email</label>
                        <Input 
                          type="email" 
                          placeholder="player@fcarena.pro" 
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          className="h-16 auth-rgb-input"
                        />
                      </div>

                      <Button type="submit" className="w-full h-16 rounded-[1.5rem]" disabled={loading}>
                        {loading ? 'TRANSMITTING...' : 'INITIATE RECOVERY'}
                        <ChevronRight size={18} className="ml-2" />
                      </Button>

                      <button 
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(false);
                          setError('');
                        }}
                        className="w-full text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                      >
                        Cancel Recovery
                      </button>
                    </form>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="auth"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8 relative z-10"
                >
                  {isSignUp && (
                    <div className="auth-role-track flex bg-slate-100 p-1.5 rounded-[1.8rem] border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setRole('player')}
                        className={cn(
                          "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.3rem] transition-all relative z-10",
                          role === 'player' ? "bg-white text-indigo-600 shadow-md auth-role-active" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                      >
                        Player
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('publisher')}
                        className={cn(
                          "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.3rem] transition-all relative z-10",
                          role === 'publisher' ? "bg-white text-indigo-600 shadow-md auth-role-active" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                      >
                        Host
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest text-center">
                        {error}
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2">
                        <Mail size={12} className="text-indigo-500 dark:text-cyan-400" /> EMAIL
                      </label>
                      <Input 
                        type="email" 
                        placeholder="player@fcarena.pro" 
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="h-16 auth-rgb-input"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between ml-2 mr-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Lock size={12} className="text-indigo-500 dark:text-purple-400" /> PASSWORD
                        </label>
                        {!isSignUp && (
                          <button 
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="text-[9px] font-black text-indigo-500 dark:text-cyan-400 uppercase tracking-widest"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input 
                          type={showPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          required
                          value={formData.password}
                          onChange={(e) => setFormData({...formData, password: e.target.value})}
                          className={cn(
                            "h-16 pr-14 transition-all duration-300 auth-rgb-input",
                            failedAttempts > 0 && failedAttempts < 10 ? "border-rose-200 bg-rose-50/10" : ""
                          )}
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 dark:text-slate-400 dark:hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                      {failedAttempts > 0 && failedAttempts < 10 && (
                        <motion.p 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[9px] font-black text-rose-500 uppercase tracking-widest ml-2"
                        >
                          {10 - failedAttempts} attempts remaining before mandatory reset
                        </motion.p>
                      )}
                    </div>

                    <AnimatePresence>
                      {isSignUp && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-6 overflow-hidden pt-2"
                        >
                          <div className="space-y-3">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Repeat Password</label>
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="Confirm password" 
                              required
                              value={formData.confirmPassword}
                              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                              className="h-16 auth-rgb-input"
                            />
                          </div>

                          <div className="h-px bg-slate-100 dark:bg-gradient-to-r dark:from-transparent dark:via-white/15 dark:to-transparent my-8" />

                          <div className="space-y-5">
                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                                {role === 'player' ? 'Your in game name' : 'Your Name'}
                              </label>
                              <Input 
                                placeholder={role === 'player' ? 'Your in game name' : 'Your Name'}
                                required
                                value={formData.inGameName}
                                onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                                className="h-16 auth-rgb-input"
                              />
                            </div>
                            
                            {role === 'player' ? (
                              <>
                                <div className="space-y-3">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">In-Game UID</label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="FC Mobile UID"
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
                                      setFormData({...formData, inGameUID: digitsOnly});
                                    }}
                                    className="h-16 auth-rgb-input font-mono"
                                  />
                                  {uidHint && (
                                    <p className="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider ml-2 flex items-center gap-1">
                                      <AlertCircle size={11} /> {uidHint}
                                    </p>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="space-y-3">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Organization/League Name</label>
                                <Input placeholder="Official Title" required value={formData.leagueName} onChange={(e) => setFormData({...formData, leagueName: e.target.value})} className="h-16 auth-rgb-input" />
                              </div>
                            )}

                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Facebook/Messenger</label>
                              <Input
                                type="url"
                                placeholder="https://facebook.com/username"
                                required
                                value={formData.fbUrl}
                                onChange={(e) => setFormData({...formData, fbUrl: e.target.value, messengerLink: e.target.value})}
                                className={cn(
                                  "h-16 auth-rgb-input",
                                  fbStatus && !fbStatus.valid ? "border-rose-400/70" : fbStatus && fbStatus.valid ? "border-emerald-400/70" : ""
                                )}
                              />
                              {fbStatus && (
                                <p className={cn(
                                  "text-[9px] font-black uppercase tracking-wider ml-2 flex items-center gap-1",
                                  fbStatus.valid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
                                )}>
                                  {fbStatus.valid ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                                  <span>{fbStatus.message}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Button
                      type="submit"
                      variant="premium"
                      className="w-full h-18 rounded-[2rem] mt-4 shadow-xl dark:bg-gradient-to-r dark:from-[#ff7a45] dark:via-[#ec4899] dark:to-[#8b5cf6] dark:shadow-[0_10px_30px_-5px_rgba(236,72,153,0.45)]"
                      disabled={loading}
                    >
                      {loading ? (
                        'ESTABLISHING CONNECTION...'
                      ) : isSignUp ? (
                        <span className="flex items-center gap-2 tracking-widest"><UserPlus size={18} /> CREATE ACCOUNT</span>
                      ) : (
                        <span className="flex items-center gap-2 tracking-widest"><LogIn size={18} /> ACCESS ARENA</span>
                      )}
                    </Button>
                  </form>

                  <div className="text-center pt-2">
                    <button 
                      onClick={() => handleToggleMode(!isSignUp)}
                      className="text-[11px] font-bold tracking-wide transition-all hover:opacity-90 inline-block"
                    >
                      {isSignUp ? (
                        <span className="text-slate-400 uppercase tracking-[0.2em] text-[10px] font-black hover:text-indigo-600 dark:hover:text-cyan-400">
                          Back to Login Terminal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-emerald-500 dark:text-emerald-400 font-bold">You have no account?</span>
                          <span className="text-blue-600 dark:text-cyan-400 font-extrabold underline underline-offset-4 decoration-blue-400 dark:decoration-cyan-400/60 hover:text-blue-700">
                            Sign Up here.
                          </span>
                        </span>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>

        <div className="flex flex-col items-center gap-3 opacity-30 dark:opacity-50 pt-4">
           <div className="flex items-center gap-3">
              <Shield size={16} />
              <Key size={14} />
              <Lock size={14} />
           </div>
           <span className="text-[8px] font-black uppercase tracking-[0.4em] text-center">
              Secured Arena Protocol &copy; 2024 FC ARENA
           </span>
        </div>
      </motion.div>
    </div>
  );
};

