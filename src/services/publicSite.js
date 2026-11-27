import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore/lite';
import { app } from './firebase';
import defaults from '../generated/siteDefaults';

/**
 * What website visitors use (no sign-in). They can only:
 *   - read public/site, public/blog, public/portfolio (published by the CRM)
 *   - send a contact / quote form (creates a lead; firestore.rules check every field)
 *   - open a tracked quotation link (quotationViews/{token})
 * Until the CRM has published anything, the built-in default content is shown.
 */
let lite = null;
const fs = () => { if (!lite) lite = getFirestore(app); return lite; };

const BUDGETS = ['Under ₹25,000', '₹25,000 – ₹75,000', '₹75,000 – ₹2,00,000', '₹2,00,000 – ₹5,00,000', 'Above ₹5,00,000', 'Not sure yet'];
const ok = (data, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, data });
const fail = (status, message, details) => ok({ success: false, message, ...(details ? { details } : {}) }, status);

const cache = {};
async function mirror(name) {
  if (!cache[name]) {
    cache[name] = getDoc(doc(fs(), 'public', name))
      .then((s) => (s.exists() ? JSON.parse(s.data().json || 'null') : null))
      .catch(() => null);
    cache[name].then((v) => { if (!v) setTimeout(() => { delete cache[name]; }, 30000); });
  }
  return cache[name];
}

function defaultSite() {
  const d = defaults || {};
  return {
    site: {
      agency: { name: 'Fourix', tagline: d.tagline || 'Software Development Studio', address: d.address || '', phone: d.phone || '', email: d.email || '', website: d.website || '', social: d.social || {} },
      services: d.services || [],
      technologies: d.technologies || [],
      workflow: d.workflow || [],
      why: d.why || [],
      aboutStory: d.aboutStory || [],
      aboutPrinciples: d.aboutPrinciples || [],
      testimonials: (d.testimonials || []).filter((t) => t.visible),
      team: d.publicTeam || [],
      posts: (d.blogPosts || []).filter((p) => p.published).map(({ body, ...rest }) => rest)
    },
    options: { services: [...new Set([...(d.services || []).map((s) => s.title), 'Other'].filter(Boolean))], budgets: BUDGETS }
  };
}

const siteDoc = async () => (await mirror('site')) || defaultSite();

/* ---------------- forms ---------------- */

// eslint-disable-next-line no-control-regex
const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : v);
const RULES = {
  name: { required: true, label: 'Full name', max: 120, min: 2 },
  company: { max: 160 },
  email: { required: true, email: true, max: 160 },
  phone: { required: true, phone: true, label: 'Phone' },
  country: { required: true, max: 80 },
  service: { required: true, max: 120, label: 'Service' },
  budget: { max: 80 },
  preferredContact: { max: 20 },
  description: { required: true, min: 20, max: 5000, label: 'Project description' }
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(body) {
  const errors = [];
  const out = {};
  Object.entries(RULES).forEach(([field, r]) => {
    const val = clean(body[field]);
    if (val === undefined || val === null || val === '') {
      if (r.required) errors.push({ field, message: `${r.label || field} is required` });
      return;
    }
    const s = String(val);
    if (r.email && !EMAIL.test(s)) errors.push({ field, message: 'Enter a valid email address' });
    if (r.phone && !/^[+()\-\s\d]{7,20}$/.test(s)) errors.push({ field, message: 'Enter a valid phone number' });
    if (r.max && s.length > r.max) errors.push({ field, message: `${r.label || field} must be under ${r.max} characters` });
    if (r.min && s.length < r.min) errors.push({ field, message: `${r.label || field} must be at least ${r.min} characters` });
    out[field] = s;
  });
  return { errors, data: out };
}

async function submit(body, isQuote) {
  // Honeypot: real users never see/fill this field. Pretend success so bots learn nothing.
  if (body.website || body.companyUrl) return ok({ success: true, message: 'Thank you! We will be in touch shortly.' });
  const { errors, data } = validate(body || {});
  if (errors.length) return fail(400, 'Validation failed', errors);
  data.email = data.email.toLowerCase();
  const { options } = await siteDoc();
  if (!options.services.includes(data.service)) return fail(400, 'Please choose a service from the list', [{ field: 'service', message: 'Invalid service' }]);
  data.preferredContact = ['email', 'phone', 'whatsapp', 'any'].includes(data.preferredContact) ? data.preferredContact : 'any';

  // Saved FIRST so a lead is never lost if email fails. The CRM picks it up (notification, audit).
  const ref = doc(collection(fs(), 'leads'));
  const lead = {
    ...data,
    source: isQuote ? 'Website – Get a Quote' : 'Website Contact Form',
    isQuoteRequest: !!isQuote,
    status: 'New',
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(ref, lead);
  } catch (e) {
    return fail(e.code === 'permission-denied' ? 400 : 503, e.code === 'permission-denied' ? 'Please check the form and try again.' : 'Could not send right now. Please try again in a moment.');
  }

  // Emails (optional): Cloudflare Pages Function. Failures never reach the visitor.
  let ack = false;
  try {
    const r = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'lead', leadId: ref.id, lead: { ...data, isQuoteRequest: !!isQuote } }) });
    const j = await r.json().catch(() => ({}));
    ack = !!j.acknowledged;
  } catch { /* email not set up */ }

  return ok({ success: true, message: `Thank you! Your request has been received.${ack ? ' Check your inbox for a confirmation.' : ' We will get back to you soon.'}` }, 201);
}

/* ---------------- router ---------------- */

export async function publicHandle({ method, url, params, data }) {
  const u = new URL(url, 'http://local');
  const path = u.pathname.replace(/^\/public/, '');
  const q = { ...Object.fromEntries(u.searchParams), ...(params || {}) };
  let body = data;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  if (method === 'GET' && path === '/options') { const { options } = await siteDoc(); return ok({ success: true, ...options }); }
  if (method === 'GET' && path === '/site') { const { site } = await siteDoc(); return ok({ success: true, data: site }); }

  if (method === 'GET' && path.startsWith('/portfolio')) {
    const items = ((await mirror('portfolio')) || { items: [] }).items || [];
    const id = decodeURIComponent(path.slice('/portfolio/'.length));
    if (path.startsWith('/portfolio/') && id) {
      const p = items.find((x) => x.id === id);
      return p ? ok({ success: true, data: p }) : fail(404, 'Project not found');
    }
    const short = ({ caseStudy, screenshots, createdAt, ...rest }) => rest;
    let list = items;
    if (q.category) list = list.filter((p) => p.category === String(q.category));
    if (q.tech) list = list.filter((p) => (p.techStack || []).includes(String(q.tech)));
    return ok({
      success: true,
      data: list.map(short),
      categories: [...new Set(items.map((p) => p.category).filter(Boolean))].sort(),
      technologies: [...new Set(items.flatMap((p) => p.techStack || []))].sort()
    });
  }

  if (method === 'GET' && path.startsWith('/blog/')) {
    const slug = decodeURIComponent(path.slice('/blog/'.length));
    const blog = (await mirror('blog')) || { posts: (defaults.blogPosts || []).filter((p) => p.published) };
    const post = (blog.posts || []).find((p) => p.slug === slug);
    return post ? ok({ success: true, data: post }) : fail(404, 'Post not found');
  }

  if (method === 'GET' && path.startsWith('/quotation-view/')) {
    const token = decodeURIComponent(path.slice('/quotation-view/'.length));
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return fail(404, 'Link not valid');
    const ref = doc(fs(), 'quotationViews', token);
    let s;
    try { s = await getDoc(ref); } catch { return fail(404, 'Link not valid'); }
    if (!s.exists()) return fail(404, 'Link not valid');
    const v = s.data();
    let status = v.status;
    if (status === 'Sent' && !v.viewedAt) {
      // The CRM turns this into "Viewed" on the quotation itself.
      try { await updateDoc(ref, { viewedAt: serverTimestamp() }); status = 'Viewed'; } catch { /* ignore */ }
    } else if (status === 'Sent') status = 'Viewed';
    const expiry = v.expiryDate && v.expiryDate.toDate ? v.expiryDate.toDate() : v.expiryDate;
    return ok({ success: true, data: { number: v.number, projectName: v.projectName, total: v.total, currency: v.currency, expiryDate: expiry, status } });
  }

  if (method === 'POST' && path === '/contact') return submit(body, false);
  if (method === 'POST' && path === '/quote') return submit(body, true);
  return fail(404, `Route not found: ${method} /public${path}`);
}
