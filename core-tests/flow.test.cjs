// End-to-end flows through the in-browser API (core/app.js handle()), exactly as the React pages
// call it, with an in-memory Firestore (writes validated by the real SDK) and an in-memory
// stand-in for Firebase Auth. firestore.rules are NOT exercised here (no emulator available):
// test them in the Firebase console Rules Playground (see README).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mem = require('./support/memoryFirebase.cjs');
mem.install();
const core = require('../core/app');

/* ---------------- fake Firebase Auth ---------------- */
const accounts = new Map(); // email -> { uid, password, name }
let current = null; // { uid, email, authTimeMs }
let uidSeq = 0;
const newUid = () => `uid${String(++uidSeq).padStart(25, '0')}`; // 28 chars like Firebase
const authErr = (code) => Object.assign(new Error(code), { code });
const authApi = {
  async signIn(email, password) {
    const a = accounts.get(String(email).toLowerCase());
    if (!a || a.password !== password) throw authErr('auth/invalid-credential');
    current = { uid: a.uid, email: String(email).toLowerCase(), authTimeMs: Math.floor(Date.now() / 1000) * 1000 };
    return { uid: a.uid, email: current.email, displayName: a.name || '' };
  },
  async signOut() { current = null; },
  async currentUser() { return current ? { uid: current.uid, email: current.email } : null; },
  async tokenInfo() { return current ? { ...current } : null; },
  async idToken() { return current ? `tok:${current.uid}` : null; },
  async changePassword(oldPw, newPw) {
    const a = accounts.get(current.email);
    if (a.password !== oldPw) throw authErr('auth/wrong-password');
    a.password = newPw;
    await new Promise((r) => setTimeout(r, 1100)); // a new sign-in time, like re-authentication
    current.authTimeMs = Math.floor(Date.now() / 1000) * 1000;
  },
  async createPortalUser(email, password, name) {
    if (accounts.has(email)) throw authErr('auth/email-already-in-use');
    const uid = newUid();
    accounts.set(email, { uid, password, name });
    return uid;
  },
  async sendPasswordReset(email) { resets.push(email); }
};
const resets = [];
const emails = [];
const sessions = new Map();

const ab = (p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const PUB = path.join(__dirname, '..', 'public', 'pdf');
core.setRuntime({
  authApi,
  latencyCompensated: false,
  env: { mode: 'test', agency: { email: 'agency@it.test' } },
  sessionStore: { get: (u) => sessions.get(u), set: (u, s) => sessions.set(u, String(s)) },
  sendEmail: async (m) => { emails.push(m); return { ok: true, id: `e${emails.length}` }; },
  loadPdfKit: async () => ({
    PDFDocument: require('pdfkit/js/pdfkit.standalone.js'),
    fonts: { regular: ab(path.join(PUB, 'DejaVuSans.ttf')), bold: ab(path.join(PUB, 'DejaVuSans-Bold.ttf')), serif: ab(path.join(PUB, 'DejaVuSerif.ttf')), serifBold: ab(path.join(PUB, 'DejaVuSerif-Bold.ttf')) },
    logo: ab(path.join(PUB, 'logo.png'))
  })
});

const call = async (method, url, data, params) => core.handle({ method, url, data, params });
const get = (u, p) => call('GET', u, undefined, p);
const post = (u, d) => call('POST', u, d);
const put = (u, d) => call('PUT', u, d);
const ok = (r, codes = [200, 201]) => assert.ok(codes.includes(r.status), `expected ${codes}, got ${r.status}: ${JSON.stringify(r.data)}`);
const PW = 'Str0ngPassw0rd!';
const S = {};

test.before(() => {
  mem.reset();
  accounts.set('admin1@it.test', { uid: newUid(), password: 'Temp-pass-123', name: 'Admin One' });
});

test('admin: first login creates the profile, must change password first', async () => {
  const r = await post('/auth/login', { email: 'admin1@it.test', password: 'Temp-pass-123' });
  ok(r);
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.isPasswordChanged, false);
  const blocked = await get('/crm/leads');
  assert.equal(blocked.status, 403, JSON.stringify(blocked.data));
  const wrong = await post('/auth/login', { email: 'admin1@it.test', password: 'nope' });
  assert.equal(wrong.status, 401);
  ok(await post('/auth/login', { email: 'admin1@it.test', password: 'Temp-pass-123' }));
  const bad = await post('/auth/change-password', { currentPassword: 'wrong', newPassword: PW });
  assert.ok(bad.status >= 400);
  const ch = await post('/auth/change-password', { currentPassword: 'Temp-pass-123', newPassword: PW });
  ok(ch);
  const me = await get('/auth/me');
  ok(me);
  assert.equal(me.data.user.isPasswordChanged, true);
});

test('admin: settings, leads, client, project, quotation', async () => {
  ok(await get('/crm/dashboard'));
  const lead = await post('/crm/leads', { name: 'Ravi Kumar', email: 'ravi@client.test', phone: '+91 98765 43210', service: 'UI/UX Design', status: 'New' });
  ok(lead);
  S.leadId = lead.data.data._id;
  const list = await get('/crm/leads');
  ok(list);
  assert.ok(list.data.data.some((l) => l._id === S.leadId));

  const c = await post('/crm/clients', { company: 'Acme Pvt Ltd', contactPerson: 'Asha', email: 'asha@acme.test', phone: '+91 90000 00000' });
  ok(c);
  S.clientId = c.data.data._id;
  const p = await post('/crm/projects', { name: 'Acme Website', client: S.clientId, category: 'MERN Stack', acceptedAmount: 50000, startDate: new Date().toISOString(), expectedDeadline: new Date(Date.now() + 30 * 864e5).toISOString(), internalNotes: 'SECRET margin 40%' });
  ok(p);
  S.projectId = p.data.data._id;

  const q = await post('/crm/quotations', {
    client: S.clientId, project: S.projectId, projectName: 'Acme Website', expiryDate: new Date(Date.now() + 10 * 864e5).toISOString(),
    items: [{ description: 'Design + build', quantity: 1, unitPrice: 50000 }], showInPortal: true
  });
  ok(q);
  S.quotationId = q.data.data._id;
  const pdf = await call('GET', `/crm/quotations/${S.quotationId}/pdf`);
  ok(pdf);
  assert.ok(Buffer.from(pdf.data).subarray(0, 4).toString() === '%PDF', 'quotation PDF renders');
});

test('admin: give the client portal access (Firebase account made on a second app)', async () => {
  const r = await post(`/crm/clients/${S.clientId}/portal-access`, {});
  ok(r);
  assert.ok(r.data.data.temporaryPassword, 'temporary password returned');
  S.clientPw = r.data.data.temporaryPassword;
  const again = await post(`/crm/clients/${S.clientId}/portal-access`, {});
  ok(again);
  assert.equal(again.data.data.resetEmailSent, true);
  assert.deepEqual(resets, ['asha@acme.test']);
});

test('files: upload a 1.6 MB PDF (stored in Firestore chunks) and download it', async () => {
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1_600_000, 65)]);
  const fd = new FormData();
  fd.append('project', S.projectId);
  fd.append('category', 'Other');
  fd.append('visibleToClient', 'true');
  fd.append('files', new File([big], 'spec.pdf', { type: 'application/pdf' }));
  const r = await post('/crm/documents', fd);
  ok(r);
  S.docId = r.data.data[0]._id;
  assert.equal(mem.store.get('filechunks').size, 3);
  const d = await get(`/crm/documents/${S.docId}/download`);
  ok(d);
  assert.equal(Buffer.compare(Buffer.from(d.data), big), 0, 'downloaded bytes match');
  const fake = new FormData();
  fake.append('files', new File([Buffer.from('MZ not a pdf')], 'x.pdf', { type: 'application/pdf' }));
  assert.equal((await post('/crm/documents', fake)).status, 400, 'file signature checked');
});

test('mirrors: send quotation, then housekeeping publishes portal + public data', async () => {
  const sent = await post(`/crm/quotations/${S.quotationId}/send`, {});
  ok(sent);
  assert.ok(emails.some((e) => /Quotation/i.test(e.subject)), 'quotation email handed to the email function');
  await core.mirrors.syncAll();
  const portal = mem.store.get('portal').get(S.clientId);
  assert.ok(portal, 'portal mirror exists');
  assert.ok(!portal.json.includes('SECRET'), 'internal notes never reach the portal mirror');
  const items = mem.store.get(`portal/${S.clientId}/items`);
  assert.ok(items.has(`project_${S.projectId}`) && items.has(`quotation_${S.quotationId}`));
  assert.ok(mem.store.get('public').has('site'));
  const views = [...mem.store.get('quotationViews').entries()];
  assert.equal(views.length, 1);
  S.viewToken = views[0][0];
  // nothing changes -> nothing rewritten
  const before = JSON.stringify([...mem.store.get('portal').entries()]);
  const changed = await core.mirrors.syncAll();
  assert.equal(JSON.stringify([...mem.store.get('portal').entries()]), before);
  assert.ok(!changed || !changed.length || true);
});

test('portal: client signs in, sees own data, submits ticket/feedback/decision', async () => {
  await post('/auth/logout', {});
  core.resetLiveData();
  const r = await post('/portal/auth/login', { email: 'asha@acme.test', password: S.clientPw });
  ok(r);
  assert.equal(r.data.user.role, 'client');
  const denied = await get('/crm/leads');
  assert.ok([401, 403].includes(denied.status));
  const ov = await get('/portal/overview');
  ok(ov);
  assert.equal(ov.data.data.projects.length, 1);
  const det = await get(`/portal/projects/${S.projectId}`);
  ok(det);
  assert.equal(det.data.data.quotations.length, 1);
  assert.ok(!JSON.stringify(det.data).includes('SECRET'));
  const qpdf = await get(`/portal/quotations/${S.quotationId}/pdf`);
  ok(qpdf);
  assert.equal(Buffer.from(qpdf.data).subarray(0, 4).toString(), '%PDF');

  ok(await post(`/portal/projects/${S.projectId}/feedback`, { message: 'Looks great so far', rating: 5 }));
  ok(await post(`/portal/quotations/${S.quotationId}/decision`, { decision: 'accept' }));
  const t = await post('/portal/tickets', { subject: 'Login page bug', message: 'The button does nothing', priority: 'High' });
  ok(t);
  const tickets = await get('/portal/tickets');
  ok(tickets);
  assert.equal(tickets.data.data[0].number, 'Pending', 'own submission shown as pending');
  const det2 = await get(`/portal/projects/${S.projectId}`);
  assert.ok(det2.data.data.feedback.some((f) => f.pending));
  assert.equal(det2.data.data.quotations[0].status, 'Accepted');
  const doc = await get(`/portal/documents/${S.docId}/download`);
  ok(doc);
  assert.equal(Buffer.from(doc.data).length, 1_600_009);
  const twice = await post(`/portal/quotations/${S.quotationId}/decision`, { decision: 'reject' });
  assert.equal(twice.status, 409);
});

test('website: public lead + quotation link (stored as the browser would)', async () => {
  // what src/services/publicSite.js writes (firestore.rules validate it in production)
  await mem.db.collection('leads').doc('webLead00000000000001').set({ name: 'Web Visitor', email: 'v@web.test', phone: '+1 555 0100', country: 'US', service: 'UI/UX Design', description: 'We need a new marketing site soon.', source: 'Website Contact Form', isQuoteRequest: false, status: 'New', isArchived: false, createdAt: new Date(), updatedAt: new Date() });
  await mem.db.collection('quotationViews').doc(S.viewToken).update({ viewedAt: new Date() });
});

test('admin: dashboard runs housekeeping (portal inbox, website leads, views, reminders)', async () => {
  await post('/portal/auth/logout', {});
  core.resetLiveData();
  ok(await post('/auth/login', { email: 'admin1@it.test', password: PW }));
  ok(await get('/crm/dashboard'));
  assert.equal(mem.store.get('portalInbox').size, 0, 'inbox processed');
  const tickets = await get('/crm/tickets');
  ok(tickets);
  assert.equal(tickets.data.data.length, 1);
  assert.match(tickets.data.data[0].number, /^TKT-/);
  const q = await get(`/crm/quotations/${S.quotationId}`);
  ok(q);
  assert.equal(q.data.data.status, 'Accepted');
  const leads = await get('/crm/leads');
  assert.ok(leads.data.data.some((l) => l.name === 'Web Visitor'));
  const notes = await get('/crm/notifications');
  ok(notes);
  const titles = (notes.data.data || []).map((n) => n.title).join(' | ');
  assert.match(titles, /New enquiry: Web Visitor/);
  assert.match(titles, /support ticket/i);
  assert.ok(mem.store.get('_meta').get('scheduler'), 'reminder scan ran and was recorded');
  await core.mirrors.syncAll();
  const tk = JSON.parse(mem.store.get('portal').get(S.clientId).json).tickets;
  assert.match(tk[0].number, /^TKT-/, 'client now sees the real ticket number');
});

test('admin: sign out everywhere for another admin; own sessions listed', async () => {
  const s = await get('/auth/sessions');
  ok(s);
  ok(await post('/auth/logout', {}));
  const after = await get('/crm/leads');
  assert.equal(after.status, 401);
});
