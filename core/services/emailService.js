const { rt } = require('../runtime');
const { config } = require('../config/env');

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Arial,sans-serif;color:#1f2430">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,41,90,.08)">
    <tr><td style="background:linear-gradient(135deg,#140a3a,#6c2bf2);padding:24px 32px;color:#fff">
      <div style="font-size:20px;font-weight:700">${esc(config.agency.name)}</div>
      <div style="opacity:.85;font-size:13px">${esc(config.agency.tagline)}</div></td></tr>
    <tr><td style="padding:32px"><h2 style="margin:0 0 16px;font-size:20px">${esc(title)}</h2>${bodyHtml}</td></tr>
    <tr><td style="padding:20px 32px;background:#fafbff;color:#6b7280;font-size:12px;border-top:1px solid #eceefa">
      ${esc(config.agency.name)} · ${esc(config.agency.address)}<br>${esc(config.agency.phone)} · ${esc(config.agency.email)}</td></tr>
  </table></td></tr></table></body></html>`;
}

const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v || '—')}</b></td></tr>`;

/**
 * Never throws. Returns { ok, id?, error? } so callers can persist the outcome
 * (e.g. a Lead is already saved before any email is attempted).
 */
<<<<<<< HEAD
async function send({ to, recipient, subject, html, attachments, replyTo }) {
  // Sent by the Cloudflare Pages Function /api/email (it holds the Resend key; the browser never
  // sees it). If that function or its key isn't set up, emails are simply skipped.
  try {
    const payload = {
      ...(recipient ? { recipient } : { to: Array.isArray(to) ? to : [to] }),
      subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 250),
      html
    };
=======
async function send({ to, subject, html, attachments, replyTo }) {
  // Sent by the Cloudflare Pages Function /api/email (it holds the Resend key; the browser never
  // sees it). If that function or its key isn't set up, emails are simply skipped.
  try {
    const payload = { to: Array.isArray(to) ? to : [to], subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 250), html };
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
    if (attachments?.length) {
      payload.attachments = attachments.map((x) => ({ filename: x.filename, content: Buffer.isBuffer(x.content) ? x.content.toString('base64') : x.content }));
    }
    if (replyTo) payload.replyTo = replyTo;
    const r = (await rt.sendEmail(payload)) || {};
    if (!r.ok) console.warn('[email] skipped:', subject, '->', r.error || 'not sent');
    return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error || 'Email not sent' };
  } catch (e) {
    console.warn('[email] failed:', subject, '->', e.message);
    return { ok: false, error: e.message };
  }
}

/* ---------------- Templates ---------------- */

function notifyAgencyOfLead(lead) {
  const html = layout(
    lead.isQuoteRequest ? 'New quote request' : 'New website enquiry',
    `<table style="font-size:14px">${row('Name', lead.name)}${row('Company', lead.company)}${row('Email', lead.email)}${row('Phone', lead.phone)}${row('Country', lead.country)}${row('Service', lead.service)}${row('Budget', lead.budget)}${row('Preferred contact', lead.preferredContact)}</table>
     <p style="margin-top:18px;font-size:14px;line-height:1.6;white-space:pre-wrap;background:#f7f7fd;padding:14px;border-radius:10px">${esc(lead.description)}</p>
     <p><a href="${esc(config.clientUrl)}/crm/leads" style="display:inline-block;background:#6c2bf2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open in CRM</a></p>`
  );
<<<<<<< HEAD
  return send({ recipient: 'agency', subject: `New ${lead.isQuoteRequest ? 'quote request' : 'enquiry'}: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`, html, replyTo: lead.email });
=======
  return send({ to: config.agencyEmail, subject: `New ${lead.isQuoteRequest ? 'quote request' : 'enquiry'}: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`, html, replyTo: lead.email });
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
}

function acknowledgeLead(lead) {
  const html = layout(
    `Thanks for reaching out, ${lead.name.split(' ')[0]}!`,
    `<p style="font-size:15px;line-height:1.7">We have received your ${lead.isQuoteRequest ? 'quote request' : 'enquiry'} about <b>${esc(lead.service || 'your project')}</b>. Our team will review the details and get back to you within one business day${lead.preferredContact && lead.preferredContact !== 'any' ? ` by ${esc(lead.preferredContact)}` : ''}.</p>
     <p style="font-size:14px;color:#6b7280">A copy of what you sent us:</p>
     <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;background:#f7f7fd;padding:14px;border-radius:10px">${esc(lead.description)}</p>
     <p style="font-size:14px">Warm regards,<br><b>${esc(config.agency.name)}</b></p>`
  );
<<<<<<< HEAD
  return send({ to: lead.email, subject: `We received your enquiry – ${config.agency.name}`, html });
=======
  return send({ to: lead.email, subject: `We received your enquiry – ${config.agency.name}`, html, replyTo: config.agencyEmail });
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
}

function sendQuotationEmail(q, client, pdfBuffer, viewUrl) {
  const html = layout(
    `Quotation ${q.number}`,
    `<p style="font-size:15px;line-height:1.7">Hello ${esc(client.contactPerson)},</p>
     <p style="font-size:15px;line-height:1.7">Please find attached our quotation for <b>${esc(q.projectName)}</b>.</p>
     <table style="font-size:14px">${row('Quotation no.', q.number)}${row('Total', money(q.grandTotal, q.currency))}${row('Valid until', fmtDate(q.expiryDate))}</table>
     ${viewUrl ? `<p><a href="${esc(viewUrl)}" style="display:inline-block;background:#6c2bf2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View online</a></p>` : ''}
     <p style="font-size:14px">Reply to this email with any questions.<br><b>${esc(config.agency.name)}</b></p>`
  );
  return send({
    to: client.email,
    subject: `Quotation ${q.number} – ${q.projectName}`,
    html,
<<<<<<< HEAD
=======
    replyTo: config.agencyEmail,
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
    attachments: [{ filename: `${q.number}.pdf`, content: pdfBuffer }]
  });
}

function sendInvoiceEmail(inv, client, pdfBuffer, reminder = false) {
  const html = layout(
    reminder ? `Payment reminder – ${inv.number}` : `Invoice ${inv.number}`,
    `<p style="font-size:15px;line-height:1.7">Hello ${esc(client.contactPerson)},</p>
     <p style="font-size:15px;line-height:1.7">${reminder ? 'This is a friendly reminder that the following invoice is awaiting payment.' : 'Please find your invoice attached.'}</p>
     <table style="font-size:14px">${row('Invoice no.', inv.number)}${row('Project', inv.projectName)}${row('Total', money(inv.total))}${row('Paid so far', money(inv.amountPaid))}${row('Balance due', money(inv.balance))}${row('Due date', fmtDate(inv.dueDate))}</table>
     ${inv.paymentInstructions ? `<p style="font-size:13px;white-space:pre-wrap;background:#f7f7fd;padding:12px;border-radius:10px">${esc(inv.paymentInstructions)}</p>` : ''}
     <p style="font-size:14px">Thank you,<br><b>${esc(config.agency.name)}</b></p>`
  );
  return send({
    to: client.email,
    subject: `${reminder ? 'Reminder: ' : ''}Invoice ${inv.number} – ${money(inv.balance)} due ${fmtDate(inv.dueDate)}`,
    html,
<<<<<<< HEAD
=======
    replyTo: config.agencyEmail,
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
    attachments: [{ filename: `${inv.number}.pdf`, content: pdfBuffer }]
  });
}

function sendReceiptEmail(payment, client, pdfBuffer) {
  const html = layout(
    `Payment received – ${payment.receiptNumber}`,
    `<p style="font-size:15px;line-height:1.7">Hello ${esc(client.contactPerson)}, we have received your payment of <b>${money(payment.amount)}</b> on ${fmtDate(payment.paidOn)}. Your receipt is attached. Thank you!</p>`
  );
<<<<<<< HEAD
  return send({ to: client.email, subject: `Payment receipt ${payment.receiptNumber}`, html, attachments: [{ filename: `${payment.receiptNumber}.pdf`, content: pdfBuffer }] });
}

function notifyAdmins(subject, title, bodyHtml) {
  return send({ recipient: 'agency', subject, html: layout(title, bodyHtml) });
=======
  return send({ to: client.email, subject: `Payment receipt ${payment.receiptNumber}`, html, replyTo: config.agencyEmail, attachments: [{ filename: `${payment.receiptNumber}.pdf`, content: pdfBuffer }] });
}

function notifyAdmins(subject, title, bodyHtml) {
  if (!config.agencyEmail) return Promise.resolve({ ok: false, error: 'AGENCY_EMAIL missing' });
  return send({ to: config.agencyEmail, subject, html: layout(title, bodyHtml) });
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
}

module.exports = { send, esc, money, fmtDate, notifyAgencyOfLead, acknowledgeLead, sendQuotationEmail, sendInvoiceEmail, sendReceiptEmail, notifyAdmins };
