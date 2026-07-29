// Vault Manager - Handle document storage and retrieval

export interface VaultDocument {
  id: string;
  fileName: string;
  fileType: "pdf" | "image" | "document";
  fileSize: string;
  fileData: string; // base64 encoded
  fileUrl?: string; // for display
  createdAt: Date;
  isEncrypted: boolean;
  encryptionKey?: string;
}

interface VaultState {
  documents: VaultDocument[];
}

const VAULT_STORAGE_KEY = "pinit_vault_documents";

// Initialize vault from localStorage
export function initializeVault(): VaultState {
  try {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : { documents: [] };
  } catch (err) {
    console.error("Failed to load vault:", err);
    return { documents: [] };
  }
}

// Save vault to localStorage
export function saveVaultState(vault: VaultState): void {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch (err) {
    console.error("Failed to save vault:", err);
  }
}

// Add document to vault
export function addDocumentToVault(
  vault: VaultState,
  document: VaultDocument
): VaultState {
  return {
    documents: [...vault.documents, document],
  };
}

// Get all documents
export function getAllDocuments(vault: VaultState): VaultDocument[] {
  return vault.documents;
}

// Delete document from vault
export function deleteDocumentFromVault(
  vault: VaultState,
  documentId: string
): VaultState {
  return {
    documents: vault.documents.filter((doc) => doc.id !== documentId),
  };
}

// Get single document
export function getDocumentById(
  vault: VaultState,
  documentId: string
): VaultDocument | undefined {
  return vault.documents.find((doc) => doc.id === documentId);
}

// Clear entire vault
export function clearVault(): VaultState {
  localStorage.removeItem(VAULT_STORAGE_KEY);
  return { documents: [] };
}
