/**
 * Device fingerprinting utility to generate a unique Hardware/Device Identifier (HWID).
 * Used for preventing duplicate bonus abuse on the same device.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown-device';

  const STORAGE_KEY = 'fc_arena_hwid_v1';
  try {
    let existingId = localStorage.getItem(STORAGE_KEY);
    if (existingId) return existingId;

    // Generate unique hardware/device composite
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const userAgent = navigator.userAgent;
    const language = navigator.language;
    const hardwareConcurrency = (navigator as any).hardwareConcurrency || 4;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    
    // Hash-like pseudo signature
    const raw = `${screenInfo}-${language}-${hardwareConcurrency}-${timeZone}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const safeHash = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
    const deviceId = `DEV-${safeHash}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    localStorage.setItem(STORAGE_KEY, deviceId);
    return deviceId;
  } catch (e) {
    return `DEV-GEN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}
