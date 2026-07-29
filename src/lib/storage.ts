import { Preferences } from '@capacitor/preferences';

/**
 * Cross-platform storage using BOTH Capacitor Preferences (mobile) AND localStorage (web + backup)
 * This ensures data is always available synchronously and persisted properly
 */

export const appStorage = {
  /**
   * Set a value in persistent storage
   * Saves to BOTH Capacitor Preferences (async) AND localStorage (sync) for maximum reliability
   */
  async setItem(key: string, value: string): Promise<void> {
    let success = false;
    
    // ALWAYS save to localStorage first (synchronous, immediate)
    try {
      localStorage.setItem(key, value);
      success = true;
    } catch (localErr) {
    }

    // ALSO try Capacitor Preferences (async, for Android native persistence)
    try {
      await Preferences.set({ key, value });
      success = true;
    } catch (capErr) {
    }

    if (!success) {
      throw new Error(`Failed to save ${key} to any storage backend`);
    }
  },

  /**
   * Get a value from persistent storage
   * Tries Capacitor Preferences FIRST (permanent Android storage), then falls back to localStorage
   */
  async getItem(key: string): Promise<string | null> {
    // Try Capacitor Preferences FIRST (permanent storage on Android)
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        // Also sync to localStorage for fast access
        localStorage.setItem(key, value);
        return value;
      }
    } catch (capErr) {
    }

    // Fallback to localStorage if not in Capacitor (web environment)
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        return value;
      }
    } catch (localErr) {
    }

    return null;
  },

  /**
   * Remove a value from persistent storage
   */
  async removeItem(key: string): Promise<void> {
    // Remove from localStorage
    try {
      localStorage.removeItem(key);
    } catch (fallbackErr) {
    }

    // Remove from Capacitor Preferences
    try {
      await Preferences.remove({ key });
    } catch (e) {
    }
  },

  /**
   * Clear all app storage
   */
  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (fallbackErr) {
    }

    try {
      await Preferences.clear();
    } catch (e) {
    }
  },
};
