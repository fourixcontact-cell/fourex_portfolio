/**
 * Fourix Firestore ODM
 * --------------------
 * A small, Mongoose-compatible model layer on top of Cloud Firestore. The CRM's
 * controllers were written against Mongoose; this module gives them the same API
 * (Schema, model(), find/findById/findOne/create/save/populate/aggregate/updateMany, …)
 * so business rules stay byte-for-byte identical while the data lives in Firestore.
 *
 * Design notes
 *  - One Firestore collection per model ("Lead" -> "leads"); the document id is the `_id`.
 *  - `_id`s are 24-char hex strings (ObjectId-shaped) so URLs and validation don't change.
 *  - Query filters use MongoDB syntax and are evaluated with `sift` (the reference
 *    Mongo-query matcher). One equality clause is pushed down to Firestore to narrow
 *    the read (single-field indexes only, so no composite index is ever *required*).
 *  - "List newest first with a limit" queries whose filters are all equalities run fully
 *    in Firestore (where + orderBy + offset + limit). If Firestore asks for a composite
 *    index the query transparently falls back to the in-memory path and logs the link.
 *  - Schemas give casting, defaults, enums, required/min/max/maxlength validation,
 *    sub-document _ids, timestamps, select:false fields, virtuals, statics, methods and
 *    pre('save') hooks, i.e. everything the original models relied on.
 *  - save() writes only the top-level fields that actually changed (like Mongoose's $set).
 */
const crypto = require('../lib/crypto');
const sift = require('sift').default;
const { db, FieldValue, isTimestamp } = require('./firebase');
const { rt } = require('../runtime');
const liveCache = require('./cache');

const cacheFor = (M) => liveCache.forCollection(M.collectionName);
const wt = (r) => (r && r.writeTime) || undefined;

/* ------------------------------------------------------------------ ids */
let seq = crypto.randomInt(0, 0xffffff);
function newId() {
  seq = (seq + 1) % 0xffffff;
  return Math.floor(Date.now() / 1000).toString(16).padStart(8, '0') + crypto.randomBytes(5).toString('hex') + seq.toString(16).padStart(6, '0');
}
// Record ids are 24-char hex; user ids are Firebase Auth uids (20-40 letters/digits).
const isValidId = (v) => typeof v === 'string' && (/^[0-9a-f]{24}$/i.test(v) || /^[A-Za-z0-9]{20,40}$/.test(v));
/** Deterministic ObjectId-shaped id (used for natural keys such as settings "agency" or a notification dedupeKey). */
const hashId = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 24);

/* ------------------------------------------------------------------ types */
class ObjectId { static isValid(v) { return isValidId(v); } }
class Mixed {}
const Types = { ObjectId, Mixed };

class CastError extends Error {
  constructor(kind, value, path) {
    let shown; try { shown = typeof value === 'string' ? value : JSON.stringify(value); } catch { shown = String(value); }
    super(`Cast to ${kind} failed for value "${String(shown).slice(0, 60)}" at path "${path}"`);
    this.name = 'CastError'; this.kind = kind; this.value = value; this.path = path;
  }
}
class ValidatorError extends Error {
  constructor(path, message) { super(message); this.name = 'ValidatorError'; this.path = path; }
}
class ValidationError extends Error {
  constructor(errors) {
    super(`Validation failed: ${Object.values(errors).map((e) => `${e.path}: ${e.message}`).join(', ')}`);
    this.name = 'ValidationError'; this.errors = errors;
  }
}

/* ------------------------------------------------------------------ schema */
const scalar = (type, opts = {}) => ({ kind: 'scalar', type, opts });
function typeName(t) {
  if (t === String || t === 'String') return 'String';
  if (t === Number || t === 'Number') return 'Number';
  if (t === Date || t === 'Date') return 'Date';
  if (t === Boolean || t === 'Boolean') return 'Boolean';
  if (t === ObjectId || t === 'ObjectId') return 'ObjectId';
  return 'Mixed';
}
const isTypeDecl = (t) => typeof t === 'function' || typeof t === 'string' || Array.isArray(t) || t instanceof Schema;

function parseValue(v, inArray = false) {
  if (v instanceof Schema) return { kind: 'object', fields: v.fields, hasId: v.options._id !== false, opts: {} };
  if (Array.isArray(v)) return { kind: 'array', of: v.length ? parseValue(v[0], true) : scalar('Mixed'), opts: {} };
  if (v === Array) return { kind: 'array', of: scalar('Mixed'), opts: {} };
  if (typeof v === 'function') return scalar(typeName(v));
  if (v && typeof v === 'object') {
    if ('type' in v && isTypeDecl(v.type)) {
      const { type, ...opts } = v;
      if (Array.isArray(type) || type === Array) return { kind: 'array', of: Array.isArray(type) && type.length ? parseValue(type[0], true) : scalar('Mixed'), opts };
      if (type instanceof Schema) return { ...parseValue(type), opts };
      return scalar(typeName(type), opts);
    }
    // Plain nested object. Inside an array Mongoose turns it into a sub-document (with _id).
    return { kind: 'object', fields: parseFields(v), hasId: inArray, opts: {} };
  }
  return scalar('Mixed');
}
function parseFields(def) {
  const out = {};
  Object.entries(def).forEach(([k, v]) => { out[k] = parseValue(v); });
  return out;
}

class Schema {
  constructor(definition = {}, options = {}) {
    this.options = { timestamps: false, strict: true, _id: true, ...options };
    this.fields = parseFields(definition);
    this.hooks = { pre: {} };
    this.methods = {};
    this.statics = {};
    this.virtuals = {};
    this.root = { kind: 'object', fields: this.fields, hasId: false, opts: {} };
  }
  pre(op, fn) { (this.hooks.pre[op] = this.hooks.pre[op] || []).push(fn); return this; }
  post() { return this; }
  index() { return this; } // Firestore indexes live in firestore.indexes.json
  virtual(name) { const api = { get: (fn) => { this.virtuals[name] = fn; return api; } }; return api; }
  /** Spec for a (dotted) path, walking through arrays and sub-documents. */
  path(p) {
    let spec = this.root;
    for (const seg of String(p).split('.')) {
      if (!spec) return null;
      if (spec.kind === 'array') { spec = spec.of; if (/^\d+$/.test(seg)) continue; }
      if (spec.kind === 'object') spec = spec.fields[seg];
      else if (spec.kind === 'scalar' && spec.type === 'Mixed') return spec;
      else return null;
    }
    return spec || null;
  }
}
Schema.Types = Types;

/* ------------------------------------------------------------------ helpers */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !isTimestamp(v) && !Buffer.isBuffer(v);

/** Deep clone to plain data (drops functions/helpers, keeps Dates). */
function plain(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (isTimestamp(v)) return v.toDate();
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach((k) => { if (typeof v[k] !== 'function') out[k] = plain(v[k]); });
    return out;
  }
  return v;
}

/** Firestore -> JS (Timestamps become Dates). */
function fromStore(v) {
  if (isTimestamp(v)) return v.toDate();
  if (Array.isArray(v)) return v.map(fromStore);
  if (isPlainObject(v)) { const o = {}; Object.keys(v).forEach((k) => { o[k] = fromStore(v[k]); }); return o; }
  return v;
}
/** JS -> Firestore (no undefined, no functions, no Documents). */
function toStore(v) {
  if (v === undefined || typeof v === 'function') return undefined;
  if (v === null || v instanceof Date || typeof v !== 'object') return v;
  if (Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return v.map(toStore).filter((x) => x !== undefined);
  const o = {};
  Object.keys(v).forEach((k) => { const x = toStore(v[k]); if (x !== undefined && k !== '') o[k] = x; });
  return o;
}

function stable(v) {
  if (v === undefined) return 'u';
  if (v === null) return 'n';
  if (v instanceof Date) return `D${v.getTime()}`;
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function getPath(obj, p) {
  return String(p).split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}
function setPath(obj, p, val) {
  const segs = String(p).split('.');
  let o = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    if (o[segs[i]] === null || typeof o[segs[i]] !== 'object') o[segs[i]] = {};
    o = o[segs[i]];
  }
  o[segs[segs.length - 1]] = val;
}
function unsetPath(obj, p) {
  const segs = String(p).split('.');
  const parent = segs.length > 1 ? getPath(obj, segs.slice(0, -1).join('.')) : obj;
  if (parent && typeof parent === 'object') delete parent[segs[segs.length - 1]];
}
function def(obj, key, value) { Object.defineProperty(obj, key, { value, enumerable: false, configurable: true, writable: true }); }

/* ------------------------------------------------------------------ casting */
function castScalar(type, v, opts, path) {
  if (v === undefined || v === null) return v;
  switch (type) {
    case 'String': {
      let s;
      if (typeof v === 'string') s = v;
      else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
      else if (v instanceof Date) s = v.toISOString();
      else throw new CastError('string', v, path);
      if (opts.trim) s = s.trim();
      if (opts.lowercase) s = s.toLowerCase();
      if (opts.uppercase) s = s.toUpperCase();
      return s;
    }
    case 'Number': {
      if (typeof v === 'number') { if (Number.isNaN(v)) throw new CastError('Number', v, path); return v; }
      if (v === '') return null;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      throw new CastError('Number', v, path);
    }
    case 'Date': {
      if (isTimestamp(v)) return v.toDate();
      if (v instanceof Date) { if (Number.isNaN(v.getTime())) throw new CastError('date', v, path); return v; }
      if (v === '') return null;
      if (typeof v === 'string' || typeof v === 'number') { const d = new Date(v); if (Number.isNaN(d.getTime())) throw new CastError('date', v, path); return d; }
      throw new CastError('date', v, path);
    }
    case 'Boolean': {
      if ([true, 'true', 1, '1', 'yes'].includes(v)) return true;
      if ([false, 'false', 0, '0', 'no'].includes(v)) return false;
      throw new CastError('Boolean', v, path);
    }
    case 'ObjectId': {
      if (typeof v === 'string') { if (isValidId(v)) return v; throw new CastError('ObjectId', v, path); }
      if (v && typeof v === 'object' && v._id !== undefined) return castScalar('ObjectId', String(v._id), opts, path);
      throw new CastError('ObjectId', v, path);
    }
    default: return plain(v);
  }
}

function defaultFor(spec) {
  if (spec.opts && Object.prototype.hasOwnProperty.call(spec.opts, 'default')) {
    const d = spec.opts.default;
    return typeof d === 'function' ? d() : plain(d);
  }
  if (spec.kind === 'array') return [];
  if (spec.kind === 'object' && !spec.hasId) return {};
  return undefined;
}

/**
 * ctx: { errors, defaults, skipRootDefaults }
 * Never throws: cast failures are recorded in ctx.errors and the raw value is kept.
 */
function castValue(spec, v, path, ctx) {
  if (v === undefined || v === null) return v;
  if (spec.kind === 'scalar') {
    try { return castScalar(spec.type, v, spec.opts, path); } catch (e) { ctx.errors[path] = e; return v; }
  }
  if (spec.kind === 'array') {
    const arr = Array.isArray(v) ? v : [v];
    return arr.map((x, i) => castValue(spec.of, x, `${path}.${i}`, ctx));
  }
  if (!isPlainObject(v)) { ctx.errors[path] = new CastError('Embedded', v, path); return v; }
  return castObject(spec, v, path, ctx, false);
}

function castObject(spec, obj, prefix, ctx, isRoot) {
  const out = {};
  if (spec.hasId) out._id = obj._id !== undefined && obj._id !== null ? String(obj._id) : newId();
  Object.entries(spec.fields).forEach(([k, fs]) => {
    let val = obj[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (val === undefined && ctx.defaults && !(isRoot && ctx.skipRootDefaults)) val = defaultFor(fs);
    if (val === undefined) return;
    out[k] = castValue(fs, val, p, ctx);
  });
  return out;
}

/* ------------------------------------------------------------------ validation */
function validateValue(spec, v, path, errors) {
  const o = spec.opts || {};
  const last = path.split('.').pop();
  const missing = v === undefined || v === null || (spec.kind === 'scalar' && spec.type === 'String' && v === '');
  if (o.required && missing) { errors[path] = new ValidatorError(path, `Path \`${last}\` is required.`); return; }
  if (v === undefined || v === null) return;
  if (o.validate) {
    const fn = typeof o.validate === 'function' ? o.validate : o.validate.validator;
    if (fn && !fn(v)) { errors[path] = new ValidatorError(path, o.validate.message || `Validator failed for path \`${path}\``); return; }
  }
  if (spec.kind === 'scalar') {
    if (o.enum && !o.enum.includes(v)) errors[path] = new ValidatorError(path, `\`${v}\` is not a valid enum value for path \`${path}\`.`);
    else if (spec.type === 'Number' && o.min !== undefined && v < o.min) errors[path] = new ValidatorError(path, `Path \`${path}\` (${v}) is less than minimum allowed value (${o.min}).`);
    else if (spec.type === 'Number' && o.max !== undefined && v > o.max) errors[path] = new ValidatorError(path, `Path \`${path}\` (${v}) is more than maximum allowed value (${o.max}).`);
    else if (spec.type === 'String' && o.maxlength !== undefined && String(v).length > o.maxlength) errors[path] = new ValidatorError(path, `Path \`${path}\` is longer than the maximum allowed length (${o.maxlength}).`);
    else if (spec.type === 'String' && o.minlength !== undefined && String(v).length < o.minlength) errors[path] = new ValidatorError(path, `Path \`${path}\` is shorter than the minimum allowed length (${o.minlength}).`);
    return;
  }
  if (spec.kind === 'array' && Array.isArray(v)) { v.forEach((x, i) => validateValue(spec.of, x, `${path}.${i}`, errors)); return; }
  if (spec.kind === 'object' && isPlainObject(v)) {
    Object.entries(spec.fields).forEach(([k, fs]) => validateValue(fs, v[k], path ? `${path}.${k}` : k, errors));
  }
}

/* ------------------------------------------------------------------ helpers on loaded docs */
function attachHelpers(value, spec) {
  if (!value || typeof value !== 'object' || !spec) return;
  if (spec.kind === 'object' && isPlainObject(value)) {
    def(value, 'toObject', function toObject() { return plain(this); });
    def(value, 'toJSON', function toJSON() { return plain(this); });
    Object.entries(spec.fields).forEach(([k, fs]) => attachHelpers(value[k], fs));
  } else if (spec.kind === 'array' && Array.isArray(value) && spec.of.kind === 'object') {
    def(value, 'id', function id(x) { return this.find((it) => it && String(it._id) === String(x)) || null; });
    value.forEach((it) => attachHelpers(it, spec.of));
  }
}
function attachRootHelpers(doc, schema) {
  Object.entries(schema.fields).forEach(([k, fs]) => attachHelpers(doc[k], fs));
}

/* ------------------------------------------------------------------ registry */
const registry = {};
const pluralise = (name) => { const n = name.toLowerCase(); return n.endsWith('s') ? n : `${n}s`; };
const col = (M) => db().collection(M.collectionName);

/* ------------------------------------------------------------------ filter prep */
function castFilterValue(spec, v) {
  if (!spec || spec.kind !== 'scalar' || v === null || v === undefined) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp) && v._id !== undefined) return String(v._id);
    return v;
  }
  const t = spec.type;
  const one = (x) => {
    if (x === null || x === undefined || x instanceof RegExp) return x;
    if (t === 'ObjectId' && typeof x === 'object' && x._id !== undefined) return String(x._id);
    if (t === 'Number' && typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x))) return Number(x);
    if (t === 'Boolean' && (x === 'true' || x === 'false')) return x === 'true';
    if (t === 'Date' && (typeof x === 'string' || typeof x === 'number')) { const d = new Date(x); return Number.isNaN(d.getTime()) ? x : d; }
    return x;
  };
  if (isPlainObject(v) && Object.keys(v).some((k) => k.startsWith('$'))) {
    const out = {};
    Object.entries(v).forEach(([op, x]) => {
      if (['$in', '$nin', '$all'].includes(op) && Array.isArray(x)) out[op] = x.map(one);
      else if (['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'].includes(op)) out[op] = one(x);
      else out[op] = x;
    });
    return out;
  }
  return one(v);
}
function castFilter(M, filter = {}) {
  const out = {};
  Object.entries(filter || {}).forEach(([k, v]) => {
    if (k === '$or' || k === '$and' || k === '$nor') { out[k] = (v || []).map((f) => castFilter(M, f)); return; }
    if (k.startsWith('$')) { out[k] = v; return; }
    const spec = k === '_id' ? scalar('ObjectId') : M.schema.path(k);
    const s = spec && spec.kind === 'array' ? spec.of : spec;
    out[k] = v === undefined ? null : castFilterValue(s, v);
  });
  return out;
}

/* ------------------------------------------------------------------ reading */
const rowFrom = (snap) => ({ _id: snap.id, ...fromStore(snap.data()) });

async function getByIds(M, ids) {
  const uniq = [...new Set(ids.map(String))].filter(isValidId);
  const cache = cacheFor(M);
  if (cache && await cache.ready()) return uniq.map((id) => cache.byId(id)).filter(Boolean).map(plain);
  const out = [];
  for (let i = 0; i < uniq.length; i += 300) {
    const refs = uniq.slice(i, i + 300).map((id) => col(M).doc(id));
    // eslint-disable-next-line no-await-in-loop
    const snaps = refs.length ? await db().getAll(...refs) : [];
    snaps.forEach((s) => { if (s.exists) out.push(rowFrom(s)); });
  }
  return out;
}

const NO_ID = '__no_id__'; // findById(null/undefined) resolves to null, like Mongoose
const TIMESTAMP_SORTS = new Set(['createdAt', 'updatedAt']);
const warned = new Set();

/** Equality clauses that Firestore can evaluate exactly like Mongo would. */
function pushable(M, filter) {
  const eqs = [];
  let all = true;
  Object.entries(filter).forEach(([k, v]) => {
    if (k.startsWith('$')) { all = false; return; }
    const prim = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    const spec = M.schema.path(k);
    if (!prim || !spec || (spec.kind === 'scalar' && spec.type === 'Mixed')) { all = false; return; }
    if (spec.kind === 'array') {
      if (spec.of.kind !== 'scalar') { all = false; return; }
      eqs.push({ field: k, op: 'array-contains', value: v, rank: spec.of.type === 'ObjectId' ? 2 : 3 });
    } else if (spec.kind === 'scalar') {
      const rank = spec.type === 'ObjectId' ? 0 : spec.type === 'String' ? 1 : spec.type === 'Number' ? 3 : 4;
      eqs.push({ field: k, op: '==', value: v, rank });
    } else all = false;
  });
  if (eqs.filter((e) => e.op === 'array-contains').length > 1) all = false;
  return { eqs: eqs.sort((a, b) => a.rank - b.rank), all };
}

const isIndexError = (e) => e && (e.code === 9 || e.code === 'failed-precondition' || /FAILED_PRECONDITION|requires an index/i.test(e.message || ''));
function warnIndex(M, e) {
  const key = `${M.collectionName}:${(e.message || '').slice(0, 120)}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[firestore] ${M.collectionName}: falling back to in-memory query. Create the suggested index for better performance:`, e.message);
}

/**
 * Static top-level defaults per model. Applied to every row before filtering, so a record
 * created outside the CRM (public form, Firebase console) still matches e.g. {isArchived:false}.
 */
const defaultsCache = new WeakMap();
function staticDefaults(M) {
  if (!defaultsCache.has(M)) {
    const d = {};
    Object.entries(M.schema.fields).forEach(([k, spec]) => {
      const o = spec.opts || {};
      if (Object.prototype.hasOwnProperty.call(o, 'default') && typeof o.default !== 'function' && o.default !== undefined) d[k] = o.default;
      else if (spec.kind === 'array' && !Object.prototype.hasOwnProperty.call(o, 'default')) d[k] = [];
    });
    defaultsCache.set(M, d);
  }
  return defaultsCache.get(M);
}
const withDefaults = (M, row) => {
  const d = staticDefaults(M);
  let out = row;
  Object.keys(d).forEach((k) => {
    if (row[k] === undefined) { if (out === row) out = { ...row }; out[k] = Array.isArray(d[k]) ? [] : d[k]; }
  });
  return out;
};

/** Core read: returns plain rows matching `filter`, sorted/sliced per opts. */
async function fetchRows(M, filter = {}, opts = {}) {
  const f = castFilter(M, filter);
  const { sort, skip = 0, limit } = opts;
  let rows;
  let sliced = false;

  if (f._id === NO_ID) return [];

  // Live in-memory mirror (long-running server): no Firestore reads at all.
  const cache = cacheFor(M);
  if (cache && await cache.ready()) {
    let src;
    if (typeof f._id === 'string') {
      if (!isValidId(f._id)) throw new CastError('ObjectId', f._id, '_id');
      src = [cache.byId(f._id)].filter(Boolean);
    } else if (isPlainObject(f._id) && Array.isArray(f._id.$in)) {
      src = f._id.$in.map((id) => cache.byId(String(id))).filter(Boolean);
    } else src = [...cache.all()];
    src = src.map((r) => withDefaults(M, r));
    if (Object.keys(f).length) src = src.filter(sift(f));
    if (sort && Object.keys(sort).length) src.sort(comparator(sort));
    if (skip) src = src.slice(skip);
    if (limit !== undefined && limit !== null) src = src.slice(0, limit);
    return src.map(plain);
  }

  if (typeof f._id === 'string' || (isPlainObject(f._id) && Array.isArray(f._id.$in))) {
    const ids = typeof f._id === 'string' ? [f._id] : f._id.$in.map(String);
    if (typeof f._id === 'string' && !isValidId(f._id)) throw new CastError('ObjectId', f._id, '_id');
    rows = await getByIds(M, ids);
  } else {
    const { eqs, all } = pushable(M, f);
    const sortKeys = sort ? Object.keys(sort) : [];
    const fast = all && limit !== undefined && limit !== null && (sortKeys.length === 0 || (sortKeys.length === 1 && TIMESTAMP_SORTS.has(sortKeys[0])));
    if (fast) {
      try {
        let q = col(M);
        eqs.forEach((e) => { q = q.where(e.field, e.op, e.value); });
        if (sortKeys.length) q = q.orderBy(sortKeys[0], sort[sortKeys[0]] < 0 ? 'desc' : 'asc');
        if (skip) q = q.offset(skip);
        q = q.limit(limit);
        rows = (await q.get()).docs.map(rowFrom);
        sliced = true;
      } catch (e) {
        if (!isIndexError(e)) throw e;
        warnIndex(M, e);
      }
    }
    if (!sliced) {
      let q = col(M);
      if (eqs.length) q = q.where(eqs[0].field, eqs[0].op, eqs[0].value);
      rows = (await q.get()).docs.map(rowFrom);
    }
  }

  rows = rows.map((r) => withDefaults(M, r));
  if (!sliced) {
    if (Object.keys(f).length) rows = rows.filter(sift(f));
    if (sort && Object.keys(sort).length) rows.sort(comparator(sort));
    if (skip) rows = rows.slice(skip);
    if (limit !== undefined && limit !== null) rows = rows.slice(0, limit);
  } else if (Object.keys(f).length) {
    rows = rows.filter(sift(f));
  }
  return rows;
}

async function countRows(M, filter = {}) {
  const cache = cacheFor(M);
  if (cache && await cache.ready()) return (await fetchRows(M, filter)).length;
  const f = castFilter(M, filter);
  const { eqs, all } = pushable(M, f);
  if (all) {
    try {
      let q = col(M);
      eqs.forEach((e) => { q = q.where(e.field, e.op, e.value); });
      return (await q.count().get()).data().count;
    } catch (e) {
      if (!isIndexError(e)) throw e;
      warnIndex(M, e);
    }
  }
  return (await fetchRows(M, f)).length;
}

/* ------------------------------------------------------------------ sorting */
function typeRank(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  if (v instanceof Date) return 6;
  if (Array.isArray(v)) return 4;
  if (typeof v === 'object') return 3;
  if (typeof v === 'boolean') return 5;
  return 7;
}
function cmpValues(a, b) {
  const ta = typeRank(a); const tb = typeRank(b);
  if (ta !== tb) return ta - tb;
  if (a instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number') return a - b;
  if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}
function normalizeSort(s) {
  if (!s) return null;
  if (typeof s === 'string') {
    const out = {};
    s.split(/\s+/).filter(Boolean).forEach((t) => { if (t.startsWith('-')) out[t.slice(1)] = -1; else out[t] = 1; });
    return out;
  }
  const out = {};
  Object.entries(s).forEach(([k, v]) => { out[k] = v === -1 || v === 'desc' || v === 'descending' ? -1 : 1; });
  return out;
}
function comparator(sort) {
  const keys = Object.entries(sort);
  return (a, b) => {
    for (const [k, dir] of keys) {
      const c = cmpValues(getPath(a, k), getPath(b, k));
      if (c) return c * dir;
    }
    return 0;
  };
}

/* ------------------------------------------------------------------ projection */
function parseSelect(arg) {
  if (!arg) return null;
  const p = { include: new Set(), exclude: new Set(), plus: new Set() };
  const add = (tok, val) => {
    if (tok.startsWith('+')) p.plus.add(tok.slice(1));
    else if (tok.startsWith('-') || val === 0) p.exclude.add(tok.replace(/^-/, ''));
    else p.include.add(tok);
  };
  if (typeof arg === 'string') arg.split(/\s+/).filter(Boolean).forEach((t) => add(t));
  else Object.entries(arg).forEach(([k, v]) => add(k, v));
  return p;
}
function mergeSelect(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { include: new Set([...a.include, ...b.include]), exclude: new Set([...a.exclude, ...b.exclude]), plus: new Set([...a.plus, ...b.plus]) };
}
function hiddenFields(M) {
  return Object.entries(M.schema.fields).filter(([, s]) => s.opts && s.opts.select === false).map(([k]) => k);
}
function project(M, row, proj) {
  const hidden = hiddenFields(M);
  if (!proj) { const o = { ...row }; hidden.forEach((h) => delete o[h]); return o; }
  if (proj.include.size) {
    const out = { _id: row._id };
    [...proj.include, ...proj.plus].forEach((p) => {
      const v = getPath(row, p);
      if (v !== undefined) setPath(out, p, v);
    });
    return out;
  }
  const o = { ...row };
  proj.exclude.forEach((p) => unsetPath(o, p));
  hidden.forEach((h) => { if (!proj.plus.has(h)) delete o[h]; });
  return o;
}
const isInclusion = (proj) => !!(proj && proj.include.size);

/* ------------------------------------------------------------------ populate */
function normPop(path, select) {
  if (Array.isArray(path)) return path.flatMap((p) => normPop(p));
  if (typeof path === 'string') return path.split(/\s+/).filter(Boolean).map((p) => ({ path: p, select }));
  if (path && typeof path === 'object') return [{ path: path.path, select: path.select, model: path.model }];
  return [];
}
/** Visit every (container, key) that holds a value at `path` (walking arrays). */
function visit(obj, segs, fn) {
  if (!obj || typeof obj !== 'object') return;
  const [head, ...rest] = segs;
  if (!rest.length) { fn(obj, head); return; }
  const next = obj[head];
  if (Array.isArray(next)) next.forEach((x) => visit(x, rest, fn));
  else visit(next, rest, fn);
}
async function populateObjects(M, objs, pops) {
  for (const pop of pops) {
    const spec = M.schema.path(pop.path);
    if (!spec) continue;
    const refName = pop.model || (spec.kind === 'array' ? spec.of.opts?.ref : spec.opts?.ref);
    const Ref = registry[refName];
    if (!Ref) continue;
    const segs = pop.path.split('.');
    const ids = [];
    objs.forEach((o) => visit(o, segs, (c, k) => {
      const v = c[k];
      if (Array.isArray(v)) v.forEach((x) => { if (x !== null && x !== undefined) ids.push(typeof x === 'object' ? x._id : x); });
      else if (v !== null && v !== undefined) ids.push(typeof v === 'object' ? v._id : v);
    }));
    // eslint-disable-next-line no-await-in-loop
    const rows = await getByIds(Ref, ids.map(String));
    const proj = parseSelect(pop.select);
    const byId = new Map(rows.map((r) => [String(r._id), project(Ref, r, proj)]));
    objs.forEach((o) => visit(o, segs, (c, k) => {
      const v = c[k];
      const find = (x) => { const id = String(x && typeof x === 'object' ? x._id : x); return byId.has(id) ? plain(byId.get(id)) : null; };
      if (Array.isArray(v)) c[k] = v.map(find).filter(Boolean);
      else if (v !== null && v !== undefined) c[k] = find(v);
    }));
  }
}

/* ------------------------------------------------------------------ update operators */
function applyUpdate(doc, update, inserting = false) {
  // Like Mongoose: plain top-level fields are treated as $set, even next to operators.
  const ops = {};
  Object.entries(update || {}).forEach(([k, v]) => {
    if (k.startsWith('$')) ops[k] = { ...(ops[k] || {}), ...v };
    else ops.$set = { ...(ops.$set || {}), [k]: v };
  });
  Object.entries(ops).forEach(([op, fields]) => {
    Object.entries(fields || {}).forEach(([p, v]) => {
      switch (op) {
        case '$set': setPath(doc, p, plain(v)); break;
        case '$setOnInsert': if (inserting) setPath(doc, p, plain(v)); break;
        case '$unset': unsetPath(doc, p); break;
        case '$inc': setPath(doc, p, (Number(getPath(doc, p)) || 0) + Number(v)); break;
        case '$push': {
          const arr = Array.isArray(getPath(doc, p)) ? getPath(doc, p) : [];
          const items = v && v.$each ? v.$each : [v];
          setPath(doc, p, [...arr, ...items.map(plain)]); break;
        }
        case '$addToSet': {
          const arr = Array.isArray(getPath(doc, p)) ? [...getPath(doc, p)] : [];
          const items = v && v.$each ? v.$each : [v];
          items.forEach((it) => { if (!arr.some((x) => stable(x) === stable(it))) arr.push(plain(it)); });
          setPath(doc, p, arr); break;
        }
        case '$pull': {
          const arr = Array.isArray(getPath(doc, p)) ? getPath(doc, p) : [];
          const test = isPlainObject(v) ? sift(v) : (x) => stable(x) === stable(v);
          setPath(doc, p, arr.filter((x) => !test(x))); break;
        }
        default: throw new Error(`Unsupported update operator ${op}`);
      }
    });
  });
  return doc;
}

/* ------------------------------------------------------------------ aggregation */
function evalExpr(expr, row) {
  if (typeof expr === 'string' && expr.startsWith('$')) { const v = getPath(row, expr.slice(1)); return v === undefined ? null : v; }
  if (isPlainObject(expr)) { const o = {}; Object.entries(expr).forEach(([k, e]) => { o[k] = evalExpr(e, row); }); return o; }
  return expr;
}
const STAGES = {
  $match: (rows, f) => rows.filter(sift(f)),
  $sort: (rows, s) => [...rows].sort(comparator(normalizeSort(s))),
  $limit: (rows, n) => rows.slice(0, n),
  $skip: (rows, n) => rows.slice(n),
  $count: (rows, name) => [{ [name]: rows.length }],
  $unwind: (rows, p) => {
    const path = (typeof p === 'string' ? p : p.path).replace(/^\$/, '');
    return rows.flatMap((r) => (Array.isArray(getPath(r, path)) ? getPath(r, path).map((x) => { const c = { ...r }; setPath(c, path, x); return c; }) : []));
  },
  $project: (rows, spec) => rows.map((r) => {
    const out = spec._id === 0 ? {} : { _id: r._id };
    Object.entries(spec).forEach(([k, v]) => { if (k === '_id') return; if (v === 1 || v === true) out[k] = getPath(r, k); else if (v !== 0 && v !== false) out[k] = evalExpr(v, r); });
    return out;
  }),
  $group: (rows, spec) => {
    const groups = new Map();
    const accs = Object.entries(spec).filter(([k]) => k !== '_id');
    rows.forEach((r) => {
      const id = evalExpr(spec._id, r);
      const key = stable(id);
      if (!groups.has(key)) groups.set(key, { out: { _id: id }, state: {} });
      const g = groups.get(key);
      accs.forEach(([name, acc]) => {
        const [op, e] = Object.entries(acc)[0];
        const v = evalExpr(e, r);
        const st = g.state;
        switch (op) {
          case '$sum': g.out[name] = (g.out[name] || 0) + (typeof v === 'number' ? v : 0); break;
          case '$avg': st[name] = st[name] || { s: 0, n: 0 }; if (typeof v === 'number') { st[name].s += v; st[name].n += 1; } g.out[name] = st[name].n ? st[name].s / st[name].n : null; break;
          case '$min': if (v !== null && (g.out[name] === undefined || cmpValues(v, g.out[name]) < 0)) g.out[name] = v; break;
          case '$max': if (v !== null && (g.out[name] === undefined || cmpValues(v, g.out[name]) > 0)) g.out[name] = v; break;
          case '$first': if (!(name in g.out)) g.out[name] = v; break;
          case '$last': g.out[name] = v; break;
          case '$push': (g.out[name] = g.out[name] || []).push(v); break;
          case '$addToSet': g.out[name] = g.out[name] || []; if (!g.out[name].some((x) => stable(x) === stable(v))) g.out[name].push(v); break;
          default: throw new Error(`Unsupported accumulator ${op}`);
        }
      });
    });
    return [...groups.values()].map((g) => {
      accs.forEach(([name, acc]) => { if (!(name in g.out)) { const op = Object.keys(acc)[0]; g.out[name] = op === '$sum' ? 0 : null; } });
      return g.out;
    });
  }
};

/* ------------------------------------------------------------------ Document */
const STATE = Symbol('odm.state');

class Document {
  constructor(data = {}, internal) {
    const M = this.constructor;
    const st = { isNew: true, original: {}, projection: null };
    def(this, STATE, st);
    if (internal && internal.fromDb) {
      st.isNew = false;
      st.projection = internal.projection || null;
      const raw = internal.row;
      st.original = snapshotOf(raw);
      let data2 = raw;
      if (!isInclusion(st.projection)) {
        const ctx = { errors: {}, defaults: true, skipRootDefaults: false };
        data2 = { ...raw, ...castObject(M.schema.root, raw, '', ctx, true) };
      }
      Object.assign(this, data2);
    } else {
      const ctx = { errors: {}, defaults: true, skipRootDefaults: false };
      const src = isPlainObject(data) || data instanceof Document ? plain(data) : {};
      const casted = castObject(M.schema.root, src, '', ctx, true);
      this._id = src._id ? String(src._id) : newId();
      Object.assign(this, casted);
      if (M.schema.options.timestamps) { if (src.createdAt) this.createdAt = castScalar('Date', src.createdAt, {}, 'createdAt'); }
    }
    attachRootHelpers(this, M.schema);
  }

  get id() { return this._id; }
  get isNew() { return this[STATE].isNew; }
  set isNew(v) { this[STATE].isNew = !!v; }

  toObject() { return plain(this); }
  toJSON() { return plain(this); }
  get(p) { return getPath(this, p); }
  set(p, v) {
    if (typeof p === 'string') setPath(this, p, v);
    else Object.entries(p || {}).forEach(([k, val]) => setPath(this, k, val));
    return this;
  }
  markModified() { return this; }
  isModified(p) {
    const st = this[STATE];
    if (!p) return true;
    const top = p.split('.')[0];
    return stable(plain(this[top])) !== st.original[top];
  }

  async populate(arg, select) {
    await populateObjects(this.constructor, [this], normPop(arg, select));
    return this;
  }

  async validate() {
    const M = this.constructor;
    const ctx = { errors: {}, defaults: true, skipRootDefaults: !this.isNew };
    const casted = castObject(M.schema.root, plain(this), '', ctx, true);
    const errors = { ...ctx.errors };
    validateValue(M.schema.root, casted, '', errors);
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  async save() {
    const M = this.constructor;
    const schema = M.schema;
    const st = this[STATE];
    for (const fn of schema.hooks.pre.save || []) {
      // eslint-disable-next-line no-await-in-loop
      await (fn.length ? new Promise((res, rej) => { const r = fn.call(this, (err) => (err ? rej(err) : res())); if (r && r.then) r.then(res, rej); }) : fn.call(this));
    }
    if (schema.options.appendOnly && !st.isNew) throw new Error(`${M.modelName} records are append-only`);

    const projected = isInclusion(st.projection);
    const ctx = { errors: {}, defaults: !projected, skipRootDefaults: !st.isNew };
    const raw = {};
    Object.keys(this).forEach((k) => { raw[k] = this[k]; });
    const casted = castObject(schema.root, raw, '', ctx, true);
    const now = new Date();

    // Which top-level fields changed?
    const changed = [];
    const removed = [];
    Object.keys(casted).forEach((k) => { if (st.isNew || stable(casted[k]) !== st.original[k]) changed.push(k); });
    if (!st.isNew) {
      Object.keys(st.original).forEach((k) => {
        if (k === '_id' || !schema.fields[k]) return; // timestamps / unknown legacy fields are never removed
        if (casted[k] === undefined) removed.push(k);
      });
    }

    // Validation: everything on create, only changed fields on update (Mongoose semantics).
    const errors = {};
    Object.entries(ctx.errors).forEach(([p, e]) => { if (st.isNew || changed.includes(p.split('.')[0])) errors[p] = e; });
    if (st.isNew) validateValue(schema.root, casted, '', errors);
    else changed.forEach((k) => { if (schema.fields[k]) validateValue(schema.fields[k], casted[k], k, errors); });
    if (Object.keys(errors).length) throw new ValidationError(errors);

    if (!st.isNew && !changed.length && !removed.length) return this; // nothing to write

    if (schema.options.timestamps) {
      if (st.isNew) { casted.createdAt = this.createdAt instanceof Date ? this.createdAt : now; }
      casted.updatedAt = now;
      if (!changed.includes('updatedAt')) changed.push('updatedAt');
      if (st.isNew && !changed.includes('createdAt')) changed.push('createdAt');
    }

    const ref = col(M).doc(String(this._id));
    if (st.isNew) {
      if (schema.options.naturalId) {
        const nid = schema.options.naturalId(casted);
        if (nid) { this._id = nid; }
      }
      const payload = toStore(casted);
      try {
        // `natural` ids may already exist (settings singleton, notification dedupe keys).
        const res = await col(M).doc(String(this._id)).create(payload, { natural: !!schema.options.naturalId });
        cacheFor(M)?.put(this._id, { _id: String(this._id), ...plain(casted) }, wt(res));
      } catch (e) {
        if (e.code === 6 || e.code === 'already-exists' || /ALREADY_EXISTS/.test(e.message || '')) { const dup = new Error(`Duplicate key in ${M.collectionName}`); dup.code = 11000; dup.keyValue = { _id: this._id }; throw dup; }
        throw e;
      }
    } else {
      const upd = {};
      changed.forEach((k) => { upd[k] = casted[k] === undefined ? FieldValue.delete() : toStore(casted[k]); });
      removed.forEach((k) => { upd[k] = FieldValue.delete(); });
      let res;
      try { res = await ref.update(upd); } catch (e) {
        if (e.code === 5 || e.code === 'not-found') { const nf = new Error(`${M.modelName} not found`); nf.status = 404; throw nf; }
        throw e;
      }
      const setFields = {};
      const gone = [...removed];
      changed.forEach((k) => { if (casted[k] === undefined) gone.push(k); else setFields[k] = plain(casted[k]); });
      cacheFor(M)?.patch(this._id, setFields, gone, wt(res));
    }

    // Refresh in-memory state to the stored values.
    removed.forEach((k) => { delete this[k]; });
    Object.keys(casted).forEach((k) => { this[k] = casted[k]; });
    attachRootHelpers(this, schema);
    const snap = st.isNew ? { _id: this._id, ...casted } : { ...rawFromOriginal(st), ...casted };
    removed.forEach((k) => delete snap[k]);
    st.original = snapshotOf(snap);
    st.isNew = false;
    return this;
  }

  async deleteOne() {
    const M = this.constructor;
    if (M.schema.options.appendOnly) throw new Error(`${M.modelName} records are append-only`);
    const res = await col(M).doc(String(this._id)).delete();
    cacheFor(M)?.drop(this._id, wt(res));
    return this;
  }
}

function snapshotOf(obj) {
  const s = {};
  Object.keys(obj || {}).forEach((k) => { s[k] = stable(obj[k]); });
  def(s, '__raw', plain(obj));
  return s;
}
const rawFromOriginal = (st) => st.original.__raw || {};

/* ------------------------------------------------------------------ Query */
class Query {
  constructor(M, filter, { single = false } = {}) {
    this.M = M; this.filter = filter || {}; this.single = single;
    this._sort = null; this._skip = 0; this._limit = null; this._select = null; this._lean = false; this._pop = []; this._distinct = null;
  }
  sort(s) { this._sort = normalizeSort(s); return this; }
  skip(n) { this._skip = Number(n) || 0; return this; }
  limit(n) { this._limit = n === undefined || n === null ? null : Number(n); return this; }
  select(p) { this._select = mergeSelect(this._select, parseSelect(p)); return this; }
  lean(v = true) { this._lean = v; return this; }
  populate(p, s) { this._pop.push(...normPop(p, s)); return this; }
  distinct(field) { this._distinct = field; return this; }
  where(obj) { Object.assign(this.filter, obj); return this; }

  async exec() {
    const M = this.M;
    const rows = await fetchRows(M, this.filter, { sort: this._sort, skip: this._skip, limit: this.single ? 1 : this._limit });
    if (this._distinct) return distinctOf(rows, this._distinct);
    const projected = rows.map((r) => project(M, r, this._select));
    let out = this._lean ? projected : projected.map((r) => new M(undefined, { fromDb: true, row: r, projection: this._select }));
    if (this._pop.length) await populateObjects(M, out, this._pop);
    if (this.single) out = out[0] || null;
    return out;
  }
  then(res, rej) { return this.exec().then(res, rej); }
  catch(rej) { return this.exec().catch(rej); }
  finally(fn) { return this.exec().finally(fn); }
}

function distinctOf(rows, field) {
  const seen = new Map();
  rows.forEach((r) => {
    const v = getPath(r, field);
    (Array.isArray(v) ? v : [v]).forEach((x) => { if (x !== undefined && x !== null && !seen.has(stable(x))) seen.set(stable(x), x); });
  });
  return [...seen.values()];
}

/* ------------------------------------------------------------------ model() */
function model(name, schema, collectionName) {
  if (registry[name]) return registry[name];

  class M extends Document {}
  Object.defineProperty(M, 'name', { value: name });
  M.modelName = name;
  M.schema = schema;
  M.collectionName = collectionName || schema.options.collection || pluralise(name);
  Object.assign(M, schema.statics);
  Object.entries(schema.methods).forEach(([k, fn]) => def(M.prototype, k, fn));
  Object.entries(schema.virtuals).forEach(([k, get]) => Object.defineProperty(M.prototype, k, { get, configurable: true }));

  const hydrate = (row) => new M(undefined, { fromDb: true, row });
  const guardAppend = () => { if (schema.options.appendOnly) throw new Error(`${name} records are append-only`); };

  /** Applies `update` to a stored row; returns the Firestore patch (or null if nothing changes). */
  function patchFor(row, update) {
    const next = applyUpdate(plain(row), update, false);
    const ctx = { errors: {}, defaults: true, skipRootDefaults: true };
    const casted = castObject(schema.root, next, '', ctx, true);
    if (schema.options.timestamps) casted.updatedAt = new Date();
    const upd = {};
    Object.keys(casted).forEach((k) => { if (stable(casted[k]) !== stable(row[k])) upd[k] = toStore(casted[k]); });
    Object.keys(row).forEach((k) => { if (k !== '_id' && schema.fields[k] && casted[k] === undefined && row[k] !== undefined) upd[k] = FieldValue.delete(); });
    if (!Object.keys(upd).some((k) => k !== 'updatedAt')) return null;
    const set = {};
    const removed = [];
    Object.keys(upd).forEach((k) => { if (casted[k] === undefined) removed.push(k); else set[k] = plain(casted[k]); });
    const merged = { ...row, ...set };
    removed.forEach((k) => { delete merged[k]; });
    return { upd, set, removed, row: { ...merged, _id: row._id } };
  }
  async function writeRow(row, update) {
    const p = patchFor(row, update);
    if (!p) return { row, modified: false };
    const res = await col(M).doc(String(row._id)).update(p.upd);
    cacheFor(M)?.patch(row._id, p.set, p.removed, wt(res));
    return { row: p.row, modified: true };
  }

  async function upsertInsert(filter, update) {
    const base = {};
    Object.entries(filter || {}).forEach(([k, v]) => { if (!k.startsWith('$') && (typeof v !== 'object' || v === null || v instanceof Date)) setPath(base, k, v); });
    applyUpdate(base, update, true);
    const doc = new M(base);
    await doc.save();
    return doc;
  }

  Object.assign(M, {
    collection: () => col(M),
    hydrate,
    find: (filter = {}, projection) => { const q = new Query(M, { ...filter }); if (projection) q.select(projection); return q; },
    findOne: (filter = {}, projection) => { const q = new Query(M, { ...filter }, { single: true }); if (projection) q.select(projection); return q; },
    findById: (id, projection) => {
      const q = new Query(M, { _id: id === null || id === undefined || id === '' ? NO_ID : String(id && id._id ? id._id : id) }, { single: true });
      if (projection) q.select(projection);
      return q;
    },
    async countDocuments(filter = {}) { return countRows(M, filter); },
    async estimatedDocumentCount() { return (await col(M).count().get()).data().count; },
    async exists(filter = {}) { const [r] = await fetchRows(M, filter, { limit: 1 }); return r ? { _id: r._id } : null; },
    async distinct(field, filter = {}) { return distinctOf(await fetchRows(M, filter), field); },
    async create(data) {
      if (Array.isArray(data)) return Promise.all(data.map((d) => M.create(d)));
      const d = new M(data);
      await d.save();
      return d;
    },
    async insertMany(arr = []) { return Promise.all(arr.map((d) => M.create(d))); },
    async aggregate(pipeline = []) {
      let i = 0;
      let rows;
      if (pipeline[0] && pipeline[0].$match) { rows = await fetchRows(M, pipeline[0].$match); i = 1; } else rows = await fetchRows(M, {});
      for (; i < pipeline.length; i += 1) {
        const [op, arg] = Object.entries(pipeline[i])[0];
        if (!STAGES[op]) throw new Error(`Unsupported aggregation stage ${op}`);
        rows = STAGES[op](rows, op === '$match' ? castFilter(M, arg) : arg);
      }
      return rows;
    },
    async updateMany(filter, update, opts = {}) {
      guardAppend();
      const rows = await fetchRows(M, filter);
      if (!rows.length && opts.upsert) { const d = await upsertInsert(filter, update); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: d._id }; }
      const patches = rows.map((r) => ({ id: r._id, p: patchFor(r, update) })).filter((x) => x.p);
      for (let i = 0; i < patches.length; i += 400) {
        const batch = db().batch();
        const slice = patches.slice(i, i + 400);
        slice.forEach((x) => batch.update(col(M).doc(String(x.id)), x.p.upd));
        // eslint-disable-next-line no-await-in-loop
        const results = (await batch.commit()) || [];
        slice.forEach((x, j) => cacheFor(M)?.patch(x.id, x.p.set, x.p.removed, wt(results[j])));
      }
      const modified = patches.length;
      return { acknowledged: true, matchedCount: rows.length, modifiedCount: modified };
    },
    async updateOne(filter, update, opts = {}) {
      guardAppend();
      const [r] = await fetchRows(M, filter, { limit: 1 });
      if (!r) {
        if (opts.upsert) { const d = await upsertInsert(filter, update); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: d._id }; }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      const { modified } = await writeRow(r, update);
      return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0 };
    },
    async findOneAndUpdate(filter, update, opts = {}) {
      guardAppend();
      const [r] = await fetchRows(M, filter, { limit: 1, sort: opts.sort ? normalizeSort(opts.sort) : undefined });
      if (!r) {
        if (!opts.upsert) return null;
        try {
          const d = await upsertInsert(filter, update);
          return opts.new || opts.returnDocument === 'after' ? d : null;
        } catch (e) {
          if (e.code !== 11000) throw e;
          return M.findOneAndUpdate(filter, update, { ...opts, upsert: false }); // lost a creation race: use the winner
        }
      }
      const { row } = await writeRow(r, update);
      return hydrate(opts.new || opts.returnDocument === 'after' ? row : r);
    },
    findByIdAndUpdate(id, update, opts = {}) { return M.findOneAndUpdate({ _id: String(id) }, update, opts); },
    async findOneAndDelete(filter) {
      guardAppend();
      const [r] = await fetchRows(M, filter, { limit: 1 });
      if (!r) return null;
      const res = await col(M).doc(String(r._id)).delete();
      cacheFor(M)?.drop(r._id, wt(res));
      return hydrate(r);
    },
    findByIdAndDelete(id) { return M.findOneAndDelete({ _id: String(id) }); },
    async replaceOne(filter, replacement) {
      guardAppend();
      const [r] = await fetchRows(M, filter, { limit: 1 });
      if (!r) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      const d = new M({ ...plain(replacement), _id: r._id });
      d.isNew = false; d[STATE].original = snapshotOf(r);
      await d.save();
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      guardAppend();
      const [r] = await fetchRows(M, filter, { limit: 1 });
      if (r) { const res = await col(M).doc(String(r._id)).delete(); cacheFor(M)?.drop(r._id, wt(res)); }
      return { acknowledged: true, deletedCount: r ? 1 : 0 };
    },
    async deleteMany(filter) {
      guardAppend();
      const rows = await fetchRows(M, filter);
      for (let i = 0; i < rows.length; i += 400) {
        const batch = db().batch();
        const slice = rows.slice(i, i + 400);
        slice.forEach((r) => batch.delete(col(M).doc(String(r._id))));
        // eslint-disable-next-line no-await-in-loop
        const results = (await batch.commit()) || [];
        slice.forEach((r, j) => cacheFor(M)?.drop(r._id, wt(results[j])));
      }
      return { acknowledged: true, deletedCount: rows.length };
    }
  });

  // Mongoose returns Query objects from these; support the `.exec()` / `.lean()` chains callers may use.
  ['countDocuments', 'estimatedDocumentCount', 'exists', 'distinct', 'aggregate', 'updateMany', 'updateOne', 'replaceOne',
    'findOneAndUpdate', 'findByIdAndUpdate', 'findOneAndDelete', 'findByIdAndDelete', 'deleteOne', 'deleteMany'].forEach((k) => {
    const fn = M[k];
    M[k] = (...args) => {
      const p = Promise.resolve().then(() => fn(...args));
      p.exec = () => p;
      p.lean = () => { const l = p.then((d) => (d && typeof d.toObject === 'function' ? d.toObject() : d)); l.exec = () => l; return l; };
      return p;
    };
  });

  registry[name] = M;
  return M;
}

module.exports = {
  Schema, model, Types, Document, Query, CastError, ValidationError,
  newId, isValidId, hashId, registry,
  // exported for tests
  _internal: { castObject, fetchRows, applyUpdate, stable, plain, STAGES, parseSelect, project }
};
