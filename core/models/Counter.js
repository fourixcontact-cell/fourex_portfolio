const { db, FieldValue } = require('../db/firebase');

/**
 * Atomic, gap-tolerant sequence backed by a Firestore transaction:
 *   nextNumber('QT') -> "QT-2026-0001"
 * Counters live in the `counters` collection, one document per key (e.g. "QT-2026").
 */
async function nextNumber(prefix, { yearly = true, pad = 4 } = {}) {
  const year = new Date().getFullYear();
  const key = yearly ? `${prefix}-${year}` : prefix;
  const ref = db().collection('counters').doc(key);
  const n = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(ref, { seq: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  const seq = String(n).padStart(pad, '0');
  return yearly ? `${prefix}-${year}-${seq}` : `${prefix}-${seq}`;
}

module.exports = { nextNumber };
