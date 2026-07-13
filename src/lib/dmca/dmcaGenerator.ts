import { jsPDF } from 'jspdf';

export interface DmcaNoticeData {
  ownerName: string;
  ownerEmail?: string;
  contentTitle: string;
  dnaId: string;
  shareId?: string;
  sha256?: string;
  infringingUrl?: string;
  createdAt: string;
  shareLink: string;
}

export async function generateDmcaNotice(data: DmcaNoticeData): Promise<string> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 50;
  const contentW = W - margin * 2;
  let y = margin;

  const heading = (text: string, size = 13) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(80, 20, 160);
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

  const rule = () => {
    doc.setDrawColor(200, 180, 255);
    doc.line(margin, y, W - margin, y);
    y += 10;
  };

  const space = (n = 10) => { y += n; };

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(80, 20, 160);
  doc.roundedRect(margin - 10, margin - 20, contentW + 20, 54, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('DMCA TAKEDOWN NOTICE', margin, y + 2);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PINIT DNA — Digital Rights Protection', margin, y + 18);
  doc.text(`Issued: ${new Date().toLocaleString()}`, W - margin - 160, y + 18);
  y += 54;
  space(12);

  // ── Section 1: Rights holder ─────────────────────────────────────────────
  heading('1. RIGHTS HOLDER IDENTIFICATION');
  rule();
  body(`Name: ${data.ownerName}`);
  if (data.ownerEmail) body(`Email: ${data.ownerEmail}`);
  body('Platform: PINIT Vault (PINIT DNA Protection System)');
  space();

  // ── Section 2: Infringed work ────────────────────────────────────────────
  heading('2. DESCRIPTION OF INFRINGED WORK');
  rule();
  body(`Content Title: ${data.contentTitle}`);
  body(`DNA Record ID: ${data.dnaId}`);
  if (data.sha256) body(`SHA-256 Hash: ${data.sha256}`);
  if (data.shareId) body(`Tracked Share ID: ${data.shareId}  (per-recipient watermark)`);
  body(`Original Creation Date: ${data.createdAt}`);
  body(`Original Share Link: ${data.shareLink}`);
  space();

  // ── Section 3: Infringing material ──────────────────────────────────────
  heading('3. INFRINGING MATERIAL LOCATION');
  rule();
  if (data.infringingUrl) {
    body(`Infringing URL:\n${data.infringingUrl}`);
  } else {
    body('Infringing URL: [Insert URL of infringing content]', 10, [160, 0, 0]);
  }
  space();

  // ── Section 4: Good faith statement ─────────────────────────────────────
  heading('4. GOOD FAITH BELIEF STATEMENT');
  rule();
  body(
    'I have a good faith belief that use of the copyrighted material described above ' +
    'is not authorized by the copyright owner, its agent, or the law. The information ' +
    'in this notification is accurate and, under penalty of perjury, I am authorized to ' +
    'act on behalf of the owner of an exclusive right that is allegedly infringed.',
    10
  );
  space();

  // ── Section 5: DNA evidence summary ─────────────────────────────────────
  heading('5. PINIT DNA FORENSIC EVIDENCE');
  rule();
  body(
    'This content has been cryptographically registered in the PINIT DNA ownership ' +
    'ledger. The embedded watermark (amplitude-8 steganographic encoding) and ' +
    'perceptual hash fingerprint are embedded at the pixel level and survive ' +
    'screenshot, re-encoding, cropping, and social-media compression pipelines.',
    10
  );
  space(6);
  body(`• DNA ID: ${data.dnaId}`, 10, [60, 0, 120]);
  if (data.sha256) body(`• File Hash (SHA-256): ${data.sha256}`, 10, [60, 0, 120]);
  if (data.shareId) {
    body(
      `• Subscriber Attribution: The per-recipient watermark variant (Share ID: ${data.shareId}) ` +
      `uniquely identifies which distribution copy was leaked. This is supported by the ` +
      `PINIT smart-link delivery log.`,
      10, [60, 0, 120]
    );
  }
  space();

  // ── Section 6: Legal action notice ──────────────────────────────────────
  heading('6. REQUESTED ACTION');
  rule();
  body(
    'We hereby request that you immediately remove or disable access to the ' +
    'infringing material listed in Section 3 pursuant to 17 U.S.C. § 512(c)(3) ' +
    '(DMCA Safe Harbor). Failure to respond may result in loss of safe harbor ' +
    'protection and direct liability for copyright infringement.',
    10
  );
  space(20);

  // ── Signature ────────────────────────────────────────────────────────────
  rule();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(`${data.ownerName}`, margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Rights Holder — PINIT DNA Registered Owner`, margin, y);
  y += 12;
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(245, 240, 255);
  doc.rect(0, pageH - 32, W, 32, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 90, 180);
  doc.text('PINIT DNA — Human-Origin Identity Protection', margin, pageH - 14);
  doc.text('Generated automatically from verified DNA ownership record', W - margin - 240, pageH - 14);

  return doc.output('datauristring');
}
