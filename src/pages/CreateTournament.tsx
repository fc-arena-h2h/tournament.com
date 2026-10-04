import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, ArrowLeft } from 'lucide-react';

export const CreateTournamentPage = ({ onBack }: { onBack: () => void }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    format: 'league' as 'league' | 'knockout' | 'hybrid',
    entryType: 'free' as 'free' | 'paid',
    ovrLimit: 100,
    entryFee: 0,
    prizePool: '$100 USDT',
    totalSlots: 16
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'tournaments'), {
        ...formData,
        publisherId: auth.currentUser.uid,
        status: 'open',
        filledSlots: 0,
        createdAt: Timestamp.now()
      });
      alert('Tournament created successfully!');
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tournaments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 pb-32 pt-4">
      <div className="flex items-center gap-6 px-4">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl nm-flat flex items-center justify-center text-slate-800 border border-white/40 active:nm-pressed">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">CREATE TOURNAMENT</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Deploy new challenge</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 px-2">
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Tournament Title</label>
          <Input 
            placeholder="Cup name..." 
            required
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
          />
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Description</label>
          <textarea 
            className="w-full p-6 nm-inset rounded-[2rem] text-slate-700 placeholder:text-slate-400 outline-none border border-white/20 min-h-[140px] text-sm font-medium leading-relaxed"
            placeholder="Rules and deployment details..."
            required
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Format</label>
            <select 
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
              value={formData.format}
              onChange={(e) => setFormData({...formData, format: e.target.value as any})}
            >
              <option value="league">League</option>
              <option value="knockout">Knockout</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Entry Type</label>
            <select 
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
              value={formData.entryType}
              onChange={(e) => setFormData({...formData, entryType: e.target.value as any})}
            >
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Entry Fee</label>
            <Input 
              type="number"
              value={formData.entryFee}
              onChange={(e) => setFormData({...formData, entryFee: parseFloat(e.target.value) || 0})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Min OVR</label>
            <Input 
              type="number"
              value={formData.ovrLimit}
              onChange={(e) => setFormData({...formData, ovrLimit: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Prize Pool</label>
            <Input 
              placeholder="$100 USDT"
              value={formData.prizePool}
              onChange={(e) => setFormData({...formData, prizePool: e.target.value})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Slots</label>
            <Input 
              type="number"
              value={formData.totalSlots}
              onChange={(e) => setFormData({...formData, totalSlots: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <Button 
          type="submit" 
          className="w-full h-18 rounded-[2.5rem] mt-8 text-indigo-600"
          disabled={loading}
        >
          {loading ? 'Deploying...' : 'Deploy Tournament'}
        </Button>
      </form>
    </div>
  );
};
