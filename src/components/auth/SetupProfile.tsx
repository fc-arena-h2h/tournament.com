import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { Shield, ArrowRight, Phone } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { signOut } from 'firebase/auth';

export const SetupProfile = ({ user }: { user: any }) => {
  const [role, setRole] = useState<'player' | 'publisher'>('player');
  const [avatar, setAvatar] = useState('https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&h=400&fit=crop');
  const [formData, setFormData] = useState({
    inGameName: '',
    inGameUID: '',
    fbUrl: '',
    phone: '',
    leagueName: '',
    ovr: 100,
  });

  const avatars = [
    'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=400&fit=crop',
  ];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setLoading(true);
    try {
      const isSystemAdmin = user.email === 'sperkplay@gmail.com';

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        role: isSystemAdmin ? 'admin' : role,
        inGameName: formData.inGameName.trim(),
        inGameUID: formData.inGameUID.trim(),
        fbUrl: formData.fbUrl.trim(),
        phone: formData.phone.trim(),
        leagueName: formData.leagueName.trim(),
        ovr: formData.ovr,
        avatar: avatar,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-bg p-4 sm:p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-8 my-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-[2rem] nm-flat flex items-center justify-center text-indigo-500">
             <Shield size={34} />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">Complete Setup</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Register your game identity</p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 space-y-6">
          <div className="flex nm-inset p-2 rounded-[2rem] relative border border-white/20">
            <button
              onClick={() => setRole('player')}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                role === 'player' ? "nm-flat text-indigo-500" : "text-slate-400"
              )}
            >
              Player
            </button>
            <button
              onClick={() => setRole('publisher')}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all relative z-10",
                role === 'publisher' ? "nm-flat text-indigo-500" : "text-slate-400"
              )}
            >
              Host
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Select Pro Avatar</label>
            <div className="grid grid-cols-6 gap-2 px-1">
              {avatars.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatar(url)}
                  className={cn(
                    "relative aspect-square rounded-xl overflow-hidden nm-flat p-0.5 transition-all active:scale-95",
                    avatar === url ? "ring-2 ring-indigo-500 ring-offset-2" : "opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={url} alt={`Avatar ${i+1}`} className="w-full h-full object-cover rounded-[10px]" />
                  {avatar === url && (
                    <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                      <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="nm-inset p-3.5 rounded-2xl border border-rose-200 text-rose-600 text-[10px] font-bold text-center">
                {error}
              </div>
            )}

            {/* Mobile Number Field (Simple input, no SMS verification required) */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                <Phone size={12} className="text-indigo-500" />
                Mobile / WhatsApp Number
              </label>
              <Input 
                placeholder="017XXXXXXXX or +880..."
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>

            {role === 'player' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">In-Game Name</label>
                  <Input 
                    placeholder="Game ID"
                    required
                    value={formData.inGameName}
                    onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Facebook URL</label>
                  <Input 
                    placeholder="https://facebook.com/..."
                    required
                    value={formData.fbUrl}
                    onChange={(e) => setFormData({...formData, fbUrl: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">UID</label>
                    <Input 
                      placeholder="ID"
                      required
                      value={formData.inGameUID}
                      onChange={(e) => setFormData({...formData, inGameUID: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">OVR</label>
                    <Input 
                      type="number"
                      placeholder="100"
                      required
                      value={formData.ovr}
                      onChange={(e) => setFormData({...formData, ovr: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Organization Name</label>
                <Input 
                  placeholder="League Name"
                  required
                  value={formData.leagueName}
                  onChange={(e) => setFormData({...formData, leagueName: e.target.value})}
                />
              </div>
            )}

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-16 rounded-[2.2rem] mt-4 font-black uppercase text-[11px]"
            >
              {loading ? 'Processing...' : 'Complete Profile'}
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button 
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
