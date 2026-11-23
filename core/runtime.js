/**
 * Everything the business logic needs from its environment, injected by the host:
 *   - in the browser: src/services/coreHost.js (Firebase Web SDK, Firebase Auth, pdfkit, logo)
 *   - in Node tests:  tests/support/nodeHost.js (in-memory Firestore + Auth emulator)
 *
 * rt.db              Firestore with the "admin-style" facade API (collection/doc/get/where/batch/…)
 * rt.FieldValue      { delete(), arrayUnion(...v), arrayRemove(...v), increment(n), serverTimestamp() }
 * rt.isTimestamp(v)  true for Firestore Timestamps
 * rt.latencyCompensated  true in the browser: the SDK applies local writes to listeners itself
 * rt.authApi         signIn / signOut / currentUser / tokenInfo / changePassword / createPortalUser / sendPasswordReset / idToken
 * rt.loadPdfKit()    -> PDFDocument class
 * rt.loadLogo()      -> Uint8Array | null
 * rt.sendEmail(msg)  -> { ok, id?, error? }
 * rt.env             { agency defaults, clientUrl, maxUploadMb, sessionHours }
 */
const rt = {
  db: null,
  FieldValue: null,
  isTimestamp: (v) => !!v && typeof v === 'object' && typeof v.toDate === 'function' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number',
  latencyCompensated: false,
  authApi: null,
  loadPdfKit: null,
  loadLogo: async () => null,
  sendEmail: async () => ({ ok: false, error: 'Email is not configured' }),
  env: {},
  onAdminWrite: null
};

function setRuntime(patch) {
  Object.assign(rt, patch);
  return rt;
}

module.exports = { rt, setRuntime };
