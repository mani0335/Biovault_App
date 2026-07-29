import { appStorage } from "./storage";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";

interface VaultDocument {
  id: string;
  name: string;
  encryptedData: string;
  encryptedImage?: string;          // Store encrypted version with embedded metadata for preview
  cloudinaryUrl?: string;
  pageCount?: number;              // Number of pages for documents
  metadata: {
    timestamp: number;
    original_name: string;
    size: number;
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
  };
  createdAt: string;
}

const BACKEND_URL = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";

/**
 * Count PDF pages by scanning the binary for /Type /Page markers.
 * Works entirely in-browser with no extra libraries.
 * Falls back to 1 if parsing fails.
 */
export async function calculatePageCount(file: File): Promise<number> {
  if (file.type !== 'application/pdf') return 1;

  try {
    const buffer = await file.arrayBuffer();
    // Decode bytes as Latin-1 so every byte maps 1-to-1 (safe for binary PDF)
    const text = new TextDecoder('latin1').decode(buffer);

    // First try the /N entry in the document catalog (fastest, most reliable)
    // Pattern: /N followed by whitespace and a number
    const catalogMatch = text.match(/\/N\s+(\d+)/);
    if (catalogMatch) {
      const n = parseInt(catalogMatch[1], 10);
      if (n > 0 && n <= 9999) {
        return n;
      }
    }

    // Fallback: count /Type /Page entries (not /Pages which appears once per tree node)
    // Use a regex that avoids matching /Pages (the parent node type)
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    return 1;
  } catch (err) {
    return 1;
  }
}

/**
 * Count PDF pages from a base64 data URL (used when File is not available,
 * e.g. when viewing an existing vault document).
 */
export function countPdfPagesFromDataUrl(dataUrl: string): number {
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return 1;
    // Decode base64 to binary string
    const binary = atob(base64);

    // Try /N entry first
    const catalogMatch = binary.match(/\/N\s+(\d+)/);
    if (catalogMatch) {
      const n = parseInt(catalogMatch[1], 10);
      if (n > 0 && n <= 9999) return n;
    }

    // Fallback: count /Type /Page (not /Pages)
    const pageMatches = binary.match(/\/Type\s*\/Page[^s]/g);
    return pageMatches ? pageMatches.length : 1;
  } catch {
    return 1;
  }
}

/**
 * Get user-specific vault storage key
 */
const getVaultStorageKey = (userId: string): string => `pinit_vault_documents_${userId}`;

/**
 * Load vault documents from backend API (user-specific)
 * Falls back to localStorage if backend fails
 */
export async function loadVaultDocuments(userId: string): Promise<VaultDocument[]> {
  if (!userId) {
    return [];
  }

  try {
    // Try loading from backend first
    const token = localStorage.getItem("biovault_token");
    const response = await fetch(`${BACKEND_URL}/vault/get-user-vault`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: userId })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.documents && Array.isArray(data.documents)) {
        // Convert backend format to VaultDocument format.
        // image_base64 holds the persistent-DNA-embedded image (what was sent as
        // encryptedImage on save) — map it back to encryptedImage so scanning
        // continues to find the embedded ownership DNA after a backend reload.
        const documents = data.documents.map((doc: any) => ({
          id: doc.asset_id || doc.id,
          name: doc.file_name,
          encryptedData: doc.image_base64,
          encryptedImage: doc.image_base64,
          cloudinaryUrl: doc.image_url || doc.thumbnail_url,
          metadata: {
            timestamp: new Date(doc.capture_timestamp).getTime(),
            original_name: doc.file_name,
            size: doc.file_size,
            checksum: doc.file_hash,
            encrypted: true,
            ownerId: doc.user_id
          },
          createdAt: doc.capture_timestamp
        }));
        return await validateDocumentsForUser(userId, documents);
      }
    }
  } catch (e) {
  }

  // Fallback to localStorage
  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);

  try {
    // Try appStorage first (Capacitor)
    const stored = await appStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      const documents = JSON.parse(stored) as VaultDocument[];
      return await validateDocumentsForUser(userId, documents);
    }
  } catch (e) {
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) {
      const documents = JSON.parse(stored) as VaultDocument[];
      return await validateDocumentsForUser(userId, documents);
    }
  } catch (e) {
    console.error("Failed to load vault documents:", e);
  }

  return [];
}

/**
 * Save vault documents to backend API and local storage (user-specific)
 */
export async function saveVaultDocuments(
  userId: string,
  documents: VaultDocument[]
): Promise<void> {
  if (!userId) {
    console.error("❌ No userId provided, cannot save vault");
    return;
  }

  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);
  const data = JSON.stringify(documents);

  // Save to backend API first
  try {
    const token = localStorage.getItem("biovault_token");
    if (token) {
      // Save each document to backend vault_images table
      for (const doc of documents) {
        try {
          const response = await fetch(`${BACKEND_URL}/vault/save`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              user_id: userId,
              asset_id: doc.id,
              file_name: doc.name,
              // image_base64 must carry the persistent-DNA-embedded image (encryptedImage),
              // not the raw pre-watermark encryptedData — otherwise the backend round-trip
              // silently strips the embedded ownership DNA from every saved document.
              image_base64: doc.encryptedImage || doc.encryptedData,
              metadata: {
                ...doc.metadata,
                original_name: doc.name,
                size: doc.metadata.size,
                checksum: doc.metadata.checksum,
                encrypted: doc.metadata.encrypted,
                created_at: doc.createdAt
              }
            })
          });

          if (response.ok) {
          } else {
          }
        } catch (error) {
        }
      }
    }
  } catch (error) {
  }

  // Also save to localStorage as fallback
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, data);
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }

  // Save to appStorage (Capacitor)
  try {
    await appStorage.setItem(VAULT_STORAGE_KEY, data);
  } catch (e) {
    console.error("Failed to save to appStorage:", e);
  }
}

/**
 * Clear vault data for a specific user (called on logout)
 */
export async function clearVaultForUser(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);

  // Clear from localStorage
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear vault from localStorage:", e);
  }

  // Clear from appStorage (Capacitor)
  try {
    await appStorage.removeItem(VAULT_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear vault from appStorage:", e);
  }
}

/**
 * Upload encrypted image to Cloudinary via backend
 */
export async function uploadImageToCloudinary(
  base64Data: string,
  fileName: string,
  userId: string,
  fileSize: number,
  checksum: string
): Promise<{ success: boolean; cloudinaryUrl?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/vault/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        asset_id: `${userId}_${Date.now()}`,
        file_name: fileName,
        file_size: fileSize,
        image_base64: base64Data,
        thumbnail_base64: base64Data, // Same as image for encrypted data
        file_hash: checksum,
        visual_fingerprint: checksum,
        blockchain_anchor: checksum,
        resolution: "encrypted",
        owner_name: userId,
        owner_email: userId,
        certificate_id: "pinit_vault",
        capture_timestamp: new Date().toISOString(),
      }),
    });

    const result = await response.json();

    if (response.ok && result.image_url) {
      return {
        success: true,
        cloudinaryUrl: result.image_url,
      };
    } else {
      // Even if Cloudinary fails, we can still store locally
      return {
        success: false,
        error: result.detail || "Cloudinary upload failed",
      };
    }
  } catch (error) {
    console.error("❌ Upload error:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Add document to vault (local storage) - user-specific
 */
export async function addDocumentToVault(userId: string, document: VaultDocument): Promise<void> {
  const documents = await loadVaultDocuments(userId);
  documents.unshift(document); // Add to beginning
  await saveVaultDocuments(userId, documents);
}

/**
 * Remove document from vault - user-specific
 */
export async function deleteDocumentFromVault(userId: string, docId: string): Promise<void> {
  let documents = await loadVaultDocuments(userId);
  documents = documents.filter((doc) => doc.id !== docId);
  await saveVaultDocuments(userId, documents);
}

/**
 * Get all vault documents - user-specific
 */
export async function getVaultDocuments(userId: string): Promise<VaultDocument[]> {
  return await loadVaultDocuments(userId);
}

/**
 * Validate that documents belong to the current user
 * Returns only documents with matching ownerId
 */
export async function validateDocumentsForUser(
  userId: string,
  documents: VaultDocument[]
): Promise<VaultDocument[]> {
  if (!userId) {
    return [];
  }

  const validated = documents.filter((doc) => {
    const docOwnerId = doc.metadata?.ownerId;
    if (docOwnerId && docOwnerId !== userId) {
      return false;
    }
    return true;
  });

  if (validated.length < documents.length) {
  }

  return validated;
}

/**
 * Get vault metadata for the user (includes storage status and stats)
 */
export async function getVaultMetadata(
  userId: string
): Promise<{
  userVaultSize: number;
  documentCount: number;
  lastSyncTime: number;
  storageType: "appStorage" | "localStorage" | "both" | "none";
  ownerId: string;
}> {
  if (!userId) {
    return {
      userVaultSize: 0,
      documentCount: 0,
      lastSyncTime: 0,
      storageType: "none",
      ownerId: userId,
    };
  }

  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);
  let storageType: "appStorage" | "localStorage" | "both" | "none" = "none";
  let vaultData = "";

  // Check appStorage
  try {
    const appStorageData = await appStorage.getItem(VAULT_STORAGE_KEY);
    if (appStorageData) {
      storageType = "appStorage";
      vaultData = appStorageData;
    }
  } catch (e) {
  }

  // Check localStorage
  try {
    const localStorageData = localStorage.getItem(VAULT_STORAGE_KEY);
    if (localStorageData) {
      if (storageType === "appStorage") {
        storageType = "both";
      } else {
        storageType = "localStorage";
      }
      if (!vaultData) vaultData = localStorageData;
    }
  } catch (e) {
  }

  let userVaultSize = 0;
  let documentCount = 0;

  if (vaultData) {
    try {
      const documents = JSON.parse(vaultData) as VaultDocument[];
      documentCount = documents.length;
      userVaultSize = new Blob([vaultData]).size;
    } catch (e) {
      console.error("Failed to parse vault data for metadata:", e);
    }
  }

  return {
    userVaultSize,
    documentCount,
    lastSyncTime: Date.now(),
    storageType,
    ownerId: userId,
  };
}

/**
 * Save encrypted image to device gallery in "PINIT Vault" folder
 * Works on Android, iOS, and web
 */
export async function saveImageToGallery(
  base64Data: string,
  fileName: string,
  _userId: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {

    // Strip data URI prefix to get raw base64
    const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;

    // Pick a safe unique filename
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "jpg";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || `PINIT_${Date.now()}.${fileExt}`;

    // Write to cache (always writable, no special permissions needed)
    const written = await Filesystem.writeFile({
      path: safeName,
      data: cleanBase64,
      directory: Directory.Cache,
      recursive: true,
    });


    // Open Android share sheet → user can tap "Save to Files", "Downloads", "Google Drive", etc.
    await Share.share({
      title: safeName,
      url: written.uri,
      dialogTitle: `Save "${safeName}" to your device`,
    });

    return { success: true, path: written.uri };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // User dismissed the share sheet — not a real error
    if (msg.includes("cancel") || msg.includes("Cancel") || msg.includes("dismissed")) {
      return { success: true, path: "share cancelled" };
    }
    console.error("❌ saveImageToGallery error:", err);
    return { success: false, error: msg };
  }
}

/**
 * Sync vault metadata to prevent image loading failures
 * Ensures document references are valid
 */
export async function syncVaultMetadata(userId: string): Promise<void> {
  if (!userId) return;

  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);

  try {
    // Load current vault
    const stored = await appStorage.getItem(VAULT_STORAGE_KEY);
    if (!stored) return;

    const documents = JSON.parse(stored) as VaultDocument[];

    // Validate each document has required fields
    const validatedDocs = documents.map((doc) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        ownerId: doc.metadata.ownerId || userId, // Ensure ownerId is set
      },
    }));

    // Re-save synced documents
    await appStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(validatedDocs));
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(validatedDocs));

  } catch (e) {
    console.error("Failed to sync vault metadata:", e);
  }
}

/**
 * Sync vault data between appStorage and localStorage
 * Ensures both stores have the same data
 */
export async function syncVaultData(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const VAULT_STORAGE_KEY = getVaultStorageKey(userId);

  try {
    // Load from primary source (appStorage preferred)
    let primaryData: string | null = null;
    let fromAppStorage = false;

    try {
      primaryData = await appStorage.getItem(VAULT_STORAGE_KEY);
      if (primaryData) fromAppStorage = true;
    } catch (e) {
    }

    if (!primaryData) {
      try {
        primaryData = localStorage.getItem(VAULT_STORAGE_KEY);
      } catch (e) {
        console.error("Failed to sync: no data found in either storage");
        return false;
      }
    }

    if (!primaryData) {
      return true;
    }

    // Validate JSON
    JSON.parse(primaryData);

    // Write to both stores
    if (!fromAppStorage) {
      try {
        await appStorage.setItem(VAULT_STORAGE_KEY, primaryData);
      } catch (e) {
        console.error("Failed to sync to appStorage:", e);
      }
    }

    try {
      localStorage.setItem(VAULT_STORAGE_KEY, primaryData);
      if (fromAppStorage) {
      }
    } catch (e) {
      console.error("Failed to sync to localStorage:", e);
    }

    return true;
  } catch (e) {
    console.error("Vault sync error:", e);
    return false;
  }
}
