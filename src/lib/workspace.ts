import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from './firebase';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const workspaceSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Workspace Auth');
    }
    cachedAccessToken = credential.accessToken;
    // Store in session-like state if needed, but per skill guidelines: "implement in-memory caching"
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Workspace sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getWorkspaceAccessToken = () => cachedAccessToken;

export const setWorkspaceAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

// --- Google Sheets Service ---
export const logToSheet = async (spreadsheetId: string, range: string, values: any[][]) => {
  const token = getWorkspaceAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Sheets API Error: ${error.error?.message || response.statusText}`);
  }
  return response.json();
};

// --- Gmail Service ---
export const sendGmail = async (to: string, subject: string, body: string) => {
  const token = getWorkspaceAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  // Basic RFC 2822 email format
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\n');

  const base64SafeMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64SafeMessage }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gmail API Error: ${error.error?.message || response.statusText}`);
  }
  return response.json();
};

// --- Calendar Service ---
export const addCalendarEvent = async (summary: string, startTime: string, endTime: string, description?: string) => {
  const token = getWorkspaceAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const event = {
    summary,
    description,
    start: { dateTime: startTime },
    end: { dateTime: endTime },
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Calendar API Error: ${error.error?.message || response.statusText}`);
  }
  return response.json();
};
