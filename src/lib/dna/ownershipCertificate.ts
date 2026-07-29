import { jsPDF } from 'jspdf';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';
import type { ForensicReport } from './types';

// ── Render QR code to canvas, return PNG data URL ──────────────────────────

async function qrDataUrl(value: string, size = 148): Promise<string> {
  return new Promise<string>((resolve) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(div);
    const root = createRoot(div);
    root.render(React.createElement(QRCodeCanvas, { value, size, level: 'H' }));
    // Two rAF frames — first commits DOM, second paints canvas pixels
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const canvas = div.querySelector('canvas') as HTMLCanvasElement | null;
      const url = canvas ? canvas.toDataURL('image/png') : '';
      root.unmount();
      document.body.removeChild(div);
      resolve(url);
    }));
  });
}

// ── Color helpers ───────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  dark:        [5,   9,   19]  as RGB,
  dark2:       [15,  23,  42]  as RGB,
  darkCard:    [22,  33,  62]  as RGB,
  purple:      [124, 58,  237] as RGB,
  purpleLight: [167, 139, 250] as RGB,
  green:       [16,  185, 129] as RGB,
  red:         [239, 68,  68]  as RGB,
  amber:       [245, 158, 11]  as RGB,
  white:       [255, 255, 255] as RGB,
  slate:       [100, 116, 139] as RGB,
  muted:       [148, 163, 184] as RGB,
};

// ── PDF helpers ─────────────────────────────────────────────────────────────

function tint(base: RGB, alpha: number): RGB {
  // Blend with dark background
  return base.map((v, i) => Math.round(C.dark[i] + (v - C.dark[i]) * alpha)) as RGB;
}

// ── Main generator ──────────────────────────────────────────────────────────

export async function generateOwnershipCertificate(
  report: ForensicReport,
  fileName: string,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const owner  = report.originalOwner;
  const device = report.originalDevice;

  const fill   = (col: RGB) => pdf.setFillColor(...col);
  const stroke = (col: RGB) => pdf.setDrawColor(...col);
  const ink    = (col: RGB) => pdf.setTextColor(...col);
  const bold   = (sz: number) => { pdf.setFont('helvetica', 'bold');   pdf.setFontSize(sz); };
  const normal = (sz: number) => { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(sz); };
  const rect   = (x: number, y: number, w: number, h: number) => pdf.rect(x, y, w, h, 'F');
  const line   = (x1: number, y1: number, x2: number, y2: number) => pdf.line(x1, y1, x2, y2);
  const label  = (val: string | null | undefined) =>
    (!val || val === 'Not Available' || val === 'N/A') ? '—' : val;

  // ── 1. BACKGROUND ──────────────────────────────────────────────────────────
  fill(C.dark);  rect(0, 0, W, 297);

  // ── 2. HEADER ──────────────────────────────────────────────────────────────
  fill(C.dark2); rect(0, 0, W, 44);
  fill(C.purple); rect(0, 0, W, 1.5);  // top accent line

  ink(C.purpleLight); bold(20);
  pdf.text('PINIT', 14, 16);

  ink(C.slate); normal(6.5);
  pdf.text('DIGITAL ASSET OWNERSHIP VERIFICATION SYSTEM', 14, 21.5);

  ink(C.white); bold(13);
  pdf.text('DIGITAL OWNERSHIP', W - 14, 14, { align: 'right' });
  pdf.text('CERTIFICATE', W - 14, 20.5, { align: 'right' });

  const certId = `CERT-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  ink(C.slate); normal(6);
  pdf.text(`Certificate ID: ${certId}`, W - 14, 28, { align: 'right' });
  pdf.text(`Issued: ${new Date().toLocaleString()}`, W - 14, 33, { align: 'right' });

  stroke(C.purple); pdf.setLineWidth(0.3);
  line(0, 44, W, 44);

  // ── 3. VERDICT BANNER ──────────────────────────────────────────────────────
  const verdictCol: RGB = report.verdict === 'authentic' ? C.green
    : report.verdict === 'minor-edit' ? C.amber : C.red;
  const verdictLabel = owner
    ? (report.verdict === 'authentic' ? '✓  OWNERSHIP VERIFIED' : report.verdict === 'minor-edit' ? '⚠  OWNERSHIP VERIFIED  (minor edit)' : '⚠  OWNERSHIP VERIFIED  (tampered copy)')
    : '✗  OWNER COULD NOT BE IDENTIFIED';

  fill(tint(verdictCol, 0.12)); rect(0, 44, W, 30);
  fill(verdictCol); rect(0, 44, 2.5, 30); // left accent strip

  ink(verdictCol); bold(13);
  pdf.text(verdictLabel, 14, 57);

  if (owner) {
    ink(C.white); bold(11);
    pdf.text(owner.ownerName || 'Name Not Available', 14, 65.5);
    ink(C.purpleLight); normal(7);
    pdf.text(owner.pinitOwnerId || '', W - 14, 65.5, { align: 'right' });
  }

  ink(C.slate); normal(6);
  pdf.text(`Trust Score: ${report.trustScore}/100  ·  Recovery: ${report.ownerRecoverySource.replace(/-/g, ' ').toUpperCase()}`, W - 14, 56, { align: 'right' });

  // divider
  stroke(tint(verdictCol, 0.3)); pdf.setLineWidth(0.2);
  line(0, 74, W, 74);

  // ── 4. CONTENT (two columns) ────────────────────────────────────────────────
  fill(C.dark2); rect(0, 74, W, 168);

  // column boundaries
  const L = 12, MID = 110;
  let ly = 82, ry = 82;

  function sectionHeader(title: string, x: number, y: number): number {
    ink(C.purpleLight); bold(6.5);
    pdf.text(title.toUpperCase(), x, y);
    stroke(C.purple); pdf.setLineWidth(0.25);
    line(x, y + 1, x + 86, y + 1);
    return y + 7;
  }

  function dataRow(lbl: string, val: string | null | undefined, x: number, y: number): number {
    const v = label(val);
    ink(C.slate); normal(5.5);
    pdf.text(lbl, x, y);
    ink(v === '—' ? C.muted : C.white); bold(6);
    const display = v.length > 36 ? v.slice(0, 34) + '…' : v;
    pdf.text(display, x, y + 4);
    return y + 9;
  }

  // ── Left column ──────────────────────
  ly = sectionHeader('Asset Identity', L, ly);
  ly = dataRow('Digital DNA ID',  owner?.dnaId, L, ly);
  ly = dataRow('Asset UUID',      owner?.assetUuid, L, ly);
  ly = dataRow('Asset Version',   owner ? `v${owner.assetVersion}` : null, L, ly);
  ly = dataRow('Vault ID',        owner?.vaultId, L, ly);
  ly += 2;

  ly = sectionHeader('Owner Identity', L, ly);
  ly = dataRow('Full Name',  owner?.ownerName, L, ly);
  ly = dataRow('PINIT ID',   owner?.pinitOwnerId, L, ly);
  ly = dataRow('User ID',    owner?.userId, L, ly);
  ly += 2;

  ly = sectionHeader('Timestamps', L, ly);
  const encT = owner?.encryptionTimestamp && owner.encryptionTimestamp !== 'Not Available'
    ? new Date(owner.encryptionTimestamp).toLocaleString() : null;
  ly = dataRow('Encrypted At',   encT, L, ly);
  ly = dataRow('Certificate At', new Date().toLocaleString(), L, ly);
  ly = dataRow('File Name',      fileName, L, ly);

  // ── Right column ─────────────────────
  ry = sectionHeader("Creator's Device", MID, ry);
  ry = dataRow('Manufacturer', device?.manufacturer, MID, ry);
  ry = dataRow('Model',        device?.model, MID, ry);
  ry = dataRow('OS',           device ? [device.operatingSystem, device.osVersion].filter(Boolean).join(' ') : null, MID, ry);
  ry = dataRow('Platform',     device?.platform, MID, ry);
  ry += 2;

  ry = sectionHeader("Creator's Location", MID, ry);
  ry = dataRow('GPS',     device?.gpsLat && device.gpsLng ? `${device.gpsLat.toFixed(6)}, ${device.gpsLng.toFixed(6)}` : null, MID, ry);
  ry = dataRow('City',    device?.city, MID, ry);
  ry = dataRow('State',   device?.state, MID, ry);
  ry = dataRow('Country', device?.country, MID, ry);
  ry = dataRow('Public IP (at creation)', device?.publicIp, MID, ry);
  ry += 2;

  ry = sectionHeader('Forensic Analysis', MID, ry);
  ry = dataRow('Tamper Score',  `${report.tamperingScore}/100`, MID, ry);
  ry = dataRow('Asset Status',  report.assetStatus.replace(/-/g, ' ').toUpperCase(), MID, ry);
  ry = dataRow('Visual Match',  report.visualSimilarity !== null ? `${report.visualSimilarity}%` : null, MID, ry);
  ry = dataRow('DNA Match',     report.dnaMatchPct !== null ? `${report.dnaMatchPct}%` : null, MID, ry);

  // ── 5. QR + FOOTER ─────────────────────────────────────────────────────────
  const FY = 244;
  fill(C.dark); rect(0, FY, W, 53);
  stroke(C.purple); pdf.setLineWidth(0.3);
  line(0, FY, W, FY);

  // QR code — encodes ownership verification payload
  const qrPayload = JSON.stringify({
    type: 'PINIT_OWNERSHIP_CERT',
    certId,
    assetId:    owner?.dnaId    ?? 'UNKNOWN',
    assetUuid:  owner?.assetUuid ?? 'UNKNOWN',
    ownerId:    owner?.userId    ?? 'UNKNOWN',
    pinitId:    owner?.pinitOwnerId ?? 'UNKNOWN',
    issuedAt:   new Date().toISOString(),
    trustScore: report.trustScore,
    verdict:    report.verdict,
  });

  const qrImg = await qrDataUrl(qrPayload, 160);
  if (qrImg) {
    pdf.addImage(qrImg, 'PNG', 12, FY + 4, 42, 42);
    ink(C.slate); normal(5.5);
    pdf.text('Scan QR to verify ownership', 33, FY + 48, { align: 'center' });
  }

  // Certificate prose
  ink(C.white); bold(9);
  pdf.text('PINIT DIGITAL OWNERSHIP CERTIFICATE', 62, FY + 10);

  ink(C.muted); normal(6.5);
  pdf.text('This certificate confirms that the digital asset identified above', 62, FY + 17);
  pdf.text('is registered under the PINIT DNA ownership verification system.', 62, FY + 22);
  pdf.text('The ownership record is cryptographically sealed and immutably', 62, FY + 27);
  pdf.text('stored in the PINIT Vault distributed ownership database.', 62, FY + 32);

  ink(C.purpleLight); normal(5.5);
  pdf.text(`Cert ID:       ${certId}`, 62, FY + 39);
  pdf.text(`DNA Signature: ${owner?.digitalSignature?.slice(0, 30) ?? 'N/A'}…`, 62, FY + 44);

  // Footer
  fill(C.dark2); rect(0, 289, W, 8);
  ink(C.slate); normal(5.5);
  pdf.text('PINIT Vault — Digital Asset Ownership & Provenance System  ·  This certificate is cryptographically generated.', W / 2, 293, { align: 'center' });
  pdf.text(`pinit.app  ·  Certificate ${certId}  ·  ${new Date().toLocaleDateString()}`, W / 2, 296.5, { align: 'center' });

  pdf.save(`PINIT-Certificate-${certId}.pdf`);
}
