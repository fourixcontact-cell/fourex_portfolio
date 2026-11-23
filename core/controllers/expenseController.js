const Expense = require('../models/Expense');
const Project = require('../models/Project');
const Document = require('../models/Document');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { assertFilesValid } = require('../services/fileCheck');
const { refreshProject } = require('../services/financeService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = ['project', 'category', 'title', 'description', 'amount', 'expenseDate', 'method', 'vendor', 'renewalDate', 'isRecurring', 'paidBy'];

function filters(query) {
  const q = { isArchived: false };
  if (query.project === 'company') q.project = null;
  else if (query.project) { assertObjectId(query.project, 'project'); q.project = query.project; }
  if (query.category) q.category = String(query.category);
  if (query.from || query.to) {
    q.expenseDate = {};
    if (query.from) q.expenseDate.$gte = new Date(query.from);
    if (query.to) q.expenseDate.$lte = new Date(query.to);
  }
  const s = searchFilter(query.search, ['title', 'vendor', 'description']);
  if (s) Object.assign(q, s);
  return q;
}

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query);
  const q = filters(req.query);
  const [rows, total, byCat, sum] = await Promise.all([
    Expense.find(q).populate('project', 'name projectId').populate('paidBy', 'name').sort({ expenseDate: -1 }).skip(paging.skip).limit(paging.limit),
    Expense.countDocuments(q),
    Expense.aggregate([{ $match: q }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    Expense.aggregate([{ $match: q }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), total: sum[0]?.total || 0, byCategory: byCat });
});

const create = asyncHandler(async (req, res) => {
  const d = pick(req.body, EDITABLE);
  if (d.project) {
    assertObjectId(d.project, 'project');
    if (!(await Project.exists({ _id: d.project }))) throw new AppError('Project not found', 404);
  } else {
    d.project = undefined; // company-wide expense
  }
  const e = await Expense.create({ ...d, paidBy: d.paidBy || req.user._id, createdBy: req.user._id });
  await refreshProject(e.project);
  await audit.record(req, { action: 'CREATE', module: 'expense', recordId: e._id, description: `Expense "${e.title}" ${e.amount} (${e.category})`, newValues: { title: e.title, amount: e.amount, category: e.category, project: e.project } });
  res.status(201).json({ success: true, data: e });
});

const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const e = await Expense.findById(req.params.id);
  if (!e) throw new AppError('Expense not found', 404);
  const before = e.toObject();
  const oldProject = e.project;
  const d = pick(req.body, EDITABLE);
  if (d.project === '' || d.project === null) d.project = undefined;
  e.set(d);
  await e.save();
  await Promise.all([refreshProject(oldProject), refreshProject(e.project)]);
  await audit.recordUpdate(req, { module: 'expense', recordId: e._id, description: `Expense "${e.title}" edited`, before, after: e.toObject() });
  res.json({ success: true, data: e });
});

const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const e = await Expense.findById(req.params.id);
  if (!e) throw new AppError('Expense not found', 404);
  e.isArchived = true;
  e.archivedAt = new Date();
  await e.save();
  await refreshProject(e.project);
  await audit.record(req, { action: 'DELETE', module: 'expense', recordId: e._id, description: `Expense "${e.title}" (${e.amount}) removed`, oldValues: { title: e.title, amount: e.amount, category: e.category } });
  res.json({ success: true });
});

const uploadReceipt = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const e = await Expense.findById(req.params.id);
  if (!e) throw new AppError('Expense not found', 404);
  if (!req.file) throw new AppError('Choose a file to upload', 400);
  assertFilesValid([req.file]);
  const doc = await Document.create({
    originalName: req.file.originalname.slice(0, 255),
    storageKey: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    category: 'Expense Receipt',
    project: e.project,
    uploadedBy: req.user._id
  });
  e.receipt = doc._id;
  await e.save();
  await audit.record(req, { action: 'UPLOAD', module: 'document', recordId: doc._id, description: `Receipt uploaded for expense "${e.title}"`, newValues: { name: doc.originalName, size: doc.size } });
  res.status(201).json({ success: true, data: { id: doc._id, name: doc.originalName } });
});

const CATEGORIES = (req, res) => res.json({ success: true, data: Expense.CATEGORIES });

module.exports = { list, create, update, remove, uploadReceipt, CATEGORIES, filters };
