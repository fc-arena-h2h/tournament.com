import React, { useState } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Trophy, ArrowLeft, Shield } from 'lucide-react';
import { UserProfile } from '@/src/hooks/useAuth';

export const CreateTournamentPage = ({ profile, onBack }: { profile?: UserProfile | null; onBack: () => void }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    organizerName: profile?.inGameName || profile?.leagueName || '',
    format: 'group_knockout' as 'group_knockout' | 'knockout',
    entryType: 'public' as 'public' | 'invited',
    prizePool: '',
    rewardType: 'winner_only' as 'winner_only' | 'top3',
    messengerGroupLink: '',
    deploymentKey: '',
    activationKey: '', // This will be the same as deploymentKey for consistency
    firstPrize: 0,
    secondPrize: 0,
    thirdPrize: 0,
    totalSlots: 16
  });
  const [loading, setLoading] = useState(false);
  const [telegramLink, setTelegramLink] = useState('https://t.me/your_admin_telegram');

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.telegramLink) setTelegramLink(data.telegramLink);
      }
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !profile) return;

    // Basic Validation
    if (!formData.messengerGroupLink.trim().startsWith('http')) {
      alert('Please enter a valid Messenger Group Link (starting with http:// or https://)');
      return;
    }

    setLoading(true);

    try {
      const keyString = formData.deploymentKey.trim();
      if (!keyString) throw new Error('Please enter an activation key!');

      // 1. Verify Deployment Key (Check by ID first, then by field for compatibility)
      let keyDoc;
      const directKeySnap = await getDoc(doc(db, 'licenseKeys', keyString));
      
      if (directKeySnap.exists() && directKeySnap.data().status === 'active') {
        keyDoc = directKeySnap;
      } else {
        const keyQuery = query(collection(db, 'licenseKeys'), where('key', '==', keyString), where('status', '==', 'active'));
        const keySnap = await getDocs(keyQuery);
        if (!keySnap.empty) {
          keyDoc = keySnap.docs[0];
        }
      }

      if (!keyDoc) {
        throw new Error('Invalid or already used Activation Key! Please purchase a valid key from the admin.');
      }

      const finalOrganizer = formData.organizerName.trim() || profile?.inGameName || profile?.leagueName || 'Official Host';

      // 2. Mark Key as Used
      await updateDoc(doc(db, 'licenseKeys', keyDoc.id), {
        status: 'used',
        usedBy: auth.currentUser.uid,
        usedAt: serverTimestamp()
      }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `licenseKeys/${keyDoc.id}`);
        throw err;
      });

      // 3. Create Tournament
      await addDoc(collection(db, 'tournaments'), {
        title: formData.title,
        description: formData.description,
        organizerName: finalOrganizer,
        organizationName: finalOrganizer,
        publisherName: finalOrganizer,
        publisherId: auth.currentUser.uid,
        format: formData.format,
        entryType: formData.entryType,
        activationKey: formData.deploymentKey.trim(), // Use the deployment key as the join key too
        messengerGroupLink: formData.messengerGroupLink.trim(),
        prizePool: formData.prizePool,
        rewardType: formData.rewardType,
        prizes: formData.rewardType === 'top3' ? {
          first: Number(formData.firstPrize) || 0,
          second: Number(formData.secondPrize) || 0,
          third: Number(formData.thirdPrize) || 0
        } : null,
        status: 'open',
        filledSlots: 0,
        totalSlots: Number(formData.totalSlots) || 16,
        createdAt: serverTimestamp()
      });

      alert(`Tournament created successfully!`);
      onBack();
    } catch (error: any) {
      console.error("Tournament Creation Error:", error);
      let errorMessage = error.message || 'Unknown error';
      
      // Try to parse Firestore error JSON if it exists
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error) {
          if (parsed.error.includes('Missing or insufficient permissions')) {
            errorMessage = "Permission Denied: You don't have enough authority to create a tournament or update the license key.";
          } else {
            errorMessage = parsed.error;
          }
        }
      } catch (e) {
        // Not a JSON error, keep original message
      }

      if (errorMessage.includes('Key')) {
        alert(errorMessage);
      } else {
        alert(`Failed to create tournament: ${errorMessage}`);
      }
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
        {/* Tournament Basic Info */}
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
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Tournament Type</label>
            <select 
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest bg-transparent cursor-pointer"
              value={formData.format}
              onChange={(e) => {
                const newFormat = e.target.value as 'group_knockout' | 'knockout';
                let newSlots = formData.totalSlots;
                if (newFormat === 'knockout' && newSlots > 32) {
                  newSlots = 32;
                }
                setFormData({...formData, format: newFormat, totalSlots: newSlots});
              }}
            >
              <option value="knockout">Knockout</option>
              <option value="group_knockout">Group + Knockout</option>
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Entry Type</label>
            <select 
              className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
              value={formData.entryType}
              onChange={(e) => setFormData({...formData, entryType: e.target.value as any})}
            >
              <option value="public">Public</option>
              <option value="invited">Invited</option>
            </select>
          </div>
        </div>

        {/* Prize Money Field */}
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Prize Money (BDT/USDT)</label>
          <Input 
            placeholder="e.g. 1000 BDT or 50 USDT"
            required
            value={formData.prizePool}
            onChange={(e) => setFormData({...formData, prizePool: e.target.value})}
          />
        </div>

        {/* Reward Type Selection */}
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Tournament Messenger Group Link</label>
          <Input 
            placeholder="https://m.me/j/..." 
            required
            value={formData.messengerGroupLink}
            onChange={(e) => setFormData({...formData, messengerGroupLink: e.target.value})}
          />
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
            Direct link to the tournament coordinate group
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Prize Distribution Type</label>
          <select 
            className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest"
            value={formData.rewardType}
            onChange={(e) => setFormData({...formData, rewardType: e.target.value as any})}
          >
            <option value="winner_only">Single Winner</option>
            <option value="top3">Top 3 Winner (1st, 2nd, 3rd)</option>
          </select>
        </div>

        {formData.rewardType === 'top3' && (
          <div className="grid grid-cols-3 gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">1st Place</label>
              <Input 
                type="number"
                value={formData.firstPrize}
                onChange={(e) => setFormData({...formData, firstPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">2nd Place</label>
              <Input 
                type="number"
                value={formData.secondPrize}
                onChange={(e) => setFormData({...formData, secondPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">3rd Place</label>
              <Input 
                type="number"
                value={formData.thirdPrize}
                onChange={(e) => setFormData({...formData, thirdPrize: parseFloat(e.target.value) || 0})}
              />
            </div>
          </div>
        )}

        {/* Buy Key Section */}
        <div className="mx-2 p-6 rounded-[2rem] nm-inset bg-indigo-50/50 border border-indigo-100/50 space-y-4">
          <div className="flex flex-col gap-1 text-center">
            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Buy Tournament Activation Key</h4>
            <p className="text-[8px] text-indigo-600 font-bold uppercase">Contact Admin to purchase your deployment license</p>
          </div>
          <Button 
            type="button" 
            onClick={() => window.open(telegramLink, '_blank')}
            className="w-full h-12 rounded-xl bg-white text-indigo-600 border border-indigo-200 shadow-sm hover:bg-indigo-50 text-[10px] font-black uppercase tracking-widest"
          >
            Contact Admin (Telegram)
          </Button>
        </div>

        {/* Activation Key Field */}
        <div className="space-y-3 pt-2">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Deployment Activation Key</label>
          <Input 
            placeholder="Enter key to deploy (e.g. FC-XXXX-XXXX)"
            required
            value={formData.deploymentKey}
            onChange={(e) => setFormData({...formData, deploymentKey: e.target.value})}
          />
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
            This key is consumed upon tournament creation
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Total Slots</label>
          <select 
            className="w-full h-16 px-6 nm-inset rounded-3xl text-slate-700 outline-none border border-white/20 text-sm font-black uppercase tracking-widest bg-transparent cursor-pointer"
            value={formData.totalSlots}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setFormData({...formData, totalSlots: val});
            }}
          >
            {[8, 16, 32, 64].map(slots => (
              <option key={slots} value={slots} disabled={formData.format === 'knockout' && slots > 32}>
                {slots} Slots {formData.format === 'knockout' && slots > 32 ? '(Group Required)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-4">
            {formData.format === 'knockout' ? 'Maximum 32 slots allowed for knockout-only format' : 'Maximum 64 slots allowed for group format'}
          </p>
        </div>

        <Button 
          type="submit" 
          className="w-full h-18 rounded-[2.5rem] mt-8 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 text-red-500 font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
          disabled={loading}
        >
          {loading ? 'Deploying...' : `Deploy Tournament`}
        </Button>
      </form>
    </div>
  );
};
