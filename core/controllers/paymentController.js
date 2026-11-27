const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Project = require('../models/Project');
const Client = require('../models/Client');
const { nextNumber } = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { refreshProject, refreshInvoice } = require('../services/financeService');
const { receiptPdf } = require('../services/pdfService');
const email = require('../services/emailService');
const { getPaging, pageMeta, assertObjectId, pick, round2 } = require('../utils/helpers');

const EDITABLE = ['project', 'client', 'invoice', 'milestone', 'amount', 'paymentType', 'method', 'paidOn', 'reference', 'notes'];

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = {};
  ['project', 'client', 'invoice'].forEach((k) => { if (req.query[k]) { assertObjectId(req.query[k], k); q[k] = req.query[k]; } });
  if (req.query.method) q.method = String(req.query.method);
  if (req.query.type) q.paymentType = String(req.query.type);
  q.status = req.query.status || 'confirmed';
  if (req.query.status === 'all') delete q.status;
  if (req.query.from || req.query.to) {
    q.paidOn = {};
    if (req.query.from) q.paidOn.$gte = new Date(req.query.from);
    if (req.query.to) q.paidOn.$lte = new Date(req.query.to);
  }
  const [rows, total, sum] = await Promise.all([
    Payment.find(q).populate('client', 'company contactPerson').populate('project', 'name projectId').populate('invoice', 'number').populate('recordedBy', 'name').sort({ paidOn: -1 }).skip(paging.skip).limit(paging.limit),
    Payment.countDocuments(q),
    Payment.aggregate([{ $match: { ...q } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), total: sum[0]?.total || 0 });
});

/** Records money that has ACTUALLY been received. Never created automatically. */
const create = asyncHandler(async (req, res) => {
  const d = pick(req.body, EDITABLE);
  d.amount = round2(d.amount);
  if (!(d.amount > 0)) throw new AppError('Amount must be greater than zero', 400);
  if (new Date(d.paidOn) > new Date(Date.now() + 864e5)) throw new AppError('Payment date cannot be in the future', 400);

  let invoice = null;
  if (d.invoice) {
    assertObjectId(d.invoice, 'invoice');
    invoice = await Invoice.findById(d.invoice);
    if (!invoice || invoice.status === 'Cancelled') throw new AppError('Invoice not found or cancelled', 404);
    if (d.amount > invoice.balance + 0.001) throw new AppError(`Amount exceeds invoice balance (${invoice.balance})`, 400);
    d.client = invoice.client;
    d.project = invoice.project;
  }
  if (d.project) {
    assertObjectId(d.project, 'project');
    const p = await Project.findById(d.project);
    if (!p) throw new AppError('Project not found', 404);
    d.client = p.client;
  }
  if (!d.client && d.paymentType !== 'Other Income') throw new AppError('Select an invoice, a project or a client for this payment', 400);
  if (d.client && !(await Client.exists({ _id: d.client }))) throw new AppError('Client not found', 404);

  const pay = await Payment.create({ ...d, receiptNumber: await nextNumber('RC'), recordedBy: req.user._id });
  await Promise.all([refreshProject(pay.project), refreshInvoice(pay.invoice)]);
  await audit.record(req, {
    action: 'CREATE', module: 'payment', recordId: pay._id,
    description: `Payment ${pay.receiptNumber} of ${pay.amount} recorded (${pay.paymentType}, ${pay.method})`,
    newValues: { receiptNumber: pay.receiptNumber, amount: pay.amount, paymentType: pay.paymentType, method: pay.method, paidOn: pay.paidOn, project: pay.project, invoice: pay.invoice }
  });
  res.status(201).json({ success: true, data: pay });
});

/** Correct only descriptive fields; amount changes require void + re-entry so the audit trail stays honest. */
const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const pay = await Payment.findById(req.params.id);
  if (!pay) throw new AppError('Payment not found', 404);
  if (pay.status === 'voided') throw new AppError('Voided payments cannot be edited', 409);
  const before = pay.toObject();
  pay.set(pick(req.body, ['method', 'paidOn', 'reference', 'notes', 'paymentType']));
  await pay.save();
  await audit.recordUpdate(req, { module: 'payment', recordId: pay._id, description: `Payment ${pay.receiptNumber} updated`, before, after: pay.toObject() });
  res.json({ success: true, data: pay });
});

const voidPayment = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const pay = await Payment.findById(req.params.id);
  if (!pay) throw new AppError('Payment not found', 404);
  if (pay.status === 'voided') throw new AppError('Already voided', 409);
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) throw new AppError('Please give a reason (min 5 characters)', 400);
  pay.status = 'voided';
  pay.voidedAt = new Date();
  pay.voidedBy = req.user._id;
  pay.voidReason = reason.slice(0, 300);
  await pay.save();
  await Promise.all([refreshProject(pay.project), refreshInvoice(pay.invoice)]);
  await audit.record(req, { action: 'PAYMENT_VOIDED', module: 'payment', recordId: pay._id, description: `Payment ${pay.receiptNumber} (${pay.amount}) voided: ${pay.voidReason}`, oldValues: { status: 'confirmed', amount: pay.amount }, newValues: { status: 'voided' } });
  res.json({ success: true, data: pay });
});

async function receiptData(id) {
  assertObjectId(id);
  const pay = await Payment.findById(id).populate('project', 'name').populate('invoice', 'number');
  if (!pay) throw new AppError('Payment not found', 404);
  const client = pay.client ? await Client.findById(pay.client) : null;
  return { pay, client };
}

const receipt = asyncHandler(async (req, res) => {
  const { pay, client } = await receiptData(req.params.id);
  const buf = await receiptPdf(pay, client, { projectName: pay.project?.name, invoiceNumber: pay.invoice?.number });
  await audit.record(req, { action: 'EXPORT', module: 'payment', recordId: pay._id, description: `Receipt ${pay.receiptNumber} downloaded` });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${pay.receiptNumber}.pdf"`, 'Cache-Control': 'private, no-store' });
  res.send(buf);
});

const emailReceipt = asyncHandler(async (req, res) => {
  const { pay, client } = await receiptData(req.params.id);
  if (!client?.email) throw new AppError('Client has no email', 400);
  if (pay.status === 'voided') throw new AppError('Payment is voided', 409);
  const buf = await receiptPdf(pay, client, { projectName: pay.project?.name, invoiceNumber: pay.invoice?.number });
  const r = await email.sendReceiptEmail(pay, client, buf);
  if (!r.ok) throw new AppError(`Email could not be sent: ${r.error}`, 502);
  await audit.record(req, { action: 'EMAIL_SENT', module: 'payment', recordId: pay._id, description: `Receipt ${pay.receiptNumber} emailed to ${client.email}` });
  res.json({ success: true, message: `Receipt sent to ${client.email}` });
});

module.exports = { list, create, update, voidPayment, receipt, emailReceipt };
