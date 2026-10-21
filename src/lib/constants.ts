export const APP_VERSION = '2.4.3';
export const APP_ID = 'fc-arena-vs-2025';
// NOTE: When changing APP_VERSION or APP_ID, ensure you also update the 
// 'settings/app_update' document in Firestore (min_version, app_id) to match.
export const DEFAULT_UPDATE_URL = 'https://t.me/fcarenavsofficial';
export const API_BASE_URL = (() => {
  if (typeof window === 'undefined') return '';
  
  // If running in a browser/PWA on the actual domain
  if (window.location.hostname.includes('asia-southeast1.run.app')) {
    return '';
  }
  
  // For native apps or local dev, we need the full URL of the backend
  // We prioritize the stable Shared/Pre-production URL
  const sharedUrl = 'https://ais-pre-xh5yosbcwnt2hs6yzdzls6-483012074842.asia-southeast1.run.app';
  return sharedUrl;
})();
