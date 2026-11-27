// Shared in-browser "Firestore + Auth" store for UI tests (persisted in localStorage so page
// reloads keep data, like the real service). Only used by `vite --mode e2e`.
const KEY = '__fake_firestore__';
const AKEY = '__fake_auth__';

export class Timestamp {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static fromDate(d) { const ms = d.getTime(); return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static fromMillis(ms) { return Timestamp.fromDate(new Date(ms)); }
  static now() { return Timestamp.fromDate(new Date()); }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  isEqual(o) { return o instanceof Timestamp && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
  valueOf() { return String(this.toMillis()).padStart(16, '0'); }
}
export class Bytes {
  constructor(u8) { this._u = u8; }
  static fromUint8Array(u) { return new Bytes(new Uint8Array(u)); }
  static fromBase64String(s) { return new Bytes(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); }
  toUint8Array() { return new Uint8Array(this._u); }
  toBase64() { let s = ''; const u = this._u; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
}

function enc(v) {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (v instanceof Bytes) return { __b: v.toBase64() };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = enc(v[k]); }); return o; }
  return v;
}
export function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    if (v.__ts) return new Timestamp(v.__ts[0], v.__ts[1]);
    if (v.__b !== undefined) return Bytes.fromBase64String(v.__b);
    const o = {}; Object.keys(v).forEach((k) => { o[k] = dec(v[k]); }); return o;
  }
  return v;
}

// One localStorage entry per document, so several tabs of the same browser see the same data.
const P = `${KEY}/`;
const listenersOut = new Set();
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(P)) listenersOut.forEach((fn) => fn()); });

export const store = {
  get: (path) => { const raw = localStorage.getItem(P + path); return raw == null ? undefined : dec(JSON.parse(raw)); },
  put: (path, data) => { localStorage.setItem(P + path, JSON.stringify(enc(data))); },
  del: (path) => { localStorage.removeItem(P + path); },
  list: (colPath) => {
    const pre = `${P}${colPath}/`;
    const out = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push(k.slice(P.length));
    }
    return out;
  },
  onExternalChange: (fn) => listenersOut.add(fn),
  flush: () => {}
};

export const authStore = {
  read() { try { return JSON.parse(localStorage.getItem(AKEY) || '{"users":{},"current":null}'); } catch { return { users: {}, current: null }; } },
  write(s) { localStorage.setItem(AKEY, JSON.stringify(s)); }
};

// Seed: the four admins of e2e/README (a1..a4@ui.test / Demo0Passw0rd!), past the first password change.
(function seed() {
  const a = authStore.read();
  if (Object.keys(a.users).length) return;
  for (let i = 1; i <= 4; i += 1) {
    const uid = `e2eAdmin${i}`.padEnd(28, '0');
    a.users[`a${i}@ui.test`] = { uid, password: 'Demo0Passw0rd!', name: `Admin ${i}` };
    const now = Timestamp.now();
    store.put(`users/${uid}`, { name: `Admin ${i}`, email: `a${i}@ui.test`, role: 'admin', isActive: true, isPasswordChanged: true, avatarColor: '#7c3aed', createdAt: now, updatedAt: now });
  }
  authStore.write(a);
  store.flush();
}());
