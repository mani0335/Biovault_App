export type CustodyEventType =
  | 'created' | 'captured' | 'uploaded' | 'encrypted' | 'shared'
  | 'downloaded' | 'verified' | 'viewed' | 'modified' | 're-encrypted'
  | 'restored' | 'archived';

export interface OwnershipDna {
  pinitOwnerId: string;
  userId: string;
  ownerName?: string;
  vaultId: string;
  dnaId: string;
  assetUuid: string;
  assetVersion: number;
  encryptionTimestamp: string;
  digitalSignature: string;
}

export interface DeviceNetworkDna {
  manufacturer: string | null;
  model: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  platform: string | null;
  browserVersion: string | null;
  deviceFingerprint: string | null;
  publicIp: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  address: string | null;
  village: string | null;
  area: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timeZone: string | null;
  capturedAt: string;
}

export interface CustodyEvent {
  id: string;
  dnaId: string;
  eventType: CustodyEventType;
  timestamp: string;
  userId: string;
  deviceInfo: string | null;
  location: string | null;
  networkInfo: string | null;
}

export interface ForensicFinding {
  signal: string;
  detected: boolean;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export type ForensicVerdict = 'authentic' | 'minor-edit' | 'tampered' | 'unknown';

export type AssetStatus =
  | 'original'       // Byte-identical to stored original
  | 'shared'         // Ownership confirmed, file re-transmitted but not visually modified
  | 'screenshot'     // Visual match, smooth-block artifacts typical of screenshot
  | 'cropped'        // Visual match, aspect ratio / edge analysis shows cropping
  | 'resized'        // Visual match, resolution differs from original
  | 'modified'       // Visible edits (filters, overlays, content changes)
  | 'unknown';       // Cannot determine status

export type OwnerRecoverySource =
  | 'exact-hash'        // SHA-256 of scanned file matches stored record exactly
  | 'persistent-dna'    // Pixel-embedded DNA extracted from image tiles
  | 'perceptual-hash'   // Fuzzy pHash similarity matched a known record
  | 'watermark'         // Legacy LSB watermark recovered
  | 'none';             // No ownership recovered

export interface ForensicReport {
  originalOwner: OwnershipDna | null;
  originalDevice: DeviceNetworkDna | null;
  custodyTimeline: CustodyEvent[];
  similarityPct: number | null;
  dnaMatchPct: number | null;
  tamperingScore: number;
  findings: ForensicFinding[];
  verdict: ForensicVerdict;
  verdictText: string;
  analyzedAt: string;
  // Extended ownership proof fields
  trustScore: number;              // 0-100: confidence level of ownership identification
  assetStatus: AssetStatus;        // Classification of the scanned asset
  ownerRecoverySource: OwnerRecoverySource;
  visualSimilarity: number | null; // pHash similarity to original (0-100, null if unavailable)
}

export interface DnaRecord {
  dnaId: string;
  signature: string;
  userId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  sha256: string | null;
  pHash: string | null;
  aHash: string | null;
  dHash: string | null;
  edgeSignature: string | null;
  hmacSeal: string | null;
  ownership: OwnershipDna | null;
  deviceNetwork: DeviceNetworkDna | null;
  custody: CustodyEvent[];
  createdAt: string;
  // Advanced visual fingerprint layers (L9-L12)
  colorHistogram?: string | null;
  blockDct?: string | null;
  edgeDensity?: string | null;
  dominantPalette?: string | null;
}
