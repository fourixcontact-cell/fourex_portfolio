const AuditLog = require('../models/AuditLog');
const { db, FieldValue } = require('../db/firebase');

// Distinct module/action names, kept in one small document so the audit filter dropdowns
// don't need to read every log entry.
const facetsRef = () => db().collection('_meta').doc('auditFacets');
const { clientInfo } = require('../utils/helpers');

const SENSITIVE = /(pass|token|secret|hash|reference|upi|account|cvv|otp|authorization|cookie)/i;

/** Deep clone that drops sensitive keys, ObjectId noise and oversized values. */
function scrub(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[truncated]';
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    if (typeof value.toObject === 'function') value = value.toObject();
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return String(value);
    const out = {};
    Object.keys(value).forEach((k) => {
      if (k === '__v' || SENSITIVE.test(k)) return;
      out[k] = scrub(value[k], depth + 1);
    });
    return out;
  }
  if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}

/** Returns {old,new} containing only fields whose value actually changed. */
function diff(before = {}, after = {}) {
  const b = scrub(before) || {};
  const a = scrub(after) || {};
  const oldValues = {};
  const newValues = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  keys.forEach((k) => {
    if (['createdAt', 'updatedAt', '_id'].includes(k)) return;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      oldValues[k] = b[k];
      newValues[k] = a[k];
    }
  });
  return { oldValues, newValues, changed: Object.keys(newValues).length > 0 };
}

/**
 * Trusted-backend audit writer. Never throws into the request path: an audit
 * failure is logged loudly but must not break the business operation that
 * already succeeded.
 */
async function record(req, { action, module, recordId, description, oldValues, newValues, actor }) {
  try {
    const info = clientInfo(req || { headers: {} });
    const user = actor || req?.user;
    await AuditLog.create({
      adminId: user?._id,
      adminName: user?.name,
      adminEmail: user?.email,
      actorType: user ? (user.role === 'client' ? 'client' : 'admin') : 'public',
      action,
      module,
      recordId: recordId ? String(recordId) : undefined,
      description,
      oldValues: oldValues === undefined ? undefined : scrub(oldValues),
      newValues: newValues === undefined ? undefined : scrub(newValues),
      ip: info.ip,
      device: info.device
    });
    await facetsRef().set({ modules: FieldValue.arrayUnion(module), actions: FieldValue.arrayUnion(action) }, { merge: true });
  } catch (e) {
    console.error('AUDIT WRITE FAILED', action, module, e.message);
  }
}

/** Convenience for update flows: audit only when something changed. */
async function recordUpdate(req, { module, recordId, description, before, after, action = 'UPDATE' }) {
  const d = diff(before, after);
  if (!d.changed) return;
  await record(req, { action, module, recordId, description, oldValues: d.oldValues, newValues: d.newValues });
}

/** Distinct values recorded so far ('modules' | 'actions'); falls back to a scan if the facet doc is missing. */
async function facet(kind) {
  const snap = await facetsRef().get();
  if (snap.exists && Array.isArray(snap.data()[kind])) return [...snap.data()[kind]];
  return AuditLog.distinct(kind === 'modules' ? 'module' : 'action');
}

module.exports = { record, recordUpdate, diff, scrub, facet };
