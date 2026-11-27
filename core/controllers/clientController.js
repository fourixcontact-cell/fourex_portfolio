const crypto = require('../lib/crypto');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Document = require('../models/Document');
const User = require('../models/User');
const Session = require('../models/Session');
const { nextNumber } = require('../models/Counter');
const { rt } = require('../runtime');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { sumConfirmed } = require('../services/financeService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = ['company', 'contactPerson', 'email', 'phone', 'address', 'city', 'state', 'country', 'gstin', 'clientType', 'notes'];

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = { isArchived: req.query.archived === 'true' };
  if (req.query.type) q.clientType = String(req.query.type);
  if (req.query.country) q.country = String(req.query.country);
  const s = searchFilter(req.query.search, ['company', 'contactPerson', 'email', 'phone', 'clientCode']);
  if (s) Object.assign(q, s);
  const [rows, total] = await Promise.all([
    Client.find(q).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    Client.countDocuments(q)
  ]);
  // Project counts for the table in one query
  const counts = await Project.aggregate([{ $match: { client: { $in: rows.map((r) => r._id) }, isArchived: false } }, { $group: { _id: '$client', n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({ success: true, data: rows.map((r) => ({ ...r, projectCount: map[String(r._id)] || 0 })), meta: pageMeta(total, paging) });
});

const get = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const client = await Client.findById(req.params.id).populate('portalUser', 'email isActive lastLoginAt');
  if (!client) throw new AppError('Client not found', 404);
  const [projects, quotations, invoices, payments, documents, received] = await Promise.all([
    Project.find({ client: client._id, isArchived: false }).select('projectId name status progress acceptedAmount amountReceived pendingBalance expectedDeadline').sort({ createdAt: -1 }),
    Quotation.find({ client: client._id, isArchived: false }).select('number projectName grandTotal status expiryDate').sort({ createdAt: -1 }),
    Invoice.find({ client: client._id, isArchived: false }).select('number total amountPaid balance status dueDate').sort({ createdAt: -1 }),
    Payment.find({ client: client._id }).select('receiptNumber amount paidOn method paymentType status').sort({ paidOn: -1 }).limit(50),
    Document.find({ client: client._id, isArchived: false }).select('originalName category size createdAt').sort({ createdAt: -1 }),
    sumConfirmed({ client: client._id })
  ]);
  const invoiced = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.total, 0);
  res.json({
    success: true,
    data: { client, projects, quotations, invoices, payments, documents, totals: { received, invoiced, outstanding: Math.max(0, invoiced - received) } }
  });
});

const create = asyncHandler(async (req, res) => {
  const exists = await Client.findOne({ email: String(req.body.email).toLowerCase(), isArchived: false });
  if (exists) throw new AppError('A client with this email already exists', 409);
  const client = await Client.create({ ...pick(req.body, EDITABLE), clientCode: await nextNumber('CL'), createdBy: req.user._id });
  await audit.record(req, { action: 'CREATE', module: 'client', recordId: client._id, description: `Client created: ${client.company || client.contactPerson}`, newValues: client });
  res.status(201).json({ success: true, data: client });
});

const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const client = await Client.findById(req.params.id);
  if (!client) throw new AppError('Client not found', 404);
  const before = client.toObject();
  client.set(pick(req.body, EDITABLE));
  await client.save();
  await audit.recordUpdate(req, { module: 'client', recordId: client._id, description: `Client updated: ${client.company || client.contactPerson}`, before, after: client.toObject() });
  res.json({ success: true, data: client });
});

const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const client = await Client.findById(req.params.id);
  if (!client) throw new AppError('Client not found', 404);
  const active = await Project.countDocuments({ client: client._id, isArchived: false, status: { $nin: ['Completed', 'Cancelled'] } });
  if (active) throw new AppError(`Cannot archive: client has ${active} active project(s)`, 409);
  client.isArchived = true;
  client.archivedAt = new Date();
  await client.save();
  if (client.portalUser) {
    await User.updateOne({ _id: client.portalUser }, { isActive: false });
    await Session.updateMany({ user: client.portalUser, revokedAt: { $exists: false } }, { revokedAt: new Date(), endReason: 'forced', revokedBy: req.user._id });
    // The portal account is now inactive: firestore.rules refuse it every read.
  }
  await audit.record(req, { action: 'DELETE', module: 'client', recordId: client._id, description: `Client archived: ${client.company || client.contactPerson}`, oldValues: { company: client.company, email: client.email } });
  res.json({ success: true, message: 'Client archived' });
});

/**
 * Create the client's portal login (temporary password shown ONCE), or, for an existing
 * login, send Firebase's password-reset email so the client chooses a new password.
 */
const portalAccess = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const client = await Client.findById(req.params.id);
  if (!client) throw new AppError('Client not found', 404);

  let user = client.portalUser ? await User.findById(client.portalUser) : null;
  if (user) {
    try { await rt.authApi.sendPasswordReset(user.email); } catch (e) {
      throw new AppError(`Could not send the reset email: ${e.message}`, 502);
    }
    if (!user.isActive) { user.isActive = true; await user.save(); }
    await audit.record(req, { action: 'PASSWORD_RESET', module: 'portal-access', recordId: user._id, description: `Portal password reset email sent to ${client.contactPerson}` });
    return res.json({ success: true, data: { email: user.email, temporaryPassword: null, resetEmailSent: true }, message: `A password-reset email was sent to ${user.email}. The client sets a new password from that email.` });
  }

  if (await User.findOne({ email: client.email })) throw new AppError('This email is already used by another account', 409);
  const temp = `${crypto.randomBytes(6).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}aA9`; // always satisfies the password policy
  let uid;
  try {
    uid = await rt.authApi.createPortalUser(client.email, temp, client.contactPerson);
  } catch (e) {
    if (String(e.code) === 'auth/email-already-in-use') throw new AppError('This email already has a sign-in account. Use a different email for the client, or delete that user in Firebase → Authentication.', 409);
    throw new AppError(`Could not create the portal login: ${e.message}`, 502);
  }
  user = await User.create({ _id: uid, name: client.contactPerson, email: client.email, role: 'client', clientId: client._id, isActive: true });
  client.portalUser = user._id;
  await client.save();
  await audit.record(req, { action: 'CREATE', module: 'portal-access', recordId: user._id, description: `Portal access created for ${client.contactPerson}` });
  res.json({ success: true, data: { email: user.email, temporaryPassword: temp }, message: 'Share this temporary password securely. It will not be shown again.' });
});

module.exports = { list, get, create, update, remove, portalAccess };
