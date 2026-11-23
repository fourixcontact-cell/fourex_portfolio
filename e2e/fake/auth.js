// In-browser stand-in for firebase/auth (UI tests only, vite --mode e2e).
import { authStore } from './store';

const err = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
function mkUser(rec, email, authTime) {
  return {
    uid: rec.uid, email, displayName: rec.name || '',
    _authTime: authTime,
    getIdToken: async () => `fake.${rec.uid}`
  };
}
class FakeAuth {
  constructor(persist) {
    this.persist = persist;
    const s = authStore.read();
    this.currentUser = persist && s.current ? mkUser(s.users[s.current.email], s.current.email, s.current.authTime) : null;
  }
  async authStateReady() {}
  _set(email, rec) {
    const authTime = new Date(Math.floor(Date.now() / 1000) * 1000).toUTCString();
    this.currentUser = rec ? mkUser(rec, email, authTime) : null;
    if (this.persist) { const s = authStore.read(); s.current = rec ? { email, authTime } : null; authStore.write(s); }
  }
}
export const browserLocalPersistence = 'local';
export const initializeAuth = (app, opts = {}) => new FakeAuth(!Array.isArray(opts.persistence));
export const connectAuthEmulator = () => {};
export async function signInWithEmailAndPassword(auth, email, password) {
  const e = String(email).toLowerCase();
  const rec = authStore.read().users[e];
  if (!rec || rec.password !== password) throw err('auth/invalid-credential');
  auth._set(e, rec);
  return { user: auth.currentUser };
}
export async function signOut(auth) { auth._set(null, null); }
export async function createUserWithEmailAndPassword(auth, email, password) {
  const s = authStore.read();
  const e = String(email).toLowerCase();
  if (s.users[e]) throw err('auth/email-already-in-use');
  s.users[e] = { uid: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(28, 'x').slice(0, 28), password };
  authStore.write(s);
  auth._set(e, s.users[e]);
  return { user: auth.currentUser };
}
export async function updateProfile(user, { displayName }) {
  const s = authStore.read(); if (s.users[user.email]) { s.users[user.email].name = displayName; authStore.write(s); }
}
export async function sendPasswordResetEmail(auth, email) { window.__resetEmails = [...(window.__resetEmails || []), email]; }
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function reauthenticateWithCredential(user, cred) {
  const rec = authStore.read().users[user.email];
  if (!rec || rec.password !== cred.password) throw err('auth/wrong-password');
  await new Promise((r) => setTimeout(r, 1100));
  user._authTime = new Date(Math.floor(Date.now() / 1000) * 1000).toUTCString();
  const s = authStore.read(); if (s.current) { s.current.authTime = user._authTime; authStore.write(s); }
}
export async function updatePassword(user, pw) { const s = authStore.read(); s.users[user.email].password = pw; authStore.write(s); }
export async function getIdTokenResult(user) { return { authTime: user._authTime, claims: { email: user.email } }; }
