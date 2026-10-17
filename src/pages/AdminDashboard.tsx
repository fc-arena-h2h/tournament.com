import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/src/components/ui/Primitives';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc, deleteDoc, limit, orderBy, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { 
  Users, CheckCircle, XCircle, Trophy, Shield, Plus, Megaphone, 
  X, LayoutDashboard, Gamepad2, Clock, Link2 
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserProfile } from '@/src/hooks/useAuth';
import { MatchesPage } from '@/src/pages/Matches';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { 
  workspaceSignIn, getWorkspaceAccessToken, logToSheet 
} from '@/src/lib/workspace';

interface Registration {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  gameName: string;
  ovr: number;
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
  const [activeSection, setActiveSection] = useState<'tournaments' | 'access' | 'workspace'>('tournaments');
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(getWorkspaceAccessToken());
  const [regFilter, setRegFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchProfile = async () => {
      const snap = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      if (snap.exists()) {
        const profile = snap.data() as UserProfile;
        setUserProfile(profile);

        const tQ = profile.role === 'admin' 
          ? query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(50))
          : query(collection(db, 'tournaments'), where('publisherId', '==', auth.currentUser!.uid), orderBy('createdAt', 'desc'), limit(50));

        const unsubTournaments = onSnapshot(tQ, (snapshot) => {
          const tMap: Record<string, Tournament> = {};
          snapshot.forEach(doc => tMap[doc.id] = { id: doc.id, ...doc.data() } as Tournament);
          setTournaments(tMap);

          const tournamentIds = Object.keys(tMap);
          if (tournamentIds.length > 0) {
            const rQ = profile.role === 'admin'
              ? query(collection(db, 'registrations'), orderBy('createdAt', 'desc'), limit(100))
              : query(collection(db, 'registrations'), where('tournamentId', 'in', tournamentIds.slice(0, 30)), limit(100));
            
            const unsubRegs = onSnapshot(rQ, (regSnap) => {
              setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)));
              setLoading(false);
            }, (error) => {
              console.error("Admin Regs Error:", error);
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
        return unsubTournaments;
      }
    };

    const unsubProfilePromise = fetchProfile();
    return () => {
      unsubProfilePromise.then(unsub => unsub?.());
    };
  }, []);

  const handleConnectWorkspace = async () => {
    try {
      const result = await workspaceSignIn();
      if (result) {
        setWorkspaceToken(result.accessToken);
        alert('Google Workspace connected!');
      }
    } catch (err) {
      alert('Workspace connection failed.');
    }
  };

  const handleExportToSheets = async () => {
    if (!workspaceToken) return alert('Connect Workspace first');
    const spreadsheetId = window.prompt('Enter Spreadsheet ID:');
    if (!spreadsheetId) return;
    try {
      const rows = Object.values(tournaments).map(t => [t.id, t.title, t.filledSlots]);
      await logToSheet(spreadsheetId, 'Sheet1!A1', [['ID', 'Title', 'Slots'], ...rows]);
      alert('Exported!');
    } catch (err: any) {
      alert(err.message);
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

  const handleUpdateStatus = async (reg: Registration, newStatus: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'registrations', reg.id), { status: newStatus });
      if (newStatus === 'approved') {
        const t = tournaments[reg.tournamentId];
        await updateDoc(doc(db, 'tournaments', reg.tournamentId), { filledSlots: (t.filledSlots || 0) + 1 });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `registrations/${reg.id}`);
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
            {userProfile?.role === 'admin' && <button onClick={() => setActiveSection('workspace')} className={cn("flex-1 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5", activeSection === 'workspace' ? "nm-flat bg-[#f0f0f3] text-blue-600 shadow-sm" : "text-slate-500")}><Link2 size={14} /> Workspace</button>}
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
                          <span className="text-[9px] font-bold text-slate-400 uppercase">OVR {reg.ovr} · {tournaments[reg.tournamentId]?.title}</span>
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

          {activeSection === 'workspace' && userProfile?.role === 'admin' && (
            <section className="space-y-6 animate-in fade-in p-4">
              <h3 className="text-sm font-black text-slate-800 uppercase italic">Google Workspace</h3>
              <div className="space-y-4">
                <Button onClick={handleConnectWorkspace} className="w-full h-14 rounded-2xl bg-white border text-blue-600 font-black flex items-center gap-3"><Link2 size={20} /> {workspaceToken ? 'Reconnect Workspace' : 'Connect Workspace'}</Button>
                {workspaceToken && <Button onClick={handleExportToSheets} className="w-full h-14 rounded-2xl bg-indigo-600 text-white font-black">Export Tournaments to Sheets</Button>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
