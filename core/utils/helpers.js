const { isValidId } = require('../db/odm');
const AppError = require('./AppError');

/** Pagination from query string, with hard caps. */
function getPaging(query, defaultLimit = 10) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function pageMeta(total, { page, limit }) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" filter for several fields. */
function searchFilter(term, fields) {
  if (!term || !String(term).trim()) return null;
  const rx = new RegExp(escapeRegex(String(term).trim().slice(0, 80)), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

function assertObjectId(id, label = 'id') {
  if (!isValidId(typeof id === 'string' ? id : String(id ?? ''))) throw new AppError(`Invalid ${label}`, 400);
}

// Optional reference fields: the UI sends '' for "none", which cannot be cast to an id.
const REF_KEYS = new Set(['assignedTo', 'client', 'project', 'invoice', 'milestone', 'quotation', 'lead', 'task', 'paidBy']);

/** Copy only whitelisted keys (stops mass assignment of privileged fields). */
function pick(obj = {}, keys = []) {
  const out = {};
  keys.forEach((k) => {
    if (obj[k] === undefined) return;
    out[k] = obj[k] === '' && REF_KEYS.has(k) ? null : obj[k];
  });
  return out;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function clientInfo(req) {
  const ua = req.headers['user-agent'] || '';
  let browser = 'Unknown';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Unknown';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const device = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return {
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: ua.slice(0, 300),
    device: `${browser} on ${os} (${device})`
  };
}

module.exports = { getPaging, pageMeta, escapeRegex, searchFilter, assertObjectId, pick, round2, clientInfo };
