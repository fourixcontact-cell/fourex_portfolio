const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Project = require('../models/Project');
const User = require('../models/User');
const { nextNumber } = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = ['name', 'company', 'email', 'phone', 'country', 'service', 'budget', 'preferredContact', 'source', 'description', 'status', 'assignedTo', 'followUpDate', 'notes'];

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = { isArchived: req.query.archived === 'true' };
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.assignedTo) { assertObjectId(req.query.assignedTo); q.assignedTo = req.query.assignedTo; }
  if (req.query.source) q.source = String(req.query.source);
  const s = searchFilter(req.query.search, ['name', 'company', 'email', 'phone', 'service']);
  if (s) Object.assign(q, s);

  const [rows, total, counts] = await Promise.all([
    Lead.find(q).populate('assignedTo', 'name avatarColor').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Lead.countDocuments(q),
    Lead.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', n: { $sum: 1 } } }])
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
});

const get = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name email').populate('convertedClient', 'company contactPerson').populate('convertedProject', 'name projectId');
  if (!lead) throw new AppError('Lead not found', 404);
  res.json({ success: true, data: lead });
});

const create = asyncHandler(async (req, res) => {
  const lead = await Lead.create({ ...pick(req.body, EDITABLE), source: req.body.source || 'Manual', createdBy: req.user._id });
  await audit.record(req, { action: 'CREATE', module: 'lead', recordId: lead._id, description: `Lead created: ${lead.name}`, newValues: lead });
  res.status(201).json({ success: true, data: lead });
});

const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new AppError('Lead not found', 404);
  const before = lead.toObject();
  lead.set(pick(req.body, EDITABLE));
  await lead.save();
  await audit.recordUpdate(req, { module: 'lead', recordId: lead._id, description: `Lead updated: ${lead.name}`, before, after: lead.toObject() });
  res.json({ success: true, data: lead });
});

const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new AppError('Lead not found', 404);
  lead.isArchived = true;
  lead.archivedAt = new Date();
  await lead.save();
  await audit.record(req, { action: 'DELETE', module: 'lead', recordId: lead._id, description: `Lead archived: ${lead.name}`, oldValues: { name: lead.name, email: lead.email, status: lead.status } });
  res.json({ success: true, message: 'Lead archived' });
});

const addCommunication = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new AppError('Lead not found', 404);
  const summary = String(req.body.summary || '').trim();
  if (!summary) throw new AppError('Summary is required', 400);
  lead.communications.unshift({ type: req.body.type || 'note', summary: summary.slice(0, 2000), by: req.user._id, byName: req.user.name });
  if (lead.status === 'New') lead.status = 'Contacted';
  await lead.save();
  await audit.record(req, { action: 'UPDATE', module: 'lead', recordId: lead._id, description: `Communication logged on lead ${lead.name}`, newValues: { type: req.body.type, summary: summary.slice(0, 200) } });
  res.json({ success: true, data: lead });
});

/** Won lead -> Client (+ optional Project). Idempotent: cannot convert twice. */
const convert = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new AppError('Lead not found', 404);
  if (lead.status !== 'Won') throw new AppError('Only leads marked "Won" can be converted', 400);
  if (lead.convertedClient) throw new AppError('This lead has already been converted', 409);

  let client = await Client.findOne({ email: lead.email, isArchived: false });
  let createdClient = false;
  if (!client) {
    client = await Client.create({
      clientCode: await nextNumber('CL'),
      company: lead.company,
      contactPerson: lead.name,
      email: lead.email,
      phone: lead.phone,
      country: lead.country,
      clientType: lead.company ? 'SME' : 'Individual',
      sourceLead: lead._id,
      notes: lead.notes,
      createdBy: req.user._id
    });
    createdClient = true;
    await audit.record(req, { action: 'CREATE', module: 'client', recordId: client._id, description: `Client created from lead ${lead.name}`, newValues: client });
  }

  let project = null;
  if (req.body.createProject) {
    const p = req.body.project || {};
    project = await Project.create({
      projectId: await nextNumber('PRJ'),
      name: String(p.name || lead.service || `${lead.name} project`).slice(0, 160),
      client: client._id,
      category: p.category || 'Other',
      description: p.description || lead.description,
      acceptedAmount: Number(p.acceptedAmount) || 0,
      team: [req.user._id],
      sourceLead: lead._id,
      createdBy: req.user._id
    });
    await audit.record(req, { action: 'CREATE', module: 'project', recordId: project._id, description: `Project created from lead ${lead.name}`, newValues: project });
  }

  lead.convertedClient = client._id;
  if (project) lead.convertedProject = project._id;
  await lead.save();
  await audit.record(req, { action: 'CONVERT', module: 'lead', recordId: lead._id, description: `Lead converted to client${project ? ' and project' : ''}`, newValues: { client: client._id, project: project?._id, createdClient } });
  res.status(201).json({ success: true, data: { lead, client, project, createdClient } });
});

const adminsForAssign = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await User.find({ role: 'admin', isActive: true }).select('name email avatarColor adminSlot').sort({ adminSlot: 1 }) });
});

module.exports = { list, get, create, update, remove, addCommunication, convert, adminsForAssign };
