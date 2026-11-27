const Settings = require('../models/Settings');
const { config } = require('../config/env');

const { rt } = require('../runtime');

/**
 * PDFs are drawn in the browser. pdfkit, the fonts and the logo are loaded once, on the first PDF
 * (rt.loadPdfKit resolves { PDFDocument, fonts: { regular, bold, serif, serifBold }, logo }), so
 * the normal CRM pages don't download ~1.5 MB they don't need.
 */
let kit = null;
async function ensureKit() {
  if (!kit) kit = Promise.resolve(rt.loadPdfKit()).catch((e) => { kit = null; throw e; });
  return kit;
}
let K = null; // resolved kit, set by each PDF builder before drawing
const C = { primary: '#6c2bf2', dark: '#1f2430', muted: '#6b7280', line: '#e5e7eb', soft: '#f4f5fb', gold: '#b8892b' };

const money = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n || 0);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Agency profile: DB settings (editable in CRM) over .env defaults. */
async function getAgency() {
  const s = (await Settings.findOne({ key: 'agency' }).lean()) || {};
  const a = config.agency;
  return {
    name: s.agencyName || a.name,
    tagline: s.tagline || a.tagline,
    address: s.address || a.address,
    phone: s.phone || a.phone,
    email: s.email || a.email,
    website: s.website || a.website,
    gstin: s.gstin || a.gstin,
    signatory: s.signatory || a.signatory,
    bank: s.bankDetails || a.bank,
    taxName: s.defaultTaxName || 'GST'
  };
}

function logoFile() {
  return K && K.logo ? K.logo : null;
}

function newDoc(opts = {}) {
  const doc = new K.PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Producer: 'Fourix CRM' }, ...opts });
  doc.registerFont('R', K.fonts.regular);
  doc.registerFont('B', K.fonts.bold);
  doc.registerFont('S', K.fonts.serif);
  doc.registerFont('SB', K.fonts.serifBold);
  doc.font('R');
  return doc;
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(Buffer.from(c)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function brandHeader(doc, agency, title, metaRows) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.rect(0, 0, doc.page.width, 8).fill(C.primary);

  const logo = logoFile();
  let textX = left;
  if (logo) {
    try { doc.image(logo, left, 30, { fit: [54, 54] }); textX = left + 66; } catch { /* bad image: fall back to monogram */ }
  }
  if (textX === left) {
    doc.circle(left + 24, 54, 24).fill(C.primary);
    doc.fillColor('#fff').font('B').fontSize(22).text((agency.name || 'A')[0].toUpperCase(), left, 44, { width: 48, align: 'center' });
    textX = left + 62;
  }
  doc.fillColor(C.dark).font('B').fontSize(16).text(agency.name, textX, 34, { width: 250 });
  doc.font('R').fontSize(8.5).fillColor(C.muted);
  if (agency.tagline) doc.text(agency.tagline, textX, doc.y, { width: 250 });
  doc.text([agency.address, agency.phone].filter(Boolean).join('  ·  '), textX, doc.y + 2, { width: 260 });
  doc.text([agency.email, agency.website].filter(Boolean).join('  ·  '), textX, doc.y, { width: 260 });
  if (agency.gstin) doc.text(`GSTIN: ${agency.gstin}`, textX, doc.y, { width: 260 });

  doc.fillColor(C.primary).font('B').fontSize(24).text(title, left, 34, { width: right - left, align: 'right' });
  let y = 66;
  doc.fontSize(9).fillColor(C.muted);
  metaRows.forEach(([k, v]) => {
    doc.font('R').fillColor(C.muted).text(k, right - 220, y, { width: 90, align: 'right' });
    doc.font('B').fillColor(C.dark).text(String(v ?? '—'), right - 124, y, { width: 124, align: 'right' });
    y += 14;
  });
  doc.y = Math.max(doc.y, y, 112) + 16;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(C.line).lineWidth(1).stroke();
  doc.y += 14;
  doc.x = left;
}

function addFooters(doc, agency, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { left, bottom } = doc.page.margins;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // prevent auto page-add while writing in the footer zone
    const y = doc.page.height - 38;
    doc.moveTo(left, y - 6).lineTo(doc.page.width - left, y - 6).strokeColor(C.line).lineWidth(0.5).stroke();
    doc.font('R').fontSize(8).fillColor(C.muted)
      .text(`${agency.name} · ${label}`, left, y, { width: 330, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, doc.page.width - left - 120, y, { width: 120, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
    void bottom;
  }
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.font('B').fontSize(10).fillColor(C.primary).text(text.toUpperCase(), doc.page.margins.left, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.35);
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 30) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function paragraph(doc, text, opts = {}) {
  if (!text) return;
  doc.font('R').fontSize(9.5).fillColor(C.dark).text(text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left * 2, lineGap: 2, ...opts });
  doc.moveDown(0.6);
}

function bullets(doc, list = []) {
  list.filter(Boolean).forEach((t) => {
    ensureSpace(doc, 18);
    const x = doc.page.margins.left;
    doc.circle(x + 4, doc.y + 5.5, 1.8).fill(C.primary);
    doc.fillColor(C.dark).font('R').fontSize(9.5).text(t, x + 14, doc.y, { width: doc.page.width - x * 2 - 14, lineGap: 1.5 });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.4);
}

function partyBox(doc, title, lines, x, y, w) {
  doc.roundedRect(x, y, w, 92, 6).fill(C.soft);
  doc.fillColor(C.primary).font('B').fontSize(8.5).text(title.toUpperCase(), x + 12, y + 10, { characterSpacing: 0.6 });
  doc.fillColor(C.dark).font('B').fontSize(10.5).text(lines[0] || '', x + 12, y + 25, { width: w - 24 });
  doc.font('R').fontSize(8.5).fillColor(C.muted).text(lines.slice(1).filter(Boolean).join('\n'), x + 12, doc.y + 2, { width: w - 24, lineGap: 1.5 });
}

function itemsTable(doc, items, cur) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left * 2;
  const cols = [
    { k: '#', w: 26, a: 'left' },
    { k: 'Description', w: width - 26 - 52 - 90 - 100, a: 'left' },
    { k: 'Qty', w: 52, a: 'right' },
    { k: 'Unit price', w: 90, a: 'right' },
    { k: 'Amount', w: 100, a: 'right' }
  ];
  const head = () => {
    const y = doc.y;
    doc.rect(left, y, width, 24).fill(C.primary);
    let x = left;
    cols.forEach((c) => {
      doc.fillColor('#fff').font('B').fontSize(9).text(c.k, x + 6, y + 8, { width: c.w - 12, align: c.a });
      x += c.w;
    });
    doc.y = y + 24;
  };
  head();
  items.forEach((it, i) => {
    doc.font('R').fontSize(9.5);
    const h = Math.max(24, doc.heightOfString(it.description, { width: cols[1].w - 12 }) + 14);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 40) { doc.addPage(); doc.y = doc.page.margins.top; head(); }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(left, y, width, h).fill('#fafbff');
    let x = left;
    const vals = [String(i + 1), it.description, String(it.quantity), money(it.unitPrice, cur), money(it.amount, cur)];
    cols.forEach((c, idx) => {
      doc.fillColor(idx === 4 ? C.dark : C.dark).font(idx === 4 ? 'B' : 'R').fontSize(9.5).text(vals[idx], x + 6, y + 7, { width: c.w - 12, align: c.a });
      x += c.w;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor(C.line).lineWidth(0.5).stroke();
    doc.y = y + h;
  });
  doc.y += 8;
}

function totalsBlock(doc, rows, cur) {
  const w = 240;
  const x = doc.page.width - doc.page.margins.right - w;
  ensureSpace(doc, rows.length * 20 + 20);
  rows.forEach((r) => {
    const y = doc.y;
    if (r.grand) {
      doc.roundedRect(x, y, w, 28, 5).fill(C.primary);
      doc.fillColor('#fff').font('B').fontSize(11).text(r.label, x + 12, y + 8, { width: 110 }).text(money(r.value, cur), x + 110, y + 8, { width: w - 122, align: 'right' });
      doc.y = y + 34;
    } else {
      doc.fillColor(C.muted).font('R').fontSize(9.5).text(r.label, x + 12, y, { width: 110 });
      doc.fillColor(r.color || C.dark).font(r.bold ? 'B' : 'R').text(money(r.value, cur), x + 110, y, { width: w - 122, align: 'right' });
      doc.y = y + 18;
    }
  });
  doc.moveDown(0.6);
}

function signatureBlock(doc, agency, clientName) {
  ensureSpace(doc, 110);
  const left = doc.page.margins.left;
  const y = doc.y + 24;
  const w = 200;
  doc.moveTo(left, y + 40).lineTo(left + w, y + 40).strokeColor(C.dark).lineWidth(0.7).stroke();
  doc.fillColor(C.dark).font('B').fontSize(9).text(agency.signatory || 'Authorized Signatory', left, y + 46, { width: w });
  doc.font('R').fillColor(C.muted).fontSize(8.5).text(`For ${agency.name}`, left, doc.y, { width: w });
  const rx = doc.page.width - doc.page.margins.right - w;
  doc.moveTo(rx, y + 40).lineTo(rx + w, y + 40).stroke();
  doc.fillColor(C.dark).font('B').fontSize(9).text(clientName ? `${clientName}` : 'Client', rx, y + 46, { width: w });
  doc.font('R').fillColor(C.muted).fontSize(8.5).text('Accepted by (signature & date)', rx, doc.y, { width: w });
  doc.y = y + 80;
}

/* ============================ QUOTATION ============================ */
async function quotationPdf(q) {
  K = await ensureKit();
  const agency = await getAgency();
  const doc = newDoc();
  const cs = q.clientSnapshot || {};
  const cur = q.currency || 'INR';
  brandHeader(doc, agency, 'QUOTATION', [
    ['Quotation no.', q.number + (q.revision > 1 ? ` (Rev ${q.revision})` : '')],
    ['Date', fmt(q.quotationDate)],
    ['Valid until', fmt(q.expiryDate)]
  ]);

  const left = doc.page.margins.left;
  const bw = (doc.page.width - left * 2 - 16) / 2;
  const y = doc.y;
  partyBox(doc, 'Quotation for', [cs.company || cs.contactPerson, cs.company ? cs.contactPerson : '', cs.email, cs.phone, [cs.address, cs.country].filter(Boolean).join(', '), cs.gstin ? `GSTIN: ${cs.gstin}` : ''], left, y, bw);
  partyBox(doc, 'Project', [q.projectName, q.deliveryTimeline ? `Timeline: ${q.deliveryTimeline}` : '', q.techStack?.length ? `Stack: ${q.techStack.join(', ')}` : ''], left + bw + 16, y, bw);
  doc.y = y + 108;

  if (q.projectDescription) { sectionTitle(doc, 'Project overview'); paragraph(doc, q.projectDescription); }
  if (q.scopeOfWork?.length) { sectionTitle(doc, 'Scope of work'); bullets(doc, q.scopeOfWork); }
  if (q.deliverables?.length) { sectionTitle(doc, 'Deliverables'); bullets(doc, q.deliverables); }

  sectionTitle(doc, 'Pricing');
  itemsTable(doc, q.items, cur);
  const rows = [{ label: 'Subtotal', value: q.subtotal }];
  if (q.discountAmount > 0) rows.push({ label: q.discountType === 'percent' ? `Discount (${q.discountValue}%)` : 'Discount', value: -q.discountAmount, color: '#16a34a' });
  if (q.taxRate > 0) rows.push({ label: `${q.taxName || agency.taxName} (${q.taxRate}%)`, value: q.taxAmount });
  rows.push({ label: 'Grand total', value: q.grandTotal, grand: true });
  totalsBlock(doc, rows, cur);

  if (q.paymentTerms || q.advanceAmount || q.milestonePayments?.length) {
    sectionTitle(doc, 'Payment terms');
    if (q.paymentTerms) paragraph(doc, q.paymentTerms);
    if (q.advanceAmount > 0) paragraph(doc, `Advance payment: ${money(q.advanceAmount, cur)} (${q.advancePercent}%) due before work begins.`);
    if (q.milestonePayments?.length) {
      bullets(doc, q.milestonePayments.map((m) => `${m.name}${m.percentage ? ` – ${m.percentage}%` : ''}${m.amount ? ` (${money(m.amount, cur)})` : ''}${m.dueNote ? ` · ${m.dueNote}` : ''}`));
    }
  }
  if (agency.bank) { sectionTitle(doc, 'Bank details'); paragraph(doc, agency.bank); }
  if (q.terms) { sectionTitle(doc, 'Terms & conditions'); paragraph(doc, q.terms, { fontSize: 8.5 }); }
  if (q.notes) { sectionTitle(doc, 'Notes'); paragraph(doc, q.notes); }
  signatureBlock(doc, agency, cs.contactPerson);
  addFooters(doc, agency, `Quotation ${q.number}`);
  return toBuffer(doc);
}

/* ============================ INVOICE ============================ */
async function invoicePdf(inv, payments = []) {
  K = await ensureKit();
  const agency = await getAgency();
  const doc = newDoc();
  const cs = inv.clientSnapshot || {};
  brandHeader(doc, agency, 'INVOICE', [
    ['Invoice no.', inv.number],
    ['Invoice date', fmt(inv.invoiceDate)],
    ['Due date', fmt(inv.dueDate)],
    ['Status', inv.status]
  ]);
  const left = doc.page.margins.left;
  const bw = (doc.page.width - left * 2 - 16) / 2;
  const y = doc.y;
  partyBox(doc, 'Bill to', [cs.company || cs.contactPerson, cs.company ? cs.contactPerson : '', cs.email, cs.phone, [cs.address, cs.country].filter(Boolean).join(', '), cs.gstin ? `GSTIN: ${cs.gstin}` : ''], left, y, bw);
  partyBox(doc, 'Project', [inv.projectName || '—', `Type: ${inv.invoiceType} payment`], left + bw + 16, y, bw);
  doc.y = y + 108;

  itemsTable(doc, inv.items, 'INR');
  const rows = [{ label: 'Subtotal', value: inv.subtotal }];
  if (inv.discountAmount > 0) rows.push({ label: 'Discount', value: -inv.discountAmount, color: '#16a34a' });
  if (inv.taxRate > 0) rows.push({ label: `${inv.taxName} (${inv.taxRate}%)`, value: inv.taxAmount });
  rows.push({ label: 'Total', value: inv.total, bold: true });
  rows.push({ label: 'Amount paid', value: inv.amountPaid, color: '#16a34a' });
  rows.push({ label: 'Balance due', value: inv.balance, grand: true });
  totalsBlock(doc, rows, 'INR');

  const confirmed = payments.filter((p) => p.status === 'confirmed');
  if (confirmed.length) {
    sectionTitle(doc, 'Payments received');
    bullets(doc, confirmed.map((p) => `${fmt(p.paidOn)} · ${p.receiptNumber} · ${p.method} · ${money(p.amount)}`));
  }
  const instr = inv.paymentInstructions || agency.bank;
  if (instr) { sectionTitle(doc, 'Payment instructions'); paragraph(doc, instr); }
  if (inv.notes) { sectionTitle(doc, 'Notes'); paragraph(doc, inv.notes); }
  signatureBlock(doc, agency, null);
  addFooters(doc, agency, `Invoice ${inv.number}`);
  return toBuffer(doc);
}

/* ============================ RECEIPT ============================ */
async function receiptPdf(payment, client, extra = {}) {
  K = await ensureKit();
  const agency = await getAgency();
  const doc = newDoc();
  brandHeader(doc, agency, 'PAYMENT RECEIPT', [
    ['Receipt no.', payment.receiptNumber],
    ['Date received', fmt(payment.paidOn)],
    ['Method', payment.method]
  ]);
  const left = doc.page.margins.left;
  const y = doc.y;
  partyBox(doc, 'Received from', [client?.company || client?.contactPerson || '—', client?.company ? client.contactPerson : '', client?.email, client?.phone], left, y, doc.page.width - left * 2);
  doc.y = y + 110;
  doc.roundedRect(left, doc.y, doc.page.width - left * 2, 70, 8).fill('#ecfdf5');
  doc.fillColor('#047857').font('R').fontSize(10).text('Amount received', left + 20, doc.y + 14);
  doc.font('B').fontSize(24).text(money(payment.amount), left + 20, doc.y + 2);
  doc.y += 40;
  const rows = [
    ['Payment type', payment.paymentType],
    ['Project', extra.projectName || '—'],
    ['Invoice', extra.invoiceNumber || '—'],
    ['Notes', payment.notes || '—']
  ];
  rows.forEach(([k, v]) => {
    doc.font('R').fontSize(10).fillColor(C.muted).text(k, left, doc.y, { continued: false, width: 140 });
    doc.font('B').fillColor(C.dark).text(v, left + 150, doc.y - 12, { width: 340 });
    doc.moveDown(0.5);
  });
  doc.moveDown(2);
  paragraph(doc, 'This receipt confirms that the above payment has been received and recorded. It is computer generated.', { fontSize: 8.5 });
  signatureBlock(doc, agency, null);
  addFooters(doc, agency, `Receipt ${payment.receiptNumber}`);
  return toBuffer(doc);
}

/* ============================ CERTIFICATE ============================ */
async function certificatePdf({ project, client, number, issuedAt }) {
  K = await ensureKit();
  const agency = await getAgency();
  const doc = newDoc({ size: 'A4', layout: 'landscape', margin: 0 });
  const W = doc.page.width;
  const H = doc.page.height;

  doc.rect(0, 0, W, H).fill('#fffdf7');
  doc.rect(18, 18, W - 36, H - 36).lineWidth(3).strokeColor(C.primary).stroke();
  doc.rect(28, 28, W - 56, H - 56).lineWidth(1).strokeColor(C.gold).stroke();
  // Corner accents
  [[28, 28], [W - 28, 28], [28, H - 28], [W - 28, H - 28]].forEach(([x, y]) => doc.circle(x, y, 6).fill(C.gold));

  const logo = logoFile();
  let logoDrawn = false;
  if (logo) { try { doc.image(logo, W / 2 - 24, 48, { fit: [48, 48], align: 'center' }); logoDrawn = true; } catch { /* use monogram */ } }
  if (!logoDrawn) {
    doc.circle(W / 2, 72, 24).fill(C.primary);
    doc.fillColor('#fff').font('B').fontSize(22).text((agency.name || 'A')[0].toUpperCase(), W / 2 - 24, 62, { width: 48, align: 'center' });
  }
  doc.fillColor(C.dark).font('B').fontSize(14).text(agency.name, 0, 104, { width: W, align: 'center', characterSpacing: 1.5 });
  if (agency.tagline) doc.font('R').fontSize(9).fillColor(C.muted).text(agency.tagline, 0, 122, { width: W, align: 'center' });

  doc.fillColor(C.primary).font('SB').fontSize(34).text('PROJECT COMPLETION CERTIFICATE', 0, 150, { width: W, align: 'center' });
  doc.moveTo(W / 2 - 90, 196).lineTo(W / 2 + 90, 196).lineWidth(1.5).strokeColor(C.gold).stroke();

  doc.fillColor(C.muted).font('S').fontSize(12).text('This is to certify that the project described below has been successfully completed and delivered for', 80, 212, { width: W - 160, align: 'center' });
  doc.fillColor(C.dark).font('SB').fontSize(26).text(client.company || client.contactPerson, 80, 246, { width: W - 160, align: 'center' });
  doc.fillColor(C.dark).font('B').fontSize(15).text(`“${project.name}”`, 80, 284, { width: W - 160, align: 'center' });

  const summary = (project.portfolio?.summary || project.description || '').slice(0, 240);
  if (summary) doc.font('S').fontSize(10).fillColor(C.muted).text(summary, 120, 312, { width: W - 240, align: 'center', lineGap: 2 });

  // Details grid
  const gy = 366;
  const cells = [
    ['Project ID', project.projectId],
    ['Technologies', (project.techStack || []).slice(0, 6).join(', ') || '—'],
    ['Start date', fmt(project.startDate)],
    ['Completion date', fmt(project.completionDate)]
  ];
  const cw = (W - 160) / cells.length;
  cells.forEach(([k, v], i) => {
    const x = 80 + i * cw;
    doc.fillColor(C.muted).font('R').fontSize(8).text(k.toUpperCase(), x, gy, { width: cw - 10, align: 'center', characterSpacing: 0.8 });
    doc.fillColor(C.dark).font('B').fontSize(10).text(v, x, gy + 14, { width: cw - 10, align: 'center' });
  });

  // Signature + meta
  const sy = H - 120;
  doc.moveTo(90, sy).lineTo(270, sy).lineWidth(0.8).strokeColor(C.dark).stroke();
  doc.fillColor(C.dark).font('B').fontSize(10).text(agency.signatory || 'Authorized Representative', 90, sy + 6, { width: 180, align: 'center' });
  doc.font('R').fontSize(8.5).fillColor(C.muted).text(`Authorized Representative, ${agency.name}`, 80, sy + 20, { width: 200, align: 'center' });

  doc.fillColor(C.muted).font('R').fontSize(8).text('CERTIFICATE NO.', W - 290, sy - 14, { width: 200, align: 'center', characterSpacing: 0.8 });
  doc.fillColor(C.dark).font('B').fontSize(11).text(number, W - 290, sy, { width: 200, align: 'center' });
  doc.fillColor(C.muted).font('R').fontSize(8.5).text(`Issued on ${fmt(issuedAt)}`, W - 290, sy + 20, { width: 200, align: 'center' });

  doc.circle(W / 2, sy - 6, 34).lineWidth(2).strokeColor(C.gold).stroke();
  doc.circle(W / 2, sy - 6, 28).lineWidth(0.6).stroke();
  doc.fillColor(C.gold).font('B').fontSize(8).text('OFFICIAL', W / 2 - 28, sy - 16, { width: 56, align: 'center' });
  doc.text('HANDOVER', W / 2 - 28, sy - 5, { width: 56, align: 'center' });

  doc.fillColor(C.muted).font('R').fontSize(7.5).text([agency.address, agency.email, agency.website].filter(Boolean).join('  ·  '), 0, H - 52, { width: W, align: 'center' });
  return toBuffer(doc);
}

/* ============================ GENERIC REPORT TABLE ============================ */
async function tablePdf(title, columns, rows, query = {}) {
  K = await ensureKit();
  const agency = await getAgency();
  const doc = newDoc({ layout: 'landscape' });
  const period = query.from || query.to ? `${query.from || '…'} to ${query.to || '…'}` : 'All time';
  brandHeader(doc, agency, 'REPORT', [['Generated', fmt(new Date())], ['Period', period]]);
  doc.font('B').fontSize(13).fillColor(C.dark).text(title, doc.page.margins.left, doc.y);
  doc.moveDown(0.8);

  const left = doc.page.margins.left;
  const width = doc.page.width - left * 2;
  const cw = width / columns.length;
  const head = () => {
    const y = doc.y;
    doc.rect(left, y, width, 22).fill(C.primary);
    columns.forEach((c, i) => doc.fillColor('#fff').font('B').fontSize(8.5).text(c.label, left + i * cw + 5, y + 7, { width: cw - 10, align: c.money ? 'right' : 'left', lineBreak: false }));
    doc.y = y + 22;
  };
  head();
  rows.forEach((r, idx) => {
    if (doc.y + 22 > doc.page.height - doc.page.margins.bottom - 30) { doc.addPage(); doc.y = doc.page.margins.top; head(); }
    const y = doc.y;
    if (idx % 2) doc.rect(left, y, width, 22).fill('#fafbff');
    const isTotal = String(Object.values(r)[0]).toUpperCase().startsWith('TOTAL') || String(Object.values(r)[0]).toUpperCase().startsWith('ALL ');
    columns.forEach((c, i) => {
      const v = r[c.key];
      doc.fillColor(C.dark).font(isTotal ? 'B' : 'R').fontSize(8.5).text(c.money ? money(v) : String(v ?? ''), left + i * cw + 5, y + 7, { width: cw - 10, align: c.money ? 'right' : 'left', lineBreak: false, ellipsis: true });
    });
    doc.moveTo(left, y + 22).lineTo(left + width, y + 22).strokeColor(C.line).lineWidth(0.4).stroke();
    doc.y = y + 22;
  });
  if (!rows.length) doc.fillColor(C.muted).font('R').fontSize(10).text('No data for the selected period.', left, doc.y + 12);
  addFooters(doc, agency, title);
  return toBuffer(doc);
}

module.exports = { quotationPdf, invoicePdf, receiptPdf, certificatePdf, tablePdf, getAgency, money, fmt };
