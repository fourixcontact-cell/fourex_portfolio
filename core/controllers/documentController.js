const Document = require('../models/Document');
const Client = require('../models/Client');
const Project = require('../models/Project');
const storage = require('../services/storageService');
const { assertFilesValid } = require('../services/fileCheck');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { getPaging, pageMeta, searchFilter, assertObjectId } = require('../utils/helpers');

const list = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query, 20);
  const q = { isArchived: false };
  ['client', 'project', 'task'].forEach((k) => { if (req.query[k]) { assertObjectId(req.query[k], k); q[k] = req.query[k]; } });
  if (req.query.category) q.category = String(req.query.category);
  const s = searchFilter(req.query.search, ['originalName']);
  if (s) Object.assign(q, s);
  const [rows, total] = await Promise.all([
    Document.find(q).populate('client', 'company contactPerson').populate('project', 'name projectId').populate('uploadedBy', 'name').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Document.countDocuments(q)
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging) });
});

const upload = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw new AppError('Choose at least one file', 400);
  assertFilesValid(req.files);
  const { client, project, task, category, visibleToClient } = req.body;
  const cleanup = () => req.files.forEach((f) => storage.remove(f.filename));
  try {
    if (client) { assertObjectId(client, 'client'); if (!(await Client.exists({ _id: client }))) throw new AppError('Client not found', 404); }
    if (project) { assertObjectId(project, 'project'); if (!(await Project.exists({ _id: project }))) throw new AppError('Project not found', 404); }
    if (task) assertObjectId(task, 'task');
  } catch (e) { cleanup(); throw e; }

  const docs = [];
  for (const f of req.files) {
    const d = await Document.create({
      originalName: f.originalname.slice(0, 255), storageKey: f.filename, mimeType: f.mimetype, size: f.size,
      category: category || 'Other', client: client || undefined, project: project || undefined, task: task || undefined,
      visibleToClient: String(visibleToClient) === 'true', uploadedBy: req.user._id
    });
    docs.push(d);
    await audit.record(req, { action: 'UPLOAD', module: 'document', recordId: d._id, description: `Document uploaded: ${d.originalName}`, newValues: { name: d.originalName, category: d.category, size: d.size, project, client } });
  }
  res.status(201).json({ success: true, data: docs.map((d) => ({ _id: d._id, originalName: d.originalName, category: d.category, size: d.size })) });
});

const download = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const d = await Document.findById(req.params.id).select('+storageKey');
  if (!d || d.isArchived || !(await storage.exists(d.storageKey))) throw new AppError('File not found', 404);
  res.set({
    'Content-Type': d.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.originalName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  storage.pipeTo(d.storageKey, res);
});

const toggleVisibility = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const d = await Document.findById(req.params.id);
  if (!d) throw new AppError('Document not found', 404);
  const before = d.visibleToClient;
  d.visibleToClient = !!req.body.visibleToClient;
  await d.save();
  await audit.record(req, { action: 'UPDATE', module: 'document', recordId: d._id, description: `Client visibility of ${d.originalName}: ${before} → ${d.visibleToClient}` });
  res.json({ success: true, data: d });
});

/** Soft delete: file bytes are kept in Cloud Storage for recovery; the record disappears from the app. */
const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const d = await Document.findById(req.params.id);
  if (!d) throw new AppError('Document not found', 404);
  d.isArchived = true;
  d.archivedAt = new Date();
  await d.save();
  await audit.record(req, { action: 'DELETE', module: 'document', recordId: d._id, description: `Document deleted: ${d.originalName}`, oldValues: { name: d.originalName, category: d.category } });
  res.json({ success: true });
});

module.exports = { list, upload, download, toggleVisibility, remove };
