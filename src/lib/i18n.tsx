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
    notifications: 'Notifications',
    back: 'Back',
    settings: 'Settings',
    logout: 'Logout',
    install_app: 'Install App',
    connected_match_engine: 'Connecting to Match Engine',
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
