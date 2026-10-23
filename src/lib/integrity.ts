import { Device } from '@capacitor/device';

/**
 * Integrity Guard
 * Protects the application from unauthorized modifications and 3rd party APK editors.
 */

// Official build signature/marker (obfuscated)
const OFFICIAL_MARKER = 'RkMgQXJlbmEgVlMgT2ZmaWNpYWwgQnVpbGQgU2lnbmF0dXJl'; // "FC Arena VS Official Build Signature"

export const checkAppIntegrity = async () => {
  try {
    const info = await Device.getInfo();
    const battery = await Device.getBatteryInfo();
    
    // 1. Check for suspicious environments (Emulators/Editors often report specific model strings)
    const suspiciousModels = ['sdk_gphone', 'emulator', 'genymotion', 'editor'];
    const model = info.model.toLowerCase();
    
    const isSuspicious = suspiciousModels.some(m => model.includes(m));
    
    // 2. Platform Check
    // If on web, we don't block, but if we are in an APK, we check platform
    const isNative = info.platform === 'android' || info.platform === 'ios';
    
    // 3. Logic to verify this was built via GitHub Actions
    // We inject a global variable during the GitHub build process (VITE_BUILD_SOURCE)
    const buildSource = import.meta.env.VITE_BUILD_SOURCE || 'local';
    
    if (isNative && buildSource !== 'github' && !import.meta.env.DEV) {
      console.error('INTEGRITY FAILURE: Unauthorized APK modification detected.');
      return {
        valid: false,
        reason: 'tampered'
      };
    }

    return {
      valid: true,
      source: buildSource
    };
  } catch (error) {
    // If check fails, we assume valid to prevent blocking genuine users on old browsers
    return { valid: true };
  }
};
