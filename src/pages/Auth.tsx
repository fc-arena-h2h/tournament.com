import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { 
  Mail, Lock, Eye, EyeOff, Shield, KeyRound, CheckCircle2, Phone, CheckCircle
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
    phone: '',
    leagueName: '',
    ovr: 100,
  });
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  // Reset errors when toggling modes
  const handleToggleMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError('');
    setSuccessInfo('');
  };

  // ==========================================
  // FORGOT PASSWORD
  // ==========================================
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
      setResetSuccessMessage(`Password reset link sent to ${formData.email}. Please check your inbox or spam folder.`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address format.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // SUBMIT (SIGN IN OR SIGN UP)
  // ==========================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Validation for registration
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, formData.email.trim(), formData.password);
        const user = userCredential.user;
        
        await sendEmailVerification(user).catch(() => {});
        
        // Create user profile in Firestore
        const isSystemAdmin = formData.email.trim().toLowerCase() === 'sperkplay@gmail.com';
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email?.toLowerCase() || formData.email.trim().toLowerCase(),
          role: isSystemAdmin ? 'admin' : role,
          inGameName: formData.inGameName.trim(),
          inGameUID: formData.inGameUID.trim(),
          fbUrl: formData.fbUrl.trim(),
          phone: formData.phone.trim(),
          leagueName: formData.leagueName.trim(),
          ovr: formData.ovr,
          createdAt: new Date().toISOString()
        });
        
        alert('Account created successfully! Welcome to FC Arena.');
      } else {
        // Standard Email + Password Sign In
        if (!formData.email.trim() || !formData.password) {
          throw new Error('Please enter email and password.');
        }

        await signInWithEmailAndPassword(auth, formData.email.trim(), formData.password);
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
        setError('Incorrect email or password. If you have not created an account yet, click "New recruit? Sign Up" below.');
      } else if (code === 'auth/wrong-password') {
        setError('Incorrect password. Please verify and try again, or use Forgot Password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please click "Already registered? Sign In" below.');
      } else if (code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else {
        setError(err?.message || 'Authentication process failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-bg p-4 sm:p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-8 my-6">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-[2.2rem] nm-flat flex items-center justify-center text-indigo-500 border-4 border-[#f0f0f3]">
             <Shield size={38} fill="currentColor" className="opacity-80" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl sm:text-4xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">
              FC ARENA
            </h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center justify-center gap-1.5">
              <span>Competitive Esports Hub</span>
              <span className="inline-block w-1 h-1 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-600 font-bold">Official Tournaments</span>
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 space-y-6">
          {isForgotPassword ? (
            /* Forgot Password Form */
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl nm-inset flex items-center justify-center text-indigo-500 mb-3">
                  <KeyRound size={22} />
                </div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">
                  Reset Password
                </h2>
                <p className="text-[11px] font-medium text-slate-500">
                  Enter your registered email and we will send a password reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-emerald-800 leading-relaxed">
                      {resetSuccessMessage}
                    </p>
                  </div>

                  <Button 
                    type="button" 
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                      setError('');
                    }}
                    className="w-full h-14 rounded-[2rem] text-[11px] font-black uppercase tracking-widest"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-6">
                  {error && (
                    <div className="nm-inset p-4 rounded-2xl border border-rose-200/50 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center">
                      {error}
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Account Email</label>
                    <Input 
                      type="email" 
                      placeholder="name@arena.com" 
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-[2rem] text-[11px]"
                    disabled={loading}
                  >
                    {loading ? 'Sending link...' : 'Send Reset Link'}
                    <ArrowRight className="ml-2" />
                  </Button>

                  <div className="text-center pt-2">
                    <button 
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setError('');
                      }}
                      className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                    >
                      Return to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Regular Sign In / Sign Up Form */
            <>
              {/* Role Toggle for Sign Up */}
              {isSignUp && (
                <div className="flex nm-inset p-2 rounded-[2rem] relative border border-white/20">
                  <button
                    type="button"
                    onClick={() => setRole('player')}
                    className={cn(
                      "flex-1 py-3.5 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                      role === 'player' ? "nm-flat text-indigo-500" : "text-slate-400"
                    )}
                  >
                    Player
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('publisher')}
                    className={cn(
                      "flex-1 py-3.5 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                      role === 'publisher' ? "nm-flat text-indigo-500" : "text-slate-400"
                    )}
                  >
                    Host / Organizer
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Feedback Messages */}
                {error && (
                  <div className="nm-inset p-3.5 rounded-2xl border border-rose-200/80 text-rose-600 text-[10px] font-bold leading-relaxed text-center">
                    {error}
                  </div>
                )}
                
                {successInfo && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold text-center flex items-center justify-center gap-1.5">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>{successInfo}</span>
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                    <Mail size={12} className="text-indigo-500" />
                    Email
                  </label>
                  <Input 
                    type="email" 
                    placeholder="name@arena.com" 
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-4 mr-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Lock size={12} className="text-indigo-500" />
                      Password
                    </label>
                    {!isSignUp && (
                      <button 
                        type="button"
                        onClick={() => {
                           setIsForgotPassword(true);
                           setError('');
                        }}
                        className="text-[9px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-wider transition-colors"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Secret key" 
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Sign Up: Confirm Password */}
                {isSignUp && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">
                      Confirm Password
                    </label>
                    <Input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Repeat key" 
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    />
                  </div>
                )}

                {/* Sign Up: Additional Fields */}
                {isSignUp && (
                  <div className="space-y-4 pt-2 border-t border-slate-200/80">
                    {/* Mobile Number Field (Simple input, no SMS verification required) */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                        <Phone size={12} className="text-indigo-500" />
                        Mobile / WhatsApp Number
                      </label>
                      <Input 
                        placeholder="017XXXXXXXX or +880..."
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      />
                    </div>

                    {/* Role Specific Additional Fields */}
                    {role === 'player' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">
                            In-Game Nickname
                          </label>
                          <Input 
                            placeholder="In-game Name"
                            required
                            value={formData.inGameName}
                            onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">
                            Facebook Profile URL
                          </label>
                          <Input 
                            placeholder="https://facebook.com/profile..."
                            required
                            value={formData.fbUrl}
                            onChange={(e) => setFormData({...formData, fbUrl: e.target.value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">In-Game UID</label>
                            <Input 
                              placeholder="UID"
                              required
                              value={formData.inGameUID}
                              onChange={(e) => setFormData({...formData, inGameUID: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Squad OVR</label>
                            <Input 
                              type="number"
                              placeholder="104"
                              required
                              value={formData.ovr}
                              onChange={(e) => setFormData({...formData, ovr: parseInt(e.target.value) || 0})}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">
                          League / Organization Title
                        </label>
                        <Input 
                          placeholder="League Title"
                          required
                          value={formData.leagueName}
                          onChange={(e) => setFormData({...formData, leagueName: e.target.value})}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Action */}
                <Button 
                  type="submit" 
                  className="w-full h-16 rounded-[2.2rem] mt-6 text-[11px] font-black uppercase tracking-wider"
                  disabled={loading}
                >
                  {loading ? (
                    'Processing...'
                  ) : isSignUp ? (
                    'Initialize Profile'
                  ) : (
                    'Access Arena'
                  )}
                  <ArrowRight className="ml-2" />
                </Button>
              </form>

              {/* Mode Switcher */}
              <div className="text-center pt-2">
                <button 
                  onClick={() => handleToggleMode(!isSignUp)}
                  className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                >
                  {isSignUp ? 'Already registered? Sign In' : 'New recruit? Sign Up'}
                </button>
              </div>
            </>
          )}
        </Card>

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-2 opacity-40">
          <Shield size={14} />
          <span className="text-[8px] font-black uppercase tracking-[0.3em]">Official Field License & Esports Arena</span>
        </div>
      </div>
    </div>
  );
};

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={cn("w-5 h-5", className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);
