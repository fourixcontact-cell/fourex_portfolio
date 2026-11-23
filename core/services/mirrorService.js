const crypto = require('../lib/crypto');
const { db } = require('../db/firebase');
const Project = require('../models/Project');
const Milestone = require('../models/Milestone');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Document = require('../models/Document');
const SupportTicket = require('../models/SupportTicket');
const Client = require('../models/Client');
const { getSiteSettings } = require('./siteSettingsService');

/**
 * "Mirrors" are small read-only copies that visitors and clients are allowed to read, because
 * without a server they can't be trusted with the real collections (those hold internal notes,
 * profit, other clients...). Admins' browsers rebuild them after changes:
 *
 *   public/site, public/blog, public/portfolio   -> website (anyone)
 *   portal/{clientId}                            -> that client's portal home + tickets
 *   portal/{clientId}/items/{key}                -> project detail, quotation/invoice PDF data
 *   quotationViews/{token}                       -> tracked quotation link (anyone with the token)
 *
 * Every mirror stores its content as JSON text plus a hash; a mirror is only rewritten when its
 * content actually changed (hashes are kept in _meta/mirrors), so syncing costs few writes.
 */
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');
const metaRef = () => db().collection('_meta').doc('mirrors');

const BUDGETS = ['Under ₹25,000', '₹25,000 – ₹75,000', '₹75,000 – ₹2,00,000', '₹2,00,000 – ₹5,00,000', 'Above ₹5,00,000', 'Not sure yet'];
const serviceOptions = (s) => [...new Set([...(s.services || []).map((x) => x.title), 'Other'].filter(Boolean))];

/* ---------------- Public website ---------------- */

function shapePortfolio(o) {
  return {
    id: String(o._id),
    title: o.portfolio?.title || o.name,
    category: o.category,
    summary: o.portfolio?.summary || '',
    techStack: o.techStack || [],
    coverImage: o.portfolio?.coverImage || '',
    featured: !!o.portfolio?.featured,
    liveUrl: o.liveUrl || '',
    githubUrl: o.githubUrl || '',
    clientName: o.portfolio?.clientDisplayName || '',
    completedOn: o.completionDate || null,
    createdAt: o.createdAt || null,
    caseStudy: o.portfolio?.caseStudy || '',
    screenshots: o.portfolio?.screenshots || []
  };
}

async function buildPublic() {
  const s = plain(await getSiteSettings());
  const site = {
    agency: { name: s.agencyName, tagline: s.tagline, address: s.address, phone: s.phone, email: s.email, website: s.website, social: s.social || {} },
    services: s.services || [],
    technologies: s.technologies || [],
    workflow: s.workflow || [],
    why: s.why || [],
    aboutStory: s.aboutStory || [],
    aboutPrinciples: s.aboutPrinciples || [],
    testimonials: (s.testimonials || []).filter((t) => t.visible),
    team: s.publicTeam || [],
    posts: (s.blogPosts || []).filter((p) => p.published).map(({ body, ...rest }) => rest)
  };
  const projects = plain(await Project.find({ 'portfolio.visible': true, isArchived: false }).sort({ 'portfolio.featured': -1, createdAt: -1 }).limit(100));
  return {
    'public/site': { site, options: { services: serviceOptions(s), budgets: BUDGETS } },
    'public/blog': { posts: (s.blogPosts || []).filter((p) => p.published) },
    'public/portfolio': { items: projects.map(shapePortfolio) }
  };
}

/* ---------------- Client portal ---------------- */

const PROJECT_LIST = 'projectId name status progress startDate expectedDeadline completionDate certificate.number certificate.issuedAt acceptedAmount amountReceived pendingBalance';

async function buildPortal(clientId) {
  const client = await Client.findById(clientId).select('company contactPerson email');
  if (!client) return null;
  const projectsFull = await Project.find({ client: clientId, isArchived: false });
  const projects = await Project.find({ client: clientId, isArchived: false }).select(PROJECT_LIST);
  const tickets = await SupportTicket.find({ client: clientId }).populate('project', 'name').sort({ updatedAt: -1 });
  const fileKeys = [];
  const items = {};

  for (const p of projectsFull) {
    const [milestones, quotations, invoices, payments, documents] = await Promise.all([
      Milestone.find({ project: p._id }).sort({ order: 1, dueDate: 1 }).select('name description dueDate status paymentAmount completedAt'),
      Quotation.find({ project: p._id, client: clientId, showInPortal: true, status: { $in: ['Sent', 'Viewed', 'Accepted'] }, isArchived: false }),
      Invoice.find({ project: p._id, client: clientId, showInPortal: true, status: { $ne: 'Draft' }, isArchived: false }),
      Payment.find({ project: p._id, client: clientId, status: 'confirmed' }).sort({ paidOn: -1 }).select('receiptNumber amount paidOn method paymentType'),
      Document.find({ project: p._id, visibleToClient: true, isArchived: false }).select('+storageKey originalName category size createdAt mimeType')
    ]);
    documents.forEach((d) => d.storageKey && fileKeys.push(d.storageKey));
    if (p.certificate?.file) fileKeys.push(p.certificate.file);

    items[`project_${p._id}`] = {
      project: { _id: p._id, projectId: p.projectId, name: p.name, description: p.description, status: p.status, progress: p.progress, startDate: p.startDate, expectedDeadline: p.expectedDeadline, completionDate: p.completionDate, liveUrl: p.liveUrl, techStack: p.techStack, acceptedAmount: p.acceptedAmount, amountReceived: p.amountReceived, pendingBalance: p.pendingBalance },
      milestones,
      quotations: quotations.map((q) => ({ _id: q._id, number: q.number, grandTotal: q.grandTotal, status: q.status, expiryDate: q.expiryDate })),
      invoices: invoices.map((i) => ({ _id: i._id, number: i.number, total: i.total, amountPaid: i.amountPaid, balance: i.balance, status: i.status, dueDate: i.dueDate })),
      payments,
      documents: documents.map((d) => ({ _id: d._id, originalName: d.originalName, category: d.category, size: d.size, createdAt: d.createdAt, mimeType: d.mimeType, key: d.storageKey })),
      feedback: (p.feedback || []).filter((f) => f.from === 'client'),
      changeRequests: (p.changeRequests || []).map((c) => ({ _id: c._id, title: c.title, description: c.description, status: c.status, estimatedCost: c.estimatedCost, createdAt: c.createdAt, decisionNote: c.decisionNote })),
      certificate: p.certificate?.number ? { number: p.certificate.number, issuedAt: p.certificate.issuedAt, file: p.certificate.file || null } : null
    };

    for (const q of quotations) {
      const o = plain(q);
      delete o.viewToken; delete o.internalNotes; delete o.costEstimate; delete o.profit;
      items[`quotation_${q._id}`] = { quotation: o };
    }
    for (const i of invoices) {
      const o = plain(i);
      delete o.internalNotes;
      // eslint-disable-next-line no-await-in-loop
      const pays = await Payment.find({ invoice: i._id }).sort({ paidOn: 1 });
      items[`invoice_${i._id}`] = { invoice: o, payments: plain(pays).map(({ reference, transactionId, notes, ...rest }) => rest) };
    }
  }
  return { main: { client, projects, tickets }, items, fileKeys };
}

/* ---------------- Quotation links ---------------- */

async function buildQuotationViews() {
  const qs = await Quotation.find({ viewToken: { $exists: true }, isArchived: false }).select('+viewToken number projectName status grandTotal expiryDate currency viewedAt');
  const out = {};
  qs.forEach((q) => {
    if (!q.viewToken) return;
    out[q.viewToken] = { number: q.number, projectName: q.projectName || '', total: q.grandTotal || 0, currency: q.currency || 'INR', expiryDate: q.expiryDate ? new Date(q.expiryDate) : null, status: q.status, quotationId: String(q._id) };
  });
  return out;
}

/* ---------------- Sync ---------------- */

let hashes = null;
async function loadHashes() {
  if (hashes) return hashes;
  try { const s = await metaRef().get(); hashes = (s.exists && s.data().hashes) || {}; } catch { hashes = {}; }
  return hashes;
}

async function writeIfChanged(key, ref, data, changed) {
  const json = JSON.stringify(plain(data.json));
  const h = hash(json + JSON.stringify(data.extra || {}));
  if (hashes[key] === h) return;
  await ref.set({ json, ...(data.extra || {}), updatedAt: new Date() });
  hashes[key] = h;
  changed.push(key);
}

let running = null;
let again = false;

/** Rebuild every mirror (admin browsers only). Coalesces overlapping calls. */
function syncAll() {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        // eslint-disable-next-line no-await-in-loop
        await syncOnce();
      } while (again);
    } finally { running = null; }
  })();
  return running;
}

async function syncOnce() {
  await loadHashes();
  const changed = [];
  const seen = new Set();

  const pub = await buildPublic();
  for (const [key, json] of Object.entries(pub)) {
    const [c, d] = key.split('/');
    seen.add(key);
    // eslint-disable-next-line no-await-in-loop
    await writeIfChanged(key, db().collection(c).doc(d), { json }, changed);
  }

  const clients = await Client.find({ isArchived: false, portalUser: { $exists: true } }).select('_id portalUser');
  for (const c of clients) {
    if (!c.portalUser) continue;
    const id = String(c._id);
    // eslint-disable-next-line no-await-in-loop
    const built = await buildPortal(id);
    if (!built) continue;
    const base = db().collection('portal').doc(id);
    for (const [k, json] of Object.entries(built.items)) {
      const key = `portal/${id}/items/${k}`;
      seen.add(key);
      // eslint-disable-next-line no-await-in-loop
      await writeIfChanged(key, base.collection('items').doc(k), { json }, changed);
    }
    seen.add(`portal/${id}`);
    // eslint-disable-next-line no-await-in-loop
    await writeIfChanged(`portal/${id}`, base, { json: built.main, extra: { clientId: id, fileKeys: [...new Set(built.fileKeys)].slice(0, 2000) } }, changed);
  }

  const views = await buildQuotationViews();
  for (const [token, v] of Object.entries(views)) {
    const key = `quotationViews/${token}`;
    seen.add(key);
    const h = hash(JSON.stringify(plain(v)));
    if (hashes[key] === h) continue;
    // merge keeps a visitor's viewedAt
    // eslint-disable-next-line no-await-in-loop
    await db().collection('quotationViews').doc(token).set(v, { merge: true });
    hashes[key] = h;
    changed.push(key);
  }

  // Remove mirrors that no longer exist (archived client, quotation hidden from the portal...)
  for (const key of Object.keys(hashes)) {
    if (seen.has(key)) continue;
    const parts = key.split('/');
    let ref = db().collection(parts[0]).doc(parts[1]);
    if (parts.length === 4) ref = ref.collection(parts[2]).doc(parts[3]);
    // eslint-disable-next-line no-await-in-loop
    try { await ref.delete(); } catch { /* already gone */ }
    delete hashes[key];
    changed.push(key);
  }

  if (changed.length) await metaRef().set({ hashes, updatedAt: new Date() });
  return changed;
}

/** Forget the in-memory hashes (on logout / account switch). */
function reset() { hashes = null; }

module.exports = { syncAll, reset, buildPublic, buildPortal, shapePortfolio, BUDGETS, serviceOptions };
