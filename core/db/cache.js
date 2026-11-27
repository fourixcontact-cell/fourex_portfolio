/**
 * Live, in-memory mirror of Firestore collections for the signed-in CRM.
 *
 * Why: Firestore's free (Spark) plan allows 50,000 document reads per day. Without a mirror
 * every list page, dashboard and notification poll would re-read whole collections. With it,
 * each collection is read ONCE per visit (and, thanks to the SDK's on-device cache, a revisit
 * within 30 minutes only downloads what changed); afterwards a real-time listener delivers
 * only the documents that change.
 *
 * Consistency
 *  - Browser (rt.latencyCompensated): the Firebase SDK applies this tab's own writes to the
 *    listener immediately, before the write promise resolves, so reads always see them.
 *  - Node/tests: writes are also applied here directly (write-through), versioned by
 *    Firestore's updateTime so an older listener event never overwrites a newer write.
 *  - The mirror is only used after the first snapshot confirmed by the server, so a stale
 *    on-device copy is never served as current data.
 * If a listener fails (e.g. permission denied), that collection falls back to direct queries.
 */
const { db, isTimestamp } = require('./firebase');
const { rt } = require('../runtime');

const enabled = () => rt.cacheEnabled === true || String((typeof process !== 'undefined' && process.env && process.env.FIRESTORE_CACHE) || '').toLowerCase() === 'on';
const micros = (ts) => (isTimestamp(ts) ? ts.seconds * 1e6 + Math.floor(ts.nanoseconds / 1000) : (ts ? Number(ts) : 0));
const READY_TIMEOUT_MS = 20000;

function fromStore(v) {
  if (isTimestamp(v)) return v.toDate();
  if (Array.isArray(v)) return v.map(fromStore);
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Uint8Array)) {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = fromStore(v[k]); });
    return o;
  }
  return v;
}

class CollectionCache {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
    this.versions = new Map();
    this.live = false;
    this.failed = false;
    this.readyPromise = null;
    this.unsubscribe = null;
  }

  ready() {
    if (this.failed) return Promise.resolve(false);
    if (this.live) return Promise.resolve(true);
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        let settled = false;
        const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
        const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
        const col = db().collection(this.name);
        if (typeof col.onSnapshot !== 'function') { this.failed = true; clearTimeout(timer); settle(false); return; }
        this.unsubscribe = col.onSnapshot(
          (snap) => {
            const readAt = micros(snap.readTime);
            snap.docChanges().forEach((ch) => {
              const id = ch.doc.id;
              const at = ch.type === 'removed' ? readAt : micros(ch.doc.updateTime);
              if (at && at < (this.versions.get(id) || 0)) return; // a newer local write already applied
              if (at) this.versions.set(id, at);
              if (ch.type === 'removed') this.docs.delete(id);
              else this.docs.set(id, { _id: id, ...fromStore(ch.doc.data()) });
            });
            const fromCache = !!(snap.metadata && snap.metadata.fromCache);
            if (!fromCache && !this.live) { this.live = true; clearTimeout(timer); settle(true); }
          },
          (err) => {
            console.warn(`[cache] live data for "${this.name}" unavailable, using direct queries:`, err.message);
            this.failed = true; this.live = false; this.docs.clear();
            clearTimeout(timer);
            settle(false);
          }
        );
      });
    }
    return this.readyPromise.then(() => this.live);
  }

  all() { return this.docs.values(); }
  byId(id) { return this.docs.get(String(id)); }

  /** Local write-through (only needed where the SDK doesn't do latency compensation). */
  put(id, row, writeTime) {
    if (rt.latencyCompensated || !this.readyPromise || this.failed) return;
    this.versions.set(String(id), Math.max(micros(writeTime) || Date.now() * 1000, this.versions.get(String(id)) || 0));
    this.docs.set(String(id), row);
  }

  patch(id, set, removed, writeTime) {
    if (rt.latencyCompensated || !this.readyPromise || this.failed) return;
    const cur = this.docs.get(String(id));
    if (!cur) return;
    const next = { ...cur, ...set };
    removed.forEach((k) => { delete next[k]; });
    this.put(id, next, writeTime);
  }

  drop(id, writeTime) {
    if (rt.latencyCompensated || !this.readyPromise || this.failed) return;
    this.versions.set(String(id), Math.max(micros(writeTime) || Date.now() * 1000, this.versions.get(String(id)) || 0));
    this.docs.delete(String(id));
  }

  stop() { if (this.unsubscribe) this.unsubscribe(); }
}

// Collections that are never mirrored: large and only read a page at a time, or raw storage.
const NEVER = new Set(['auditlogs', 'counters', '_meta', 'files', 'filechunks', 'portal', 'public', 'quotationViews']);

const caches = new Map();
function forCollection(name) {
  if (!enabled() || NEVER.has(name)) return null;
  if (!caches.has(name)) caches.set(name, new CollectionCache(name));
  return caches.get(name);
}

function stats() {
  return [...caches.values()].map((c) => ({ collection: c.name, live: c.live, failed: c.failed, docs: c.docs.size }));
}
function stopAll() { caches.forEach((c) => c.stop()); caches.clear(); }

module.exports = { enabled, forCollection, stats, stopAll, micros };
