const Project = require('../models/Project');
const Client = require('../models/Client');
const { nextNumber } = require('../models/Counter');
const storage = require('../services/storageService');
const { certificatePdf } = require('../services/pdfService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { assertObjectId } = require('../utils/helpers');

async function loadEligible(id) {
  assertObjectId(id, 'project id');
  const p = await Project.findById(id);
  if (!p) throw new AppError('Project not found', 404);
  const client = await Client.findById(p.client);
  if (!client) throw new AppError('Client not found', 404);
  const problems = [];
  if (p.status !== 'Completed') problems.push('Project status must be Completed');
  if (!p.checklistComplete) problems.push('Handover checklist is not fully completed');
  if (!p.handoverConfirmed?.confirmed) problems.push('Handover has not been confirmed by an admin');
  return { p, client, problems };
}

/** Tells the UI whether the certificate button should be enabled and why not. */
const eligibility = asyncHandler(async (req, res) => {
  const { p, problems } = await loadEligible(req.params.id);
  res.json({ success: true, data: { eligible: problems.length === 0, problems, issued: !!p.certificate?.number, certificate: p.certificate?.number ? { number: p.certificate.number, issuedAt: p.certificate.issuedAt, regenerations: p.certificate.regenerations } : null } });
});

const preview = asyncHandler(async (req, res) => {
  const { p, client, problems } = await loadEligible(req.params.id);
  if (problems.length) throw new AppError(problems.join('. '), 400);
  const number = p.certificate?.number || 'PREVIEW-NOT-ISSUED';
  const buf = await certificatePdf({ project: p, client, number, issuedAt: p.certificate?.issuedAt || new Date() });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="certificate-preview.pdf"', 'Cache-Control': 'private, no-store' });
  res.send(buf);
});

const generate = asyncHandler(async (req, res) => {
  const { p, client, problems } = await loadEligible(req.params.id);
  if (problems.length) throw new AppError(problems.join('. '), 400);
  if (req.body.confirm !== true) throw new AppError('Authorised confirmation required to issue a certificate', 400);

  const already = !!p.certificate?.number;
  const regenerate = req.body.regenerate === true;
  if (already && !regenerate) throw new AppError('A certificate was already issued for this project. Re-download it, or regenerate with a reason.', 409);
  const reason = String(req.body.reason || '').trim();
  if (already && reason.length < 5) throw new AppError('Provide a reason (min 5 characters) to regenerate the certificate', 400);

  const number = p.certificate?.number || (await nextNumber('CERT'));
  const issuedAt = new Date();
  const buf = await certificatePdf({ project: p, client, number, issuedAt });
  const oldKey = p.certificate?.file;
  const key = await storage.saveBuffer(buf, '.pdf');

  p.certificate = { number, issuedAt, issuedBy: req.user._id, file: key, regenerations: (p.certificate?.regenerations || 0) + (already ? 1 : 0) };
  await p.save();
  if (oldKey) storage.remove(oldKey);

  await audit.record(req, {
    action: already ? 'CERTIFICATE_REGENERATED' : 'CERTIFICATE_GENERATED',
    module: 'certificate',
    recordId: p._id,
    description: `Completion certificate ${number} ${already ? 'regenerated' : 'issued'} for ${p.name}${already ? ` (reason: ${reason})` : ''}`,
    newValues: { number, issuedAt, project: p.projectId }
  });
  res.status(already ? 200 : 201).json({ success: true, data: { number, issuedAt } });
});

const download = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'project id');
  const p = await Project.findById(req.params.id);
  if (!p?.certificate?.file || !(await storage.exists(p.certificate.file))) throw new AppError('No certificate has been issued for this project', 404);
  await audit.record(req, { action: 'EXPORT', module: 'certificate', recordId: p._id, description: `Certificate ${p.certificate.number} downloaded` });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${p.certificate.number}.pdf"`, 'Cache-Control': 'private, no-store' });
  storage.pipeTo(p.certificate.file, res);
});

module.exports = { eligibility, preview, generate, download };
