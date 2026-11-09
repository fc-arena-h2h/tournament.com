import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { 
  Trophy, ArrowLeft, Shield, Lock, Send, MessageCircle, 
  Sparkles, Key, Zap, CheckCircle2, Award, Calendar, DollarSign, Users, Info
} from 'lucide-react';
import { UserProfile } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import { saveDemoTournament, saveDemoParticipants, generateDemoPlayers, DemoTournament } from '@/src/lib/localTournaments';
import { getTournamentDbForShard, getShardClusterInfo } from '@/src/lib/shardManager';
import { registerTournamentShard, recordUserActiveShard, invalidateLocalCache, ShardId } from '@/src/lib/localDbManager';

export const CreateTournamentPage = ({ 
  profile, 
  onBack,
  isDemo = false 
}: { 
  profile?: UserProfile | null; 
  onBack: () => void;
  isDemo?: boolean;
}) => {
  const initialHostLink = profile?.fbUrl || profile?.messengerLink || '';

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    organizerName: profile?.inGameName || profile?.leagueName || '',
    format: 'group_knockout' as 'group_knockout' | 'knockout',
    entryType: 'public' as 'public' | 'invited',
    invitationKey: '',
    prizePool: '',
    rewardType: 'winner_only' as 'winner_only' | 'top3',
    messengerGroupLink: initialHostLink,
    deploymentKey: '',
    activationKey: '', // This will be the same as deploymentKey for consistency
    firstPrize: 0,
    secondPrize: 0,
    thirdPrize: 0,
    totalSlots: 16,
    resultUploadType: 'players' as 'players' | 'publisher',
    autoMatchDeploy: false
  });

  // Keep synced if profile loads asynchronously
  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        organizerName: prev.organizerName || profile.inGameName || profile.leagueName || '',
        messengerGroupLink: prev.messengerGroupLink || profile.fbUrl || profile.messengerLink || ''
      }));
    }
  }, [profile]);

  const generateInvitationKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'INV-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleEntryTypeChange = (val: 'public' | 'invited') => {
    setFormData(prev => ({
      ...prev,
      entryType: val,
      invitationKey: val === 'invited' && !prev.invitationKey ? generateInvitationKey() : prev.invitationKey
    }));
  };

  const [loading, setLoading] = useState(false);
  const [telegramLink, setTelegramLink] = useState('https://t.me/your_admin_telegram');
  const [facebookLink, setFacebookLink] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.telegramLink) setTelegramLink(data.telegramLink);
        if (data.facebookLink) setFacebookLink(data.facebookLink);
      }
    });
    return () => unsub();
  }, []);

  const hasValidPrizeCurrency = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return false;
    return /\d/.test(trimmed) && /(?:^|\s|\d)(BDT|USDT)(?:\s|$)/i.test(trimmed);
  };

  const showPrizeCurrencyError =
    formData.prizePool.trim().length > 0 && !hasValidPrizeCurrency(formData.prizePool);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !profile) return;

    // Validate Prize Pool Currency (BDT or USDT)
    if (!hasValidPrizeCurrency(formData.prizePool)) {
      alert('Please type your currency type BDT or USDT.');
      return;
    }

    // Basic Validation
    if (!formData.messengerGroupLink.trim().startsWith('http')) {
      alert('Please enter a valid Facebook or Messenger link (starting with http:// or https://)');
      return;
    }

    if (formData.entryType === 'invited' && !formData.invitationKey.trim()) {
      alert('Please provide an invitation key for invited tournaments.');
      return;
    }

    setLoading(true);

    try {
      const finalOrganizer = formData.organizerName.trim() || profile?.inGameName || profile?.leagueName || 'Official Host';
      const normalizedPrizePool = formData.prizePool
        .trim()
        .replace(/bdt/gi, 'BDT')
        .replace(/usdt/gi, 'USDT');
      
      if (isDemo) {
        // --- Handle Demo Creation (Local Storage) ---
        const demoId = `demo_${Date.now()}`;
        const demoTournament: DemoTournament = {
          id: demoId,
          title: formData.title,
          description: formData.description,
          organizerName: finalOrganizer,
          format: formData.format,
          totalSlots: Number(formData.totalSlots) || 16,
          entryType: formData.entryType,
          prizePool: normalizedPrizePool,
          rewardType: formData.rewardType,
          prizes: formData.rewardType === 'top3' ? {
            first: Number(formData.firstPrize) || 0,
            second: Number(formData.secondPrize) || 0,
            third: Number(formData.thirdPrize) || 0
          } : null,
          messengerGroupLink: formData.messengerGroupLink.trim(),
          publisherId: auth.currentUser.uid,
          isDemo: true,
          status: 'open',
          filledSlots: Number(formData.totalSlots) || 16, // Auto filled with demo players
          createdAt: Date.now()
        };

        saveDemoTournament(demoTournament);
        
        // Auto generate demo players
        const players = generateDemoPlayers(demoTournament.totalSlots);
        const participants = players.map(p => ({
          ...p,
          tournamentId: demoId
        }));
        saveDemoParticipants(demoId, participants as any);

        alert(`Demo Tournament created successfully in Local Storage!`);
        onBack();
        return;
      }

      // --- Handle Official Creation (Firestore) ---
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

      const keyData = keyDoc.data();
      const targetShardId: ShardId =
        keyData.targetShardId ||
        (keyString.startsWith('FC-DB2-') ? 'shard_2' : 'shard_1');
      const notifShardId =
        keyData.notifShardId ||
        (targetShardId === 'shard_2' ? 'notif_2' : 'notif_1');
      const targetTournamentDb = getTournamentDbForShard(targetShardId);
      const shardInfo = getShardClusterInfo(targetShardId);

      // 2. Create Tournament in the Assigned Shard Database (Gariena1 or FC Tournament)
      const createdRef = await addDoc(collection(targetTournamentDb, 'tournaments'), {
        title: formData.title,
        description: formData.description,
        organizerName: finalOrganizer,
        organizationName: finalOrganizer,
        publisherName: finalOrganizer,
        publisherId: auth.currentUser.uid,
        format: formData.format,
        entryType: formData.entryType,
        invitationKey: formData.entryType === 'invited' ? formData.invitationKey.trim() : null,
        activationKey: formData.deploymentKey.trim(),
        messengerGroupLink: formData.messengerGroupLink.trim(),
        prizePool: normalizedPrizePool,
        rewardType: formData.rewardType,
        prizes: formData.rewardType === 'top3' ? {
          first: Number(formData.firstPrize) || 0,
          second: Number(formData.secondPrize) || 0,
          third: Number(formData.thirdPrize) || 0
        } : null,
        status: 'open',
        filledSlots: 0,
        totalSlots: Number(formData.totalSlots) || 16,
        resultUploadType: formData.resultUploadType,
        autoMatchDeploy: formData.autoMatchDeploy,
        shardId: targetShardId,
        notifShardId,
        createdAt: serverTimestamp()
      });

      // 3. Mark Key as Used in Master DB (zxzx) after tournament creation succeeds
      await updateDoc(doc(db, 'licenseKeys', keyDoc.id), {
        status: 'used',
        usedBy: auth.currentUser.uid,
        usedAt: serverTimestamp(),
        tournamentId: createdRef.id
      }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `licenseKeys/${keyDoc.id}`);
        throw err;
      });

      // 4. Register in Local Database Management System
      registerTournamentShard(createdRef.id, targetShardId, formData.title);
      recordUserActiveShard(auth.currentUser.uid, targetShardId);
      invalidateLocalCache('all_tournaments_');

      alert(
        profile?.role === 'admin'
          ? `Tournament created successfully in ${shardInfo.name}!`
          : 'Tournament created successfully!'
      );
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
    <div className="space-y-8 pb-32 pt-2 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 px-2">
        <button 
          onClick={onBack} 
          className="w-12 h-12 rounded-2xl nm-flat bg-white flex items-center justify-center text-slate-800 border border-white/50 active:nm-pressed shrink-0 shadow-sm"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight leading-none">
              {isDemo ? 'DEMO TOURNAMENT' : 'CREATE TOURNAMENT'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100">
              {isDemo ? 'Sandbox' : 'Official'}
            </span>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {isDemo ? 'Local Storage Simulation Arena' : 'Deploy new competitive challenge'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 px-1">
        {/* Section 1: Tournament Identity */}
        <div className="p-6 sm:p-7 rounded-[2.5rem] bg-white border border-slate-100/80 shadow-md space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Trophy size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase italic">1. Tournament Identity</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Basic branding and details</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Tournament Title</label>
            <Input 
              placeholder="e.g. FC Super Cup 2025..." 
              required
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="h-14 font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-1.5">
              <Shield size={12} className="text-indigo-500" />
              Organizer / Organization Name
            </label>
            <Input 
              placeholder="e.g. Sperk Esports, FC Arena Official..." 
              value={formData.organizerName}
              onChange={(e) => setFormData({...formData, organizerName: e.target.value})}
              className="h-14 font-bold"
            />
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">
              This name will be displayed on tournament cards and banners
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Description & Rules</label>
            <textarea 
              className="w-full p-5 rounded-2xl bg-slate-50 text-slate-700 placeholder:text-slate-400 outline-none border border-slate-200/80 min-h-[120px] text-xs font-medium leading-relaxed focus:bg-white focus:border-indigo-300 transition-all"
              placeholder="Provide tournament rules, match guidelines, and requirements..."
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
        </div>

        {/* Section 2: Structure & Capacity */}
        <div className="p-6 sm:p-7 rounded-[2.5rem] bg-white border border-slate-100/80 shadow-md space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase italic">2. Structure & Capacity</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Format, slots, and access rules</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Tournament Type</label>
              <select 
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 outline-none text-xs font-black uppercase tracking-wider cursor-pointer focus:bg-white focus:border-indigo-300 transition-all"
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
                <option value="group_knockout">Group + Knockout</option>
                <option value="knockout">Knockout Only</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Total Slots</label>
              <select 
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 outline-none text-xs font-black uppercase tracking-wider cursor-pointer focus:bg-white focus:border-indigo-300 transition-all"
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
            </div>
          </div>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">
            {formData.format === 'knockout' ? 'Maximum 32 slots allowed for knockout-only format' : 'Maximum 64 slots allowed for group format'}
          </p>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Entry Type</label>
            <select 
              className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 outline-none text-xs font-black uppercase tracking-wider cursor-pointer focus:bg-white focus:border-indigo-300 transition-all"
              value={formData.entryType}
              onChange={(e) => handleEntryTypeChange(e.target.value as any)}
            >
              <option value="public">Public (Open for Everyone)</option>
              <option value="invited">Invited (Requires Passcode / Key)</option>
            </select>
          </div>

          {formData.entryType === 'invited' && (
            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2 animate-in slide-in-from-top-2">
              <label className="text-[9px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                <Lock size={12} className="text-indigo-600" />
                Invitation Join Key
              </label>
              <Input 
                placeholder="e.g. INV-XXXXXX"
                required
                value={formData.invitationKey}
                onChange={(e) => setFormData({...formData, invitationKey: e.target.value.toUpperCase()})}
                className="h-12 bg-white font-mono font-bold"
              />
              <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider ml-1">
                Players must enter this key to send a join request. Share this key with your invited players.
              </p>
            </div>
          )}
        </div>

        {/* Section 3: Prize Pool & Host Contact */}
        <div className="p-6 sm:p-7 rounded-[2.5rem] bg-white border border-slate-100/80 shadow-md space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase italic">3. Rewards & Host Contact</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Prize money and your communication channel</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Prize Pool (BDT/USDT)</label>
              <Input 
                placeholder="e.g. 1000 BDT or 50 USDT" 
                required
                value={formData.prizePool}
                onChange={(e) => setFormData({...formData, prizePool: e.target.value})}
                className={cn(
                  "h-14 font-bold transition-all",
                  showPrizeCurrencyError && "border-rose-500 focus:border-rose-500 ring-2 ring-rose-500/20 text-rose-500"
                )}
              />
              {showPrizeCurrencyError && (
                <p className="text-[10px] font-extrabold text-rose-500 tracking-wide ml-2 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                  <Info size={12} className="shrink-0" />
                  Please type your currency type BDT or USDT.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Prize Distribution</label>
              <select 
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 outline-none text-xs font-black uppercase tracking-wider cursor-pointer focus:bg-white focus:border-indigo-300 transition-all"
                value={formData.rewardType}
                onChange={(e) => setFormData({...formData, rewardType: e.target.value as any})}
              >
                <option value="winner_only">Single Winner (Champion)</option>
                <option value="top3">Top 3 Winners (1st, 2nd, 3rd)</option>
              </select>
            </div>
          </div>

          {formData.rewardType === 'top3' && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-3 animate-in slide-in-from-top-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Prize Distribution Breakdown</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-amber-600 uppercase tracking-widest ml-1">1st Place</label>
                  <Input 
                    type="number"
                    value={formData.firstPrize}
                    onChange={(e) => setFormData({...formData, firstPrize: parseFloat(e.target.value) || 0})}
                    className="h-12 bg-white font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">2nd Place</label>
                  <Input 
                    type="number"
                    value={formData.secondPrize}
                    onChange={(e) => setFormData({...formData, secondPrize: parseFloat(e.target.value) || 0})}
                    className="h-12 bg-white font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-amber-700 uppercase tracking-widest ml-1">3rd Place</label>
                  <Input 
                    type="number"
                    value={formData.thirdPrize}
                    onChange={(e) => setFormData({...formData, thirdPrize: parseFloat(e.target.value) || 0})}
                    className="h-12 bg-white font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Host Facebook / Messenger Link Field */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between ml-2">
              <label className="text-[9px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                <MessageCircle size={13} className="text-blue-600" />
                Your Facebook / Messenger Link
              </label>
              <span className="text-[8px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                Host Direct Contact
              </span>
            </div>
            <Input 
              placeholder="https://facebook.com/... or https://m.me/..." 
              required
              value={formData.messengerGroupLink}
              onChange={(e) => setFormData({...formData, messengerGroupLink: e.target.value})}
              className="h-14 font-medium"
            />
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">
              Pre-filled from your registered account. Participants can click this to contact you directly.
            </p>
          </div>
        </div>

        {/* Section 4: Match Authority */}
        <div className="p-6 sm:p-7 rounded-[2.5rem] bg-white border border-slate-100/80 shadow-md space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Zap size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase italic">4. Match Authority</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Result submission permissions</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Match Result Upload Type</label>
            <select 
              className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-700 outline-none text-xs font-black uppercase tracking-wider cursor-pointer focus:bg-white focus:border-indigo-300 transition-all"
              value={formData.resultUploadType}
              onChange={(e) => setFormData({...formData, resultUploadType: e.target.value as any})}
            >
              <option value="players">Players Upload Match Result</option>
              <option value="publisher">Only Tournament Publisher Upload</option>
            </select>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">
              {formData.resultUploadType === 'players' ? 'Players can submit scores with verification' : 'Only you can enter match scores'}
            </p>
          </div>
        </div>

        {/* Section 5: License & Deployment */}
        {!isDemo && (
          <div className="p-6 sm:p-7 rounded-[2.5rem] bg-white border border-slate-100/80 shadow-md space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Key size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase italic">5. License & Activation</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Required deployment key</p>
              </div>
            </div>

            {/* Buy Key Card with Telegram and Facebook */}
            <div className="p-5 rounded-[2rem] bg-gradient-to-br from-indigo-50/70 via-sky-50/40 to-slate-50 border border-indigo-100/80 space-y-4">
              <div className="flex flex-col text-center">
                <h4 className="text-[11px] font-black text-indigo-950 uppercase italic tracking-wide">
                  Buy Tournament Activation Key
                </h4>
                <p className="text-[8px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5">
                  Contact admin on Telegram or Facebook to purchase your key
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button 
                  type="button" 
                  onClick={() => window.open(telegramLink, '_blank')}
                  className="h-13 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                >
                  <Send size={15} />
                  Contact (Telegram)
                </button>

                <button 
                  type="button" 
                  onClick={() => window.open(facebookLink || 'https://facebook.com', '_blank')}
                  className="h-13 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                >
                  <MessageCircle size={15} />
                  Contact (Facebook)
                </button>
              </div>
            </div>

            {/* Activation Key Input */}
            <div className="space-y-2 pt-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Deployment Activation Key</label>
              <Input 
                placeholder="Enter key to deploy (e.g. FC-XXXX-XXXX)"
                required
                value={formData.deploymentKey}
                onChange={(e) => setFormData({...formData, deploymentKey: e.target.value.trim().toUpperCase()})}
                className="h-14 font-mono font-bold tracking-widest text-indigo-900"
              />
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">
                This activation key is consumed upon tournament creation
              </p>
            </div>
          </div>
        )}

        {/* Deploy Button */}
        <Button 
          type="submit" 
          className="w-full h-18 rounded-[2rem] mt-6 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm uppercase tracking-widest shadow-2xl active:scale-98 transition-all flex items-center justify-center gap-3"
          disabled={loading}
        >
          {loading ? (
            'DEPLOYING TOURNAMENT...'
          ) : isDemo ? (
            <>
              <Trophy size={20} className="text-amber-400" />
              CREATE DEMO ARENA
            </>
          ) : (
            <>
              <Zap size={20} className="text-amber-400 fill-amber-400" />
              DEPLOY TOURNAMENT
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
