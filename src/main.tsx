import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { I18nProvider } from '@/src/lib/i18n';
import { setupBackgroundPushWorker } from '@/src/lib/fcm';

// Setup background Push & FCM Service Worker
setupBackgroundPushWorker().catch(() => {});

// Register Service Worker for PWA background notification support
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New content available, please refresh the app.');
    // updateSW(true); // Disable automatic reload loop
  },
  onOfflineReady() {
    console.log('FC Arena VS is ready for offline and background notifications');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

