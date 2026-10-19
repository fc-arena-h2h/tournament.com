import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc, deleteDoc, limit, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { 
  Users, CheckCircle, XCircle, Trophy, Shield, Plus, Megaphone, 
  X, LayoutDashboard, Gamepad2, Clock, Trash2, Copy as CopyIcon 
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { MatchesPage } from '@/src/pages/Matches';
import { GameLoader } from '@/src/components/ui/GameLoader';


interface Registration {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  gameName: string;
}

interface Tournament {
  id: string;
  title: string;
  publisherId: string;
  filledSlots: number;
  organizerName?: string;
  organizationName?: string;
  publisherName?: string;
}

export const AdminDashboard = ({ 
  onCreateNew, 
  onEnterTournament 
}: { 
  onCreateNew: () => void; 
  onEnterTournament: (t: any) => void;
}) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [adminViewMode, setAdminViewMode] = useState<'dashboard' | 'matches'>('dashboard');
  const [activeSection, setActiveSection] = useState<'tournaments' | 'access' | 'keys'>('tournaments');
  const [regFilter, setRegFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [licenseKeys, setLicenseKeys] = useState<any[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [settings, setSettings] = useState({ telegramLink: 'https://t.me/your_admin_telegram' });

  useEffect(() => {
    if (!auth.currentUser || !userProfile) return;

    // 1. Fetch Tournaments
    const tQ = userProfile.role === 'admin' 
      ? query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(50))
      : query(collection(db, 'tournaments'), where('publisherId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'), limit(50));

    const unsubTournaments = onSnapshot(tQ, (snapshot) => {
      const tMap: Record<string, Tournament> = {};
      snapshot.forEach(doc => tMap[doc.id] = { id: doc.id, ...doc.data() } as Tournament);
      setTournaments(tMap);

      const tournamentIds = Object.keys(tMap);
      if (tournamentIds.length > 0 && userProfile.role !== 'admin') {
        // Publishers only see registrations for their own tournaments
        const rQ = query(collection(db, 'registrations'), where('tournamentId', 'in', tournamentIds.slice(0, 30)), limit(100));
        const unsubRegs = onSnapshot(rQ, (regSnap) => {
          setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
          setLoading(false);
        }, (error) => {
          console.error("Admin Regs Error (Publisher):", error);
          setLoading(false);
        });
        return () => unsubRegs();
      } else if (userProfile.role === 'admin') {
        // Admins see all registrations
        const rQ = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'), limit(100));
        const unsubRegs = onSnapshot(rQ, (regSnap) => {
          setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
          setLoading(false);
        }, (error) => {
          console.error("Admin Regs Error (Admin):", error);
          setLoading(false);
        });
        return () => unsubRegs();
      } else {
        setLoading(false);
      }
    }, (error) => {
      console.error("Admin Tournaments Error:", error);
      setLoading(false);
    });

    // 2. Fetch Keys & Settings (Admin Only)
    let unsubKeys: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    if (userProfile.role === 'admin') {
      const kQ = query(collection(db, 'licenseKeys'), orderBy('createdAt', 'desc'), limit(50));
      unsubKeys = onSnapshot(kQ, (snapshot) => {
        setLicenseKeys(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as any);
        }
      });
    }

    return () => {
      unsubTournaments();
      if (unsubKeys) unsubKeys();
      if (unsubSettings) unsubSettings();
    };
  }, [userProfile?.role, auth.currentUser?.uid]);

  // Separate effect to fetch the profile itself if not provided by props
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [auth.currentUser?.uid]);





  const handleUpdateStatus = async (reg: Registration, newStatus: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'registrations', reg.id), { status: newStatus });
      if (newStatus === 'approved') {
        const t = tournaments[reg.tournamentId];
        if (t) {
          await updateDoc(doc(db, 'tournaments', reg.tournamentId), { filledSlots: (t.filledSlots || 0) + 1 });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `registrations/${reg.id}`);
    }
  };

  const handleBroadcast = async () => {
    if (!announcement.trim()) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        text: announcement,
        senderId: auth.currentUser?.uid,
        senderName: userProfile?.inGameName || 'System Admin',
        createdAt: serverTimestamp()
      });
      setAnnouncement('');
      alert('Broadcasted!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'system'), settings, { merge: true });
      alert('Settings saved!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/system');
    }
  };

  const handleGenerateKey = async () => {
    if (!auth.currentUser) return;
    setIsGeneratingKey(true);
    try {
      // Generate a clean key: FC-XXXX-XXXX
      const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const keyString = `FC-${randomPart()}-${randomPart()}`;
      
      // Use the key string as the document ID for easier rule validation
      await setDoc(doc(db, 'licenseKeys', keyString), {
        key: keyString,
        status: 'active',
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      alert(`Key Generated: ${keyString}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'licenseKeys');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      console.log('Admin Action: Deleting license key:', keyId);
      await deleteDoc(doc(db, 'licenseKeys', keyId));
      return true;
    } catch (error) {
      console.error('Failed to delete license key:', error);
      handleFirestoreError(error, OperationType.DELETE, `licenseKeys/${keyId}`);
      return false;
    }
  };

  if (loading) return <GameLoader fullScreen={false} text="LOADING DASHBOARD..." />;

  return (
    <div className="space-y-12 pb-32 pt-4 px-2">
      {userProfile?.role === 'admin' && (
        <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-16 mx-2">
          <button onClick={() => setAdminViewMode('dashboard')} className={cn("flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2", adminViewMode === 'dashboard' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400")}><LayoutDashboard size={14} /> Admin</button>
          <button onClick={() => setAdminViewMode('matches')} className={cn("flex-1 py-2 text-[9px] font-black uppercase tracking-[0.2em] rounded-full transition-all flex items-center justify-center gap-2", adminViewMode === 'matches' ? "nm-flat text-indigo-600 bg-[#f0f0f3]" : "text-slate-400")}><Gamepad2 size={14} /> Battles</button>
        </div>
      )}

      {adminViewMode === 'matches' ? (
        <MatchesPage profile={userProfile} />
      ) : (
        <>
          <div className="flex items-center justify-between px-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">{userProfile?.role === 'admin' ? 'Command Center' : 'Publisher'}</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Operations</p>
            </div>
            <button onClick={onCreateNew} className="w-14 h-14 rounded-2xl nm-flat text-indigo-500 flex items-center justify-center border border-white/50 active:nm-pressed"><Plus size={24} /></button>
          </div>

          <div className="mx-2 p-1.5 nm-inset rounded-[1.6rem] bg-[#e6e6e9] border-2 border-white/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-inner">
            <button onClick={() => setActiveSection('tournaments')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5", activeSection === 'tournaments' ? "nm-flat bg-[#f0f0f3] text-indigo-600 shadow-sm" : "text-slate-500")}><Trophy size={14} /> Tournaments</button>
            <button onClick={() => setActiveSection('access')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5", activeSection === 'access' ? "nm-flat bg-[#f0f0f3] text-amber-600 shadow-sm" : "text-slate-500")}><Users size={14} /> Access</button>
            {userProfile?.role === 'admin' && (
              <button onClick={() => setActiveSection('keys')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5", activeSection === 'keys' ? "nm-flat bg-[#f0f0f3] text-emerald-600 shadow-sm" : "text-slate-500")}><Shield size={14} /> Keys</button>
            )}
          </div>

          {activeSection === 'tournaments' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4"><h3 className="text-sm font-black text-slate-800 uppercase italic">Tournament Management</h3></div>
              <div className="space-y-4">
                {userProfile?.role === 'admin' && (
                  <Card className="p-6 border-none space-y-4 mx-2 bg-indigo-50/30">
                    <textarea className="w-full h-24 p-4 nm-inset rounded-2xl text-slate-700 outline-none border border-white/20 text-xs font-medium" placeholder="Broadcast to all users..." value={announcement} onChange={(e) => setAnnouncement(e.target.value)} />
                    <Button onClick={handleBroadcast} className="w-full h-12 rounded-xl flex items-center gap-2"><Megaphone size={16} /> Broadcast Update</Button>
                  </Card>
                )}
                {Object.values(tournaments).map(t => (
                  <Card key={t.id} className="p-6 border-none mx-2 group">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-black text-slate-800 uppercase italic">{t.title}</span>
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">{t.organizerName || 'Host'}</span>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-xl border-fc-green text-fc-green hover:bg-fc-green hover:text-white" onClick={() => onEnterTournament(t)}>MANAGE</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {activeSection === 'keys' && userProfile?.role === 'admin' && (
            <section className="space-y-12 animate-in fade-in">
              <div className="space-y-6">
                <div className="px-4 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">System Settings</h3>
                </div>
                <Card className="p-6 border-none mx-2 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Admin Telegram Link</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="https://t.me/username"
                        value={settings.telegramLink}
                        onChange={(e) => setSettings({ ...settings, telegramLink: e.target.value })}
                      />
                      <Button onClick={handleSaveSettings} className="h-12 px-6">Save</Button>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <div className="px-4 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">Activation Keys</h3>
                  <Button size="sm" onClick={handleGenerateKey} disabled={isGeneratingKey} className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-700">Generate Key</Button>
                </div>
                <div className="space-y-4 px-2">
                  {licenseKeys.length === 0 && <p className="text-center text-[10px] text-slate-400 py-10 uppercase tracking-widest font-black">No keys generated yet</p>}
                  {licenseKeys.map(k => (
                    <Card key={k.id} className="p-4 border-none flex items-center justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-mono font-black text-slate-800 select-all">{k.key}</span>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          Status: <span className={cn(k.status === 'active' ? 'text-emerald-500' : 'text-rose-400')}>{k.status}</span>
                          {k.status === 'used' && k.usedAt && (
                            <span className="text-slate-300">· Used on {new Date(k.usedAt.seconds * 1000).toLocaleDateString()}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(k.key);
                            alert('Key copied to clipboard');
                          }}
                          className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-slate-400 hover:text-indigo-500"
                          title="Copy Key"
                        >
                          <CopyIcon size={16} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm(`Are you sure you want to delete key ${k.key}?`)) {
                              await handleDeleteKey(k.id);
                              alert('Key deleted successfully');
                            }
                          }}
                          className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors group"
                          title="Delete Key"
                        >
                          <X size={18} className="pointer-events-none group-active:scale-90 transition-transform" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </section>
          )}
          {activeSection === 'access' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4"><h3 className="text-sm font-black text-slate-800 uppercase italic">Access Queue</h3></div>
              <div className="flex gap-2 px-3">
                {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setRegFilter(f)} className={cn("py-1.5 px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all", regFilter === f ? "bg-slate-900 text-white" : "bg-white/80 text-slate-500")}>{f}</button>
                ))}
              </div>
              <div className="space-y-4">
                {registrations.filter(r => regFilter === 'all' || r.status === regFilter).map(reg => (
                  <Card key={reg.id} className="p-5 border-none mx-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-slate-800 font-black italic">{reg.gameName.charAt(0)}</div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-800 uppercase italic">{reg.gameName}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{tournaments[reg.tournamentId]?.title}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateStatus(reg, 'approved')} className="w-10 h-10 rounded-xl nm-flat text-emerald-500 bg-white"><CheckCircle size={18} /></button>
                        <button onClick={() => handleUpdateStatus(reg, 'rejected')} className="w-10 h-10 rounded-xl nm-flat text-rose-400 bg-white"><XCircle size={18} /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}



        </>
      )}
    </div>
  );
};
