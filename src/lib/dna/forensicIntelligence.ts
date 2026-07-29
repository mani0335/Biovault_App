import { generateDocumentDNA, diffDocumentDNA, type DocumentDNA } from '@/lib/documentDna';
import { analyzeImageMetrics, classifyImage, type ForensicsMetrics } from '@/lib/forensicsUtils';
import { extractOwnerFromAsset, type VaultDocHint } from './ownershipDna';
import { getCustodyTimeline } from './chainOfCustody';
import { findRecordByHashWithCloud, getDnaRecordWithCloud } from './dnaRecordStore';
import type { ForensicReport, ForensicFinding, ForensicVerdict, DnaRecord, AssetStatus, OwnerRecoverySource } from './types';

export type { VaultDocHint };

function loadImageEl(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function imageToCanvas(img: HTMLImageElement, maxSize = 512): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function addFinding(findings: ForensicFinding[], signal: string, detected: boolean, detail: string, severity: ForensicFinding['severity']): void {
  findings.push({ signal, detected, detail, severity });
}

export async function runForensicScan(
  scannedDataUrl: string,
  scannedFileName: string,
  scannedMime: string,
  scannedSize: number,
  vaultDocHints?: VaultDocHint[],
): Promise<ForensicReport> {
  const analyzedAt = new Date().toISOString();
  const findings: ForensicFinding[] = [];

  // Step 1: Generate DNA of the scanned asset
  const currentDna = await generateDocumentDNA(scannedDataUrl, scannedFileName, scannedMime, scannedSize);

  // Step 2: Find original record by hash (local + Supabase cloud).
  // NOTE: This will miss most embedded files because embedPersistentDna changes
  // pixel bytes → different SHA-256. The dnaId-based lookup below (Step 3b) is
  // the primary path for persistent-DNA assets.
  const hashRecord = await findRecordByHashWithCloud(currentDna.sha256, currentDna.pHash);

  // Step 3: Extract ownership via persistent pixel DNA (primary) or record store
  const { ownership, source: ownerSource, fuzzyPHashSimilarity, watermarkDevice } = await extractOwnerFromAsset(
    scannedDataUrl, currentDna.sha256, currentDna.pHash, vaultDocHints,
  );

  // Step 3b: Fetch the full DNA record by dnaId to get device/GPS info.
  // This runs whenever pixel DNA produced a dnaId — regardless of ownerSource —
  // because embedPersistentDna changes the SHA-256 so the hash-based record is always null.
  let dnaIdRecord: DnaRecord | null = null;
  if (!hashRecord && ownership?.dnaId) {
    dnaIdRecord = await getDnaRecordWithCloud(ownership.dnaId);
  }

  // Best available record — prefer hash match (byte-identical), fall back to dnaId match
  const originalRecord = hashRecord ?? dnaIdRecord;

  // Step 4: Get custody timeline
  const custodyTimeline = originalRecord ? getCustodyTimeline(originalRecord.dnaId) : [];

  // Step 5: Run forensic image analysis
  let metrics: ForensicsMetrics | null = null;
  let classification = null;
  const img = await loadImageEl(scannedDataUrl);
  if (img) {
    const canvas = imageToCanvas(img);
    metrics = analyzeImageMetrics(canvas);
    classification = classifyImage(canvas, scannedFileName, metrics);
  }

  // Step 6: Compare original vs current
  let similarityPct: number | null = null;
  let dnaMatchPct: number | null = null;

  if (originalRecord) {
    const originalDna: DocumentDNA = {
      dnaId: originalRecord.dnaId,
      signature: originalRecord.signature,
      version: '1.0.0-ondevice',
      layers: [],
      layerCount: 6,
      totalMs: 0,
      sha256: originalRecord.sha256,
      edgeSignature: originalRecord.edgeSignature,
      pHash: originalRecord.pHash,
      aHash: originalRecord.aHash,
      dHash: originalRecord.dHash,
      colorHistogram: originalRecord.colorHistogram ?? null,
      dominantColors: null,
      exifSummary: null,
      hmacSeal: originalRecord.hmacSeal,
      fileType: originalRecord.fileType,
      sizeBytes: originalRecord.sizeBytes,
      composedAt: originalRecord.createdAt,
    };

    const diff = diffDocumentDNA(originalDna, currentDna);
    dnaMatchPct = diff.overallSimilarity;

    // Weighted visual similarity
    const scores = [
      diff.layerDiffs.find((l) => l.key === 'cryptographic')?.similarity,
      diff.layerDiffs.find((l) => l.key === 'structural')?.similarity,
      diff.layerDiffs.find((l) => l.key === 'perceptual')?.similarity,
    ].filter((s): s is number => s !== null && s !== undefined);
    similarityPct = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    // Exact hash match
    if (originalRecord.sha256 && originalRecord.sha256 === currentDna.sha256) {
      addFinding(findings, 'Exact Hash Match', true, 'SHA-256 matches original — file is byte-identical', 'info');
    } else if (originalRecord.sha256) {
      addFinding(findings, 'Hash Mismatch', true, 'SHA-256 differs from original — file has been modified', 'warning');
    }

    // Size comparison
    if (originalRecord.sizeBytes && currentDna.sizeBytes) {
      const sizeRatio = currentDna.sizeBytes / originalRecord.sizeBytes;
      if (sizeRatio < 0.7) {
        addFinding(findings, 'Compression Detected', true, `File is ${Math.round((1 - sizeRatio) * 100)}% smaller than original`, 'warning');
      } else if (sizeRatio > 1.3) {
        addFinding(findings, 'Size Increase', true, `File is ${Math.round((sizeRatio - 1) * 100)}% larger than original`, 'info');
      }
    }

    // Perceptual hash comparison
    if (originalRecord.pHash && currentDna.pHash && originalRecord.pHash !== currentDna.pHash) {
      addFinding(findings, 'Visual Modification', true, 'Perceptual hash differs — visual content has changed', 'warning');
    }

    // Structural comparison
    if (originalRecord.edgeSignature && currentDna.edgeSignature && originalRecord.edgeSignature !== currentDna.edgeSignature) {
      addFinding(findings, 'Structural Change', true, 'Edge structure differs — possible crop/resize/edit', 'warning');
    }
  } else if (ownership) {
    addFinding(findings, 'Owner Recovered from Pixel DNA', false, 'No exact record-store match, but ownership was successfully recovered from embedded persistent DNA', 'info');
  } else {
    addFinding(findings, 'No Original Record', true, 'No matching DNA record found in vault — cannot compare with original', 'info');
  }

  // Step 7: Image forensics findings
  if (classification) {
    if (classification.isCropped) {
      addFinding(findings, 'Cropping Detected', true, 'Image aspect ratio and edge analysis suggest cropping', 'warning');
    }
    if (classification.isAIGenerated) {
      addFinding(findings, 'AI-Generated Content', true, 'Image metrics indicate possible AI generation', 'critical');
    }
    if (!classification.isAuthentic) {
      addFinding(findings, 'Authenticity Concern', true, classification.reasoning.join('; '), 'warning');
    }
  }

  if (metrics) {
    if (metrics.noiseLevel > 0.3) {
      addFinding(findings, 'Noise Injection', true, `High noise level detected (${(metrics.noiseLevel * 100).toFixed(0)}%)`, 'warning');
    }
    if (metrics.compressionRatio > 0.8) {
      addFinding(findings, 'Re-encoding', true, 'High compression ratio suggests re-encoding', 'warning');
    }
    if (metrics.edgeCoherence < 0.3) {
      addFinding(findings, 'Edge Manipulation', true, 'Low edge coherence may indicate editing', 'warning');
    }
    if (metrics.smoothBlockRatio > 0.4) {
      addFinding(findings, 'Screenshot Suspected', true, 'Smooth block ratio is high — possible screenshot capture', 'warning');
    }
  }

  // Metadata analysis
  if (originalRecord && currentDna.exifSummary) {
    addFinding(findings, 'Metadata Present', false, 'EXIF/metadata found in scanned file', 'info');
  } else if (originalRecord && !currentDna.exifSummary) {
    addFinding(findings, 'Metadata Stripped', true, 'No metadata found — may have been removed', 'warning');
  }

  // Watermark / ownership recovery findings
  if (ownerSource === 'perceptual-hash') {
    const simStr = fuzzyPHashSimilarity !== undefined ? `${fuzzyPHashSimilarity.toFixed(0)}% visual similarity` : '';
    addFinding(findings, 'Ownership via Perceptual Hash', false, `Owner identified via visual fingerprint matching (${simStr}). Pixel DNA may have been destroyed by JPEG/screenshot.`, 'info');
  } else if (ownerSource === 'watermark') {
    addFinding(findings, 'Watermark Intact', false, 'PINIT watermark successfully extracted', 'info');
  } else if (ownerSource === 'none' && originalRecord) {
    addFinding(findings, 'Watermark Missing', true, 'PINIT watermark not found — may have been removed', 'critical');
  }

  // Step 8: Compute tampering score (0-100, higher = more tampered)
  const criticalCount = findings.filter((f) => f.detected && f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.detected && f.severity === 'warning').length;
  let tamperingScore = Math.min(100, criticalCount * 30 + warningCount * 12);

  if (dnaMatchPct !== null && dnaMatchPct < 50) tamperingScore = Math.min(100, tamperingScore + 20);
  if (similarityPct !== null && similarityPct >= 95 && tamperingScore > 15) tamperingScore = Math.max(5, tamperingScore - 10);

  // Step 9: Compute Trust Score (0-100) based on how ownership was recovered
  let trustScore = 0;
  if (ownerSource === 'exact-hash') {
    trustScore = 100; // Byte-identical match — maximum confidence
  } else if (ownerSource === 'persistent-dna') {
    // Pixel DNA recovered — confidence depends on how much record data we have
    trustScore = originalRecord ? 95 : 85;
  } else if (ownerSource === 'perceptual-hash') {
    // Visual fingerprint match — confidence proportional to pHash similarity
    const sim = fuzzyPHashSimilarity ?? 70;
    trustScore = Math.round(40 + sim * 0.5); // 70% sim → 75 trust, 100% sim → 90 trust
  } else if (ownerSource === 'watermark') {
    trustScore = 60; // Legacy watermark — less reliable
  }
  // Deduct for tampering signals
  trustScore = Math.max(0, trustScore - Math.round(tamperingScore * 0.2));

  // Step 10: Determine Asset Status
  let assetStatus: AssetStatus = 'unknown';
  if (ownerSource === 'exact-hash' && tamperingScore <= 5) {
    assetStatus = 'original';
  } else if (findings.some((f) => f.detected && f.signal === 'Screenshot Suspected')) {
    assetStatus = 'screenshot';
  } else if (findings.some((f) => f.detected && f.signal === 'Cropping Detected')) {
    assetStatus = 'cropped';
  } else if (findings.some((f) => f.detected && (f.signal === 'Visual Modification' || f.signal === 'Structural Change'))) {
    assetStatus = tamperingScore > 40 ? 'modified' : 'resized';
  } else if (ownership && ownerSource !== 'none') {
    assetStatus = 'shared'; // Ownership confirmed but bytes changed — likely re-shared
  }

  // Step 11: Verdict
  let verdict: ForensicVerdict;
  let verdictText: string;

  const ownerLabel = ownership?.ownerName ?? ownership?.pinitOwnerId ?? 'Unknown';
  if (!ownership) {
    verdict = 'unknown';
    verdictText = 'No PINIT DNA could be recovered from this asset. It may predate the PINIT DNA system, or ownership data was destroyed by heavy compression or editing.';
  } else if (tamperingScore <= 10) {
    verdict = 'authentic';
    verdictText = `Asset verified as authentic. Original owner: ${ownerLabel}. File integrity is fully intact.`;
  } else if (tamperingScore <= 40) {
    verdict = 'minor-edit';
    verdictText = `Minor modifications detected (score: ${tamperingScore}/100). Ownership confirmed: ${ownerLabel}. Likely resized or lightly compressed.`;
  } else {
    // Distinguish a normal messaging-app share (compression only) from malicious tampering
    const isNormalShare = (ownerSource === 'perceptual-hash' || ownerSource === 'persistent-dna') && tamperingScore < 70;
    verdict = 'tampered';
    verdictText = isNormalShare
      ? `Image was re-encoded by a sharing app (WhatsApp, arattai, etc.). Ownership confirmed: ${ownerLabel}. Pixel DNA destroyed by compression but visual fingerprint matched.`
      : `Significant tampering detected (score: ${tamperingScore}/100). Original owner: ${ownerLabel}. File integrity has been compromised.`;
  }

  // Visual similarity for display (use fuzzy pHash sim if available, else dnaMatchPct proxy)
  const visualSimilarity = fuzzyPHashSimilarity ?? similarityPct;

  // Fire-and-forget: record this scan so the owner is notified
  if (ownership?.userId) {
    (async () => {
      try {
        const [{ getViewerGeoInfo }, { recordScanEvent }] = await Promise.all([
          import('@/lib/activityService'),
          import('./scanEventService'),
        ]);
        const geo = await getViewerGeoInfo().catch(() => null);
        const scannerUserId = typeof localStorage !== 'undefined'
          ? (localStorage.getItem('biovault_userId') ?? null)
          : null;
        await recordScanEvent({
          ownerId: ownership!.userId,
          scannerUserId,
          assetId: ownership!.dnaId,
          assetUuid: ownership!.assetUuid,
          fileName: scannedFileName,
          scannerIp: geo?.ip ?? null,
          scannerCity: geo?.city ?? null,
          scannerCountry: geo?.country ?? null,
          scannerDevice: navigator.userAgent.slice(0, 120),
        });
      } catch { /* silent */ }
    })();
  }

  // originalDevice: prefer cloud record (has full device + GPS), fall back to
  // watermark-extracted location so GPS/city/country shows even when Supabase
  // is unreachable or RLS blocks a cross-user read.
  const cloudDevice = originalRecord?.deviceNetwork ?? null;
  const effectiveDevice = cloudDevice ?? watermarkDevice ?? null;

  return {
    originalOwner: ownership,
    originalDevice: effectiveDevice,
    custodyTimeline,
    similarityPct,
    dnaMatchPct,
    tamperingScore,
    findings,
    verdict,
    verdictText,
    analyzedAt,
    trustScore,
    assetStatus,
    ownerRecoverySource: ownerSource as OwnerRecoverySource,
    visualSimilarity,
  };
}
