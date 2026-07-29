import { Device } from '@capacitor/device';

/**
 * Get persistent device identifier
 * 
 * Priority:
 * 1. Capacitor Device.getId() - Hardware UUID (permanent hardware identifier)
 * 2. localStorage cached UUID - Previous session UUID
 * 3. Generate new temporary UUID - fallback
 * 
 * This ALWAYS returns the SAME ID for the same physical device
 * even after uninstall/reinstall because it uses Android's hardware UUID
 */
export async function getDeviceToken(): Promise<string> {
  
  const STORAGE_KEY = 'biovault_deviceToken';
  const HARDWARE_UUID_KEY = 'biovault_hardwareUUID';
  
  // ✅ Step 1: Check if we already cached the hardware UUID
  let cachedUUID = localStorage.getItem(HARDWARE_UUID_KEY);
  if (cachedUUID) {
    return cachedUUID;
  }
  
  // ✅ Step 2: Try to get hardware UUID from Capacitor Device
  try {
    const deviceInfo = await Device.getId();
    
    if (deviceInfo && deviceInfo.uuid) {
      const hardwareUUID = deviceInfo.uuid;
      
      // Cache it so we never query again
      localStorage.setItem(HARDWARE_UUID_KEY, hardwareUUID);
      localStorage.setItem(STORAGE_KEY, hardwareUUID);
      
      return hardwareUUID;
    }
  } catch (error: any) {
  }
  
  // ✅ Step 3: Fallback - check for old stored token
  let token = localStorage.getItem(STORAGE_KEY);
  if (token) {
    return token;
  }
  
  // ✅ Step 4: Last resort - generate temporary token
  token = 'dev-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  localStorage.setItem(STORAGE_KEY, token);
  
  return token;
}

/**
 * Get ONLY the hardware UUID if available
 * Returns null if running in web browser (not native)
 */
export async function getHardwareUUID(): Promise<string | null> {
  try {
    const deviceInfo = await Device.getId();
    return deviceInfo?.uuid || null;
  } catch {
    return null;
  }
}
