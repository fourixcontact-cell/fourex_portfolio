const { db } = require('../db/firebase');
const storage = require('../services/storageService');
const { invoicePdf, quotationPdf } = require('../services/pdfService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../utils/helpers');

/**
 * Client portal, running in the client's browser.
 *
 * A client can't be allowed to read the real CRM collections (they contain internal notes,
 * profit and other clients' data), so the portal reads only its own mirror:
 *   portal/{clientId}               overview + tickets + the file keys it may download
 *   portal/{clientId}/items/{key}   project detail, quotation / invoice data for PDFs
 * firestore.rules let a client read only the mirror whose id is their own clientId.
 *
 * Anything a client submits (feedback, change request, quotation decision, ticket, ticket reply)
 * is written to `portalInbox`; the CRM applies it the next time an admin opens it. Until then the
 * client sees their own submission marked as pending.
 */
const cid = (req) => {
  if (!req.user.clientId) throw new AppError('Account is not linked to a client', 403);
  return String(req.user.clientId);
};

const mirrorRef = (req) => db().collection('portal').doc(cid(req));

async function readMain(req) {
  const snap = await mirrorRef(req).get();
  if (!snap.exists) return { main: { client: null, projects: [], tickets: [] }, fileKeys: [] };
  const d = snap.data();
  return { main: JSON.parse(d.json || '{}'), fileKeys: d.fileKeys || [] };
}

async function readItem(req, key) {
  const snap = await mirrorRef(req).collection('items').doc(key).get();
  return snap.exists ? JSON.parse(snap.data().json || 'null') : null;
}

/** This client's not-yet-processed submissions. */
async function pending(req) {
  try {
    const snap = await db().collection('portalInbox').where('uid', '==', String(req.user._id)).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  } catch {
    return [];
  }
}

async function submit(req, kind, payload) {
  const ref = db().collection('portalInbox').doc();
  await ref.set({
    uid: String(req.user._id),
    clientId: cid(req),
    kind,
    payload: JSON.stringify(payload).slice(0, 20000),
    at: new Date().toISOString(),
    createdAt: new Date()
  });
  return ref.id;
}

async function ownProject(req, id) {
  assertObjectId(id, 'project id');
  const item = await readItem(req, `project_${id}`);
  if (!item) throw new AppError('Project not found', 404);
  return item;
}

const overview = asyncHandler(async (req, res) => {
  const { main } = await readMain(req);
  res.json({ success: true, data: { client: main.client, projects: main.projects || [] } });
});

const projectDetail = asyncHandler(async (req, res) => {
  const item = await ownProject(req, req.params.id);
  const mine = (await pending(req)).filter((p) => JSON.parse(p.payload || '{}').project === req.params.id);
  const now = new Date().toISOString();
  mine.forEach((p) => {
    const body = JSON.parse(p.payload || '{}');
    if (p.kind === 'feedback') item.feedback.push({ _id: `pending-${p.id}`, from: 'client', authorName: req.user.name, message: body.message, rating: body.rating, createdAt: p.at || now, pending: true });
    if (p.kind === 'changeRequest') item.changeRequests.push({ _id: `pending-${p.id}`, title: body.title, description: body.description, status: 'Pending', createdAt: p.at || now, pending: true });
  });
  (await pending(req)).filter((p) => p.kind === 'quotationDecision').forEach((p) => {
    const body = JSON.parse(p.payload || '{}');
    const q = item.quotations.find((x) => String(x._id) === body.quotation);
    if (q) q.status = body.decision === 'accept' ? 'Accepted' : 'Rejected';
  });
  item.quotations = item.quotations.filter((q) => ['Sent', 'Viewed', 'Accepted'].includes(q.status));
  item.documents = item.documents.map(({ key, ...d }) => d);
  if (item.certificate) delete item.certificate.file;
  res.json({ success: true, data: item });
});

const addFeedback = asyncHandler(async (req, res) => {
  await ownProject(req, req.params.id);
  const message = String(req.body.message || '').trim();
  if (message.length < 3) throw new AppError('Please write your feedback', 400);
  const rating = Number(req.body.rating);
  await submit(req, 'feedback', { project: req.params.id, message: message.slice(0, 4000), rating: rating >= 1 && rating <= 5 ? rating : undefined });
  res.status(201).json({ success: true });
});

const addChangeRequest = asyncHandler(async (req, res) => {
  await ownProject(req, req.params.id);
  const title = String(req.body.title || '').trim();
  if (title.length < 3) throw new AppError('Please give the change request a title', 400);
  await submit(req, 'changeRequest', { project: req.params.id, title: title.slice(0, 200), description: String(req.body.description || '').slice(0, 4000) });
  res.status(201).json({ success: true });
});

const approveQuotation = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const item = await readItem(req, `quotation_${req.params.id}`);
  if (!item) throw new AppError('Quotation not found', 404);
  const q = item.quotation;
  if (!['Sent', 'Viewed'].includes(q.status)) throw new AppError('This quotation can no longer be answered', 409);
  if ((await pending(req)).some((p) => p.kind === 'quotationDecision' && JSON.parse(p.payload || '{}').quotation === req.params.id)) throw new AppError('This quotation can no longer be answered', 409);
  if (q.expiryDate && new Date(q.expiryDate) < new Date()) throw new AppError('This quotation has expired', 409);
  const decision = req.body.decision === 'accept' ? 'Accepted' : req.body.decision === 'reject' ? 'Rejected' : null;
  if (!decision) throw new AppError('Invalid decision', 400);
  await submit(req, 'quotationDecision', { quotation: req.params.id, project: String(q.project || ''), decision: req.body.decision });
  res.json({ success: true, data: { status: decision } });
});

const pdfHeaders = (res, name) => res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'private, no-store' });

const invoicePdfDownload = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const item = await readItem(req, `invoice_${req.params.id}`);
  if (!item) throw new AppError('Invoice not found', 404);
  const buf = await invoicePdf(item.invoice, item.payments || []);
  pdfHeaders(res, item.invoice.number);
  res.send(buf);
});

const quotationPdfDownload = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const item = await readItem(req, `quotation_${req.params.id}`);
  if (!item) throw new AppError('Quotation not found', 404);
  const buf = await quotationPdf(item.quotation);
  pdfHeaders(res, item.quotation.number);
  res.send(buf);
});

const documentDownload = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const { main } = await readMain(req);
  let doc = null;
  for (const p of main.projects || []) {
    // eslint-disable-next-line no-await-in-loop
    const item = await readItem(req, `project_${p._id}`);
    doc = item?.documents?.find((d) => String(d._id) === req.params.id);
    if (doc) break;
  }
  if (!doc || !doc.key) throw new AppError('File not found', 404);
  res.set({ 'Content-Type': doc.mimeType || 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  await storage.pipeTo(doc.key, res);
});

const certificateDownload = asyncHandler(async (req, res) => {
  const item = await ownProject(req, req.params.id);
  if (!item.certificate?.file) throw new AppError('No certificate issued yet', 404);
  pdfHeaders(res, item.certificate.number);
  await storage.pipeTo(item.certificate.file, res);
});

const listTickets = asyncHandler(async (req, res) => {
  const { main } = await readMain(req);
  const tickets = main.tickets || [];
  const projects = Object.fromEntries((main.projects || []).map((p) => [String(p._id), p.name]));
  const inbox = await pending(req);
  inbox.forEach((p) => {
    const body = JSON.parse(p.payload || '{}');
    if (p.kind === 'ticketCreate') {
      tickets.unshift({ _id: `pending-${p.id}`, number: 'Pending', subject: body.subject, message: body.message, priority: body.priority, status: 'Open', replies: [], project: body.project ? { _id: body.project, name: projects[body.project] } : null, createdAt: p.at, updatedAt: p.at, pending: true });
    }
    if (p.kind === 'ticketReply') {
      const t = tickets.find((x) => String(x._id) === body.ticket);
      if (t) {
        t.replies = [...(t.replies || []), { _id: `pending-${p.id}`, from: 'client', authorName: req.user.name, message: body.message, createdAt: p.at, pending: true }];
        if (['Resolved', 'Closed'].includes(t.status)) t.status = 'Open';
      }
    }
  });
  res.json({ success: true, data: tickets });
});

const createTicket = asyncHandler(async (req, res) => {
  const { subject, message, priority, project } = req.body;
  if (!subject || String(subject).trim().length < 3 || !message || String(message).trim().length < 5) throw new AppError('Subject and message are required', 400);
  if (project) await ownProject(req, project);
  const payload = { subject: String(subject).slice(0, 200), message: String(message).slice(0, 4000), priority: ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium', project: project || undefined };
  const id = await submit(req, 'ticketCreate', payload);
  res.status(201).json({ success: true, data: { _id: `pending-${id}`, number: 'Pending', ...payload, status: 'Open', replies: [], pending: true } });
});

const replyTicket = asyncHandler(async (req, res) => {
  const { main } = await readMain(req);
  const t = (main.tickets || []).find((x) => String(x._id) === req.params.id);
  if (!t) throw new AppError('Ticket not found', 404);
  const message = String(req.body.message || '').trim();
  if (!message) throw new AppError('Message required', 400);
  const id = await submit(req, 'ticketReply', { ticket: req.params.id, message: message.slice(0, 4000) });
  t.replies = [...(t.replies || []), { _id: `pending-${id}`, from: 'client', authorName: req.user.name, message: message.slice(0, 4000), createdAt: new Date().toISOString(), pending: true }];
  if (['Resolved', 'Closed'].includes(t.status)) t.status = 'Open';
  res.json({ success: true, data: t });
});

module.exports = { overview, projectDetail, addFeedback, addChangeRequest, approveQuotation, invoicePdfDownload, quotationPdfDownload, documentDownload, certificateDownload, listTickets, createTicket, replyTicket };
