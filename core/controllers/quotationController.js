const crypto = require('../lib/crypto');
const Quotation = require('../models/Quotation');
const Client = require('../models/Client');
const Lead = require('../models/Lead');
const Project = require('../models/Project');
const Settings = require('../models/Settings');
const { nextNumber } = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { calcTotals, refreshProject } = require('../services/financeService');
const { quotationPdf } = require('../services/pdfService');
const email = require('../services/emailService');
const { config } = require('../config/env');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = [
  'client', 'lead', 'project', 'quotationDate', 'expiryDate', 'projectName', 'projectDescription', 'scopeOfWork', 'deliverables',
  'techStack', 'items', 'discountType', 'discountValue', 'taxName', 'taxRate', 'paymentTerms', 'advancePercent', 'milestonePayments',
  'deliveryTimeline', 'terms', 'notes', 'currency', 'showInPortal'
];

const snapshot = (c) => ({ company: c.company, contactPerson: c.contactPerson, email: c.email, phone: c.phone, address: [c.address, c.city, c.state].filter(Boolean).join(', '), country: c.country, gstin: c.gstin });

async function load(id) {
  assertObjectId(id, 'quotation id');
  const q = await Quotation.findById(id);
  if (!q) throw new AppError('Quotation not found', 404);
  return q;
}

function applyTotals(q) {
  const t = calcTotals(q);
  q.items = t.items;
  q.subtotal = t.subtotal;
  q.discountAmount = t.discountAmount;
  q.taxAmount = t.taxAmount;
  q.grandTotal = t.grandTotal;
  q.advanceAmount = t.advanceAmount;
  // Milestone amounts are derived from percentages against the grand total
  (q.milestonePayments || []).forEach((m) => { if (m.percentage) m.amount = Math.round(((q.grandTotal * m.percentage) / 100) * 100) / 100; });
}

async function resolveClient(q) {
  if (q.client) {
    const c = await Client.findById(q.client);
    if (!c) throw new AppError('Client not found', 404);
    q.clientSnapshot = snapshot(c);
  } else if (q.lead) {
    const l = await Lead.findById(q.lead);
    if (!l) throw new AppError('Lead not found', 404);
    q.clientSnapshot = { company: l.company, contactPerson: l.name, email: l.email, phone: l.phone, country: l.country };
  } else {
    throw new AppError('Select a client or a lead for this quotation', 400);
  }
}

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = { isArchived: false };
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.client) { assertObjectId(req.query.client); q.client = req.query.client; }
  if (req.query.project) { assertObjectId(req.query.project); q.project = req.query.project; }
  const s = searchFilter(req.query.search, ['number', 'projectName', 'clientSnapshot.company', 'clientSnapshot.contactPerson']);
  if (s) Object.assign(q, s);
  const [rows, total, agg] = await Promise.all([
    Quotation.find(q).populate('client', 'company contactPerson').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Quotation.countDocuments(q),
    Quotation.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$grandTotal' } } }])
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), summary: agg });
});

const get = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  await q.populate([{ path: 'client', select: 'company contactPerson email' }, { path: 'project', select: 'name projectId' }]);
  res.json({ success: true, data: q });
});

const defaults = asyncHandler(async (req, res) => {
  const s = (await Settings.findOne({ key: 'agency' }).lean()) || {};
  res.json({
    success: true,
    data: {
      taxName: s.defaultTaxName || 'GST',
      taxRate: s.defaultTaxRate ?? 18,
      paymentTerms: s.defaultPaymentTerms || '',
      terms: s.defaultTerms || '',
      validityDays: s.quotationValidityDays || 15,
      currency: s.defaultCurrency || 'INR'
    }
  });
});

const create = asyncHandler(async (req, res) => {
  const q = new Quotation({ ...pick(req.body, EDITABLE), createdBy: req.user._id });
  await resolveClient(q);
  applyTotals(q);
  q.number = await nextNumber('QT');
  q.revisions = [{ revision: 1, by: req.user._id, byName: req.user.name, grandTotal: q.grandTotal, note: 'Created' }];
  await q.save();
  await audit.record(req, { action: 'CREATE', module: 'quotation', recordId: q._id, description: `Quotation ${q.number} created (${q.grandTotal})`, newValues: { number: q.number, projectName: q.projectName, grandTotal: q.grandTotal, status: q.status } });
  res.status(201).json({ success: true, data: q });
});

const update = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  if (q.status === 'Accepted') throw new AppError('Accepted quotations are locked. Duplicate it to create a revised version.', 409);
  const before = q.toObject();
  q.set(pick(req.body, EDITABLE));
  await resolveClient(q);
  applyTotals(q);
  const wasSent = ['Sent', 'Viewed', 'Rejected', 'Expired'].includes(before.status);
  if (wasSent) {
    q.revision += 1;
    q.status = 'Draft'; // re-send after revising
    q.viewedAt = undefined;
  }
  if (q.grandTotal !== before.grandTotal || wasSent) {
    q.revisions.push({ revision: q.revision, by: req.user._id, byName: req.user.name, grandTotal: q.grandTotal, note: req.body.revisionNote || 'Edited' });
  }
  await q.save();
  const amountChanged = before.grandTotal !== q.grandTotal;
  await audit.recordUpdate(req, {
    module: 'quotation',
    recordId: q._id,
    action: amountChanged ? 'AMOUNT_CHANGE' : 'UPDATE',
    description: `Quotation ${q.number} edited${amountChanged ? ` – total ${before.grandTotal} → ${q.grandTotal}` : ''}`,
    before: { ...before, items: before.items?.map((i) => ({ d: i.description, q: i.quantity, p: i.unitPrice })) },
    after: { ...q.toObject(), items: q.items.map((i) => ({ d: i.description, q: i.quantity, p: i.unitPrice })) }
  });
  res.json({ success: true, data: q });
});

const duplicate = asyncHandler(async (req, res) => {
  const src = await load(req.params.id);
  const o = src.toObject();
  ['_id', 'number', 'createdAt', 'updatedAt', 'sentAt', 'viewedAt', 'respondedAt', 'revisions', 'viewToken', '__v'].forEach((k) => delete o[k]);
  const copy = new Quotation({ ...o, status: 'Draft', revision: 1, quotationDate: new Date(), createdBy: req.user._id });
  copy.expiryDate = new Date(Date.now() + 15 * 864e5);
  copy.number = await nextNumber('QT');
  copy.revisions = [{ revision: 1, by: req.user._id, byName: req.user.name, grandTotal: copy.grandTotal, note: `Duplicated from ${src.number}` }];
  await copy.save();
  await audit.record(req, { action: 'CREATE', module: 'quotation', recordId: copy._id, description: `Quotation ${copy.number} duplicated from ${src.number}` });
  res.status(201).json({ success: true, data: copy });
});

const remove = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  if (q.status === 'Accepted' && q.project) throw new AppError('Cannot delete an accepted quotation linked to a project', 409);
  q.isArchived = true;
  q.archivedAt = new Date();
  await q.save();
  await audit.record(req, { action: 'DELETE', module: 'quotation', recordId: q._id, description: `Quotation ${q.number} archived`, oldValues: { number: q.number, grandTotal: q.grandTotal, status: q.status } });
  res.json({ success: true, message: 'Quotation archived' });
});

const pdf = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  const buf = await quotationPdf(q);
  await audit.record(req, { action: 'EXPORT', module: 'quotation', recordId: q._id, description: `Quotation ${q.number} PDF downloaded` });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${q.number}.pdf"`, 'Cache-Control': 'private, no-store' });
  res.send(buf);
});

const send = asyncHandler(async (req, res) => {
  const q = await Quotation.findById(req.params.id).select('+viewToken');
  if (!q) throw new AppError('Quotation not found', 404);
  if (['Accepted'].includes(q.status)) throw new AppError('Quotation already accepted', 409);
  if (q.expiryDate < new Date()) throw new AppError('Quotation has expired. Extend the expiry date first.', 400);
  const target = q.clientSnapshot;
  if (!target?.email) throw new AppError('Recipient has no email address', 400);

  q.viewToken = q.viewToken || crypto.randomBytes(24).toString('hex');
  const buf = await quotationPdf(q);
  const viewUrl = `${config.clientUrl}/quotation/view/${q.viewToken}`;
  const result = await email.sendQuotationEmail(q, { contactPerson: target.contactPerson, email: target.email }, buf, viewUrl);
  if (!result.ok) {
    await audit.record(req, { action: 'EMAIL_FAILED', module: 'quotation', recordId: q._id, description: `Sending ${q.number} failed: ${result.error}` });
    throw new AppError(`Email could not be sent: ${result.error}`, 502);
  }
  q.status = 'Sent';
  q.sentAt = new Date();
  await q.save();
  if (q.lead) await Lead.updateOne({ _id: q.lead, status: { $in: ['New', 'Contacted', 'Discussion'] } }, { status: 'Quotation Sent' });
  await audit.record(req, { action: 'EMAIL_SENT', module: 'quotation', recordId: q._id, description: `Quotation ${q.number} emailed to ${target.email}` });
  res.json({ success: true, message: `Quotation sent to ${target.email}`, data: { status: q.status, sentAt: q.sentAt } });
});

/** Admin records the client's decision. */
const setStatus = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  const { status } = req.body;
  if (!['Accepted', 'Rejected', 'Draft', 'Sent'].includes(status)) throw new AppError('Invalid status', 400);
  if (q.status === 'Accepted' && status !== 'Accepted') throw new AppError('Accepted quotations cannot be reverted', 409);
  const before = { status: q.status };
  q.status = status;
  if (status === 'Accepted' || status === 'Rejected') q.respondedAt = new Date();
  await q.save();
  if (status === 'Accepted' && q.project) {
    await Project.findByIdAndUpdate(q.project, { acceptedAmount: q.grandTotal, quotationAmount: q.grandTotal, sourceQuotation: q._id });
    await refreshProject(q.project);
  }
  await audit.record(req, { action: 'STATUS_CHANGE', module: 'quotation', recordId: q._id, description: `Quotation ${q.number}: ${before.status} → ${status}`, oldValues: before, newValues: { status } });
  res.json({ success: true, data: q });
});

/** Accepted quotation -> new project (accepted amount = quotation grand total). */
const createProject = asyncHandler(async (req, res) => {
  const q = await load(req.params.id);
  if (q.status !== 'Accepted') throw new AppError('Only accepted quotations can create a project', 400);
  if (q.project) throw new AppError('A project is already linked to this quotation', 409);
  if (!q.client) throw new AppError('Convert the lead to a client first, then link the quotation to that client', 400);
  const p = await Project.create({
    projectId: await nextNumber('PRJ'),
    name: q.projectName,
    client: q.client,
    description: q.projectDescription,
    techStack: q.techStack,
    category: req.body.category || 'Other',
    quotationAmount: q.grandTotal,
    acceptedAmount: q.grandTotal,
    advanceAmount: q.advanceAmount,
    pendingBalance: q.grandTotal,
    sourceQuotation: q._id,
    team: [req.user._id],
    createdBy: req.user._id
  });
  q.project = p._id;
  await q.save();
  await audit.record(req, { action: 'CREATE', module: 'project', recordId: p._id, description: `Project ${p.projectId} created from quotation ${q.number}`, newValues: { name: p.name, acceptedAmount: p.acceptedAmount } });
  res.status(201).json({ success: true, data: p });
});

module.exports = { list, get, defaults, create, update, duplicate, remove, pdf, send, setStatus, createProject };
