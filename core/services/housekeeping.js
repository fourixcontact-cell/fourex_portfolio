const { db } = require('../db/firebase');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const SupportTicket = require('../models/SupportTicket');
const { nextNumber } = require('../models/Counter');
const audit = require('./auditService');
const { notify } = require('./notificationService');
const mirrors = require('./mirrorService');
const { scan } = require('./scheduler');

/**
 * Work a server would normally do in the background. With no server, the browser of an admin
 * does it whenever the CRM dashboard or the notification bell loads:
 *
 *   1. apply what clients submitted in the portal (portalInbox)
 *   2. create the "new enquiry" notification for leads sent from the website
 *   3. mark quotations as Viewed when the client opened the tracked link
 *   4. reminders scan (deadlines, overdue tasks/invoices, expiring quotations, renewals),
 *      at most once every 6 hours across all admins
 *   5. refresh the public / portal mirrors
 */
const SCAN_EVERY = 6 * 3600 * 1000;
const WEBSITE_SOURCES = ['Website Contact Form', 'Website – Get a Quote'];

const fakeReq = (user) => ({ user, headers: { 'user-agent': (typeof navigator !== 'undefined' && navigator.userAgent) || '' }, ip: '' });

async function applyInboxItem(item, user) {
  const body = JSON.parse(item.payload || '{}');
  const req = fakeReq(user);
  const clientId = String(user.clientId);
  const ownProject = async (id) => {
    if (!id) return null;
    const p = await Project.findOne({ _id: id, client: clientId, isArchived: false });
    if (!p) throw new Error('project not found');
    return p;
  };

  switch (item.kind) {
    case 'feedback': {
      const p = await ownProject(body.project);
      p.feedback.push({ from: 'client', authorName: user.name, message: String(body.message || '').slice(0, 4000), rating: body.rating >= 1 && body.rating <= 5 ? body.rating : undefined });
      await p.save();
      await audit.record(req, { action: 'CREATE', module: 'feedback', recordId: p._id, description: `Client feedback on ${p.name}` });
      await notify({ type: 'enquiry', title: `Client feedback: ${p.name}`, message: String(body.message || '').slice(0, 120), link: `/crm/projects/${p._id}`, dedupeKey: `fb:${item.id}` });
      break;
    }
    case 'changeRequest': {
      const p = await ownProject(body.project);
      const title = String(body.title || '').slice(0, 200);
      p.changeRequests.push({ title, description: String(body.description || '').slice(0, 4000), requestedBy: 'client', requesterName: user.name });
      await p.save();
      await audit.record(req, { action: 'CREATE', module: 'change-request', recordId: p._id, description: `Client change request on ${p.name}: ${title}` });
      await notify({ type: 'change_request', title: `Change request: ${p.name}`, message: title, link: `/crm/projects/${p._id}`, dedupeKey: `cr:${item.id}` });
      break;
    }
    case 'quotationDecision': {
      const q = await Quotation.findOne({ _id: body.quotation, client: clientId, showInPortal: true, isArchived: false });
      if (!q || !['Sent', 'Viewed'].includes(q.status) || (q.expiryDate && q.expiryDate < new Date(item.at || Date.now()))) break;
      const decision = body.decision === 'accept' ? 'Accepted' : 'Rejected';
      q.status = decision;
      q.respondedAt = new Date(item.at || Date.now());
      await q.save();
      await audit.record(req, { action: 'STATUS_CHANGE', module: 'quotation', recordId: q._id, description: `Client ${decision.toLowerCase()} quotation ${q.number} via portal`, newValues: { status: decision } });
      await notify({ type: 'enquiry', title: `Quotation ${q.number} ${decision.toLowerCase()} by client`, link: '/crm/quotations', dedupeKey: `qdec:${q._id}` });
      break;
    }
    case 'ticketCreate': {
      if (body.project) await ownProject(body.project);
      const t = await SupportTicket.create({
        number: await nextNumber('TKT'),
        client: clientId,
        project: body.project || undefined,
        subject: String(body.subject || '').slice(0, 200),
        message: String(body.message || '').slice(0, 4000),
        priority: ['Low', 'Medium', 'High'].includes(body.priority) ? body.priority : 'Medium'
      });
      await audit.record(req, { action: 'CREATE', module: 'ticket', recordId: t._id, description: `Support ticket ${t.number}: ${t.subject}` });
      await notify({ type: 'ticket', title: `New support ticket ${t.number}`, message: t.subject, link: '/crm/tickets', dedupeKey: `ticket:${t._id}` });
      break;
    }
    case 'ticketReply': {
      const t = await SupportTicket.findOne({ _id: body.ticket, client: clientId });
      if (!t) break;
      t.replies.push({ from: 'client', authorName: user.name, message: String(body.message || '').slice(0, 4000) });
      if (['Resolved', 'Closed'].includes(t.status)) t.status = 'Open';
      await t.save();
      await notify({ type: 'ticket', title: `Client replied on ${t.number}`, message: t.subject, link: '/crm/tickets', dedupeKey: `treply:${item.id}` });
      break;
    }
    default:
  }
}

async function processInbox() {
  const snap = await db().collection('portalInbox').limit(100).get();
  let n = 0;
  for (const d of snap.docs) {
    const item = { id: d.id, ...d.data() };
    try {
      // eslint-disable-next-line no-await-in-loop
      const user = await User.findById(item.uid);
      // The rules already make sure uid/clientId belong together; re-check anyway.
      if (user && user.role === 'client' && user.isActive && String(user.clientId) === String(item.clientId)) {
        // eslint-disable-next-line no-await-in-loop
        await applyInboxItem(item, user);
      }
    } catch (e) {
      console.warn('[housekeeping] portal item skipped', item.kind, e.message);
    }
    // eslint-disable-next-line no-await-in-loop
    await d.ref.delete().catch(() => {});
    n += 1;
  }
  return n;
}

async function processWebsiteLeads() {
  const fresh = await Lead.find({ source: { $in: WEBSITE_SOURCES }, notifiedAt: { $exists: false } }).limit(100);
  for (const lead of fresh) {
    const isQuote = !!lead.isQuoteRequest;
    // eslint-disable-next-line no-await-in-loop
    await audit.record(null, { action: 'CREATE', module: 'lead', recordId: lead._id, description: `Public ${isQuote ? 'quote request' : 'enquiry'} from ${lead.name}` });
    // eslint-disable-next-line no-await-in-loop
    await notify({ type: 'new_lead', title: `New ${isQuote ? 'quote request' : 'enquiry'}: ${lead.name}`, message: lead.service, link: '/crm/leads', dedupeKey: `lead:${lead._id}` });
    lead.notifiedAt = new Date();
    // eslint-disable-next-line no-await-in-loop
    try { await lead.save(); } catch (e) { console.warn('[housekeeping] lead', e.message); }
  }
  return fresh.length;
}

async function processQuotationViews() {
  const snap = await db().collection('quotationViews').where('status', '==', 'Sent').get();
  let n = 0;
  for (const d of snap.docs) {
    const v = d.data();
    if (!v.viewedAt) continue;
    // eslint-disable-next-line no-await-in-loop
    const q = await Quotation.findById(v.quotationId);
    if (q && q.status === 'Sent') {
      q.status = 'Viewed';
      q.viewedAt = v.viewedAt.toDate ? v.viewedAt.toDate() : new Date(v.viewedAt);
      // eslint-disable-next-line no-await-in-loop
      await q.save();
      // eslint-disable-next-line no-await-in-loop
      await audit.record(null, { action: 'VIEWED', module: 'quotation', recordId: q._id, description: `Client opened quotation ${q.number}` });
    }
    // eslint-disable-next-line no-await-in-loop
    await d.ref.set({ status: q ? q.status : 'Viewed' }, { merge: true });
    n += 1;
  }
  return n;
}

/** True for exactly one admin browser per 6 hours. */
async function claimScan() {
  const ref = db().collection('_meta').doc('scheduler');
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? snap.data().lastScanAt : null;
    const lastMs = last ? (last.toDate ? last.toDate() : new Date(last)).getTime() : 0;
    if (Date.now() - lastMs < SCAN_EVERY) return false;
    tx.set(ref, { lastScanAt: new Date() }, { merge: true });
    return true;
  });
}

let running = null;
let lastRun = 0;

/** Safe to call often: runs at most once a minute per browser tab. */
function run({ force = false } = {}) {
  if (running) return running;
  if (!force && Date.now() - lastRun < 60 * 1000) return Promise.resolve();
  lastRun = Date.now();
  running = (async () => {
    const step = async (name, fn) => { try { return await fn(); } catch (e) { console.warn(`[housekeeping] ${name}:`, e.message); return 0; } };
    const changes = (await step('inbox', processInbox)) + (await step('leads', processWebsiteLeads)) + (await step('quotation views', processQuotationViews));
    if (await step('claim', claimScan)) await step('reminders', scan);
    await step('mirrors', () => mirrors.syncAll());
    return changes;
  })().finally(() => { running = null; });
  return running;
}

let timer = null;
/** After an admin changes something, refresh the mirrors shortly afterwards. */
function afterAdminWrite() {
  clearTimeout(timer);
  timer = setTimeout(() => { mirrors.syncAll().catch((e) => console.warn('[mirrors]', e.message)); }, 1500);
}

function reset() { lastRun = 0; clearTimeout(timer); mirrors.reset(); }

module.exports = { run, afterAdminWrite, reset, processInbox, processWebsiteLeads, processQuotationViews, applyInboxItem };
