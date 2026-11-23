const Project = require('../models/Project');
const Client = require('../models/Client');
const Task = require('../models/Task');
const Milestone = require('../models/Milestone');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');
const { nextNumber } = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { refreshProject } = require('../services/financeService');
const { notify } = require('../services/notificationService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = [
  'name', 'client', 'category', 'description', 'techStack', 'quotationAmount', 'acceptedAmount', 'advanceAmount',
  'startDate', 'expectedDeadline', 'status', 'progress', 'team', 'githubUrl', 'liveUrl', 'internalNotes'
];

async function load(id) {
  assertObjectId(id, 'project id');
  const p = await Project.findById(id);
  if (!p) throw new AppError('Project not found', 404);
  return p;
}

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = { isArchived: req.query.archived === 'true' };
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.client) { assertObjectId(req.query.client); q.client = req.query.client; }
  if (req.query.category) q.category = String(req.query.category);
  if (req.query.team) { assertObjectId(req.query.team); q.team = req.query.team; }
  const s = searchFilter(req.query.search, ['name', 'projectId']);
  if (s) Object.assign(q, s);
  const [rows, total] = await Promise.all([
    Project.find(q).populate('client', 'company contactPerson').populate('team', 'name avatarColor').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Project.countDocuments(q)
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging) });
});

const get = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  await p.populate([{ path: 'client' }, { path: 'team', select: 'name email avatarColor' }, { path: 'contributions.admin', select: 'name' }]);
  const [tasks, milestones, quotations, invoices, payments, expenses, documents, activity] = await Promise.all([
    Task.find({ project: p._id }).populate('assignedTo', 'name avatarColor').sort({ order: 1, createdAt: 1 }),
    Milestone.find({ project: p._id }).sort({ order: 1, dueDate: 1 }),
    Quotation.find({ project: p._id, isArchived: false }).select('number grandTotal status expiryDate'),
    Invoice.find({ project: p._id, isArchived: false }).select('number total amountPaid balance status dueDate'),
    Payment.find({ project: p._id }).sort({ paidOn: -1 }),
    Expense.find({ project: p._id, isArchived: false }).sort({ expenseDate: -1 }),
    Document.find({ project: p._id, isArchived: false }).select('originalName category size createdAt visibleToClient'),
    AuditLog.find({ $or: [{ module: 'project', recordId: String(p._id) }, { module: 'task', 'newValues.project': String(p._id) }] }).sort({ createdAt: -1 }).limit(40)
  ]);
  res.json({
    success: true,
    data: { project: p, tasks, milestones, quotations, invoices, payments, expenses, documents, activity, checklistComplete: p.checklistComplete }
  });
});

const create = asyncHandler(async (req, res) => {
  assertObjectId(req.body.client, 'client');
  if (!(await Client.exists({ _id: req.body.client, isArchived: false }))) throw new AppError('Client not found', 404);
  const data = pick(req.body, EDITABLE);
  // Money fields that are derived can never be set by the caller.
  const p = await Project.create({ ...data, projectId: await nextNumber('PRJ'), team: data.team?.length ? data.team : [req.user._id], createdBy: req.user._id });
  await refreshProject(p._id);
  await audit.record(req, { action: 'CREATE', module: 'project', recordId: p._id, description: `Project created: ${p.name} (${p.projectId})`, newValues: p });
  res.status(201).json({ success: true, data: p });
});

const update = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const before = p.toObject();
  const data = pick(req.body, EDITABLE);

  if (data.status && data.status !== p.status) {
    if (data.status === 'Completed') {
      // Completion requires the handover checklist; certificate is a separate, explicit step.
      if (!p.checklistComplete) throw new AppError('Complete the handover checklist before marking the project as Completed', 400);
      data.progress = 100;
      p.completionDate = p.completionDate || new Date();
    }
    if (data.status === 'Cancelled' || data.status === 'Completed') {
      // nothing else; pendingBalance remains visible separately
    }
  }
  if (data.client) {
    assertObjectId(data.client, 'client');
    if (!(await Client.exists({ _id: data.client }))) throw new AppError('Client not found', 404);
  }
  p.set(data);
  await p.save();
  await refreshProject(p._id);

  const fresh = await Project.findById(p._id);
  const statusChanged = before.status !== fresh.status;
  await audit.recordUpdate(req, {
    module: 'project',
    recordId: p._id,
    action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    description: statusChanged ? `Project ${p.projectId} status: ${before.status} → ${fresh.status}` : `Project updated: ${p.name}`,
    before,
    after: fresh.toObject()
  });
  if (statusChanged && fresh.status === 'Completed') {
    await notify({ type: 'project_completed', title: `Project completed: ${fresh.name}`, link: `/crm/projects/${fresh._id}`, dedupeKey: `done:${fresh._id}` });
  }
  res.json({ success: true, data: fresh });
});

const remove = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  p.isArchived = true;
  p.archivedAt = new Date();
  p.portfolio.visible = false;
  await p.save();
  await audit.record(req, { action: 'DELETE', module: 'project', recordId: p._id, description: `Project archived: ${p.name}`, oldValues: { name: p.name, status: p.status, received: p.amountReceived } });
  res.json({ success: true, message: 'Project archived (financial history preserved)' });
});

/* ---------- Portfolio visibility ---------- */
const setPortfolio = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const before = p.portfolio.toObject();
  const f = pick(req.body, ['visible', 'title', 'summary', 'caseStudy', 'coverImage', 'screenshots', 'featured', 'clientDisplayName']);
  if (Array.isArray(f.screenshots)) f.screenshots = f.screenshots.map((u) => String(u).trim()).filter((u) => /^https?:\/\/[^\s]+$/i.test(u)).slice(0, 12);
  if (f.visible && !(f.summary || p.portfolio.summary)) throw new AppError('Add a public summary before showing this project publicly', 400);
  Object.assign(p.portfolio, f);
  await p.save();
  const visibilityChanged = before.visible !== p.portfolio.visible;
  await audit.record(req, {
    action: visibilityChanged ? 'PORTFOLIO_VISIBILITY' : 'UPDATE',
    module: 'project',
    recordId: p._id,
    description: visibilityChanged ? `Portfolio visibility ${p.portfolio.visible ? 'ON' : 'OFF'} for ${p.name}` : `Portfolio content edited for ${p.name}`,
    oldValues: before,
    newValues: p.portfolio.toObject()
  });
  res.json({ success: true, data: p.portfolio });
});

/* ---------- Handover checklist ---------- */
const toggleChecklist = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const item = p.handoverChecklist.id(req.params.itemId);
  if (!item) throw new AppError('Checklist item not found', 404);
  item.done = !!req.body.done;
  item.doneBy = item.done ? req.user._id : undefined;
  item.doneAt = item.done ? new Date() : undefined;
  if (!p.checklistComplete) p.handoverConfirmed = { confirmed: false };
  await p.save();
  await audit.record(req, { action: 'UPDATE', module: 'project', recordId: p._id, description: `Handover item "${item.label}" ${item.done ? 'completed' : 'reopened'}` });
  res.json({ success: true, data: p.handoverChecklist, checklistComplete: p.checklistComplete });
});

const addChecklistItem = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const label = String(req.body.label || '').trim();
  if (!label) throw new AppError('Label required', 400);
  p.handoverChecklist.push({ label: label.slice(0, 200) });
  await p.save();
  res.json({ success: true, data: p.handoverChecklist });
});

/** Explicit authorised confirmation that handover is finished (precondition for the certificate). */
const confirmHandover = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  if (!p.checklistComplete) throw new AppError('All handover checklist items must be completed first', 400);
  if (p.status !== 'Completed') throw new AppError('Project status must be Completed', 400);
  p.handoverConfirmed = { confirmed: true, by: req.user._id, at: new Date() };
  await p.save();
  await audit.record(req, { action: 'HANDOVER_CONFIRMED', module: 'project', recordId: p._id, description: `${req.user.name} confirmed handover for ${p.name}` });
  res.json({ success: true, data: p.handoverConfirmed });
});

/* ---------- Change requests / feedback / contributions ---------- */
const addChangeRequest = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const cr = pick(req.body, ['title', 'description', 'estimatedCost']);
  if (!cr.title) throw new AppError('Title required', 400);
  p.changeRequests.push({ ...cr, requestedBy: 'admin', requesterName: req.user.name });
  await p.save();
  await audit.record(req, { action: 'CREATE', module: 'change-request', recordId: p._id, description: `Change request added on ${p.name}: ${cr.title}` });
  res.status(201).json({ success: true, data: p.changeRequests });
});

const decideChangeRequest = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const cr = p.changeRequests.id(req.params.crId);
  if (!cr) throw new AppError('Change request not found', 404);
  const { status, decisionNote, estimatedCost } = req.body;
  if (!['Pending', 'Approved', 'Rejected', 'Implemented'].includes(status)) throw new AppError('Invalid status', 400);
  const before = cr.toObject();
  cr.status = status;
  cr.decisionNote = decisionNote;
  if (estimatedCost !== undefined) cr.estimatedCost = Number(estimatedCost) || 0;
  cr.decidedAt = new Date();
  await p.save();
  await audit.recordUpdate(req, { module: 'change-request', recordId: p._id, description: `Change request "${cr.title}" → ${status}`, before, after: cr.toObject() });
  res.json({ success: true, data: p.changeRequests });
});

const addFeedback = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const message = String(req.body.message || '').trim();
  if (!message) throw new AppError('Message required', 400);
  p.feedback.push({ rating: req.body.rating, message: message.slice(0, 4000), from: 'admin', authorName: req.user.name });
  await p.save();
  res.status(201).json({ success: true, data: p.feedback });
});

const addContribution = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const c = pick(req.body, ['admin', 'area', 'hours', 'note']);
  assertObjectId(c.admin, 'admin');
  p.contributions.push(c);
  await p.save();
  await audit.record(req, { action: 'CREATE', module: 'contribution', recordId: p._id, description: `Contribution logged on ${p.name} (${c.area})`, newValues: c });
  res.status(201).json({ success: true, data: p.contributions });
});

/* ---------- Milestones ---------- */
const listMilestones = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  res.json({ success: true, data: await Milestone.find({ project: req.params.id }).sort({ order: 1, dueDate: 1 }) });
});

const createMilestone = asyncHandler(async (req, res) => {
  const p = await load(req.params.id);
  const m = await Milestone.create({ ...pick(req.body, ['name', 'description', 'dueDate', 'paymentAmount', 'order']), project: p._id, createdBy: req.user._id });
  await audit.record(req, { action: 'CREATE', module: 'milestone', recordId: m._id, description: `Milestone "${m.name}" added to ${p.name}`, newValues: m });
  res.status(201).json({ success: true, data: m });
});

const updateMilestone = asyncHandler(async (req, res) => {
  assertObjectId(req.params.mid);
  const m = await Milestone.findOne({ _id: req.params.mid, project: req.params.id });
  if (!m) throw new AppError('Milestone not found', 404);
  const before = m.toObject();
  m.set(pick(req.body, ['name', 'description', 'dueDate', 'paymentAmount', 'status', 'order']));
  if (m.status === 'Completed' && !m.completedAt) m.completedAt = new Date();
  if (m.status !== 'Completed') m.completedAt = undefined;
  await m.save();
  await audit.recordUpdate(req, { module: 'milestone', recordId: m._id, description: `Milestone updated: ${m.name}`, before, after: m.toObject() });
  res.json({ success: true, data: m });
});

const deleteMilestone = asyncHandler(async (req, res) => {
  assertObjectId(req.params.mid);
  const m = await Milestone.findOneAndDelete({ _id: req.params.mid, project: req.params.id });
  if (!m) throw new AppError('Milestone not found', 404);
  await audit.record(req, { action: 'DELETE', module: 'milestone', recordId: m._id, description: `Milestone deleted: ${m.name}`, oldValues: m });
  res.json({ success: true });
});

module.exports = {
  list, get, create, update, remove, setPortfolio, toggleChecklist, addChecklistItem, confirmHandover,
  addChangeRequest, decideChangeRequest, addFeedback, addContribution,
  listMilestones, createMilestone, updateMilestone, deleteMilestone, load
};
