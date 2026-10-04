import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { Mail, Lock, Eye, EyeOff, Shield, Trophy, ChevronLeft, Globe } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { auth, db } from '@/src/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export const AuthPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        
        await sendEmailVerification(user);
        
        // Create user profile
        const isSystemAdmin = formData.email === 'sperkplay@gmail.com';
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: isSystemAdmin ? 'admin' : role,
          inGameName: formData.inGameName,
          inGameUID: formData.inGameUID,
          fbUrl: formData.fbUrl,
          phone: formData.phone,
          leagueName: formData.leagueName,
          ovr: formData.ovr,
          stats: {
            globalRank: 0,
            winRate: 0,
            totalPlay: 0,
            fp: 0,
            balance: 0
          },
          createdAt: new Date().toISOString()
        });
        
        alert('Verification email sent! Please check your inbox.');
      } else {
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-bg p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-12">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-24 h-24 rounded-[2.5rem] nm-flat flex items-center justify-center text-indigo-500 border-4 border-[#f0f0f3]">
             <Shield size={40} fill="currentColor" className="opacity-80" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">
              ELITE ARENA
            </h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              The Ultimate Mobile FC Platform
            </p>
          </div>
        </div>

        <Card className="p-8 space-y-8">
          {/* Role Toggle - Neumorphic Inset */}
          <div className="flex nm-inset p-2 rounded-[2rem] relative border border-white/20">
            <button
              onClick={() => setRole('player')}
              className={cn(
                "flex-1 py-4 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                role === 'player' ? "nm-flat text-indigo-500" : "text-slate-400"
              )}
            >
              Player
            </button>
            <button
              onClick={() => setRole('publisher')}
              className={cn(
                "flex-1 py-4 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                role === 'publisher' ? "nm-flat text-indigo-500" : "text-slate-400"
              )}
            >
              Host
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="nm-inset p-4 rounded-2xl border border-rose-200/50 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-3">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Email</label>
              <Input 
                type="email" 
                placeholder="name@arena.com" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Password</label>
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
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Confirm Password</label>
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Repeat key" 
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                />
              </div>
            )}

            {isSignUp && (
              <div className="space-y-6 pt-4 border-t border-white/20">
                {role === 'player' ? (
                  <>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Game Name</label>
                      <Input 
                        placeholder="In-game Name"
                        required
                        value={formData.inGameName}
                        onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Facebook URL</label>
                      <Input 
                        placeholder="https://facebook.com/profile..."
                        required
                        value={formData.fbUrl}
                        onChange={(e) => setFormData({...formData, fbUrl: e.target.value})}
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone / WhatsApp</label>
                      <Input 
                        placeholder="+880..."
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">UID</label>
                        <Input 
                          placeholder="ID"
                          required
                          value={formData.inGameUID}
                          onChange={(e) => setFormData({...formData, inGameUID: e.target.value})}
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">OVR</label>
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
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Organization</label>
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

            <Button 
              type="submit" 
              className="w-full h-18 rounded-[2.5rem] mt-8 text-[11px]"
              disabled={loading}
            >
              {loading ? 'Entering...' : (isSignUp ? 'Initialize Profile' : 'Access Arena')}
              <ArrowRight className="ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              {isSignUp ? 'Already verified? Sign In' : 'New recruit? Sign Up'}
            </button>
          </div>
        </Card>

        <div className="flex items-center justify-center gap-2 opacity-30">
          <Shield size={14} />
          <span className="text-[8px] font-black uppercase tracking-[0.3em]">Official Field License</span>
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
