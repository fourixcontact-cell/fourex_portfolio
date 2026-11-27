/**
 * Cloudflare Pages Function: POST /api/email
 *
 * The ONLY server-side piece, and it is optional. It exists because the Resend API key must not
 * be put in the browser. Without RESEND_API_KEY every email is simply skipped and the rest of
 * Fourix keeps working.
 *
 * Cloudflare Pages → your project → Settings → Variables and secrets:
 *   RESEND_API_KEY         re_...                              (secret)
 *   EMAIL_FROM             Fourix <hello@yourdomain.com>       (a domain verified in Resend)
 *   FIREBASE_PROJECT_ID    fourex-93596
 *   ADMIN_EMAILS           a@x.com,b@x.com,c@x.com,d@x.com     (the same four as firestore.rules)
<<<<<<< HEAD
 *   AGENCY_EMAIL           where agency-directed email goes (defaults to the admin emails)
=======
 *   AGENCY_EMAIL           where new website enquiries go (defaults to the admin emails)
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
 *   AGENCY_NAME            Fourix
 *   SEND_ACKNOWLEDGEMENT   on  -> also send visitors a "we got your message" email
 *
 * Two kinds of request:
 *   { kind: 'admin', message }  from a signed-in admin (Firebase ID token checked here)
 *   { kind: 'lead', lead }      from the website forms (fixed templates only, so it can't be
 *                               used to send arbitrary email)
 */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks = null;
let jwksAt = 0;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function verifyFirebaseToken(token, projectId) {
  const [h, p, sig] = String(token || '').split('.');
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (header.alg !== 'RS256') return null;
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    const r = await fetch(JWKS_URL);
    jwks = (await r.json()).keys || [];
    jwksAt = Date.now();
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || claims.exp < now || !claims.sub) return null;
  return claims;
}

async function resend(env, { to, subject, html, attachments, replyTo }) {
<<<<<<< HEAD
  const recipients = [].concat(to).filter(Boolean).slice(0, 10);
  if (!recipients.length) return { ok: false, error: 'No email recipient is configured' };
  const body = { from: env.EMAIL_FROM, to: recipients, subject: String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250), html: String(html || '') };
=======
  const body = { from: env.EMAIL_FROM, to: [].concat(to).slice(0, 10), subject: String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250), html: String(html || '') };
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  if (Array.isArray(attachments) && attachments.length) body.attachments = attachments.slice(0, 5).map((a) => ({ filename: String(a.filename || 'file.pdf').slice(0, 120), content: String(a.content || '') }));
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: data.id } : { ok: false, error: data.message || `Resend error ${r.status}` };
}

function layout(env, title, inner) {
  const name = esc(env.AGENCY_NAME || 'Fourix');
  return `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Arial,sans-serif;color:#1f2430">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#140a3a,#6c2bf2);padding:24px 32px;color:#fff;font-size:20px;font-weight:700">${name}</td></tr>
    <tr><td style="padding:32px"><h2 style="margin:0 0 16px;font-size:20px">${esc(title)}</h2>${inner}</td></tr>
  </table></td></tr></table></body></html>`;
}
const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v || '—')}</b></td></tr>`;

export async function onRequestPost({ request, env }) {
<<<<<<< HEAD
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ ok: false, error: 'Email is not set up (RESEND_API_KEY / EMAIL_FROM missing)' }, 503);
=======
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ ok: false, error: 'Email is not set up (RESEND_API_KEY / EMAIL_FROM missing)' });
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
  if (JSON.stringify(body).length > 12 * 1024 * 1024) return json({ ok: false, error: 'Too large' }, 413);
  const admins = list(env.ADMIN_EMAILS);

  if (body.kind === 'admin') {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID).catch(() => null);
    if (!claims || !admins.includes(String(claims.email || '').toLowerCase())) return json({ ok: false, error: 'Not allowed' }, 403);
    const m = body.message || {};
<<<<<<< HEAD
    if (m.recipient && m.recipient !== 'agency') return json({ ok: false, error: 'Invalid recipient' }, 400);
    const to = m.recipient === 'agency'
      ? (list(env.AGENCY_EMAIL).length ? list(env.AGENCY_EMAIL) : admins)
      : m.to;
    if ((!to || (Array.isArray(to) && !to.length)) || !m.subject) {
      return json({ ok: false, error: 'Missing recipient or subject' }, m.recipient === 'agency' ? 503 : 400);
    }
    const replyTo = m.replyTo || list(env.AGENCY_EMAIL)[0] || admins[0];
    const result = await resend(env, { ...m, to, replyTo });
    return json(result, result.ok ? 200 : 502);
=======
    if (!m.to || !m.subject) return json({ ok: false, error: 'Missing recipient or subject' }, 400);
    return json(await resend(env, m));
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  }

  if (body.kind === 'lead') {
    const l = body.lead || {};
    const clip = (v, n) => String(v || '').slice(0, n);
    const lead = { name: clip(l.name, 120), company: clip(l.company, 160), email: clip(l.email, 160), phone: clip(l.phone, 30), country: clip(l.country, 80), service: clip(l.service, 120), budget: clip(l.budget, 80), preferredContact: clip(l.preferredContact, 20), description: clip(l.description, 5000), isQuoteRequest: !!l.isQuoteRequest };
    if (lead.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email) || lead.description.length < 20) return json({ ok: false, error: 'Invalid enquiry' }, 400);
    const kind = lead.isQuoteRequest ? 'quote request' : 'enquiry';
    const to = list(env.AGENCY_EMAIL).length ? list(env.AGENCY_EMAIL) : admins;
    const html = layout(env, `New ${kind} from ${lead.name}`, `<table style="font-size:14px">${row('Name', lead.name)}${row('Company', lead.company)}${row('Email', lead.email)}${row('Phone', lead.phone)}${row('Country', lead.country)}${row('Service', lead.service)}${row('Budget', lead.budget)}${row('Preferred contact', lead.preferredContact)}</table><p style="white-space:pre-wrap;font-size:14px;line-height:1.6;background:#f7f7fb;padding:14px;border-radius:10px">${esc(lead.description)}</p>`);
<<<<<<< HEAD
    const agency = to.length
      ? await resend(env, { to, subject: `New ${kind}: ${lead.name}`, html, replyTo: lead.email })
      : { ok: false, error: 'No email recipient is configured' };
=======
    const agency = to.length ? await resend(env, { to, subject: `New ${kind}: ${lead.name}`, html, replyTo: lead.email }) : { ok: false };
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
    let acknowledged = false;
    if (String(env.SEND_ACKNOWLEDGEMENT).toLowerCase() === 'on') {
      const ack = await resend(env, { to: lead.email, subject: `We received your ${kind} — ${env.AGENCY_NAME || 'Fourix'}`, html: layout(env, `Thanks, ${lead.name}!`, `<p style="font-size:14px;line-height:1.7">We've received your ${kind} about <b>${esc(lead.service)}</b>. Someone from our team will get back to you within one business day.</p>`), replyTo: to[0] });
      acknowledged = ack.ok;
    }
<<<<<<< HEAD
    return json({ ok: agency.ok, acknowledged }, agency.ok ? 200 : 502);
=======
    return json({ ok: agency.ok, acknowledged });
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  }

  return json({ ok: false, error: 'Unknown request' }, 400);
}

export const onRequest = () => json({ ok: false, error: 'Method not allowed' }, 405);
