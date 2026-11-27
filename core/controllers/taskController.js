const Task = require('../models/Task');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

const EDITABLE = ['title', 'description', 'assignedTo', 'priority', 'dueDate', 'status', 'milestone', 'area', 'order'];

const list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.project) { assertObjectId(req.query.project); q.project = req.query.project; }
  if (req.query.assignedTo) { assertObjectId(req.query.assignedTo); q.assignedTo = req.query.assignedTo; }
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.priority) q.priority = String(req.query.priority);
  if (req.query.overdue === 'true') { q.status = { $ne: 'Completed' }; q.dueDate = { $lt: new Date() }; }
  const s = searchFilter(req.query.search, ['title', 'description']);
  if (s) Object.assign(q, s);

  // Kanban wants everything for a project; a global list is paginated.
  if (req.query.board === 'true') {
    const rows = await Task.find(q).populate('assignedTo', 'name avatarColor').populate('project', 'name projectId').sort({ order: 1, createdAt: 1 }).limit(500);
    return res.json({ success: true, data: rows });
  }
  const paging = getPaging(req.query, 20);
  const [rows, total] = await Promise.all([
    Task.find(q).populate('assignedTo', 'name avatarColor').populate('project', 'name projectId').sort({ dueDate: 1, createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Task.countDocuments(q)
  ]);
  return res.json({ success: true, data: rows, meta: pageMeta(total, paging) });
});

async function recalcProgress(projectId) {
  const [total, done] = await Promise.all([Task.countDocuments({ project: projectId }), Task.countDocuments({ project: projectId, status: 'Completed' })]);
  if (total) await Project.findByIdAndUpdate(projectId, { progress: Math.round((done / total) * 100) });
}

const create = asyncHandler(async (req, res) => {
  assertObjectId(req.body.project, 'project');
  if (!(await Project.exists({ _id: req.body.project, isArchived: false }))) throw new AppError('Project not found', 404);
  const t = await Task.create({ ...pick(req.body, EDITABLE), project: req.body.project, createdBy: req.user._id });
  await recalcProgress(t.project);
  await audit.record(req, { action: 'CREATE', module: 'task', recordId: t._id, description: `Task created: ${t.title}`, newValues: { title: t.title, project: String(t.project), assignedTo: t.assignedTo, priority: t.priority, status: t.status } });
  res.status(201).json({ success: true, data: t });
});

const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const t = await Task.findById(req.params.id);
  if (!t) throw new AppError('Task not found', 404);
  const before = t.toObject();
  t.set(pick(req.body, EDITABLE));
  if (t.status === 'Completed' && !before.completedAt) { t.completedAt = new Date(); t.completedBy = req.user._id; }
  if (t.status !== 'Completed') { t.completedAt = undefined; t.completedBy = undefined; }
  await t.save();
  await recalcProgress(t.project);
  await audit.recordUpdate(req, {
    module: 'task',
    recordId: t._id,
    action: before.status !== t.status ? 'STATUS_CHANGE' : String(before.assignedTo) !== String(t.assignedTo) ? 'ASSIGN' : 'UPDATE',
    description: `Task updated: ${t.title}`,
    before,
    after: t.toObject()
  });
  res.json({ success: true, data: t });
});

const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const t = await Task.findByIdAndDelete(req.params.id);
  if (!t) throw new AppError('Task not found', 404);
  await recalcProgress(t.project);
  await audit.record(req, { action: 'DELETE', module: 'task', recordId: t._id, description: `Task deleted: ${t.title}`, oldValues: { title: t.title, project: String(t.project), status: t.status } });
  res.json({ success: true });
});

const addComment = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const t = await Task.findById(req.params.id);
  if (!t) throw new AppError('Task not found', 404);
  const text = String(req.body.text || '').trim();
  if (!text) throw new AppError('Comment text required', 400);
  t.comments.push({ by: req.user._id, byName: req.user.name, text: text.slice(0, 2000) });
  await t.save();
  res.status(201).json({ success: true, data: t.comments });
});

module.exports = { list, create, update, remove, addComment };
