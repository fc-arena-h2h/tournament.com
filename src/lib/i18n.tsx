import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en';

export const translations = {
  en: {
    // Navigation & Shell
    nav_dashboard: 'DASHBOARD',
    nav_arena: 'ARENA',
    nav_field: 'FIELD',
    nav_elite: 'ELITE',
    nav_me: 'PROFILE',
    app_title: 'FC Arena VS',
    menu: 'Menu',
    wallet: 'Wallet',
    notifications: 'Notifications',
    back: 'Back',
    settings: 'Settings',
    logout: 'Logout',
    install_app: 'Install App',
    connected_match_engine: 'Connecting to Match Engine',
    language: 'Language',
    language_toggle: 'English',
    language_current: 'English',

    // Wallet & Cashier
    wallet_title: 'Cashier & Digital Wallet',
    wallet_balance: 'Current Balance',
    tab_deposit: 'Deposit (Add Money)',
    tab_withdraw: 'Withdraw (Cash Out)',
    tab_history: 'Transaction History',
    amount: 'Amount',
    sender_phone: 'Sender Phone / Wallet',
    receiver_phone: 'Recipient Phone / Account',
    trx_id: 'Transaction ID (TrxID)',
    enter_amount: 'Enter amount',
    enter_trx_id: 'Paste TrxID here',
    submit_deposit: 'Submit Deposit Request',
    submit_withdraw: 'Submit Withdrawal Request',
    copy_number: 'Copy Number',
    copied: 'Copied!',
    deposit_instruction: 'Send Money to the official number, then submit your TrxID below.',
    status_pending: 'Pending Verification',
    status_approved: 'Approved',
    status_rejected: 'Rejected',
    no_transactions: 'No transactions found',

    // Tournaments & Arena
    tournaments_title: 'Active Tournaments',
    create_tournament: 'Create Tournament',
    entry_fee: 'Entry Fee',
    prize_pool: 'Prize Pool',
    total_slots: 'Total Slots',
    filled_slots: 'Filled Slots',
    ovr_limit: 'Max OVR',
    format: 'Format',
    knockout: 'Knockout',
    league: 'League',
    free_entry: 'Free Entry',
    join_now: 'Join Tournament',
    registered: 'Registered',
    view_details: 'View Details',
    match_fixtures: 'Match Schedule',
    brackets: 'Tournament Brackets',

    // 1v1 Battle
    battles_title: '1v1 Head-to-Head Battles',
    create_challenge: 'Create Challenge',
    accept_challenge: 'Accept Battle',
    pot_amount: 'Pot Amount (Points)',
    room_code: 'In-Game Room Code',
    report_score: 'Submit Match Score',

    // Push Notifications & Alerts
    notification_center: 'Notification Center',
    enable_push: 'Enable Push Notifications',
    push_active: 'Push Notifications Active',
    test_push: 'Send Test Notification',
    no_notifications: 'No new notifications',
    mark_all_read: 'Mark all as read',

    // Security & Anti-Cheat
    security_alert: 'Security Alert: Account Suspended',
    security_message: 'Our 2-second anti-cheat integrity scanner detected unauthorized balance/token discrepancy. All account transactions are suspended pending Admin verification.',
    waiting_admin: 'Waiting for Admin Review & Verification',
    sign_out_button: 'Sign Out',
    btn_continue: 'Continue (Verify & Unfreeze)',
    btn_block: 'Block (Permanent Ban)',

    // Common
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    success: 'Success!',
    error: 'An error occurred, please try again',
    loading: 'Loading...'
  }
};

export type TranslationKey = keyof typeof translations.en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language] = useState<Language>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fc_arena_lang');
    }
  }, []);

  const t = (key: TranslationKey, fallback?: string): string => {
    return translations.en[key] || fallback || key;
  };

  return (
    <I18nContext.Provider value={{ 
      language, 
      setLanguage: () => {}, 
      toggleLanguage: () => {}, 
      t 
    }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      language: 'en' as Language,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: TranslationKey, fallback?: string) => translations.en[key] || fallback || key
    };
  }
  return context;
}
