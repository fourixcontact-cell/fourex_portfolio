const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { nextNumber } = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { calcTotals, refreshInvoice } = require('../services/financeService');
const { invoicePdf } = require('../services/pdfService');
const email = require('../services/emailService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = ['client', 'project', 'quotation', 'invoiceType', 'invoiceDate', 'dueDate', 'items', 'discountAmount', 'taxName', 'taxRate', 'notes', 'paymentInstructions', 'showInPortal'];

const snapshot = (c) => ({ company: c.company, contactPerson: c.contactPerson, email: c.email, phone: c.phone, address: [c.address, c.city, c.state].filter(Boolean).join(', '), country: c.country, gstin: c.gstin });

async function load(id) {
  assertObjectId(id, 'invoice id');
  const inv = await Invoice.findById(id);
  if (!inv) throw new AppError('Invoice not found', 404);
  return inv;
}

async function prepare(inv) {
  const client = await Client.findById(inv.client);
  if (!client) throw new AppError('Client not found', 404);
  inv.clientSnapshot = snapshot(client);
  if (inv.project) {
    const p = await Project.findById(inv.project);
    if (!p) throw new AppError('Project not found', 404);
    if (String(p.client) !== String(inv.client)) throw new AppError('Project does not belong to the selected client', 400);
    inv.projectName = p.name;
  }
  const t = calcTotals({ items: inv.items, discountType: 'flat', discountValue: inv.discountAmount, taxRate: inv.taxRate });
  inv.items = t.items;
  inv.subtotal = t.subtotal;
  inv.discountAmount = t.discountAmount;
  inv.taxAmount = t.taxAmount;
  inv.total = t.grandTotal;
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
    Invoice.find(q).populate('client', 'company contactPerson').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Invoice.countDocuments(q),
    Invoice.aggregate([{ $match: { isArchived: false, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, invoiced: { $sum: '$total' }, paid: { $sum: '$amountPaid' }, balance: { $sum: '$balance' } } }])
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), summary: agg[0] || { invoiced: 0, paid: 0, balance: 0 } });
});

const get = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  const payments = await Payment.find({ invoice: inv._id }).sort({ paidOn: -1 });
  res.json({ success: true, data: { invoice: inv, payments } });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, EDITABLE);
  // Pre-fill from an accepted quotation if asked.
  if (req.body.fromQuotation) {
    assertObjectId(req.body.fromQuotation, 'quotation');
    const q = await Quotation.findById(req.body.fromQuotation);
    if (!q || !q.client) throw new AppError('Quotation not found or not linked to a client', 400);
    body.client = q.client;
    body.project = q.project;
    body.quotation = q._id;
    body.taxName = q.taxName;
    body.taxRate = q.taxRate;
    if (!body.items?.length) {
      const pct = Number(req.body.percentOfQuotation) || 100;
      body.items = q.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: Math.round(i.unitPrice * pct) / 100 }));
      body.discountAmount = Math.round(q.discountAmount * pct) / 100;
    }
  }
  const s = (await Settings.findOne({ key: 'agency' }).lean()) || {};
  const inv = new Invoice({ ...body, createdBy: req.user._id });
  if (!inv.dueDate) inv.dueDate = new Date(Date.now() + (s.invoiceDueDays || 7) * 864e5);
  if (!inv.paymentInstructions) inv.paymentInstructions = s.bankDetails;
  await prepare(inv);
  inv.number = await nextNumber('INV');
  inv.balance = inv.total;
  await inv.save();
  await audit.record(req, { action: 'CREATE', module: 'invoice', recordId: inv._id, description: `Invoice ${inv.number} created (${inv.total})`, newValues: { number: inv.number, total: inv.total, client: String(inv.client), project: inv.project ? String(inv.project) : undefined } });
  res.status(201).json({ success: true, data: inv });
});

const update = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  if (inv.status === 'Cancelled') throw new AppError('Cancelled invoices cannot be edited', 409);
  const before = inv.toObject();
  inv.set(pick(req.body, EDITABLE));
  await prepare(inv);
  if (inv.total < inv.amountPaid) throw new AppError('Invoice total cannot be lower than the amount already paid', 400);
  await inv.save();
  await refreshInvoice(inv._id);
  const fresh = await Invoice.findById(inv._id);
  await audit.recordUpdate(req, {
    module: 'invoice',
    recordId: inv._id,
    action: 'INVOICE_MODIFIED',
    description: `Invoice ${inv.number} modified`,
    before: { ...before, items: before.items?.map((i) => ({ d: i.description, q: i.quantity, p: i.unitPrice })) },
    after: { ...fresh.toObject(), items: fresh.items.map((i) => ({ d: i.description, q: i.quantity, p: i.unitPrice })) }
  });
  res.json({ success: true, data: fresh });
});

const cancel = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  if (inv.amountPaid > 0) throw new AppError('Invoice has confirmed payments. Void those payments first.', 409);
  const before = { status: inv.status };
  inv.status = 'Cancelled';
  await inv.save();
  await audit.record(req, { action: 'INVOICE_MODIFIED', module: 'invoice', recordId: inv._id, description: `Invoice ${inv.number} cancelled`, oldValues: before, newValues: { status: 'Cancelled' } });
  res.json({ success: true, data: inv });
});

const remove = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  if (inv.amountPaid > 0) throw new AppError('Cannot delete an invoice with payments. Cancel it after voiding payments.', 409);
  inv.isArchived = true;
  inv.archivedAt = new Date();
  await inv.save();
  await audit.record(req, { action: 'DELETE', module: 'invoice', recordId: inv._id, description: `Invoice ${inv.number} archived`, oldValues: { number: inv.number, total: inv.total } });
  res.json({ success: true });
});

const pdf = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  const payments = await Payment.find({ invoice: inv._id }).sort({ paidOn: 1 });
  const buf = await invoicePdf(inv, payments);
  await audit.record(req, { action: 'EXPORT', module: 'invoice', recordId: inv._id, description: `Invoice ${inv.number} PDF downloaded` });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${inv.number}.pdf"`, 'Cache-Control': 'private, no-store' });
  res.send(buf);
});

const sendOrRemind = (reminder) =>
  asyncHandler(async (req, res) => {
    const inv = await load(req.params.id);
    if (inv.status === 'Cancelled') throw new AppError('Invoice is cancelled', 409);
    if (reminder && inv.balance <= 0) throw new AppError('Nothing outstanding on this invoice', 400);
    const to = inv.clientSnapshot?.email;
    if (!to) throw new AppError('Client has no email address', 400);
    const payments = await Payment.find({ invoice: inv._id }).sort({ paidOn: 1 });
    const buf = await invoicePdf(inv, payments);
    const result = await email.sendInvoiceEmail(inv, inv.clientSnapshot, buf, reminder);
    if (!result.ok) {
      await audit.record(req, { action: 'EMAIL_FAILED', module: 'invoice', recordId: inv._id, description: `Email for ${inv.number} failed: ${result.error}` });
      throw new AppError(`Email could not be sent: ${result.error}`, 502);
    }
    if (reminder) { inv.lastReminderAt = new Date(); inv.reminderCount += 1; } else { inv.sentAt = new Date(); if (inv.status === 'Draft') inv.status = 'Sent'; }
    await inv.save();
    await refreshInvoice(inv._id);
    await audit.record(req, { action: 'EMAIL_SENT', module: 'invoice', recordId: inv._id, description: `${reminder ? 'Payment reminder' : 'Invoice'} ${inv.number} emailed to ${to}` });
    res.json({ success: true, message: `${reminder ? 'Reminder' : 'Invoice'} sent to ${to}` });
  });

/** Invoice delivered outside the app (WhatsApp, hand, email client) or Resend is down: move Draft -> Sent without emailing. */
const markSent = asyncHandler(async (req, res) => {
  const inv = await load(req.params.id);
  if (inv.status !== 'Draft') throw new AppError('Only draft invoices can be marked as sent', 409);
  inv.status = 'Sent'; inv.sentAt = new Date();
  await inv.save();
  await refreshInvoice(inv._id);
  await audit.record(req, { action: 'STATUS_CHANGE', module: 'invoice', recordId: inv._id, description: `${inv.number} marked as sent manually (no email)`, oldValues: { status: 'Draft' }, newValues: { status: 'Sent' } });
  res.json({ success: true, message: `${inv.number} marked as sent` });
});

module.exports = { list, get, create, update, cancel, remove, pdf, markSent, send: sendOrRemind(false), remind: sendOrRemind(true) };
