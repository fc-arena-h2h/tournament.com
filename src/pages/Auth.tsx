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
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  const handleToggleMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError('');
    setSuccessInfo('');
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
          messengerLink: formData.messengerLink.trim(),
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
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
        setError('Incorrect email or password. Verify credentials or sign up.');
      } else if (code === 'auth/wrong-password') {
        setError('Incorrect password. Try again or reset.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError(err?.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8 z-10"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-24 h-24 rounded-[2.5rem] bg-slate-900 flex items-center justify-center text-white shadow-2xl shadow-slate-900/20"
          >
             <Shield size={44} fill="currentColor" className="opacity-90" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              FC ARENA
            </h1>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
              <span>EST. 2024</span>
              <div className="w-1 h-1 rounded-full bg-indigo-500" />
              <span className="text-indigo-600">Pro Esports Management</span>
            </div>
          </div>
        </div>

        <Card className="p-8 sm:p-10 shadow-2xl border-white bg-white/90" hover={false}>
          <AnimatePresence mode="wait">
            {isForgotPassword ? (
              <motion.div 
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
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
                        className="h-16"
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
                className="space-y-8"
              >
                {isSignUp && (
                  <div className="flex bg-slate-100 p-1.5 rounded-[1.8rem] border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setRole('player')}
                      className={cn(
                        "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.3rem] transition-all relative z-10",
                        role === 'player' ? "bg-white text-indigo-600 shadow-md" : "text-slate-400"
                      )}
                    >
                      Player
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('publisher')}
                      className={cn(
                        "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.3rem] transition-all relative z-10",
                        role === 'publisher' ? "bg-white text-indigo-600 shadow-md" : "text-slate-400"
                      )}
                    >
                      Host
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest text-center">
                      {error}
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2">
                      <Mail size={12} className="text-indigo-500" /> EMAIL
                    </label>
                    <Input 
                      type="email" 
                      placeholder="player@fcarena.pro" 
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="h-16"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between ml-2 mr-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Lock size={12} className="text-indigo-500" /> PASSWORD
                      </label>
                      {!isSignUp && (
                        <button 
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="text-[9px] font-black text-indigo-500 uppercase tracking-widest"
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
                        className="h-16 pr-14"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
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
                            className="h-16"
                          />
                        </div>

                        <div className="h-px bg-slate-100 my-8" />

                        <div className="space-y-5">
                          <div className="space-y-3">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Display Name</label>
                            <Input 
                              placeholder="Your public handle"
                              required
                              value={formData.inGameName}
                              onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                              className="h-16"
                            />
                          </div>
                          
                          {role === 'player' ? (
                            <>
                              <div className="space-y-3">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">In-Game UID</label>
                                <Input placeholder="FC Mobile UID" required value={formData.inGameUID} onChange={(e) => setFormData({...formData, inGameUID: e.target.value})} className="h-16" />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Organization/League Name</label>
                              <Input placeholder="Official Title" required value={formData.leagueName} onChange={(e) => setFormData({...formData, leagueName: e.target.value})} className="h-16" />
                            </div>
                          )}

                          <div className="space-y-3">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Social Profile Link (FB/Web)</label>
                            <Input placeholder="https://..." required value={formData.fbUrl} onChange={(e) => setFormData({...formData, fbUrl: e.target.value})} className="h-16" />
                          </div>

                          <div className="space-y-3">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Messenger Contact</label>
                            <Input placeholder="https://m.me/..." required value={formData.messengerLink} onChange={(e) => setFormData({...formData, messengerLink: e.target.value})} className="h-16" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button type="submit" className="w-full h-18 rounded-[2rem] mt-4" disabled={loading}>
                    {loading ? (
                      'ESTABLISHING CONNECTION...'
                    ) : isSignUp ? (
                      <span className="flex items-center gap-2 tracking-widest"><UserPlus size={18} /> CREATE ACCOUNT</span>
                    ) : (
                      <span className="flex items-center gap-2 tracking-widest"><LogIn size={18} /> ACCESS ARENA</span>
                    )}
                  </Button>
                </form>

                <div className="text-center">
                  <button 
                    onClick={() => handleToggleMode(!isSignUp)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors"
                  >
                    {isSignUp ? 'Back to Login Terminal' : 'No account? Enlist Now'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="flex flex-col items-center gap-3 opacity-30 pt-4">
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

