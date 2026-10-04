import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { Shield, ArrowRight } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';

export const SetupProfile = ({ user }: { user: any }) => {
  const [role, setRole] = useState<'player' | 'publisher'>('player');
  const [formData, setFormData] = useState({
    inGameName: '',
    inGameUID: '',
    fbUrl: '',
    phone: '',
    leagueName: '',
    ovr: 100,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isSystemAdmin = user.email === 'sperkplay@gmail.com';
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
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          globalRank: 0
        },
        eliteScore: 1000,
        pointsGifted: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(err);
      alert('Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-bg p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-12">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-[2rem] nm-flat flex items-center justify-center text-indigo-500">
             <Shield size={32} />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">Complete Setup</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Register your game identity</p>
          </div>
        </div>

        <Card className="p-8 space-y-8">
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
            {role === 'player' ? (
              <>
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">In-Game Name</label>
                  <Input 
                    placeholder="Game ID"
                    required
                    value={formData.inGameName}
                    onChange={(e) => setFormData({...formData, inGameName: e.target.value})}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Facebook URL</label>
                  <Input 
                    placeholder="https://facebook.com/..."
                    required
                    value={formData.fbUrl}
                    onChange={(e) => setFormData({...formData, fbUrl: e.target.value})}
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
                      placeholder="100"
                      required
                      value={formData.ovr}
                      onChange={(e) => setFormData({...formData, ovr: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Organization Name</label>
                <Input 
                  placeholder="League Name"
                  required
                  value={formData.leagueName}
                  onChange={(e) => setFormData({...formData, leagueName: e.target.value})}
                />
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-18 rounded-[2.5rem] mt-4">
              {loading ? 'Processing...' : 'Complete Profile'}
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => import('firebase/auth').then(m => m.signOut(m.getAuth()))}
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
