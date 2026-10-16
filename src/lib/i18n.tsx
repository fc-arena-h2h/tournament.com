import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'bn' | 'en';

export const translations = {
  bn: {
    // Navigation & Shell
    nav_dashboard: 'ড্যাশবোর্ড',
    nav_arena: 'এরিনা',
    nav_field: 'ম্যাচ ফিল্ড',
    nav_elite: 'এলিট লিগ',
    nav_me: 'প্রোফাইল',
    app_title: 'এফসি এরিনা ভিএস',
    menu: 'মেনু',
    wallet: 'ওয়ালেট',
    notifications: 'নোটিফিকেশন',
    back: 'ফিরে যান',
    settings: 'সেটিংস',
    logout: 'লগআউট',
    install_app: 'অ্যাপ ইনস্টল করুন',
    connected_match_engine: 'ম্যাচ ইঞ্জিনে কানেক্ট হচ্ছে',
    language: 'ভাষা',
    language_toggle: 'English',
    language_current: 'বাংলা',

    // Wallet & Cashier
    wallet_title: 'ক্যাশিয়ার ও ডিজিটাল ওয়ালেট',
    wallet_balance: 'বর্তমান ব্যালেন্স',
    tab_deposit: 'টাকা জমা (Deposit)',
    tab_withdraw: 'টাকা উত্তোলন (Withdraw)',
    tab_history: 'লেনদেনের ইতিহাস',
    amount: 'টাকার পরিমাণ',
    sender_phone: 'যে নম্বর থেকে পাঠিয়েছেন',
    receiver_phone: 'যে নম্বরে টাকা নেবেন',
    trx_id: 'ট্রানজ্যাকশন আইডি (TrxID)',
    enter_amount: 'টাকার পরিমাণ লিখুন',
    enter_trx_id: 'TrxID এখানে পেস্ট করুন',
    submit_deposit: 'ডিপোজিট রিকোয়েস্ট পাঠান',
    submit_withdraw: 'উইথড্র রিকোয়েস্ট পাঠান',
    copy_number: 'নম্বর কপি করুন',
    copied: 'কপি হয়েছে!',
    deposit_instruction: 'অফিসিয়াল নম্বরে Send Money করার পর TrxID সাবমিট করুন।',
    status_pending: 'পেন্ডিং (যাচাই চলছে)',
    status_approved: 'অনুমোদিত',
    status_rejected: 'বাতিল',
    no_transactions: 'এখনো কোনো লেনদেন হয়নি',

    // Tournaments & Arena
    tournaments_title: 'চলমান টুর্নামেন্ট',
    create_tournament: 'নতুন টুর্নামেন্ট তৈরি',
    entry_fee: 'এন্ট্রি ফি',
    prize_pool: 'প্রাইজ পুল',
    total_slots: 'মোট স্লট',
    filled_slots: 'পূরণ হওয়া স্লট',
    ovr_limit: 'সর্বোচ্চ OVR',
    format: 'ফরম্যাট',
    knockout: 'নকআউট',
    league: 'লিগ',
    free_entry: 'ফ্রি এন্ট্রি',
    join_now: 'টুর্নামেন্টে যোগ দিন',
    registered: 'রেজিস্ট্রেশন সম্পন্ন',
    view_details: 'বিস্তারিত দেখুন',
    match_fixtures: 'খেলার সময়সূচি',
    brackets: 'টুর্নামেন্ট ব্র্যাকেট',

    // 1v1 Battle
    battles_title: '১v১ হেড-টু-হেড চ্যালেঞ্জ',
    create_challenge: 'চ্যালেঞ্জ ছুড়ে দিন',
    accept_challenge: 'চ্যালেঞ্জ গ্রহণ করুন',
    pot_amount: 'বাজির পয়েন্ট/কয়েন',
    room_code: 'ইন-গেম ফ্রেন্ড ম্যাচ রুম কোড',
    report_score: 'ফলাফল সাবমিট করুন',

    // Push Notifications & Alerts
    notification_center: 'নোটিফিকেশন সেন্টার',
    enable_push: 'পুশ নোটিফিকেশন চালু করুন',
    push_active: 'পুশ নোটিফিকেশন সক্রিয় রয়েছে',
    test_push: 'টেস্ট নোটিফিকেশন পাঠান',
    no_notifications: 'কোনো নতুন নোটিফিকেশন নেই',
    mark_all_read: 'সব পঠিত হিসেবে চিহ্নিত করুন',

    // Security & Anti-Cheat
    security_alert: 'নিরাপত্তা সতর্কতা: অ্যাকাউন্ট স্থগিত',
    security_message: 'আমাদের ২-সেকেন্ডের অ্যান্টি-চিট সিকিউরিটি স্ক্যানার অননুমোদিত ব্যালেন্স/টোকেন গরমিল শনাক্ত করেছে। আপনার সকল লেনদেন সাময়িকভাবে স্থগিত রাখা হয়েছে।',
    waiting_admin: 'অ্যাডমিনের পর্যালোচনার অপেক্ষায় রয়েছে',
    sign_out_button: 'সাইন আউট করুন',
    btn_continue: 'সচল করুন (Continue)',
    btn_block: 'স্থায়ীভাবে ব্লক (Block)',

    // Common
    save: 'সংরক্ষণ করুন',
    cancel: 'বাতিল',
    confirm: 'নিশ্চিত করুন',
    success: 'সফল হয়েছে!',
    error: 'সমস্যা হয়েছে, আবার চেষ্টা করুন',
    loading: 'লোড হচ্ছে...'
  },
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
    language_toggle: 'বাংলা',
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

export type TranslationKey = keyof typeof translations.bn;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fc_arena_lang');
      if (saved === 'en' || saved === 'bn') return saved;
    }
    return 'bn'; // Default to Bengali as requested
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fc_arena_lang', lang);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'bn' ? 'en' : 'bn');
  };

  const t = (key: TranslationKey, fallback?: string): string => {
    const langDict = translations[language] || translations.bn;
    return langDict[key] || fallback || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    // Graceful fallback outside provider
    return {
      language: 'bn' as Language,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: TranslationKey, fallback?: string) => translations.bn[key] || fallback || key
    };
  }
  return context;
}
