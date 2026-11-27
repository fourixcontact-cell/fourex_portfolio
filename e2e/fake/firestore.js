// In-memory stand-in for the parts of the Firebase Web SDK (firebase/firestore and
// firebase/firestore/lite) that Fourix uses. UI tests only (vite --mode e2e). It does NOT check
// firestore.rules.
import { store, Timestamp, Bytes } from './store';

export { Timestamp, Bytes };
const FS = { type: 'firestore' };
const listeners = new Set();
store.onExternalChange(() => listeners.forEach((l) => l.check()));
let autoSeq = 0;
const autoId = () => { let s = ''; for (let i = 0; i < 20; i += 1) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]; autoSeq += 1; return s; };

class Sentinel { constructor(op, v) { this.op = op; this.v = v; } }
export const deleteField = () => new Sentinel('delete');
export const arrayUnion = (...v) => new Sentinel('union', v);
export const arrayRemove = (...v) => new Sentinel('remove', v);
export const increment = (n) => new Sentinel('inc', n);
export const serverTimestamp = () => new Sentinel('ts');

const mkDoc = (path) => ({ type: 'document', path, id: path.split('/').pop(), get parent() { return mkCol(path.split('/').slice(0, -1).join('/')); }, firestore: FS });
const mkCol = (path) => ({ type: 'collection', path, id: path.split('/').pop(), firestore: FS, constraints: [] });

export function collection(parent, ...segs) {
  const base = parent && parent.path ? parent.path : '';
  return mkCol([base, ...segs].filter(Boolean).join('/'));
}
export function doc(parent, ...segs) {
  if (parent && parent.type === 'collection') return mkDoc(`${parent.path}/${segs.length ? segs.join('/') : autoId()}`);
  const base = parent && parent.path ? parent.path : '';
  return mkDoc([base, ...segs].filter(Boolean).join('/'));
}

export const where = (f, op, v) => ({ kind: 'where', f, op, v });
export const orderBy = (f, dir = 'asc') => ({ kind: 'order', f, dir });
export const limit = (n) => ({ kind: 'limit', n });
export function query(base, ...cs) { return { ...base, type: 'query', path: base.path, constraints: [...(base.constraints || []), ...cs] }; }

const getField = (o, f) => String(f).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const norm = (v) => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function cmp(a, b) { const x = norm(a); const y = norm(b); if (x === y) return 0; if (x === undefined || x === null) return -1; if (y === undefined || y === null) return 1; return x < y ? -1 : 1; }
function match(d, w) {
  const v = getField(d, w.f);
  switch (w.op) {
    case '==': return v !== undefined && same(v, w.v);
    case '!=': return v !== undefined && !same(v, w.v);
    case '<': return v !== undefined && cmp(v, w.v) < 0;
    case '<=': return v !== undefined && cmp(v, w.v) <= 0;
    case '>': return v !== undefined && cmp(v, w.v) > 0;
    case '>=': return v !== undefined && cmp(v, w.v) >= 0;
    case 'in': return v !== undefined && w.v.some((x) => same(v, x));
    case 'not-in': return v !== undefined && !w.v.some((x) => same(v, x));
    case 'array-contains': return Array.isArray(v) && v.some((x) => same(x, w.v));
    case 'array-contains-any': return Array.isArray(v) && v.some((x) => w.v.some((y) => same(x, y)));
    default: throw new Error(`fake firestore: op ${w.op}`);
  }
}

function toStoreVal(v) {
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (v instanceof Sentinel && v.op === 'ts') return Timestamp.now();
  if (v instanceof Timestamp || v instanceof Bytes) return v;
  if (v instanceof Uint8Array) throw new Error('fake firestore: raw Uint8Array is not a valid Firestore value (use Bytes)');
  if (Array.isArray(v)) return v.map(toStoreVal);
  if (v && typeof v === 'object') {
    if (v.constructor !== Object && Object.getPrototypeOf(v) !== null) throw new Error(`fake firestore: unsupported value ${v.constructor && v.constructor.name}`);
    const o = {}; Object.keys(v).forEach((k) => { if (v[k] !== undefined && !(v[k] instanceof Sentinel && v[k].op === 'delete')) o[k] = toStoreVal(v[k]); }); return o;
  }
  return v;
}
function applySentinel(cur, s) {
  if (s.op === 'delete') return undefined;
  if (s.op === 'ts') return Timestamp.now();
  if (s.op === 'inc') return (Number(cur) || 0) + s.v;
  if (s.op === 'union') { const a = Array.isArray(cur) ? [...cur] : []; s.v.forEach((x) => { if (!a.some((y) => same(y, x))) a.push(toStoreVal(x)); }); return a; }
  if (s.op === 'remove') return (Array.isArray(cur) ? cur : []).filter((y) => !s.v.some((x) => same(x, y)));
  return cur;
}
function setPath(o, path, v) {
  const ks = String(path).split('.');
  let t = o;
  ks.slice(0, -1).forEach((k) => { if (!t[k] || typeof t[k] !== 'object') t[k] = {}; t = t[k]; });
  const last = ks[ks.length - 1];
  if (v instanceof Sentinel) { const nv = applySentinel(t[last], v); if (nv === undefined) delete t[last]; else t[last] = nv; } else if (v === undefined) { /* ignoreUndefinedProperties */ } else t[last] = toStoreVal(v);
}
function mergeInto(cur, data) {
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (v && typeof v === 'object' && !(v instanceof Sentinel) && !(v instanceof Date) && !(v instanceof Timestamp) && !(v instanceof Bytes) && !Array.isArray(v)) {
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      mergeInto(cur[k], v);
    } else setPath(cur, k.includes('.') ? k : k, v);
  });
  return cur;
}
const noSentinelsSet = (data) => { const o = {}; Object.keys(data).forEach((k) => setPath(o, k, data[k])); return o; };

function write(path, fn) {
  const after = fn(store.get(path)); // a fresh decoded copy
  if (after === null) store.del(path); else store.put(path, after);
  queueMicrotask(() => listeners.forEach((l) => l.check()));
}
const notFound = (p) => Object.assign(new Error(`No document to update: ${p}`), { code: 'not-found' });

export async function setDoc(ref, data, opts = {}) { write(ref.path, (cur) => (opts.merge ? mergeInto(cur || {}, data) : noSentinelsSet(data))); }
export async function updateDoc(ref, data) {
  if (!store.get(ref.path)) throw notFound(ref.path);
  write(ref.path, (cur) => { Object.keys(data).forEach((k) => setPath(cur, k, data[k])); return cur; });
}
export async function deleteDoc(ref) { write(ref.path, () => null); }

const meta = { fromCache: false, hasPendingWrites: false };
function docSnap(path) {
  const d = store.get(path);
  return { id: path.split('/').pop(), ref: mkDoc(path), exists: () => d !== undefined, data: () => (d === undefined ? undefined : store.get(path)), get: (f) => getField(d, f), metadata: meta };
}
function run(q) {
  let paths = store.list(q.path).sort();
  const cs = q.constraints || [];
  cs.filter((c) => c.kind === 'where').forEach((w) => { paths = paths.filter((p) => match(store.get(p), w)); });
  const ord = cs.filter((c) => c.kind === 'order');
  if (ord.length) {
    paths = paths.filter((p) => getField(store.get(p), ord[0].f) !== undefined);
    paths.sort((a, b) => { for (const o of ord) { const r = cmp(getField(store.get(a), o.f), getField(store.get(b), o.f)); if (r) return o.dir === 'desc' ? -r : r; } return 0; });
  }
  const lim = cs.filter((c) => c.kind === 'limit').pop();
  if (lim) paths = paths.slice(0, lim.n);
  return paths;
}
function querySnap(paths, changes) {
  const docs = paths.map(docSnap);
  return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn), metadata: meta, docChanges: () => changes || docs.map((d) => ({ type: 'added', doc: d })) };
}

export async function getDoc(ref) { await tick(); return docSnap(ref.path); }
export async function getDocs(q) { await tick(); return querySnap(run(q)); }
export async function getCountFromServer(q) { await tick(); const n = run({ ...q, constraints: (q.constraints || []).filter((c) => c.kind !== 'limit') }).length; return { data: () => ({ count: n }) }; }
const tick = () => new Promise((r) => setTimeout(r, 0));

export function onSnapshot(ref, a, b, c) {
  const opts = a && typeof a === 'object' && !a.next && typeof a !== 'function' ? a : null;
  const next = opts ? b : a;
  const error = opts ? c : b;
  if (ref.type === 'document') {
    let last = JSON.stringify(store.get(ref.path) ?? null);
    const l = { check() { const now = JSON.stringify(store.get(ref.path) ?? null); if (now !== last) { last = now; next(docSnap(ref.path)); } } };
    listeners.add(l);
    setTimeout(() => next(docSnap(ref.path)), 0);
    return () => listeners.delete(l);
  }
  let seen = new Map();
  const snapshotNow = (first) => {
    const paths = run(ref);
    const cur = new Map(paths.map((p) => [p, JSON.stringify(store.get(p))]));
    const changes = [];
    cur.forEach((v, p) => { if (!seen.has(p)) changes.push({ type: 'added', doc: docSnap(p) }); else if (seen.get(p) !== v) changes.push({ type: 'modified', doc: docSnap(p) }); });
    seen.forEach((v, p) => { if (!cur.has(p)) changes.push({ type: 'removed', doc: { id: p.split('/').pop(), ref: mkDoc(p), exists: () => false, data: () => undefined, metadata: meta } }); });
    seen = cur;
    if (first || changes.length) next(querySnap(paths, changes));
  };
  const l = { check: () => { try { snapshotNow(false); } catch (e) { if (error) error(e); } } };
  listeners.add(l);
  setTimeout(() => { try { snapshotNow(true); } catch (e) { if (error) error(e); } }, 0);
  return () => listeners.delete(l);
}

export function writeBatch() {
  const ops = [];
  const b = {
    set: (r, d, o) => { ops.push(() => setDoc(r, d, o)); return b; },
    update: (r, d) => { ops.push(() => updateDoc(r, d)); return b; },
    delete: (r) => { ops.push(() => deleteDoc(r)); return b; },
    commit: async () => { if (ops.length > 500) throw new Error('batch too large'); for (const o of ops) await o(); }
  };
  return b;
}
export async function runTransaction(fs, fn) {
  const ops = [];
  const tx = {
    get: (r) => getDoc(r),
    set: (r, d, o) => { ops.push(() => setDoc(r, d, o)); return tx; },
    update: (r, d) => { ops.push(() => updateDoc(r, d)); return tx; },
    delete: (r) => { ops.push(() => deleteDoc(r)); return tx; }
  };
  const out = await fn(tx);
  for (const o of ops) await o();
  return out;
}

// setup functions
export const initializeFirestore = () => FS;
export const getFirestore = () => FS;
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const connectFirestoreEmulator = () => {};
export const clearIndexedDbPersistence = async () => {};
export const terminate = async () => {};
