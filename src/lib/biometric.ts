// Comprehensive biometric diagnostic system
export async function isBiometricAvailable(): Promise<{ available: boolean; reason?: string; sensorType?: string }> {
  try {
    // Silent sensor check - no popup messages
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor) {
      console.error(' NOT A NATIVE APP - Capacitor not detected');
      return { available: false, reason: 'App is not running in native environment. Install APK on phone.' };
    }
    
    // Silent native app check
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    
    if (!NativeBiometric) {
      console.error('Biometric plugin NOT loaded');
      return { available: false, reason: 'Biometric plugin not installed' };
    }
    
    // Silent availability check
    try {
      const result = await NativeBiometric.isAvailable();
      
      if (result.isAvailable) {
        return { 
          available: true, 
          sensorType: String(result.biometryType) || 'fingerprint' 
        };
      } else {
        return { 
          available: false, 
          reason: 'Device has biometric sensor but no fingerprints enrolled. Please go to Settings -> Security -> Fingerprint and add your fingerprint.' 
        };
      }
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      return { 
        available: false, 
        reason: `Biometric check failed: ${error?.message || 'Unknown error'}. Please ensure your device has fingerprint security enabled.` 
      };
    }
  } catch (error: any) {
    console.error(' Critical error in biometric check:', error);
    console.error('   Message:', error?.message);
    console.error('   Stack:', error?.stack);
    return { 
      available: false, 
      reason: `System error: ${error?.message || 'Unknown error'}` 
    };
  }
}

// Show biometric prompt for authentication (Using Capacitor @capgo/capacitor-native-biometric)
// CRITICAL: This function MUST BLOCK until user actually scans fingerprint
export async function showBiometricPrompt(options?: {
  reason?: string;
  title?: string;
  subtitle?: string;
  description?: string;
}): Promise<void> {
  
  try {
    // STEP 1: Quick availability check
    const availability = await isBiometricAvailable();
    
    if (!availability.available) {
      throw new Error(availability.reason || 'Biometric not available');
    }
    
    
    // STEP 2: Load plugin and use simplest method
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    
    if (!NativeBiometric) {
      throw new Error('Biometric plugin not available');
    }
    
    // STEP 3: Use the most basic authentication options
    
    const basicOptions = {
      reason: options?.reason || 'Authenticate to continue',
      title: options?.title || 'BioVault',
      subtitle: options?.subtitle || 'Verify your fingerprint',
      description: options?.description || 'Place your finger on the sensor',
      // Remove all problematic options
    };
    
    
    // SIMPLIFIED: Try only the most reliable method
    try {
      
      // Use the simplest possible call
      const result = await NativeBiometric.verifyIdentity(basicOptions);
      
      
      // Very simple success check - if we get here without error, it worked
      return;
      
    } catch (error: any) {
      console.error('   Authentication failed:', error.message);
      
      // If basic method fails, try with minimal options
      try {
        const minimalResult = await NativeBiometric.verifyIdentity({
          reason: 'Verify your fingerprint'
        });
        return;
      } catch (minimalError: any) {
        console.error('   Minimal authentication also failed:', minimalError.message);
        
        // FINAL ATTEMPT: Try authenticate method as fallback
        if (typeof NativeBiometric.authenticate === 'function') {
          try {
            const authResult = await NativeBiometric.authenticate({
              reason: 'Verify your fingerprint'
            });
            return;
          } catch (authError: any) {
            console.error('   Authenticate method failed:', authError.message);
          }
        }
        
        // All methods failed - provide user-friendly error
        const errorMsg = error.message || minimalError.message || 'Biometric authentication failed';
        
        if (errorMsg.includes('canceled') || errorMsg.includes('cancel')) {
          throw new Error('Authentication was cancelled');
        } else if (errorMsg.includes('not available') || errorMsg.includes('not enrolled')) {
          throw new Error('Please add your fingerprint to device settings first');
        } else if (errorMsg.includes('not implemented')) {
          throw new Error('Biometric authentication not supported on this device');
        } else {
          throw new Error('Fingerprint authentication failed. Please try again.');
        }
      }
    }
    
  } catch (error: any) {
    console.error('Biometric authentication error:', error.message);
    throw error;
  }
}

// ✅ Initialize biometric system (Capacitor Biometric)
export async function initializeBiometric(): Promise<{ success: boolean; error?: string }> {
  try {
    const win: any = window;
    
    // Stage 1: Check if we're on a native platform
    
    // Stage 2: Check if Capacitor is available
    if (!win.Capacitor) {
      console.error('❌ Capacitor framework not available');
      return { 
        success: false, 
        error: 'Capacitor framework not available. App may not be running in native environment.' 
      };
    }
    
    
    // Stage 3: Load Capacitor Biometric plugin
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      
      if (!NativeBiometric) {
        throw new Error('Biometric plugin not available');
      }
      
      
      // Stage 4: Check if biometric is available
      const result = await NativeBiometric.isAvailable();
      
      if (result.isAvailable) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'Biometric hardware not available on this device' 
        };
      }
    } catch (pluginErr: any) {
      console.error('❌ Error loading Capacitor Biometric plugin:', pluginErr);
      return { 
        success: false, 
        error: `Plugin error: ${pluginErr.message || String(pluginErr)}` 
      };
    }
  } catch (error: any) {
    console.error('❌ Unexpected error during initialization:', error);
    return { 
      success: false, 
      error: String(error.message || error) 
    };
  }
}

// ✅ Check if biometric is ready to use
export async function isBiometricReady(): Promise<boolean> {
  const result = await initializeBiometric();
  return result.success;
}

// ✅ Request biometric permission (Using Capacitor Permissions)
export async function requestBiometricPermission(): Promise<boolean> {
  try {
    const win: any = window;
    
    
    if (!win.Capacitor) {
      return true;
    }
    
    // Request permissions via NativeBiometric plugin (correct Capacitor approach)
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      return available.isAvailable;
    } catch (permErr: any) {
      // Android handles permissions via manifest — return true to let the OS prompt
      return true;
    }
  } catch (error: any) {
    console.error('❌ [PERMISSIONS] Error requesting biometric permission:', error);
    return false;
  }
}
