const path = require('../lib/path');
const crypto = require('../lib/crypto');
const { db } = require('../db/firebase');

/**
 * Private file storage (uploaded documents, expense receipts, generated certificates) inside
 * Cloud Firestore, because Cloud Storage needs the paid Blaze plan.
 *
 * Each file = one metadata document in `files` + ~700 KB chunks in `filechunks`. Keys are
 * random, server-chosen names. firestore.rules let admins read everything and let a client
 * read only the files listed in their own portal document (documents shared with them and
 * their completion certificates).
 */
const CHUNK = 700 * 1024; // Firestore documents are limited to 1 MiB
const CHUNKS_PER_BATCH = 8; // keeps every commit well under the 10 MiB request limit

const newKey = (ext = '') => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${String(ext).toLowerCase()}`;
const safeKey = (key) => path.basename(String(key));
const metaRef = (key) => db().collection('files').doc(safeKey(key));
const chunkRef = (key, i) => db().collection('filechunks').doc(`${safeKey(key)}__${i}`);
const toBuffer = (data) => (Buffer.isBuffer(data) ? data : Buffer.from(data instanceof Uint8Array ? data : data || []));

async function saveBuffer(buffer, ext = '.pdf', contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream') {
  const key = newKey(ext);
  const buf = toBuffer(buffer);
  const n = Math.max(1, Math.ceil(buf.length / CHUNK));
  for (let i = 0; i < n; i += CHUNKS_PER_BATCH) {
    const batch = db().batch();
    for (let j = i; j < Math.min(n, i + CHUNKS_PER_BATCH); j += 1) {
      batch.set(chunkRef(key, j), { key, i: j, data: new Uint8Array(buf.subarray(j * CHUNK, (j + 1) * CHUNK)) });
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  // Metadata last: a file "exists" only once all its chunks are stored.
  await metaRef(key).set({ key, contentType, size: buf.length, chunks: n, createdAt: new Date() });
  return key;
}

async function exists(key) {
  if (!key) return false;
  try { return (await metaRef(key).get()).exists; } catch { return false; }
}

/** Whole file as { buffer, contentType }. Throws { code: 404 } if missing. */
async function read(key) {
  const snap = await metaRef(key).get();
  if (!snap.exists) throw Object.assign(new Error('No such file'), { code: 404 });
  const meta = snap.data();
  const n = Number(meta.chunks) || 0;
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => chunkRef(key, i).get()));
  const missing = parts.findIndex((c) => !c.exists);
  if (missing >= 0) throw new Error(`File chunk ${missing} missing`);
  return { buffer: Buffer.concat(parts.map((c) => toBuffer(c.data().data))), contentType: meta.contentType || 'application/octet-stream' };
}

/** Fire-and-forget delete (never throws). */
function remove(key) {
  if (!key) return Promise.resolve();
  return (async () => {
    const snap = await metaRef(key).get();
    if (!snap.exists) return;
    const n = Number(snap.data().chunks) || 0;
    await metaRef(key).delete();
    for (let i = 0; i < n; i += 400) {
      const batch = db().batch();
      for (let j = i; j < Math.min(n, i + 400); j += 1) batch.delete(chunkRef(key, j));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  })().catch(() => {});
}

/** Send a stored file as the response body (headers are set by the caller). */
async function pipeTo(key, res) {
  try {
    const { buffer, contentType } = await read(key);
    if (!res.get('content-type')) res.set('content-type', contentType);
    res.send(buffer);
  } catch (e) {
    if (!res.headersSent) res.status(e.code === 404 ? 404 : 500).json({ success: false, message: 'File not available' });
  }
}

module.exports = { saveBuffer, exists, read, remove, pipeTo, newKey, DRIVER: 'firestore' };
