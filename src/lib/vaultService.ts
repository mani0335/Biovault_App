/**
 * vaultService.ts
 *
 * Persistent vault storage — layered strategy (most-to-least reliable):
 *
 *   1. Capacitor Filesystem  Directory.Data
 *      • Maps to  data/data/com.biovault.app/files/  on Android
 *      • Permanent: survives app restart / device reboot / logout
 *      • App-private, no permissions required
 *      • Unlimited size (limited only by device storage)
 *
 *   2. Supabase vault_documents table  (best-effort cloud backup)
 *      • Enables cross-device access after re-login
 *      • Silently skipped if table does not exist / network offline
 *
 *   3. localStorage  (fast write-through read cache)
 *      • Synchronous; used as a fast-path after the app restores the page
 *      • May be cleared by the OS on some Android manufacturers — never the
 *        primary source after a cold start
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface VaultDocument {
  id: string;
  name: string;
  /** Full encrypted / watermarked binary as base64 or data URL */
  encryptedData: string;
  /** Preview-ready data URL (watermarked image, same MIME as original) */
  encryptedImage?: string;
  /** Cloudinary / remote URL for the encrypted asset */
  cloudinaryUrl?: string;
  /** Number of pages (PDF only) */
  pageCount?: number;
  /** Perceptual hash for duplicate detection */
  pHash?: string;
  metadata: {
    timestamp: number;
    original_name: string;
    /** Actual byte size of the unencrypted file */
    size: number;
    /** XOR encryption key / checksum (required for decryption) */
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
    mimeType?: string;
  };
  createdAt: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const BACKEND_URL =
  import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";

/** Sanitise userId to a safe filename segment */
function safeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 60);
}

function vaultFilePath(userId: string): string {
  return `vault_${safeUserId(userId)}.json`;
}

function vaultStorageKey(userId: string): string {
  return `pinit_vault_documents_${userId}`;
}

// ─── Filesystem layer  (Capacitor only) ───────────────────────────────────────

async function fsWrite(userId: string, docs: VaultDocument[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // Filesystem.Data not available on web
  await Filesystem.writeFile({
    path: vaultFilePath(userId),
    data: JSON.stringify(docs),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

async function fsRead(userId: string): Promise<VaultDocument[] | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { data } = await Filesystem.readFile({
      path: vaultFilePath(userId),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(data as string);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // File not found on first run — that is expected
  }
}

// ─── Supabase layer  (best-effort cloud backup) ───────────────────────────────

async function supabaseSave(userId: string, docs: VaultDocument[]): Promise<void> {
  try {
    for (const doc of docs) {
      await (supabase as any)
        .from("vault_documents")
        .upsert(
          {
            id: doc.id,
            user_id: userId,
            name: doc.name,
            encrypted_data: doc.encryptedData,
            encrypted_image: doc.encryptedImage ?? null,
            cloudinary_url: doc.cloudinaryUrl ?? null,
            page_count: doc.pageCount ?? null,
            metadata: doc.metadata,
            created_at: doc.createdAt,
          },
          { onConflict: "id" }
        );
    }
  } catch {
    // Supabase table may not exist — silently skip
  }
}

async function supabaseLoad(userId: string): Promise<VaultDocument[] | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("vault_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !data || !Array.isArray(data) || data.length === 0) return null;

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      encryptedData: row.encrypted_data || "",
      encryptedImage: row.encrypted_image ?? undefined,
      cloudinaryUrl: row.cloudinary_url ?? undefined,
      pageCount: row.page_count ?? undefined,
      metadata: row.metadata || {
        timestamp: 0,
        original_name: row.name,
        size: 0,
        checksum: "",
        encrypted: true,
        ownerId: userId,
      },
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

// ─── Backend layer  (existing REST API) ───────────────────────────────────────

async function backendLoad(userId: string): Promise<VaultDocument[] | null> {
  try {
    const token = localStorage.getItem("biovault_token");
    const response = await fetch(`${BACKEND_URL}/vault/get-user-vault`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload.documents || !Array.isArray(payload.documents)) return null;

    return payload.documents.map((doc: any) => ({
      id: doc.asset_id || doc.id,
      name: doc.file_name,
      // NOTE: backend only stores full image_base64 — never use the truncated thumbnail
      encryptedData: doc.image_base64 || "",
      encryptedImage: undefined,        // backend does not store encryptedImage
      cloudinaryUrl: doc.image_url || doc.thumbnail_url || undefined,
      metadata: {
        timestamp: doc.capture_timestamp
          ? new Date(doc.capture_timestamp).getTime()
          : Date.now(),
        original_name: doc.file_name,
        size: typeof doc.file_size === "number" ? doc.file_size : 0,
        checksum: doc.file_hash || "",
        encrypted: true,
        ownerId: doc.user_id,
      },
      createdAt: doc.capture_timestamp || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load vault documents for a user.
 *
 * Priority:
 *   Filesystem.Data → Supabase → backend API → localStorage → Preferences
 */
export async function loadVaultDocuments(userId: string): Promise<VaultDocument[]> {
  if (!userId) {
    console.warn("⚠️ loadVaultDocuments: no userId");
    return [];
  }

  // 1. Filesystem (most persistent on Android)
  const fsDocs = await fsRead(userId);
  if (fsDocs && fsDocs.length > 0) {
    console.log(`✅ Vault: loaded ${fsDocs.length} docs from Filesystem.Data`);
    return validateDocumentsForUser(userId, fsDocs);
  }

  // 2. Supabase cloud backup
  const sbDocs = await supabaseLoad(userId);
  if (sbDocs && sbDocs.length > 0) {
    console.log(`✅ Vault: loaded ${sbDocs.length} docs from Supabase`);
    // Persist locally so future loads are offline-capable
    await fsWrite(userId, sbDocs).catch(() => {});
    return validateDocumentsForUser(userId, sbDocs);
  }

  // 3. Backend REST API
  const beDocs = await backendLoad(userId);
  if (beDocs && beDocs.length > 0) {
    console.log(`✅ Vault: loaded ${beDocs.length} docs from backend API`);
    await fsWrite(userId, beDocs).catch(() => {});
    return validateDocumentsForUser(userId, beDocs);
  }

  // 4. localStorage (fast in-memory cache, may not survive Android restart)
  try {
    const raw = localStorage.getItem(vaultStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as VaultDocument[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`✅ Vault: loaded ${parsed.length} docs from localStorage`);
        await fsWrite(userId, parsed).catch(() => {}); // Promote to Filesystem
        return validateDocumentsForUser(userId, parsed);
      }
    }
  } catch { /* ignore */ }

  // 5. Capacitor Preferences (legacy)
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: vaultStorageKey(userId) });
    if (value) {
      const parsed = JSON.parse(value) as VaultDocument[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`✅ Vault: loaded ${parsed.length} docs from Preferences`);
        await fsWrite(userId, parsed).catch(() => {}); // Promote to Filesystem
        return validateDocumentsForUser(userId, parsed);
      }
    }
  } catch { /* ignore */ }

  console.log("📭 Vault: no documents found anywhere");
  return [];
}

/**
 * Save vault documents for a user.
 *
 * Writes to ALL available backends concurrently for maximum durability.
 */
export async function saveVaultDocuments(
  userId: string,
  documents: VaultDocument[]
): Promise<void> {
  if (!userId) {
    console.error("❌ saveVaultDocuments: no userId");
    return;
  }

  // Validate: only save documents that actually have data
  const validDocs = documents.filter((doc) => {
    const hasData = (doc.encryptedData && doc.encryptedData.length > 100) ||
                    (doc.encryptedImage && doc.encryptedImage.length > 100) ||
                    doc.cloudinaryUrl;
    if (!hasData) {
      console.warn(`⚠️ Vault: skipping empty document "${doc.name}" (no data)`);
    }
    return hasData;
  });

  const json = JSON.stringify(validDocs);

  // 1. Filesystem.Data (primary — most reliable on Android)
  try {
    await fsWrite(userId, validDocs);
    console.log(`✅ Vault: saved ${validDocs.length} docs to Filesystem.Data`);
  } catch (e) {
    console.error("❌ Vault: Filesystem.Data save failed:", e);
  }

  // 2. localStorage (sync write-through cache)
  try {
    localStorage.setItem(vaultStorageKey(userId), json);
  } catch (e) {
    console.warn("⚠️ Vault: localStorage save failed:", e);
  }

  // 3. Supabase (async cloud backup — fire-and-forget)
  supabaseSave(userId, validDocs).catch(() => {});

  // 4. Backend REST API (async — fire-and-forget, store FULL data)
  const token = localStorage.getItem("biovault_token");
  if (token) {
    for (const doc of validDocs) {
      fetch(`${BACKEND_URL}/vault/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          asset_id: doc.id,
          file_name: doc.name,
          file_size: doc.metadata.size,
          // Store the FULL encrypted data — NOT truncated
          image_base64: doc.encryptedData,
          file_hash: doc.metadata.checksum,
          capture_timestamp: doc.createdAt,
          owner_name: userId,
          owner_email: userId,
        }),
      }).catch(() => {});
    }
  }
}

/**
 * Add a single document to the vault.
 */
export async function addDocumentToVault(
  userId: string,
  document: VaultDocument
): Promise<void> {
  // Validate document has data before saving
  if (
    (!document.encryptedData || document.encryptedData.length < 100) &&
    (!document.encryptedImage || document.encryptedImage.length < 100) &&
    !document.cloudinaryUrl
  ) {
    throw new Error(
      `Cannot save document "${document.name}": encrypted data is empty or missing`
    );
  }

  const docs = await loadVaultDocuments(userId);
  // Remove any existing doc with the same id (upsert behaviour)
  const filtered = docs.filter((d) => d.id !== document.id);
  filtered.unshift(document);
  await saveVaultDocuments(userId, filtered);
}

/**
 * Delete a document from the vault.
 */
export async function deleteDocumentFromVault(
  userId: string,
  docId: string
): Promise<void> {
  const docs = await loadVaultDocuments(userId);
  await saveVaultDocuments(
    userId,
    docs.filter((d) => d.id !== docId)
  );

  // Best-effort delete from Supabase
  try {
    await (supabase as any).from("vault_documents").delete().eq("id", docId);
  } catch { /* ignore */ }
}

/**
 * Clear all vault data for a user (called on account deletion, NOT on logout).
 * On regular logout we keep the data so it reloads after biometric re-auth.
 */
export async function clearVaultForUser(userId: string): Promise<void> {
  if (!userId) return;

  // Filesystem
  try {
    await Filesystem.deleteFile({
      path: vaultFilePath(userId),
      directory: Directory.Data,
    });
  } catch { /* file may not exist */ }

  // localStorage
  try { localStorage.removeItem(vaultStorageKey(userId)); } catch { /* ignore */ }

  // Preferences
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: vaultStorageKey(userId) });
  } catch { /* ignore */ }
}

/**
 * Keep only docs that belong to this user.
 */
export function validateDocumentsForUser(
  userId: string,
  documents: VaultDocument[]
): VaultDocument[] {
  if (!userId) return [];
  return documents.filter((doc) => {
    const owner = doc.metadata?.ownerId;
    if (owner && owner !== userId) {
      console.warn(`⚠️ Filtering doc "${doc.name}" — belongs to ${owner}`);
      return false;
    }
    return true;
  });
}

/**
 * Sync Filesystem data → localStorage (useful after a Filesystem-only restore).
 */
export async function syncVaultData(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const docs = await loadVaultDocuments(userId);
    if (docs.length > 0) {
      localStorage.setItem(vaultStorageKey(userId), JSON.stringify(docs));
    }
    return true;
  } catch {
    return false;
  }
}

/** No-op kept for API compatibility. */
export async function syncVaultMetadata(_userId: string): Promise<void> {}

/**
 * Vault metadata summary (for the dashboard status bar).
 */
export async function getVaultMetadata(userId: string): Promise<{
  userVaultSize: number;
  documentCount: number;
  lastSyncTime: number;
  storageType: "filesystem" | "localStorage" | "none";
  ownerId: string;
}> {
  if (!userId) {
    return { userVaultSize: 0, documentCount: 0, lastSyncTime: 0, storageType: "none", ownerId: userId };
  }
  try {
    const docs = await loadVaultDocuments(userId);
    const json = JSON.stringify(docs);
    return {
      userVaultSize: new Blob([json]).size,
      documentCount: docs.length,
      lastSyncTime: Date.now(),
      storageType: Capacitor.isNativePlatform() ? "filesystem" : "localStorage",
      ownerId: userId,
    };
  } catch {
    return { userVaultSize: 0, documentCount: 0, lastSyncTime: Date.now(), storageType: "none", ownerId: userId };
  }
}

/**
 * Upload encrypted image to Cloudinary via backend.
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        asset_id: `${userId}_${Date.now()}`,
        file_name: fileName,
        file_size: fileSize,
        image_base64: base64Data,
        file_hash: checksum,
        capture_timestamp: new Date().toISOString(),
        owner_name: userId,
        owner_email: userId,
        certificate_id: "pinit_vault",
      }),
    });

    const result = await response.json();
    if (response.ok && result.image_url) {
      return { success: true, cloudinaryUrl: result.image_url };
    }
    return { success: false, error: result.detail || "Upload failed" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get all vault documents (alias for loadVaultDocuments).
 */
export async function getVaultDocuments(userId: string): Promise<VaultDocument[]> {
  return loadVaultDocuments(userId);
}

/**
 * Save encrypted image to device gallery via share sheet.
 */
export async function saveImageToGallery(
  base64Data: string,
  fileName: string,
  _userId: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const { Share } = await import("@capacitor/share");
    const cleanBase64 = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;
    const safeName =
      fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || `PINIT_${Date.now()}.jpg`;

    const written = await Filesystem.writeFile({
      path: safeName,
      data: cleanBase64,
      directory: Directory.Cache,
      recursive: true,
    });

    await Share.share({
      title: safeName,
      url: written.uri,
      dialogTitle: `Save "${safeName}" to your device`,
    });

    return { success: true, path: written.uri };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("cancel") || msg.includes("Cancel") || msg.includes("dismiss")) {
      return { success: true, path: "share cancelled" };
    }
    return { success: false, error: msg };
  }
}

// ─── PDF helpers ───────────────────────────────────────────────────────────────

/**
 * Count PDF pages by scanning raw bytes for /Type /Page entries.
 */
export async function calculatePageCount(file: File): Promise<number> {
  if (file.type !== "application/pdf") return 1;
  try {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder("latin1").decode(buffer);
    const catalogMatch = text.match(/\/N\s+(\d+)/);
    if (catalogMatch) {
      const n = parseInt(catalogMatch[1], 10);
      if (n > 0 && n <= 9999) return n;
    }
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    return pageMatches ? pageMatches.length : 1;
  } catch {
    return 1;
  }
}

export function countPdfPagesFromDataUrl(dataUrl: string): number {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return 1;
    const binary = atob(base64);
    const catalogMatch = binary.match(/\/N\s+(\d+)/);
    if (catalogMatch) {
      const n = parseInt(catalogMatch[1], 10);
      if (n > 0 && n <= 9999) return n;
    }
    const pageMatches = binary.match(/\/Type\s*\/Page[^s]/g);
    return pageMatches ? pageMatches.length : 1;
  } catch {
    return 1;
  }
}

// Keep appStorage export for compatibility with other parts of the app
export { appStorage } from "./storage";
