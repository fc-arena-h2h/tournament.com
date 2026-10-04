import { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { ArenaPage } from '@/src/pages/Arena';
import { AuthPage } from '@/src/pages/Auth';
import { MatchesPage } from '@/src/pages/Matches';
import { TournamentListPage } from '@/src/pages/TournamentList';
import { AdminDashboard } from '@/src/pages/AdminDashboard';
import { CreateTournamentPage } from '@/src/pages/CreateTournament';
import { GlobalChatPage } from '@/src/pages/GlobalChat';
import { LeaderboardPage } from '@/src/pages/Leaderboard';
import { ProfilePage } from '@/src/pages/Profile';
import { ArenaDetail } from '@/src/pages/ArenaDetail';
import { useAuth } from '@/src/hooks/useAuth';
import { Header, BottomNav, NavTab } from '@/src/components/layout/Shell';
import { SetupProfile } from '@/src/components/auth/SetupProfile';
import { OfflineIndicator } from '@/src/components/ui/OfflineIndicator';
import { GameLoader } from '@/src/components/ui/GameLoader';
import { Button } from '@/src/components/ui/Primitives';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [leagueSubTab, setLeagueSubTab] = useState<'leaderboard' | 'chat'>('leaderboard');
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  if (loading || !initialLoadComplete) {
    return (
      <GameLoader 
        text="CONNECTING TO MATCH ENGINE" 
        onComplete={() => setInitialLoadComplete(true)} 
      />
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!profile && !loading) {
    return <SetupProfile user={user} />;
  }

  const renderContent = () => {
    if (selectedTournament) {
      return (
        <div className="fixed inset-0 z-[4000] bg-soft-bg overflow-y-auto">
          <ArenaDetail 
            tournament={selectedTournament} 
            profile={profile} 
            onBack={() => setSelectedTournament(null)} 
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'arena':
        return <ArenaPage profile={profile} onNavigate={setActiveTab} onEnterTournament={setSelectedTournament} />;
      case 'matches':
        if (profile?.role === 'publisher' || profile?.role === 'admin') {
          if (isAdminCreating) return <CreateTournamentPage onBack={() => setIsAdminCreating(false)} />;
          return <AdminDashboard onCreateNew={() => setIsAdminCreating(true)} onEnterTournament={setSelectedTournament} />;
        }
        return <MatchesPage profile={profile} />;
      case 'league':
        return (
          <div className="space-y-6 pt-4">
            <div className="flex nm-inset p-2 rounded-full border-2 border-white/20 bg-[#e6e6e9] h-18">
              <button 
                onClick={() => setLeagueSubTab('leaderboard')}
                className={cn(
                  "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all",
                  leagueSubTab === 'leaderboard' ? "nm-flat text-indigo-500 bg-[#f0f0f3]" : "text-slate-400"
                )}
              >
                Leaderboard
              </button>
              <button 
                onClick={() => setLeagueSubTab('chat')}
                className={cn(
                  "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all",
                  leagueSubTab === 'chat' ? "nm-flat text-indigo-500 bg-[#f0f0f3]" : "text-slate-400"
                )}
              >
                Social Feed
              </button>
            </div>
            {leagueSubTab === 'leaderboard' ? <LeaderboardPage /> : <GlobalChatPage profile={profile} />}
          </div>
        );
      case 'tournament':
        return <TournamentListPage profile={profile} onEnter={setSelectedTournament} />;
      case 'profile':
        return <ProfilePage user={user} profile={profile} />;
      default:
        return <ArenaPage profile={profile} onNavigate={setActiveTab} onEnterTournament={setSelectedTournament} />;
    }
  };

  // Publisher hack: If user is publisher, replace matches with admin dashboard
  const content = renderContent();

  const getTitle = () => {
    if (activeTab === 'matches' && (profile?.role === 'publisher' || profile?.role === 'admin')) {
      return isAdminCreating ? 'CREATE TOURNAMENT' : (profile.role === 'admin' ? 'COMMAND CENTER' : 'PUBLISHER PORTAL');
    }
    switch (activeTab) {
      case 'arena': return 'Dashboard';
      case 'matches': return 'My Matches';
      case 'league': return leagueSubTab === 'leaderboard' ? 'LEADERBOARD' : 'ARENA CHAT';
      case 'tournament': return 'ARENA';
      case 'profile': return 'Settings';
      default: return 'Dashboard';
    }
  };

  return (
    <div className="relative min-h-screen font-sans selection:bg-slate-900 selection:text-white pb-safe">
      {/* Locked Fixed Background Layer - Will NEVER move or scroll */}
      <div className="app-fixed-bg" />

      <div className="relative z-10">
        <Header title={getTitle()} profile={profile} />

        <main className="max-w-lg mx-auto px-6 pt-44 pb-48 min-h-screen animate-slide-left" key={activeTab}>
          {content}
        </main>
        <BottomNav 
          activeTab={activeTab} 
          onTabChange={(tab) => {
            setSelectedTournament(null);
            setActiveTab(tab);
          }} 
        />
        <OfflineIndicator />
      </div>
    </div>
  );
};
