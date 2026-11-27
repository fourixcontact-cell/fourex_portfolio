import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit as qLimit,
  getCountFromServer, writeBatch, runTransaction, onSnapshot, deleteField, arrayUnion, arrayRemove,
  increment, serverTimestamp, Bytes, Timestamp
} from 'firebase/firestore';

/**
 * The CRM's business logic (in /core) was written against the "admin-style" Firestore API
 * (db.collection('x').doc(id).get(), snap.exists, batch(), runTransaction(), ...). This file is a
 * thin wrapper that gives the Firebase Web SDK that same shape, so the logic runs unchanged in
 * the browser. Security comes from firestore.rules, not from this file.
 */

const isPlain = (v) => v && typeof v === 'object' && (v.constructor === Object || Object.getPrototypeOf(v) === null);

/** Uint8Array / Buffer -> Bytes (the Web SDK only stores binary as Bytes). */
function toStore(v) {
  if (v instanceof Uint8Array) return Bytes.fromUint8Array(new Uint8Array(v));
  if (Array.isArray(v)) return v.map(toStore);
  if (isPlain(v)) { const o = {}; Object.keys(v).forEach((k) => { o[k] = toStore(v[k]); }); return o; }
  return v;
}

/** Bytes -> Uint8Array (top level is enough: only file chunks hold binary). */
function fromStore(data) {
  if (!data) return data;
  Object.keys(data).forEach((k) => { if (data[k] instanceof Bytes) data[k] = data[k].toUint8Array(); });
  return data;
}

/** Admin-style update() takes { 'a.b': value } paths; the Web SDK does too. */
const toUpdate = (data) => toStore(data);

function wrapDocSnap(s, ref) {
  return {
    id: s.id,
    ref,
    exists: s.exists(),
    data: () => (s.exists() ? fromStore(s.data()) : undefined),
    get: (f) => s.get(f),
    updateTime: undefined,
    metadata: s.metadata
  };
}

function wrapQuerySnap(s, fs) {
  const docs = s.docs.map((d) => wrapDocSnap(d, new DocRef(fs, d.ref)));
  return {
    docs,
    empty: s.empty,
    size: s.size,
    forEach: (fn) => docs.forEach(fn),
    readTime: undefined,
    metadata: s.metadata,
    docChanges: () => s.docChanges().map((c) => ({ type: c.type, doc: wrapDocSnap(c.doc, new DocRef(fs, c.doc.ref)) }))
  };
}

const alreadyExists = (path) => Object.assign(new Error(`Document already exists: ${path}`), { code: 'already-exists' });

class DocRef {
  constructor(fs, ref) { this.fs = fs; this._ref = ref; this.id = ref.id; this.path = ref.path; }

  collection(name) { return new Query(this.fs, collection(this._ref, name)); }

  async get() { return wrapDocSnap(await getDoc(this._ref), this); }

  async set(data, opts) { await setDoc(this._ref, toStore(data), opts && opts.merge ? { merge: true } : {}); return {}; }

  async update(data) { await updateDoc(this._ref, toUpdate(data)); return {}; }

  async delete() { await deleteDoc(this._ref); return {}; }

  /**
   * Admin create() fails when the document exists. Random ids can't collide, so a plain write is
   * enough; natural (deterministic) ids are checked inside a transaction.
   */
  async create(data, opts = {}) {
    if (!opts.natural) { await setDoc(this._ref, toStore(data)); return {}; }
    await runTransaction(this.fs, async (tx) => {
      const s = await tx.get(this._ref);
      if (s.exists()) throw alreadyExists(this.path);
      tx.set(this._ref, toStore(data));
    });
    return {};
  }

  onSnapshot(next, error) { return onSnapshot(this._ref, (s) => next(wrapDocSnap(s, this)), error); }
}

class Query {
  constructor(fs, base, constraints = [], skip = 0, lim = null) {
    this.fs = fs; this.base = base; this.constraints = constraints; this.skip = skip; this.lim = lim;
  }

  get id() { return this.base.id; }

  doc(id) { return new DocRef(this.fs, id === undefined ? doc(this.base) : doc(this.base, String(id))); }

  where(f, op, v) { return new Query(this.fs, this.base, [...this.constraints, where(f, op, v)], this.skip, this.lim); }

  orderBy(f, dir = 'asc') { return new Query(this.fs, this.base, [...this.constraints, orderBy(f, dir)], this.skip, this.lim); }

  limit(n) { return new Query(this.fs, this.base, this.constraints, this.skip, n); }

  /** The Web SDK has no offset: read skip+limit and drop the first `skip`. */
  offset(n) { return new Query(this.fs, this.base, this.constraints, n, this.lim); }

  build() {
    const c = [...this.constraints];
    if (this.lim != null) c.push(qLimit(this.lim + this.skip));
    return c.length ? query(this.base, ...c) : this.base;
  }

  async get() {
    const s = wrapQuerySnap(await getDocs(this.build()), this.fs);
    if (this.skip) { s.docs = s.docs.slice(this.skip); s.size = s.docs.length; s.empty = !s.docs.length; s.forEach = (fn) => s.docs.forEach(fn); }
    return s;
  }

  count() {
    return { get: async () => { const r = await getCountFromServer(query(this.base, ...this.constraints)); return { data: () => ({ count: r.data().count }) }; } };
  }

  onSnapshot(next, error) {
    return onSnapshot(this.build(), { includeMetadataChanges: true }, (s) => next(wrapQuerySnap(s, this.fs)), error);
  }
}

class Batch {
  constructor(fs) { this.b = writeBatch(fs); }
  set(ref, data, opts) { this.b.set(ref._ref, toStore(data), opts && opts.merge ? { merge: true } : {}); return this; }
  create(ref, data) { this.b.set(ref._ref, toStore(data)); return this; }
  update(ref, data) { this.b.update(ref._ref, toUpdate(data)); return this; }
  delete(ref) { this.b.delete(ref._ref); return this; }
  async commit() { await this.b.commit(); return []; }
}

export function makeFacade(fs) {
  return {
    collection: (name) => new Query(fs, collection(fs, name)),
    doc: (path) => new DocRef(fs, doc(fs, path)),
    batch: () => new Batch(fs),
    async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
    runTransaction(fn) {
      return runTransaction(fs, (t) => fn({
        get: async (ref) => wrapDocSnap(await t.get(ref._ref), ref),
        set: (ref, data, opts) => { t.set(ref._ref, toStore(data), opts && opts.merge ? { merge: true } : {}); },
        create: (ref, data) => { t.set(ref._ref, toStore(data)); },
        update: (ref, data) => { t.update(ref._ref, toUpdate(data)); },
        delete: (ref) => { t.delete(ref._ref); }
      }));
    }
  };
}

export const FieldValue = {
  delete: () => deleteField(),
  arrayUnion: (...v) => arrayUnion(...v),
  arrayRemove: (...v) => arrayRemove(...v),
  increment: (n) => increment(n),
  serverTimestamp: () => serverTimestamp()
};

export const isTimestamp = (v) => v instanceof Timestamp;
