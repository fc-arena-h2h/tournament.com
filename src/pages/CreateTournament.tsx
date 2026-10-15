import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, ArrowLeft, Shield } from 'lucide-react';
import { UserProfile } from '@/src/hooks/useAuth';

export const CreateTournamentPage = ({ profile, onBack }: { profile?: UserProfile | null; onBack: () => void }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    organizerName: profile?.inGameName || profile?.leagueName || '',
    format: 'group_knockout' as 'group_knockout' | 'knockout',
    entryType: 'free' as 'free' | 'paid',
    ovrLimit: 100,
    entryFee: 100,
    prizePool: '1000',
    totalSlots: 16,
    rewardType: 'winner_only' as 'winner_only' | 'top3',
    firstPrize: 500,
    secondPrize: 300,
    thirdPrize: 200
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !profile) return;

    const creationFee = formData.entryType === 'paid' ? 20 : 10;
    const currentWallet = profile.wallet || 0;

    if (currentWallet < creationFee) {
      alert(`Insufficient balance in wallet to pay tournament creation service charge! Required: ৳${creationFee} (${formData.entryType === 'paid' ? 'Paid tournament fee: ৳20' : 'Free tournament fee: ৳10'}). Your current wallet balance is ৳${currentWallet.toFixed(2)}.`);
      return;
    }

    setLoading(true);

    try {
      const finalOrganizer = formData.organizerName.trim() || profile?.inGameName || profile?.leagueName || 'Official Host';

      // Deduct creation fee from publisher wallet
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        wallet: currentWallet - creationFee
      });

      // Log fee transaction
      await addDoc(collection(db, 'transactions'), {
        userId: auth.currentUser.uid,
        userName: finalOrganizer,
        type: 'fee',
        method: 'bkash',
        amount: creationFee,
        currency: 'BDT',
        status: 'approved',
        note: `Tournament creation service charge (${formData.entryType} tournament)`,
        createdAt: Timestamp.now()
      });

      await addDoc(collection(db, 'tournaments'), {
        title: formData.title,
        description: formData.description,
        organizerName: finalOrganizer,
        organizationName: finalOrganizer,
        publisherName: finalOrganizer,
        publisherId: auth.currentUser.uid,
        format: formData.format,
        entryType: formData.entryType,
        entryFee: formData.entryType === 'paid' ? Number(formData.entryFee) || 0 : 0,
        ovrLimit: Number(formData.ovrLimit) || 100,
        totalSlots: Number(formData.totalSlots) || 16,
        prizePool: formData.prizePool,
        rewardType: formData.rewardType,
        prizes: formData.rewardType === 'top3' ? {
          first: Number(formData.firstPrize) || 0,
          second: Number(formData.secondPrize) || 0,
          third: Number(formData.thirdPrize) || 0
        } : null,
        status: 'open',
        filledSlots: 0,
        tournamentFund: 0,
        rewardsDistributed: false,
        createdAt: Timestamp.now()
      });

      alert(`Tournament created successfully! Service charge of ৳${creationFee} deducted from your wallet.`);
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
        {/* Service Charge Info Banner */}
        <div className="p-4 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center gap-3 mx-2">
          <Shield className="text-indigo-600 shrink-0" size={24} />
          <div>
            <h4 className="text-xs font-black text-indigo-900 uppercase">Service Charge Notice</h4>
            <p className="text-[10px] text-indigo-700 font-medium mt-0.5">
              {formData.entryType === 'paid' 
                ? 'Paid tournament creation requires a ৳20 service charge + 2% prize pool deduction on completion.' 
                : 'Free tournament creation requires a ৳10 service charge.'}
            </p>
          </div>
        </div>

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
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-1.5">
            <Shield size={12} className="text-indigo-500" />
            Organizer / Organization Name
          </label>
          <Input 
            placeholder="e.g. Sperk Esports, FC Arena Official..." 
            value={formData.organizerName}
            onChange={(e) => setFormData({...formData, organizerName: e.target.value})}
          />
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
            This name will be proudly displayed on tournament cards and the arena banner
          </p>
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
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest bg-transparent cursor-pointer"
              value={formData.format}
              onChange={(e) => setFormData({...formData, format: e.target.value as 'group_knockout' | 'knockout'})}
            >
              <option value="group_knockout">Group + Knockout</option>
              <option value="knockout">Knockout</option>
            </select>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
              {formData.format === 'knockout' ? 'Single Elimination Bracket' : 'Group Stage + Knockout'}
            </p>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Entry Type</label>
            <select 
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
              value={formData.entryType}
              onChange={(e) => setFormData({...formData, entryType: e.target.value as any})}
            >
              <option value="free">Free (৳10 Fee)</option>
              <option value="paid">Paid (৳20 Fee + 2%)</option>
            </select>
          </div>
        </div>

        {formData.entryType === 'paid' && (
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Entry Fee (Per Player in ৳)</label>
            <Input 
              type="number"
              min="1"
              required
              value={formData.entryFee}
              onChange={(e) => setFormData({...formData, entryFee: parseFloat(e.target.value) || 0})}
            />
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
              Player entry fees will be collected into the escrow tournament fund.
            </p>
          </div>
        )}

        {/* Reward Type Selection */}
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Reward Distribution Type</label>
          <select 
            className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
            value={formData.rewardType}
            onChange={(e) => setFormData({...formData, rewardType: e.target.value as any})}
          >
            <option value="winner_only">Winner Takes All (Single Winner)</option>
            <option value="top3">Top 3 Winners (1st, 2nd, 3rd)</option>
          </select>
        </div>

        {formData.rewardType === 'top3' ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">1st Place Prize (৳)</label>
              <Input 
                type="number"
                value={formData.firstPrize}
                onChange={(e) => setFormData({...formData, firstPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">2nd Place Prize (৳)</label>
              <Input 
                type="number"
                value={formData.secondPrize}
                onChange={(e) => setFormData({...formData, secondPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">3rd Place Prize (৳)</label>
              <Input 
                type="number"
                value={formData.thirdPrize}
                onChange={(e) => setFormData({...formData, thirdPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Prize Pool Description / Amount</label>
            <Input 
              placeholder="e.g. ৳1000 or $100 USDT"
              value={formData.prizePool}
              onChange={(e) => setFormData({...formData, prizePool: e.target.value})}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Min OVR Limit</label>
            <Input 
              type="number"
              value={formData.ovrLimit}
              onChange={(e) => setFormData({...formData, ovrLimit: parseInt(e.target.value) || 0})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Total Slots</label>
            <Input 
              type="number"
              value={formData.totalSlots}
              onChange={(e) => setFormData({...formData, totalSlots: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <Button 
          type="submit" 
          className="w-full h-18 rounded-[2.5rem] mt-8 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
          disabled={loading}
        >
          {loading ? 'Deploying...' : `Deploy Tournament (Fee: ৳${formData.entryType === 'paid' ? 20 : 10})`}
        </Button>
      </form>
    </div>
  );
};
