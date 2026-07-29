import { useEffect, useState } from 'react';
import { initializeBiometric, isBiometricReady, requestBiometricPermission } from '@/lib/biometric';

/**
 * BiometricInitializer Component
 * Initializes the biometric system when app starts
 * Logs warnings if biometric system is not ready
 */
export function BiometricInitializer() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initBiometric = async () => {
      try {
        const win: any = window;
        
        
        // ✅ CRITICAL: Check if running in native environment
        if (!win.Capacitor) {
          console.error('❌❌❌ CRITICAL: APP IS NOT RUNNING NATIVELY ❌❌❌');
          console.error('[APP INIT] Capacitor not detected - this means:');
          console.error('   - You are running in WEB/BROWSER mode');
          console.error('   - Biometric will NOT work');
          console.error('   - You must open the APK file on your Android phone');
          console.error('[APP INIT] SOLUTION:');
          console.error('   1. Uninstall any web version');
          console.error('   2. Install the APK on your phone: PINIT-Vault-debug.apk');
          console.error('   3. Open the app from your phone home screen');
          setIsInitialized(true);
          return;
        }
        
        
        // ✅ CRITICAL: Request biometric permission from user
        const permissionGranted = await requestBiometricPermission();
        
        if (permissionGranted) {
        } else {
        }
        
        // Now initialize biometric
        const result = await initializeBiometric();
        
        if (result.success) {
        } else {
          console.error('❌ Biometric initialization failed:', result.error);
          console.error('[APP INIT] Fingerprint authentication will NOT work');
          console.error('[APP INIT] Check your phone settings:');
          console.error('   1. Settings → Security → Fingerprint');
          console.error('   2. Enroll at least one fingerprint');
          console.error('   3. Restart the app');
        }
        
        setIsInitialized(true);
      } catch (err: any) {
        console.error('❌ Error during initialization:', err);
        setIsInitialized(true);
      }
    };
    
    initBiometric();
  }, []);

  // This component doesn't render anything, just initializes
  return null;
}
