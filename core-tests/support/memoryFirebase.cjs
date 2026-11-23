/**
 * Test double for Cloud Firestore + Cloud Storage (used when the Firestore emulator jar is
 * not available). Storage is in memory, but EVERY write is first validated by a real
 * @google-cloud/firestore WriteBatch, so values the real service would reject (custom class
 * instances, misplaced FieldValue.delete(), empty keys, undefined in queries, …) fail here
 * too. On top of that it rejects nested arrays and functions, which the backend rejects.
 *
 * Supported surface = exactly what the app uses: collection/doc/get/create/update/set(merge)/
 * delete, where(==, array-contains)/orderBy/offset/limit/count, getAll, batch, runTransaction,
 * FieldValue.delete/arrayUnion/arrayRemove/increment/serverTimestamp. Dates come back as
 * Timestamps, like the real service.
 */
const { Firestore, FieldValue, Timestamp } = require('@google-cloud/firestore');

const validator = new Firestore({ projectId: 'demo-fourix' });
validator.settings({ ignoreUndefinedProperties: true });

const store = new Map(); // collection -> Map(id -> data)
const stats = { reads: 0, listenerStarts: 0 };
const files = new Map(); // object name -> { buffer, contentType }
let failComposite = false;
const updateTimes = new Map(); // "col/id" -> Timestamp of last write
const listeners = new Map(); // col -> Set(fn)
let listenerDelay = 0;
let clock = 0;
const nextTime = () => { clock = Math.max(clock + 1, Date.now() * 1000); return new Timestamp(Math.floor(clock / 1e6), (clock % 1e6) * 1000); };
function emit(col, id, type) {
  const t = nextTime();
  updateTimes.set(`${col}/${id}`, t);
  const fns = listeners.get(col);
  if (fns && fns.size) {
    const data = colMap(col).get(id);
    const change = { type, doc: { id, exists: type !== 'removed', updateTime: t, data: () => clone(data) } };
    const snapEvt = { readTime: t, docChanges: () => [change] };
    fns.forEach((fn) => setTimeout(() => fn(snapEvt), listenerDelay));
  }
  return { writeTime: t };
} // when true, multi-field ordered queries throw FAILED_PRECONDITION (to test the fallback)

const err = (code, msg) => Object.assign(new Error(`${code === 5 ? 'NOT_FOUND' : code === 6 ? 'ALREADY_EXISTS' : 'FAILED_PRECONDITION'}: ${msg}`), { code });

function checkServerRules(v, path = '') {
  if (typeof v === 'function') throw new Error(`Function values are not supported (at ${path})`);
  if (Array.isArray(v)) v.forEach((x, i) => { if (Array.isArray(x)) throw new Error(`Nested arrays are not supported (at ${path}.${i})`); checkServerRules(x, `${path}.${i}`); });
  else if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Timestamp) && !Buffer.isBuffer(v) && !(v instanceof FieldValue)) Object.entries(v).forEach(([k, x]) => checkServerRules(x, `${path}.${k}`));
}
const vRef = (col, id) => validator.collection(col).doc(id);

function encode(v) {
  if (v === undefined) return undefined;
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (Array.isArray(v)) return v.map(encode).filter((x) => x !== undefined);
  if (v instanceof Uint8Array) return Buffer.from(v); // the real service returns bytes as Buffer
  if (v && typeof v === 'object' && !(v instanceof Timestamp) && !Buffer.isBuffer(v) && !(v instanceof FieldValue)) {
    const o = {};
    Object.entries(v).forEach(([k, x]) => { const e = encode(x); if (e !== undefined) o[k] = e; });
    return o;
  }
  return v;
}
const clone = (v) => {
  if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
  if (Array.isArray(v)) return v.map(clone);
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (v && typeof v === 'object') { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = clone(x); }); return o; }
  return v;
};
const eq = (a, b) => {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  if (a instanceof Timestamp || b instanceof Timestamp) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every((k) => eq(a[k], b[k])); }
  return a === b;
};
function applyTransform(current, t) {
  switch (t.methodName) {
    case 'FieldValue.serverTimestamp': return Timestamp.now();
    case 'FieldValue.increment': return (typeof current === 'number' ? current : 0) + t.operand;
    case 'FieldValue.arrayUnion': { const arr = Array.isArray(current) ? [...current] : []; t.elements.map(encode).forEach((e) => { if (!arr.some((x) => eq(x, e))) arr.push(e); }); return arr; }
    case 'FieldValue.arrayRemove': { const arr = Array.isArray(current) ? current : []; const rm = t.elements.map(encode); return arr.filter((x) => !rm.some((e) => eq(x, e))); }
    default: throw new Error(`Unsupported transform ${t.methodName}`);
  }
}
function setField(obj, path, value) {
  const segs = path.split('.'); let o = obj;
  for (let i = 0; i < segs.length - 1; i += 1) { if (!o[segs[i]] || typeof o[segs[i]] !== 'object') o[segs[i]] = {}; o = o[segs[i]]; }
  const last = segs[segs.length - 1];
  if (value instanceof FieldValue && value.methodName === 'FieldValue.delete') delete o[last];
  else if (value instanceof FieldValue) o[last] = applyTransform(o[last], value);
  else o[last] = encode(value);
}
const getField = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function mergeDeep(target, src) {
  Object.entries(src).forEach(([k, v]) => {
    if (v instanceof FieldValue) setField(target, k, v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Timestamp) && !Buffer.isBuffer(v)) { if (!target[k] || typeof target[k] !== 'object') target[k] = {}; mergeDeep(target[k], v); }
    else if (v !== undefined) target[k] = encode(v);
  });
}
function materialise(data) {
  const out = {};
  Object.entries(data).forEach(([k, v]) => { if (v instanceof FieldValue) { if (v.methodName !== 'FieldValue.delete') out[k] = applyTransform(undefined, v); } else if (v !== undefined) out[k] = encode(v); });
  return out;
}

const colMap = (name) => { if (!store.has(name)) store.set(name, new Map()); return store.get(name); };
const snap = (col, id) => {
  const d = colMap(col).get(id);
  return { id, exists: !!d, ref: new DocRef(col, id), data: () => (d ? clone(d) : undefined), get: (f) => (d ? clone(getField(d, f)) : undefined) };
};

/* ---- write primitives (validated by the real SDK first) ---- */
function doCreate(col, id, data) {
  validator.batch().create(vRef(col, id), data); checkServerRules(data);
  if (colMap(col).has(id)) throw err(6, `Document already exists: ${col}/${id}`);
  colMap(col).set(id, materialise(data));
  return emit(col, id, 'added');
}
function doSet(col, id, data, opts = {}) {
  validator.batch().set(vRef(col, id), data, opts); checkServerRules(data);
  const existed = colMap(col).has(id);
  if (opts.merge) { const cur = clone(colMap(col).get(id) || {}); mergeDeep(cur, data); colMap(col).set(id, cur); } else colMap(col).set(id, materialise(data));
  return emit(col, id, existed ? 'modified' : 'added');
}
function doUpdate(col, id, data) {
  validator.batch().update(vRef(col, id), data); checkServerRules(data);
  const cur = colMap(col).get(id);
  if (!cur) throw err(5, `No document to update: ${col}/${id}`);
  const next = clone(cur);
  Object.entries(data).forEach(([k, v]) => setField(next, k, v));
  colMap(col).set(id, next);
  return emit(col, id, 'modified');
}
const doDelete = (col, id) => { const had = colMap(col).delete(id); return had ? emit(col, id, 'removed') : { writeTime: nextTime() }; };

class DocRef {
  constructor(col, id) { this.col = col; this.id = id; this.path = `${col}/${id}`; }
  async get() { return snap(this.col, this.id); }
  async create(d) { return doCreate(this.col, this.id, d); }
  async set(d, o) { return doSet(this.col, this.id, d, o); }
  async update(d) { return doUpdate(this.col, this.id, d); }
  async delete() { return doDelete(this.col, this.id); }
  collection(name) { return new CollectionRef(`${this.col}/${this.id}/${name}`); }
}

const TYPE_ORDER = (v) => (v === null ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'number' ? 2 : v instanceof Timestamp ? 3 : typeof v === 'string' ? 4 : Array.isArray(v) ? 8 : 9);
function cmp(a, b) {
  const ta = TYPE_ORDER(a); const tb = TYPE_ORDER(b);
  if (ta !== tb) return ta - tb;
  if (a instanceof Timestamp) return a.toMillis() - b.toMillis();
  if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b);
  return 0;
}

class Query {
  constructor(col, state = { wheres: [], order: null, off: 0, lim: null }) { this.col = col; this.s = state; }
  _with(p) { return new Query(this.col, { ...this.s, ...p, wheres: p.wheres || this.s.wheres }); }
  where(f, op, v) {
    validator.collection(this.col).where(f, op, v); // real argument validation
    if (!['==', 'array-contains'].includes(op)) throw new Error(`memoryFirestore: operator ${op} not supported`);
    return this._with({ wheres: [...this.s.wheres, { f, op, v: encode(v) }] });
  }
  orderBy(f, dir = 'asc') { return this._with({ order: { f, dir } }); }
  offset(n) { return this._with({ off: n }); }
  limit(n) { return this._with({ lim: n }); }
  _run() {
    const fields = new Set(this.s.wheres.map((w) => w.f));
    if (failComposite && this.s.order && fields.size >= 1 && !fields.has(this.s.order.f)) {
      throw err(9, `The query requires an index. You can create it here: https://console.firebase.google.com/fake-index-link (${this.col})`);
    }
    let rows = [...colMap(this.col).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    rows = rows.filter(([, d]) => this.s.wheres.every((w) => {
      const v = getField(d, w.f);
      return w.op === '==' ? v !== undefined && eq(v, w.v) : Array.isArray(v) && v.some((x) => eq(x, w.v));
    }));
    if (this.s.order) {
      const { f, dir } = this.s.order;
      rows = rows.filter(([, d]) => getField(d, f) !== undefined).sort((a, b) => cmp(getField(a[1], f), getField(b[1], f)) * (dir === 'desc' ? -1 : 1));
    }
    if (this.s.off) rows = rows.slice(this.s.off);
    if (this.s.lim !== null) rows = rows.slice(0, this.s.lim);
    return rows.map(([id]) => snap(this.col, id));
  }
  async get() { const docs = this._run(); stats.reads += docs.length || 1; return { docs, empty: !docs.length, size: docs.length }; }
  count() { return { get: async () => ({ data: () => ({ count: this._run().length }) }) }; }
}
class CollectionRef extends Query {
  constructor(name) { super(name); this.id = name; }
  doc(id) {
    if (id === undefined) id = Array.from({ length: 20 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
    if (!id || String(id).includes('/')) throw new Error(`Invalid document id "${id}"`); return new DocRef(this.col, String(id)); }
  /** Real-time listener: first an "added" event for every document, then one event per write. */
  onSnapshot(next) {
    if (!listeners.has(this.col)) listeners.set(this.col, new Set());
    const fn = (e) => next(e);
    listeners.get(this.col).add(fn);
    stats.listenerStarts += 1;
    setTimeout(() => {
      const changes = [...colMap(this.col).keys()].map((id) => ({ type: 'added', doc: { id, exists: true, updateTime: updateTimes.get(`${this.col}/${id}`) || nextTime(), data: () => clone(colMap(this.col).get(id)) } }));
      stats.reads += changes.length || 1;
      next({ readTime: nextTime(), docChanges: () => changes });
    }, 0);
    return () => listeners.get(this.col)?.delete(fn);
  }
}

const db = {
  settings() {},
  collection: (name) => new CollectionRef(name),
  async getAll(...refs) { stats.reads += refs.length; return refs.map((r) => snap(r.col, r.id)); },
  batch() {
    const ops = [];
    const b = {
      create: (r, d) => { validator.batch().create(vRef(r.col, r.id), d); ops.push(() => doCreate(r.col, r.id, d)); return b; },
      set: (r, d, o) => { validator.batch().set(vRef(r.col, r.id), d, o); ops.push(() => doSet(r.col, r.id, d, o)); return b; },
      update: (r, d) => { validator.batch().update(vRef(r.col, r.id), d); ops.push(() => doUpdate(r.col, r.id, d)); return b; },
      delete: (r) => { ops.push(() => doDelete(r.col, r.id)); return b; },
      commit: async () => { if (ops.length > 500) throw new Error('A batch can contain at most 500 writes'); return ops.map((o) => o() || { writeTime: nextTime() }); }
    };
    return b;
  },
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      get: async (r) => (r instanceof DocRef ? snap(r.col, r.id) : r.get()),
      set: (r, d, o) => { writes.push(() => doSet(r.col, r.id, d, o)); return tx; },
      update: (r, d) => { writes.push(() => doUpdate(r.col, r.id, d)); return tx; },
      create: (r, d) => { writes.push(() => doCreate(r.col, r.id, d)); return tx; },
      delete: (r) => { writes.push(() => doDelete(r.col, r.id)); return tx; }
    };
    const out = await fn(tx);
    writes.forEach((w) => w());
    return out;
  }
};

const { PassThrough } = require('stream');
const bucket = {
  name: 'demo-fourix.appspot.com',
  file: (name) => ({
    name,
    async save(buffer, opts = {}) { files.set(name, { buffer: Buffer.from(buffer), contentType: opts.contentType }); },
    async exists() { return [files.has(name)]; },
    async delete(opts = {}) { if (!files.has(name) && !opts.ignoreNotFound) throw Object.assign(new Error('No such object'), { code: 404 }); files.delete(name); },
    createReadStream() {
      const s = new PassThrough();
      process.nextTick(() => { if (!files.has(name)) s.emit('error', Object.assign(new Error('No such object'), { code: 404 })); else s.end(files.get(name).buffer); });
      return s;
    }
  }),
  async getFiles({ prefix = '' } = {}) { return [[...files.keys()].filter((n) => n.startsWith(prefix)).map((name) => ({ name }))]; }
};

/** Plug the in-memory Firestore into the core runtime. */
function install() {
  const { setRuntime } = require('../../core/runtime');
  setRuntime({ db, FieldValue, isTimestamp: (v) => v instanceof Timestamp });
  return { db };
}

module.exports = {
  install, db, bucket, store, files, stats,
  reset() { store.clear(); files.clear(); failComposite = false; updateTimes.clear(); listeners.clear(); listenerDelay = Number(process.env.MEM_LISTENER_DELAY || 0); stats.reads = 0; stats.listenerStarts = 0; },
  setListenerDelay(ms) { listenerDelay = ms; },
  setFailComposite(v) { failComposite = v; }
};
