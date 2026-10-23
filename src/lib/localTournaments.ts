import { Timestamp } from 'firebase/firestore';

export interface DemoTournament {
  id: string;
  title: string;
  description: string;
  organizerName: string;
  format: 'group_knockout' | 'knockout';
  totalSlots: number;
  entryType: 'public' | 'invited';
  prizePool: string;
  rewardType: 'winner_only' | 'top3';
  messengerGroupLink: string;
  publisherId: string;
  isDemo: true;
  status: 'open' | 'ongoing' | 'finished';
  filledSlots: number;
  createdAt: number;
  rules?: string[];
  autoMatchDeploy?: boolean;
  autoKnockout?: boolean;
  winnerId?: string;
  winnerText?: string;
  resultUploadType?: 'players' | 'publisher';
}

export interface DemoParticipant {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  gameName: string;
  gameUid: string;
  groupId?: string;
  stage?: string;
  isDemoPlayer: true;
}

export interface DemoMatch {
  id: string;
  tournamentId: string;
  matchId: string;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayerName: string;
  awayPlayerName: string;
  homeScore?: number;
  awayScore?: number;
  status: 'scheduled' | 'reported' | 'disputed' | 'completed' | 'draft';
  reporterId?: string;
  groupId: string;
  stage: string;
  scheduledTime: { toMillis: () => number };
  penaltyWinnerId?: string | null;
}

const STORAGE_KEY = 'fc_arena_demo_tournaments';

export const getDemoTournaments = (): DemoTournament[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveDemoTournament = (tournament: DemoTournament) => {
  const tournaments = getDemoTournaments();
  const index = tournaments.findIndex(t => t.id === tournament.id);
  if (index >= 0) {
    tournaments[index] = tournament;
  } else {
    tournaments.push(tournament);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
};

export const deleteDemoTournament = (id: string) => {
  const tournaments = getDemoTournaments().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
  localStorage.removeItem(`${STORAGE_KEY}_participants_${id}`);
  localStorage.removeItem(`${STORAGE_KEY}_matches_${id}`);
};

export const getDemoParticipants = (tournamentId: string): DemoParticipant[] => {
  const data = localStorage.getItem(`${STORAGE_KEY}_participants_${tournamentId}`);
  return data ? JSON.parse(data) : [];
};

export const saveDemoParticipants = (tournamentId: string, participants: DemoParticipant[]) => {
  localStorage.setItem(`${STORAGE_KEY}_participants_${tournamentId}`, JSON.stringify(participants));
};

export const getDemoMatches = (tournamentId: string): DemoMatch[] => {
  const data = localStorage.getItem(`${STORAGE_KEY}_matches_${tournamentId}`);
  if (!data) return [];
  const matches = JSON.parse(data);
  // Restore Timestamp-like behavior for scheduledTime
  return matches.map((m: any) => ({
    ...m,
    scheduledTime: { toMillis: () => m.scheduledTimeMillis || Date.now() }
  }));
};

export const saveDemoMatches = (tournamentId: string, matches: DemoMatch[]) => {
  const serialized = matches.map(m => ({
    ...m,
    scheduledTimeMillis: m.scheduledTime.toMillis()
  }));
  localStorage.setItem(`${STORAGE_KEY}_matches_${tournamentId}`, JSON.stringify(serialized));
};

export const generateDemoPlayers = (totalSlots: number): DemoParticipant[] => {
  const players: DemoParticipant[] = [];
  const names = [
    "Sperk", "ArenaKing", "Striker99", "GoalGetter", "DefenseWall", "MidfieldMaestro", 
    "Vortex", "EliteGamer", "ProPlayer", "Champion", "Ace", "Legend", "Master", 
    "Rogue", "Shadow", "Falcon", "Titan", "Zenith", "Apex", "Nova", "Cosmo", "Astro",
    "Blaze", "Frost", "Storm", "Thunder", "Bolt", "Swift", "Quick", "Smart", "Wise"
  ];

  for (let i = 0; i < totalSlots; i++) {
    const name = names[i % names.length] + (Math.floor(i / names.length) || '');
    players.push({
      id: `demo_p_${i}`,
      tournamentId: '',
      userId: `demo_u_${i}`,
      status: 'approved',
      gameName: name,
      gameUid: `UID-${100000 + i}`,
      isDemoPlayer: true
    });
  }
  return players;
};

export const updateDemoTournament = (id: string, updates: Partial<DemoTournament>) => {
  const tournaments = getDemoTournaments();
  const index = tournaments.findIndex(t => t.id === id);
  if (index >= 0) {
    tournaments[index] = { ...tournaments[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
  }
};

export const updateDemoParticipant = (tournamentId: string, participantId: string, updates: Partial<DemoParticipant>) => {
  const participants = getDemoParticipants(tournamentId);
  const index = participants.findIndex(p => p.id === participantId);
  if (index >= 0) {
    participants[index] = { ...participants[index], ...updates };
    saveDemoParticipants(tournamentId, participants);
  }
};

export const addDemoMatch = (tournamentId: string, match: Omit<DemoMatch, 'id'>) => {
  const matches = getDemoMatches(tournamentId);
  const newMatch = { ...match, id: `demo_m_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
  matches.push(newMatch as DemoMatch);
  saveDemoMatches(tournamentId, matches);
  return newMatch;
};

export const updateDemoMatch = (tournamentId: string, matchId: string, updates: Partial<DemoMatch>) => {
  const matches = getDemoMatches(tournamentId);
  const index = matches.findIndex(m => m.id === matchId || m.matchId === matchId);
  if (index >= 0) {
    matches[index] = { ...matches[index], ...updates };
    saveDemoMatches(tournamentId, matches);
  }
};

export const deleteDemoMatch = (tournamentId: string, matchId: string) => {
  const matches = getDemoMatches(tournamentId).filter(m => m.id !== matchId && m.matchId !== matchId);
  saveDemoMatches(tournamentId, matches);
};
