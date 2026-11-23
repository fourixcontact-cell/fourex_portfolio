// Live in-memory cache (db/cache.js) used by the free Render server to stay inside
// Firestore's 50K reads/day. Runs against the strict in-memory Firestore double.
process.env.FIREBASE_PROJECT_ID = 'demo-fourix';
process.env.FIRESTORE_CACHE = 'on';
const mem = require('./support/memoryFirebase.cjs');
mem.install();

const test = require('node:test');
const assert = require('node:assert');
const { Schema, model, Types } = require('../core/db/odm');
const cache = require('../core/db/cache');
const { db } = require('../core/db/firebase');

const Owner = model('CacheOwner', new Schema({ name: String }, { timestamps: true }));
const Item = model('CacheItem', new Schema({
  title: { type: String, required: true }, status: { type: String, default: 'A' }, n: { type: Number, default: 0 },
  owner: { type: Types.ObjectId, ref: 'CacheOwner' }, tags: [String], note: String
}, { timestamps: true }));

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(() => { cache.stopAll(); mem.reset(); });

test('a collection is read once; later queries, counts and populates cost zero Firestore reads', async () => {
  const o = await Owner.create({ name: 'Ann' });
  for (let i = 0; i < 20; i += 1) await Item.create({ title: `t${i}`, owner: o._id, n: i });
  await Item.find({}); await Owner.find({});
  const before = mem.stats.reads;
  for (let i = 0; i < 50; i += 1) {
    await Item.find({ n: { $gte: 5 } }).sort({ n: -1 }).limit(3).populate('owner', 'name');
    await Item.countDocuments({ status: 'A' });
    await Item.findById((await Item.findOne({ title: 't3' }))._id);
  }
  assert.equal(mem.stats.reads, before, 'no reads after the initial load');
  const top = await Item.find({}).sort({ n: -1 }).limit(1).populate('owner', 'name');
  assert.equal(top[0].n, 19); assert.equal(top[0].owner.name, 'Ann');
});

test('read-your-writes even when listener events are slow', async () => {
  mem.setListenerDelay(40);
  await Item.find({}); // start the mirror
  const a = await Item.create({ title: 'fresh' });
  assert.equal((await Item.findById(a._id)).title, 'fresh', 'create visible immediately');
  a.status = 'B'; a.note = 'x'; await a.save();
  assert.equal((await Item.findById(a._id)).status, 'B', 'update visible immediately');
  a.note = undefined; await a.save();
  assert.equal((await Item.findById(a._id)).note, undefined, 'field removal visible immediately');
  await Item.updateMany({ title: 'fresh' }, { $inc: { n: 5 }, $addToSet: { tags: 'hot' } });
  const u = await Item.findById(a._id); assert.equal(u.n, 5); assert.deepEqual(u.tags, ['hot']);
  await tick(120); // let the (older) listener events arrive
  const after = await Item.findById(a._id);
  assert.equal(after.status, 'B'); assert.equal(after.n, 5); assert.equal(after.note, undefined, 'late events never roll back newer state');
  await Item.findOneAndDelete({ _id: a._id });
  assert.equal(await Item.findById(a._id), null, 'delete visible immediately');
  await tick(120);
  assert.equal(await Item.findById(a._id), null, 'late events never resurrect a deleted doc');
});

test('writes made outside the server (e.g. Firebase console) arrive through the listener', async () => {
  const a = await Item.create({ title: 'console' });
  await Item.find({});
  await db().collection('cacheitems').doc(a._id).update({ status: 'B' });
  await db().collection('cacheitems').doc('0123456789abcdef01234567').set({ title: 'added in console', status: 'A', n: 1 });
  await tick(10);
  assert.equal((await Item.findById(a._id)).status, 'B');
  assert.equal((await Item.findOne({ title: 'added in console' }))._id, '0123456789abcdef01234567');
  await db().collection('cacheitems').doc(a._id).delete();
  await tick(10);
  assert.equal(await Item.findById(a._id), null);
});

test('saving a projected document only patches the changed field in the mirror', async () => {
  const a = await Item.create({ title: 'proj', status: 'B', n: 7, tags: ['k'] });
  await Item.find({});
  const p = await Item.findById(a._id).select('title');
  p.title = 'renamed'; await p.save();
  const back = await Item.findById(a._id);
  assert.equal(back.title, 'renamed'); assert.equal(back.status, 'B'); assert.equal(back.n, 7); assert.deepEqual(back.tags, ['k']);
});

test('returned rows are copies: callers mutating results never corrupt the mirror', async () => {
  await Item.create({ title: 'immutable', tags: ['a'] });
  const rows = await Item.find({ title: 'immutable' }).lean();
  rows[0].title = 'hacked'; rows[0].tags.push('b');
  const again = await Item.findOne({ title: 'immutable' }).lean();
  assert.deepEqual(again.tags, ['a']);
});

test('if a listener cannot start, queries fall back to Firestore', async () => {
  const col = db().collection('cacheowners');
  const proto = Object.getPrototypeOf(col);
  const orig = proto.onSnapshot;
  proto.onSnapshot = function broken(next, error) { setTimeout(() => error(new Error('permission denied')), 0); return () => {}; };
  const errLog = console.error; console.error = () => {};
  try {
    await Owner.create({ name: 'Zed' });
    assert.equal((await Owner.find({ name: 'Zed' })).length, 1);
    assert.deepEqual(cache.stats().find((s) => s.collection === 'cacheowners'), { collection: 'cacheowners', live: false, failed: true, docs: 0 });
  } finally { proto.onSnapshot = orig; console.error = errLog; }
});
