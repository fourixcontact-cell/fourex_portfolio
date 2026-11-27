import { authApi } from './firebase';
import { getFirestoreDb, clearLocalData } from './firestoreDb';
import { makeFacade, FieldValue, isTimestamp } from './firestoreFacade';

/**
 * Loads the CRM/portal business logic (bundled from /core into src/generated/core.js) and
 * plugs in what it needs from the browser: Firestore, Firebase Auth, pdfkit, email.
 * Public website visitors never load it: it is imported only by CRM / portal requests.
 */
const env = {
  mode: import.meta.env.MODE,
  clientUrl: typeof window !== 'undefined' ? window.location.origin : '',
  maxUploadMb: Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 10,
  agency: {
    name: 'Fourix',
    tagline: import.meta.env.VITE_AGENCY_TAGLINE || 'Software Development Studio',
    email: import.meta.env.VITE_PUBLIC_AGENCY_EMAIL || import.meta.env.VITE_AGENCY_EMAIL || ''
  }
};

const sessionStore = {
  get(uid) { try { return localStorage.getItem(`fourix.session.${uid}`); } catch { return null; } },
  set(uid, sid) { try { localStorage.setItem(`fourix.session.${uid}`, String(sid)); } catch { /* private mode */ } },
  clear() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('fourix.session.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  }
};

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.arrayBuffer(); // pdfkit's browser build accepts ArrayBuffers for fonts and images
}

/** pdfkit (standalone browser build), the PDF fonts and the logo: loaded on the first PDF only. */
async function loadPdfKit() {
  const [{ default: PDFDocument }, regular, bold, serif, serifBold, logo] = await Promise.all([
    import('pdfkit/js/pdfkit.standalone.js'),
    fetchBytes('/pdf/DejaVuSans.ttf'),
    fetchBytes('/pdf/DejaVuSans-Bold.ttf'),
    fetchBytes('/pdf/DejaVuSerif.ttf'),
    fetchBytes('/pdf/DejaVuSerif-Bold.ttf'),
    fetchBytes('/pdf/logo.png').catch(() => null)
  ]);
  return { PDFDocument, fonts: { regular, bold, serif, serifBold }, logo };
}

/**
 * Emails go through the Cloudflare Pages Function at /api/email, which holds the Resend key.
 * If it isn't deployed or has no key, the CRM keeps working and the email is just skipped.
 */
async function sendEmail(message) {
  try {
    const token = await authApi.idToken();
    const r = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ kind: 'admin', message })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || `Email service returned ${r.status}` };
    return data.ok ? { ok: true, id: data.id } : { ok: false, error: data.error || 'Email skipped' };
  } catch (e) {
    return { ok: false, error: `Email service not reachable (${e.message})` };
  }
}

let corePromise = null;

export function loadCore() {
  if (!corePromise) {
    corePromise = import('../generated/core.js').then((m) => {
      const core = m.default || m;
      core.setRuntime({
        db: makeFacade(getFirestoreDb()),
        FieldValue,
        isTimestamp,
        latencyCompensated: true,
        authApi,
        loadPdfKit,
        sendEmail,
        env,
        sessionStore
      });
      return core;
    }).catch((e) => { corePromise = null; throw e; });
  }
  return corePromise;
}

/** After sign-out: stop live listeners, wipe the local Firestore copy, start clean. */
export async function resetAfterSignOut() {
  if (corePromise) {
    const core = await corePromise;
    try { core.resetLiveData(); } catch { /* ignore */ }
    try { core.housekeeping.reset(); } catch { /* ignore */ }
    await clearLocalData();
    core.setRuntime({ db: makeFacade(getFirestoreDb()) });
  } else {
    await clearLocalData();
  }
}
