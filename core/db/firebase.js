/**
 * Firestore access for the business logic. The real implementation is injected at runtime
 * (see ../runtime.js): the Firebase Web SDK in the browser, an in-memory double in tests.
 */
const { rt } = require('../runtime');

const db = () => {
  if (!rt.db) throw new Error('Firestore is not initialised');
  return rt.db;
};

// Sentinels resolved lazily, so modules can import these before the runtime is set.
const FieldValue = {
  delete: () => rt.FieldValue.delete(),
  arrayUnion: (...v) => rt.FieldValue.arrayUnion(...v),
  arrayRemove: (...v) => rt.FieldValue.arrayRemove(...v),
  increment: (n) => rt.FieldValue.increment(n),
  serverTimestamp: () => rt.FieldValue.serverTimestamp()
};

const isTimestamp = (v) => rt.isTimestamp(v);

module.exports = { db, FieldValue, isTimestamp };
