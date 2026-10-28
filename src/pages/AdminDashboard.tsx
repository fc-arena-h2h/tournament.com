import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button, Input } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc, deleteDoc, limit, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { 
  Users, CheckCircle, XCircle, Trophy, Shield, Plus, Megaphone, 
  X, LayoutDashboard, Gamepad2, Clock, Trash2, Copy as CopyIcon, Download, AlertCircle, Edit3, RotateCcw
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { MatchesPage } from '@/src/pages/Matches';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { getDemoTournaments, deleteDemoTournament } from '@/src/lib/localTournaments';
import { notifyMatchParticipants } from '@/src/lib/notifications';


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
  onCreateDemo,
  onEnterTournament 
}: { 
  onCreateNew: () => void; 
  onCreateDemo?: () => void;
  onEnterTournament: (t: any) => void;
}) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [demoTournaments, setDemoTournaments] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [adminViewMode, setAdminViewMode] = useState<'dashboard' | 'matches'>('dashboard');
  const [activeSection, setActiveSection] = useState<'tournaments' | 'access' | 'reports' | 'keys'>('tournaments');
  const [regFilter, setRegFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reportedMatches, setReportedMatches] = useState<any[]>([]);
  const [editingPortalMatch, setEditingPortalMatch] = useState<any | null>(null);
  const [portalEditScores, setPortalEditScores] = useState({ home: 0, away: 0 });
  const [isSavingPortalMatch, setIsSavingPortalMatch] = useState(false);
  const [licenseKeys, setLicenseKeys] = useState<any[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [settings, setSettings] = useState({ telegramLink: 'https://t.me/your_admin_telegram' });
  const [appSettings, setAppSettings] = useState({ 
    min_version: '2.4.4', 
    app_id: 'fc-arena-vs-2025', 
    force_update: true,
    update_url: 'https://t.me/fcarenavsofficial'
  });

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
        // Publishers only see registrations & reported matches for their own tournaments
        const rQ = query(collection(db, 'registrations'), where('tournamentId', 'in', tournamentIds.slice(0, 30)), limit(100));
        const unsubRegs = onSnapshot(rQ, (regSnap) => {
          setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
          setLoading(false);
        }, (error) => {
          console.error("Admin Regs Error (Publisher):", error);
          setLoading(false);
        });

        const mQ = query(
          collection(db, 'matches'),
          where('tournamentId', 'in', tournamentIds.slice(0, 30)),
          limit(150)
        );
        const unsubMatches = onSnapshot(mQ, (mSnap) => {
          const allM = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setReportedMatches(allM.filter(m => m.status === 'disputed' || m.status === 'reported'));
        });

        return () => {
          unsubRegs();
          unsubMatches();
        };
      } else if (userProfile.role === 'admin') {
        // Admins see all registrations & all reported/disputed matches
        const rQ = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'), limit(100));
        const unsubRegs = onSnapshot(rQ, (regSnap) => {
          setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
          setLoading(false);
        }, (error) => {
          console.error("Admin Regs Error (Admin):", error);
          setLoading(false);
        });

        const mQ = query(
          collection(db, 'matches'),
          where('status', 'in', ['disputed', 'reported']),
          limit(100)
        );
        const unsubMatches = onSnapshot(mQ, (mSnap) => {
          setReportedMatches(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        });

        return () => {
          unsubRegs();
          unsubMatches();
        };
      } else {
        setReportedMatches([]);
        setLoading(false);
      }
    }, (error) => {
      console.error("Admin Tournaments Error:", error);
      setLoading(false);
    });

    // 2. Fetch Keys & Settings (Admin Only)
    let unsubKeys: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;
    let unsubAppSettings: (() => void) | null = null;

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

      unsubAppSettings = onSnapshot(doc(db, 'settings', 'app_update'), (snap) => {
        if (snap.exists()) {
          setAppSettings(snap.data() as any);
        } else {
          // Initialize with current app defaults if missing
          setDoc(doc(db, 'settings', 'app_update'), {
            min_version: '2.4.4',
            app_id: 'fc-arena-vs-2025',
            force_update: true,
            update_url: 'https://t.me/fcarenavsofficial'
          }).catch(console.error);
        }
      });
    }

    return () => {
      unsubTournaments();
      if (unsubKeys) unsubKeys();
      if (unsubSettings) unsubSettings();
      if (unsubAppSettings) unsubAppSettings();
    };
  }, [userProfile?.role, auth.currentUser?.uid]);

  // Load Demo Tournaments
  useEffect(() => {
    setDemoTournaments(getDemoTournaments());
  }, [activeSection]);

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

  const handleDeleteDemo = (id: string) => {
    if (confirm('Delete this demo arena and all its data? This cannot be undone.')) {
      deleteDemoTournament(id);
      setDemoTournaments(getDemoTournaments());
    }
  };

  const handlePortalConfirmMatch = async (match: any) => {
    try {
      const hScore = match.homeScore ?? 0;
      const aScore = match.awayScore ?? 0;
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      const winnerName = hScore > aScore ? match.homePlayerName : (aScore > hScore ? match.awayPlayerName : 'Draw');
      notifyMatchParticipants({
        homePlayerId: match.homePlayerId,
        awayPlayerId: match.awayPlayerId,
        title: '🏆 Match Result Confirmed!',
        message: `${match.homePlayerName} (${hScore}) - (${aScore}) ${match.awayPlayerName}. Winner: ${winnerName}!`,
        type: 'match_result',
        tournamentId: match.tournamentId,
        matchId: match.id
      }).catch(() => {});
      alert('Match result confirmed and finalized!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  const handlePortalResetMatch = async (match: any) => {
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        penaltyWinnerId: null,
        reporterId: null,
        disputeReason: null,
        updatedAt: serverTimestamp()
      });
      alert('Match has been reset to scheduled status.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  const handlePortalSaveEditedMatch = async () => {
    if (!editingPortalMatch) return;
    setIsSavingPortalMatch(true);
    try {
      await updateDoc(doc(db, 'matches', editingPortalMatch.id), {
        homeScore: portalEditScores.home,
        awayScore: portalEditScores.away,
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      alert('Match score updated and finalized!');
      setEditingPortalMatch(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${editingPortalMatch.id}`);
    } finally {
      setIsSavingPortalMatch(false);
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
          <div className="flex flex-col gap-6 px-2">
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">{userProfile?.role === 'admin' ? 'Command Center' : 'Publisher'}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Operations</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 px-2">
              <div className="p-5 nm-flat bg-white rounded-[2rem] border border-white/50 flex items-center justify-between group">
                <div className="flex flex-col gap-1">
                   <h4 className="text-[12px] font-black text-slate-800 uppercase italic tracking-tight">Create a Tournament</h4>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Official Competition</p>
                </div>
                <button 
                  onClick={onCreateNew} 
                  className="w-14 h-14 rounded-2xl nm-inset bg-[#f0f1f5] text-indigo-600 flex items-center justify-center active:scale-95 transition-all shadow-sm"
                  title="Create Tournament"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="p-5 nm-flat bg-white/60 rounded-[2rem] border border-white/30 flex items-center justify-between opacity-80">
                <div className="flex flex-col gap-1">
                   <h4 className="text-[12px] font-black text-slate-500 uppercase italic tracking-tight">Create a Demo Tournament</h4>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sandbox / Testing</p>
                </div>
                <button 
                  onClick={onCreateDemo} 
                  className="w-14 h-14 rounded-2xl nm-inset bg-[#f0f1f5] text-slate-400 flex items-center justify-center active:scale-95 transition-all shadow-sm"
                  title="Create Demo"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>
          </div>

          <div className="mx-2 p-1.5 nm-inset rounded-[1.6rem] bg-[#e6e6e9] border-2 border-white/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-inner">
            <button onClick={() => setActiveSection('tournaments')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5", activeSection === 'tournaments' ? "nm-flat bg-[#f0f0f3] text-indigo-600 shadow-sm" : "text-slate-500")}><Trophy size={14} /> Tournaments</button>
            <button onClick={() => setActiveSection('reports')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 relative", activeSection === 'reports' ? "nm-flat bg-[#f0f0f3] text-rose-600 shadow-sm" : "text-slate-500")}>
              <AlertCircle size={14} /> Reports
              {reportedMatches.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[8px] font-black">
                  {reportedMatches.length}
                </span>
              )}
            </button>
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

                {/* Demo Tournaments List */}
                {demoTournaments.length > 0 && (
                  <div className="space-y-4 px-2">
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Local Demo Arenas</span>
                      <div className="h-px flex-1 bg-amber-100" />
                    </div>
                    {demoTournaments.map(t => (
                      <Card key={t.id} className="p-6 border-none mx-2 group bg-amber-50/30 border-amber-100/50">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-black text-slate-800 uppercase italic">{t.title}</span>
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Demo · Local Storage</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleDeleteDemo(t.id)} className="w-10 h-10 rounded-xl nm-inset flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                            <Button variant="outline" size="sm" className="rounded-xl border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white" onClick={() => onEnterTournament(t)}>MANAGE DEMO</Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {(Object.values(tournaments).length === 0 && demoTournaments.length === 0) && (
                  <div className="py-20 text-center space-y-4 nm-inset rounded-[2.5rem] bg-slate-50/50 mx-2">
                    <Trophy size={48} className="mx-auto text-slate-200" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">No Tournaments Created</p>
                  </div>
                )}
                
                {Object.values(tournaments).length > 0 && (
                   <div className="space-y-4">
                     <div className="flex items-center gap-3 px-4 py-2">
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Official Live Arenas</span>
                        <div className="h-px flex-1 bg-indigo-100" />
                      </div>
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
                )}
              </div>
            </section>
          )}

          {activeSection === 'keys' && userProfile?.role === 'admin' && (
            <section className="space-y-12 animate-in fade-in">
              <div className="space-y-6">
                <div className="px-4 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">Platform Control</h3>
                </div>
                
                {/* Admin Links */}
                <Card className="p-6 border-none mx-2 space-y-6 bg-white shadow-sm">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Megaphone size={12} /> Communication Links
                    </label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Admin Telegram Link"
                        value={settings.telegramLink}
                        onChange={(e) => setSettings({ ...settings, telegramLink: e.target.value })}
                        className="h-14"
                      />
                      <Button onClick={handleSaveSettings} className="h-14 px-8 nm-flat bg-indigo-600 text-white font-black uppercase">Update</Button>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* App Update Management */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Download size={12} /> App Update Protocol
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase ml-2">Min Version</span>
                          <Input 
                            value={appSettings.min_version}
                            onChange={(e) => setAppSettings({...appSettings, min_version: e.target.value})}
                            placeholder="e.g. 2.4.1"
                          />
                       </div>
                       <div className="space-y-1.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase ml-2">Application ID</span>
                          <Input 
                            value={appSettings.app_id}
                            onChange={(e) => setAppSettings({...appSettings, app_id: e.target.value})}
                            placeholder="fc-arena-vs-2024"
                          />
                       </div>
                    </div>

                    <div className="space-y-1.5">
                       <span className="text-[8px] font-black text-slate-400 uppercase ml-2">Official Update URL</span>
                       <Input 
                         value={appSettings.update_url}
                         onChange={(e) => setAppSettings({...appSettings, update_url: e.target.value})}
                         placeholder="https://t.me/..."
                       />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl nm-inset bg-slate-50">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Enforce Mandatory Update</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">Blocks app usage if version mismatch</span>
                       </div>
                       <button 
                         onClick={() => setAppSettings({...appSettings, force_update: !appSettings.force_update})}
                         className={cn(
                           "w-14 h-8 rounded-full transition-all relative flex items-center px-1",
                           appSettings.force_update ? "bg-emerald-500" : "bg-slate-300"
                         )}
                       >
                          <div className={cn("w-6 h-6 rounded-full bg-white shadow-md transition-all", appSettings.force_update ? "translate-x-6" : "translate-x-0")} />
                       </button>
                    </div>

                    <Button 
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'settings', 'app_update'), appSettings, { merge: true });
                          alert('App Update Settings Deployment Successful!');
                        } catch (e) {
                          alert('Deployment Failed!');
                        }
                      }}
                      className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl"
                    >
                      Deploy Update Protocol
                    </Button>
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



          {activeSection === 'reports' && (
            <section className="space-y-6 animate-in fade-in">
              <div className="px-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase italic">Reported & Pending Match Results</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Review opponent reports, confirm, edit, or reset matches
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-black uppercase tracking-widest">
                  {reportedMatches.length} Matches
                </span>
              </div>

              <div className="space-y-4 px-2">
                {reportedMatches.length === 0 ? (
                  <div className="py-16 text-center space-y-3 nm-inset rounded-[2.5rem] bg-slate-50/50">
                    <CheckCircle size={40} className="mx-auto text-emerald-300" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                      No reported or pending match results right now
                    </p>
                  </div>
                ) : (
                  reportedMatches.map((m) => (
                    <Card key={m.id} className="p-6 border-2 border-white bg-white space-y-4 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                            {tournaments[m.tournamentId]?.title || 'Tournament Match'}
                          </span>
                          <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">
                            {m.stage === 'group' ? `Group Stage · Group ${m.groupId}` : m.stage || 'Match'} {m.matchId ? `· ID: ${m.matchId}` : ''}
                          </span>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                          m.status === 'disputed'
                            ? "bg-rose-50 text-rose-600 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {m.status === 'disputed' ? 'REPORTED BY OPPONENT' : 'PENDING CONFIRMATION'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">HOME</span>
                          <span className="text-xs font-black text-slate-900 uppercase italic truncate block">{m.homePlayerName}</span>
                        </div>
                        <div className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 text-lg font-black italic text-indigo-600">
                          {m.homeScore ?? 0} - {m.awayScore ?? 0}
                        </div>
                        <div className="flex-1 text-right min-w-0">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">AWAY</span>
                          <span className="text-xs font-black text-slate-900 uppercase italic truncate block">{m.awayPlayerName}</span>
                        </div>
                      </div>

                      {m.disputeReason && m.status === 'disputed' && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[9px] font-bold text-rose-800">
                          Report Reason: {m.disputeReason}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handlePortalConfirmMatch(m)}
                          className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <CheckCircle size={13} /> Confirm Result
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPortalMatch(m);
                            setPortalEditScores({
                              home: m.homeScore ?? 0,
                              away: m.awayScore ?? 0
                            });
                          }}
                          className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <Edit3 size={13} /> Edit Result
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortalResetMatch(m)}
                          className="h-10 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <RotateCcw size={13} /> Reset Match
                        </button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </section>
          )}

          {editingPortalMatch && createPortal(
            <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 sm:p-6">
              <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-[0_25px_70px_-15px_rgba(15,23,42,0.28)] relative">
                <div className="p-6 sm:p-8 flex items-center justify-between border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                      <Edit3 size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">EDIT RESULT</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        Modify & finalize reported match scoreline
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingPortalMatch(null)}
                    className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">
                        {editingPortalMatch.homePlayerName}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={portalEditScores.home}
                        onChange={(e) => setPortalEditScores({ ...portalEditScores, home: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all"
                      />
                    </div>
                    <span className="text-xl font-black text-slate-400 italic pt-6">VS</span>
                    <div className="flex-1 space-y-3">
                      <label className="text-[9px] font-black text-slate-700 uppercase tracking-[0.15em] text-center block truncate w-full px-2">
                        {editingPortalMatch.awayPlayerName}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={portalEditScores.away}
                        onChange={(e) => setPortalEditScores({ ...portalEditScores, away: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-full h-20 rounded-3xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white text-3xl font-black text-center text-slate-900 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePortalSaveEditedMatch}
                    disabled={isSavingPortalMatch}
                    className="w-full h-16 rounded-[2rem] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-[12px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
                  >
                    {isSavingPortalMatch ? 'SAVING...' : 'SAVE & FINALIZE RESULT'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};
