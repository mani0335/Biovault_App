import { jsPDF } from 'jspdf';

export interface HrLegalReportData {
  recipientName: string;
  recipientEmail?: string;
  recipientOrg?: string;
  documentTitle: string;
  dnaId: string;
  shareId: string;
  shareLink: string;
  createdAt: string;
  leakDetectedAt?: string;
  matchConfidence?: number;
  matchSource?: string;
  accessEvents?: Array<{
    timestamp: string;
    device?: string;
    location?: string;
    eventType?: string;
  }>;
  infringingUrl?: string;
  reportedBy?: string;
}

export async function generateHrLegalReport(data: HrLegalReportData): Promise<string> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 50;
  const contentW = W - margin * 2;
  let y = margin;

  const heading = (text: string, size = 13) => {
    checkPage(size + 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(30, 60, 120);
    doc.text(text, margin, y);
    y += size + 6;
  };

  const body = (text: string, size = 10, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentW);
    doc.text(lines, margin, y);
    y += (lines.length * (size + 3)) + 4;
  };

  const pageH = doc.internal.pageSize.getHeight();

  const checkPage = (needed = 60) => {
    if (y + needed > pageH - 40) {
      doc.addPage();
      y = margin;
    }
  };

  const rule = () => {
    doc.setDrawColor(160, 180, 220);
    doc.line(margin, y, W - margin, y);
    y += 10;
  };

  const space = (n = 10) => { y += n; };

  // ── Header bar ───────────────────────────────────────────────────────────────
  doc.setFillColor(20, 40, 100);
  doc.roundedRect(margin - 10, margin - 20, contentW + 20, 54, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('CONFIDENTIAL — INTERNAL INCIDENT REPORT', margin, y + 2);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PINIT Sentinel — Tracked Export Package (TEP) Breach', margin, y + 18);
  doc.text(`Issued: ${new Date().toLocaleString()}`, W - margin - 200, y + 18);
  y += 54;
  space(12);

  // ── Section 1: Incident summary ──────────────────────────────────────────────
  heading('1. INCIDENT SUMMARY');
  rule();
  body(`Incident Type: Unauthorized redistribution of a Tracked Export Package (TEP)`);
  body(`TEP ID / Share ID: ${data.shareId}`);
  body(`Document: ${data.documentTitle}`);
  body(`DNA Record ID: ${data.dnaId}`);
  body(`TEP Issued: ${data.createdAt}`);
  if (data.leakDetectedAt) body(`Leak Detected: ${data.leakDetectedAt}`);
  if (data.infringingUrl) body(`Leak Location: ${data.infringingUrl}`);
  space();

  // ── Section 2: Recipient identification ──────────────────────────────────────
  heading('2. IDENTIFIED RECIPIENT (SUBJECT OF INVESTIGATION)');
  rule();
  body(`Name: ${data.recipientName}`);
  if (data.recipientEmail) body(`Email: ${data.recipientEmail}`);
  if (data.recipientOrg) body(`Organization / Department: ${data.recipientOrg}`);
  body(
    `Basis for identification: Each TEP is individually watermarked per recipient, not per ` +
    `document. The leaked copy carries a per-recipient pixel watermark whose decoded payload ` +
    `uniquely maps to the above individual's TEP distribution record.`,
    10, [60, 0, 0]
  );
  space();

  // ── Section 3: PINIT DNA forensic evidence ───────────────────────────────────
  heading('3. PINIT DNA FORENSIC EVIDENCE');
  rule();
  body(
    'The TEP carries an amplitude-14 steganographic watermark embedded at the pixel level, ' +
    'along with a 10-layer perceptual fingerprint (SHA-256, pHash, pixel DNA, DCT grid, ' +
    'edge density, color histogram, dominant palette). These fingerprints survive compression, ' +
    'cropping, screenshots, and social-media re-encoding pipelines.',
    10
  );
  space(6);
  body(`• DNA ID: ${data.dnaId}`, 10, [30, 30, 120]);
  body(`• Share (TEP) ID: ${data.shareId}`, 10, [30, 30, 120]);
  if (data.matchConfidence !== undefined) {
    body(`• Match Confidence: ${data.matchConfidence}% (${data.matchSource ?? 'watermark decode'})`, 10, [30, 30, 120]);
  }
  space();

  // ── Section 4: Smart Link access log ─────────────────────────────────────────
  heading('4. SMART LINK ACCESS LOG (DUAL-SIGNAL TELEMETRY)');
  rule();
  if (data.accessEvents && data.accessEvents.length > 0) {
    body(`${data.accessEvents.length} access event(s) recorded for this TEP:`, 10, [30, 30, 30]);
    space(4);
    for (const ev of data.accessEvents) {
      body(
        `• ${ev.timestamp}${ev.eventType ? ` [${ev.eventType.toUpperCase()}]` : ''}${ev.device ? ` — ${ev.device.slice(0, 60)}` : ''}${ev.location ? ` — ${ev.location}` : ''}`,
        9, [50, 50, 80]
      );
    }
  } else {
    body(
      'Access log data: available in the PINIT Vault Security Center → Enterprise tab → ' +
      `TEP: ${data.shareId.slice(0, 8)}… → Access Events.`,
      10, [80, 80, 80]
    );
  }
  space();

  // ── Section 5: Recommended action ───────────────────────────────────────────
  heading('5. RECOMMENDED HR / LEGAL ACTION');
  rule();
  body(
    'This incident constitutes a breach of confidentiality obligations and, depending on the ' +
    'jurisdiction and employment agreement, may also constitute misappropriation of trade ' +
    'secrets under the Defend Trade Secrets Act (18 U.S.C. § 1836) and/or the Economic ' +
    'Espionage Act (18 U.S.C. § 1831-1839).',
    10
  );
  space(6);
  body('Recommended immediate steps:', 10, [30, 30, 30]);
  body('1. Revoke the TEP share link immediately via PINIT Vault Security Center.', 10, [60, 0, 0]);
  body('2. Notify HR and Legal/Compliance teams with this report.', 10, [60, 0, 0]);
  body('3. Preserve all access log evidence (do not delete scan_events records).', 10, [60, 0, 0]);
  body('4. Conduct internal investigation with HR before external disclosure.', 10, [60, 0, 0]);
  body('5. If the material was published externally, a separate DMCA notice may be filed for the publication, but the primary action is internal.', 10, [60, 0, 0]);
  space();

  // ── Section 6: Distinction from public DMCA ─────────────────────────────────
  heading('6. NOTE: THIS IS NOT A DMCA TAKEDOWN');
  rule();
  body(
    'Unlike Scenarios 1–4 (creator-content distribution to anonymous internet consumers), ' +
    'this TEP breach identifies a named, contracted individual. The primary response is an ' +
    'internal HR and/or legal action, not a public DMCA notice. A DMCA notice may be filed ' +
    'separately against any publishing venue, but the employee identification is handled through ' +
    'internal channels and the applicable employment/NDA agreements.',
    10, [80, 40, 0]
  );
  space(20);

  // ── Signature ────────────────────────────────────────────────────────────────
  rule();
  if (data.reportedBy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`Reported by: ${data.reportedBy}`, margin, y);
    y += 16;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Report Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 12;
  doc.text(`TEP ID: ${data.shareId}`, margin, y);

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFillColor(230, 235, 245);
  doc.rect(0, pageH - 32, W, 32, 'F');
  doc.setFillColor(180, 0, 0);
  doc.rect(0, pageH - 32, 4, 32, 'F');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 100);
  doc.text('CONFIDENTIAL — PINIT Sentinel Enterprise — Internal HR/Legal Use Only', margin + 8, pageH - 14);
  doc.text('Not for public distribution', W - margin - 120, pageH - 14);

  return doc.output('datauristring');
}
