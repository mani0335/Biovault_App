/**
 * PINIT Sharing & Certificate Utilities
 * Manage public shares and digital certificates
 */

export interface ShareCertificate {
  id: string;
  certificateId: string;
  assetId: string;
  userId: string;
  dateCreated: string;
  confidence: number;
  status: string;
  ownershipAtCreation: {
    assetId: string;
    authorshipCertificateId: string;
    uniqueUserId: string;
    assetFileSize: string | number;
    assetResolution: string;
    userEncryptedResolution: string;
    timeStamp: string;
    captureLocation: string;
    gpsLocation: string;
  };
  technicalDetails: {
    totalPixels: string | number;
    pixelsVerified: string | number;
    deviceName: string;
    deviceId: string;
    deviceSource: string;
    ipAddress: string;
    ipSource: string;
    ownershipInfo: string;
    certificate: string;
    rotationDetected: string;
    rotationMessage: string;
  };
  classificationAnalysis: {
    detectedCase: string;
    confidence: number;
    reasoning: string[];
    metrics: Record<string, any>;
  };
  cropInfo: any;
  gpsDetails: {
    available: boolean;
    latitude: number | null;
    longitude: number | null;
    coordinates: string | null;
    mapsUrl: string | null;
    source: string;
  };
  deviceDetails: any;
  imagePreview: string | null;
}

// ─── Generate authorship certificate ──
export const generateAuthorshipCertificateId = (userId: string, deviceId: string): string => {
  const combinedString = `${userId}-${deviceId}`;

  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }

  const hashStr = Math.abs(hash).toString(16).toUpperCase();
  const userHash = userId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const userSuffix = Math.abs(userHash).toString(36).toUpperCase().slice(0, 6);

  return `CERT-${hashStr.slice(0, 8)}${userSuffix}`;
};

// ─── Generate asset ID ──
export const generateAssetId = (imageData: ImageData): string => {
  const data = imageData.data;

  let hash = 0;
  const sampleInterval = Math.floor(data.length / 1000);

  for (let i = 0; i < data.length; i += sampleInterval) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0;
  }

  hash = ((hash << 5) - hash) + imageData.width;
  hash = ((hash << 5) - hash) + imageData.height;
  hash |= 0;

  const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');

  return `AST-${hashStr}`;
};

// ─── Generate blockchain anchor ──
export const generateBlockchainAnchor = (fileHash: string, timestamp: string | number): string => {
  const seed = (fileHash || '') + (timestamp || Date.now()).toString(16);
  let result = '0x';
  for (let i = 0; i < 64; i++) {
    const charCode = seed.charCodeAt(i % seed.length);
    result += ((charCode * (i + 7)) % 16).toString(16);
  }
  return result;
};

// ─── Save certificate to storage ──
export const saveCertificate = (analysisReport: any, imageData: string): ShareCertificate | null => {
  try {
    const savedCerts = localStorage.getItem('certificates');
    const certificates: ShareCertificate[] = savedCerts ? JSON.parse(savedCerts) : [];

    const certificate: ShareCertificate = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      certificateId:
        analysisReport.authorshipCertificateId || 'CERT-' + Date.now().toString(36).toUpperCase(),
      assetId: analysisReport.assetId || 'AST-UNKNOWN',
      userId: analysisReport.uniqueUserId || 'unknown',
      dateCreated: new Date().toISOString(),
      confidence: analysisReport.confidence || 0,
      status: analysisReport.ownershipInfo || 'Unverified',

      ownershipAtCreation: {
        assetId: analysisReport.assetId || 'Unknown',
        authorshipCertificateId: analysisReport.authorshipCertificateId || 'Unknown',
        uniqueUserId: analysisReport.uniqueUserId || 'Unknown',
        assetFileSize: analysisReport.assetFileSize || 'Unknown',
        assetResolution: analysisReport.assetResolution || 'Unknown',
        userEncryptedResolution: analysisReport.userEncryptedResolution || 'N/A',
        timeStamp: analysisReport.timestamp
          ? new Date(analysisReport.timestamp).toLocaleString()
          : 'Not Available',
        captureLocation: analysisReport.captureLocationInfo || 'Unknown',
        gpsLocation: analysisReport.gpsLocation?.available
          ? `${analysisReport.gpsLocation.coordinates} (${analysisReport.gpsLocation.source || 'Unknown'})`
          : 'Not Available',
      },

      technicalDetails: {
        totalPixels: analysisReport.totalPixels || 'Unknown',
        pixelsVerified: analysisReport.pixelsVerifiedWithBiometrics || '0',
        deviceName: analysisReport.deviceName || 'Unknown',
        deviceId: analysisReport.deviceId || 'Unknown',
        deviceSource: analysisReport.deviceSource || 'Unknown',
        ipAddress: analysisReport.ipAddress || 'Unknown',
        ipSource: analysisReport.ipSource || 'Unknown',
        ownershipInfo: analysisReport.ownershipInfo || 'Unknown',
        certificate: analysisReport.authorshipCertificate || 'Not Present',
        rotationDetected:
          analysisReport.rotationDetected !== null && analysisReport.rotationDetected !== undefined
            ? `${analysisReport.rotationDetected}°`
            : 'Not detected',
        rotationMessage: analysisReport.rotationMessage || 'Not detected',
      },

      classificationAnalysis: {
        detectedCase: analysisReport.detectedCase || 'Unknown',
        confidence: analysisReport.confidence || 0,
        reasoning: analysisReport.reasoning || [],
        metrics: analysisReport.metrics || {},
      },

      cropInfo: analysisReport.cropInfo || null,

      gpsDetails: {
        available: analysisReport.gpsLocation?.available || false,
        latitude: analysisReport.gpsLocation?.latitude || null,
        longitude: analysisReport.gpsLocation?.longitude || null,
        coordinates: analysisReport.gpsLocation?.coordinates || null,
        mapsUrl: analysisReport.gpsLocation?.mapsUrl || null,
        source: analysisReport.gpsLocation?.source || 'Unknown',
      },

      deviceDetails: analysisReport.deviceDetails || null,
      imagePreview: imageData ? imageData.substring(0, 50000) : null,
    };

    certificates.unshift(certificate);

    if (certificates.length > 50) {
      certificates.splice(50);
    }

    localStorage.setItem('certificates', JSON.stringify(certificates));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'certificates',
        newValue: JSON.stringify(certificates),
        url: window.location.href,
        storageArea: localStorage,
      })
    );


    return certificate;
  } catch (error) {
    console.error('❌ Error saving certificate:', error);
    return null;
  }
};

// ─── Get all certificates ──
export const getCertificates = (): ShareCertificate[] => {
  try {
    const saved = localStorage.getItem('certificates');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// ─── Delete certificate ──
export const deleteCertificate = (id: string): boolean => {
  try {
    const certs = getCertificates();
    const filtered = certs.filter((c) => c.id !== id);
    localStorage.setItem('certificates', JSON.stringify(filtered));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'certificates',
        newValue: JSON.stringify(filtered),
        url: window.location.href,
        storageArea: localStorage,
      })
    );

    return true;
  } catch {
    return false;
  }
};

// ─── Create share link ──
export interface ShareLink {
  id: string;
  shareToken: string;
  assetId: string;
  userId: string;
  imagePreview: string;
  fileName: string;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  maxAccesses: number | null;
  isPublic: boolean;
}

export const createShareLink = (
  assetId: string,
  userId: string,
  imageData: string,
  fileName: string,
  expiryDays?: number,
  maxAccesses?: number
): ShareLink => {
  const shareToken = 'share-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

  const link: ShareLink = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    shareToken,
    assetId,
    userId,
    imagePreview: imageData.substring(0, 50000),
    fileName,
    createdAt: new Date().toISOString(),
    expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : null,
    accessCount: 0,
    maxAccesses: maxAccesses || null,
    isPublic: true,
  };

  const shares = getShareLinks();
  shares.push(link);
  localStorage.setItem('shareLinks', JSON.stringify(shares));

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'shareLinks',
      newValue: JSON.stringify(shares),
      url: window.location.href,
      storageArea: localStorage,
    })
  );

  return link;
};

// ─── Get all share links ──
export const getShareLinks = (): ShareLink[] => {
  try {
    const saved = localStorage.getItem('shareLinks');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// ─── Get share link by token ──
export const getShareLinkByToken = (token: string): ShareLink | null => {
  try {
    const links = getShareLinks();
    const link = links.find((l) => l.shareToken === token);

    if (!link) return null;

    // Check expiry
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      deleteShareLink(link.id);
      return null;
    }

    // Check access limit
    if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
      deleteShareLink(link.id);
      return null;
    }

    return link;
  } catch {
    return null;
  }
};

// ─── Increment access count ──
export const incrementShareLinkAccess = (token: string): boolean => {
  try {
    const links = getShareLinks();
    const link = links.find((l) => l.shareToken === token);
    if (!link) return false;

    link.accessCount++;
    localStorage.setItem('shareLinks', JSON.stringify(links));
    return true;
  } catch {
    return false;
  }
};

// ─── Delete share link ──
export const deleteShareLink = (id: string): boolean => {
  try {
    const links = getShareLinks();
    const filtered = links.filter((l) => l.id !== id);
    localStorage.setItem('shareLinks', JSON.stringify(filtered));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'shareLinks',
        newValue: JSON.stringify(filtered),
        url: window.location.href,
        storageArea: localStorage,
      })
    );

    return true;
  } catch {
    return false;
  }
};
