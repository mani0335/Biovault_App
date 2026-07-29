// Simulated Encryption Utilities

/**
 * Simulate file encryption
 * In production, use actual crypto libraries like TweetNaCl.js or libsodium.js
 */
export function encryptFile(
  fileData: string,
  encryptionKey?: string
): { encrypted: string; key: string } {
  // Generate a simple encryption key
  const key = encryptionKey || generateEncryptionKey();

  // Simulate encryption by base64 encoding + xor
  const encrypted = simulateEncryption(fileData, key);

  return {
    encrypted,
    key,
  };
}

/**
 * Simulate file decryption
 */
export function decryptFile(encrypted: string, key: string): string {
  try {
    const decrypted = simulateDecryption(encrypted, key);
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    throw new Error("Failed to decrypt file");
  }
}

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  const key = Math.random().toString(36).substring(2, 15);
  return key + Math.random().toString(36).substring(2, 15);
}

/**
 * Simulate encryption with simple XOR
 * (NOT SECURE - for demonstration only)
 */
function simulateEncryption(data: string, key: string): string {
  // Encode as base64
  const encoded = btoa(data);

  // Simple XOR with key
  let result = "";
  for (let i = 0; i < encoded.length; i++) {
    const charCode = encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }

  // Encode as base64 again
  return btoa(result);
}

/**
 * Simulate decryption
 */
function simulateDecryption(encrypted: string, key: string): string {
  try {
    // Decode from base64
    const decoded = atob(encrypted);

    // Simple XOR with key
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }

    // Decode from base64
    return atob(result);
  } catch (err) {
    throw new Error("Decryption failed");
  }
}

/**
 * Calculate file checksum (simple hash)
 */
export function calculateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}
