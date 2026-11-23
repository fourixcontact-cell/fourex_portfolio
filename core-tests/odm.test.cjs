// Unit tests for the Firestore ODM (db/odm.js) against the strict in-memory Firestore.
process.env.FIREBASE_PROJECT_ID = 'demo-fourix';
const mem = require('./support/memoryFirebase.cjs');
mem.install();

const test = require('node:test');
const assert = require('node:assert');
const { Schema, model, Types, ValidationError } = require('../core/db/odm');
const { Timestamp } = require('@google-cloud/firestore');

const Ref = model('OdmRef', new Schema({ name: String, color: String, secret: { type: String, select: false } }, { timestamps: true }));
const Item = new Schema({ label: { type: String, required: true }, done: { type: Boolean, default: false }, by: { type: Types.ObjectId, ref: 'OdmRef' } }, { _id: true });
const Thing = model('OdmThing', new Schema({
  title: { type: String, required: true, trim: true, maxlength: 20 },
  status: { type: String, enum: ['A', 'B'], default: 'A' },
  amount: { type: Number, min: 0, default: 0 },
  when: Date,
  owner: { type: Types.ObjectId, ref: 'OdmRef' },
  team: [{ type: Types.ObjectId, ref: 'OdmRef' }],
  tags: [String],
  items: { type: [Item], default: () => [{ label: 'first' }] },
  meta: { visible: { type: Boolean, default: false }, note: String },
  removable: Date,
  isArchived: { type: Boolean, default: false }
}, { timestamps: true }));

test.beforeEach(() => mem.reset());

test('create applies casting, defaults, sub-document ids and timestamps; stores Timestamps', async () => {
  const t = await Thing.create({ title: '  Hello  ', amount: '12.5', when: '2026-03-01', tags: 'x', unknownField: 'dropped' });
  assert.equal(t.title, 'Hello');
  assert.equal(t.amount, 12.5);
  assert.ok(t.when instanceof Date);
  assert.deepEqual(t.tags, ['x']);
  assert.equal(t.items.length, 1); assert.match(t.items[0]._id, /^[0-9a-f]{24}$/); assert.equal(t.items[0].done, false);
  assert.equal(t.meta.visible, false);
  assert.equal(t.unknownField, undefined);
  assert.ok(t.createdAt instanceof Date && t.updatedAt instanceof Date);
  const raw = mem.store.get('odmthings').get(t._id);
  assert.ok(raw.when instanceof Timestamp && raw.createdAt instanceof Timestamp, 'dates are stored as Firestore Timestamps');
  const back = await Thing.findById(t._id);
  assert.ok(back.when instanceof Date && back.createdAt instanceof Date, 'Timestamps come back as Dates');
  assert.equal(JSON.parse(JSON.stringify(back)).title, 'Hello');
});

test('validation: required, enum, min, maxlength, cast errors -> ValidationError', async () => {
  await assert.rejects(Thing.create({}), (e) => !!(e instanceof ValidationError && e.errors.title));
  await assert.rejects(Thing.create({ title: 'x', status: 'Z' }), (e) => !!(e.name === 'ValidationError' && /enum/.test(e.errors.status.message)));
  await assert.rejects(Thing.create({ title: 'x', amount: -1 }), (e) => !!(e.errors.amount));
  await assert.rejects(Thing.create({ title: 'x'.repeat(21) }), (e) => !!(e.errors.title));
  await assert.rejects(Thing.create({ title: 'x', amount: 'abc' }), (e) => !!(e.errors.amount && e.errors.amount.name === 'CastError'));
  await assert.rejects(Thing.create({ title: 'x', owner: 'not-an-id' }), (e) => !!(e.errors.owner));
  await assert.rejects(Thing.create({ title: 'x', items: [{ done: true }] }), (e) => !!(e.errors['items.0.label']));
});

test('save writes only changed fields, keeps createdAt, deletes fields set to undefined', async () => {
  const t = await Thing.create({ title: 'a', removable: new Date() });
  const created = t.createdAt.getTime();
  const firstUpdated = t.updatedAt.getTime();
  await new Promise((r) => setTimeout(r, 5));
  const same = await Thing.findById(t._id);
  await same.save(); // no-op
  assert.equal((await Thing.findById(t._id)).updatedAt.getTime(), firstUpdated, 'no-op save does not bump updatedAt');
  same.status = 'B'; same.removable = undefined; same.items.push({ label: 'second' });
  await same.save();
  const back = await Thing.findById(t._id);
  assert.equal(back.status, 'B');
  assert.equal(back.removable, undefined);
  assert.equal(back.createdAt.getTime(), created);
  assert.ok(back.updatedAt.getTime() > firstUpdated);
  assert.equal(back.items.length, 2); assert.match(back.items[1]._id, /^[0-9a-f]{24}$/);
  assert.equal(back.items.id(back.items[1]._id).label, 'second');
  assert.deepEqual(back.meta.toObject(), { visible: false });
});

test('projected documents never clobber unselected data on save', async () => {
  const t = await Thing.create({ title: 'proj', status: 'B', amount: 5, meta: { visible: true, note: 'keep' } });
  const p = await Thing.findById(t._id).select('title meta.visible');
  assert.equal(p.amount, undefined);
  p.title = 'renamed';
  await p.save();
  const back = await Thing.findById(t._id);
  assert.equal(back.title, 'renamed'); assert.equal(back.status, 'B'); assert.equal(back.amount, 5); assert.equal(back.meta.note, 'keep');
});

test('queries: mongo filters, sort, skip/limit, count, exists, distinct, select:false', async () => {
  const r1 = await Ref.create({ name: 'Ann', color: 'red', secret: 's1' });
  const r2 = await Ref.create({ name: 'Bob', color: 'blue', secret: 's2' });
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Thing.create({ title: `t${i}`, amount: i * 10, status: i % 2 ? 'B' : 'A', owner: i < 3 ? r1._id : r2._id, team: [r1._id], tags: i === 5 ? ['hot'] : [], isArchived: i === 4 });
  }
  assert.equal((await Thing.find({ status: 'A' })).length, 3);
  assert.equal((await Thing.find({ amount: { $gte: 20, $lt: 50 } })).length, 3);
  assert.equal((await Thing.find({ team: r1._id })).length, 6, 'array membership');
  assert.equal((await Thing.find({ tags: 'hot' })).length, 1);
  assert.equal((await Thing.find({ $or: [{ title: /t1/i }, { title: /T2/i }] })).length, 2);
  assert.equal((await Thing.find({ removable: null })).length, 6, 'null matches missing');
  assert.equal((await Thing.find({ isArchived: 'false' })).length, 5, 'query values are cast by schema type');
  const page = await Thing.find({}).sort({ amount: -1 }).skip(1).limit(2);
  assert.deepEqual(page.map((x) => x.amount), [40, 30]);
  assert.equal(await Thing.countDocuments({ owner: r1._id }), 3);
  assert.equal(await Thing.countDocuments({ owner: r1._id, status: 'A' }), 2);
  assert.ok(await Thing.exists({ title: 't3' }));
  assert.equal(await Thing.exists({ title: 'nope' }), null);
  assert.deepEqual((await Thing.distinct('owner')).sort(), [r1._id, r2._id].sort());
  assert.deepEqual((await Thing.find({ owner: r1._id }).distinct('status')).sort(), ['A', 'B']);
  assert.equal((await Ref.findById(r1._id)).secret, undefined, 'select:false hidden by default');
  assert.equal((await Ref.findById(r1._id).select('+secret')).secret, 's1');
  assert.equal(await Thing.findById(undefined), null);
  await assert.rejects(Thing.findById('bad-id').exec(), (e) => !!(e.name === 'CastError'));
});

test('populate: single ref, arrays, nested sub-document paths, lean + select', async () => {
  const r1 = await Ref.create({ name: 'Ann', color: 'red', secret: 'x' });
  const r2 = await Ref.create({ name: 'Bob', color: 'blue' });
  const t = await Thing.create({ title: 'pop', owner: r1._id, team: [r1._id, r2._id], items: [{ label: 'i', by: r2._id }] });
  const p = await Thing.findById(t._id).populate('owner', 'name').populate('team', 'name color').populate('items.by', 'name');
  assert.deepEqual(p.owner, { _id: r1._id, name: 'Ann' });
  assert.deepEqual(p.team.map((x) => x.name), ['Ann', 'Bob']);
  assert.equal(p.items[0].by.name, 'Bob');
  assert.equal(JSON.stringify(p).includes('"secret"'), false);
  const lean = await Thing.find({ _id: t._id }).populate([{ path: 'owner', select: 'color' }]).lean();
  assert.equal(lean[0].owner.color, 'red');
  // saving a populated doc stores ids again
  p.title = 'pop2'; await p.save();
  const raw = mem.store.get('odmthings').get(t._id);
  assert.equal(raw.owner, r1._id); assert.deepEqual(raw.team, [r1._id, r2._id]);
  const inst = await Thing.findById(t._id); await inst.populate([{ path: 'owner', select: 'name' }]);
  assert.equal(inst.owner.name, 'Ann');
});

test('aggregate: $match/$group/$sum/$sort and compound _id', async () => {
  await Thing.create([{ title: 'a', status: 'A', amount: 10 }, { title: 'b', status: 'A', amount: 5 }, { title: 'c', status: 'B', amount: 1 }, { title: 'd', status: 'B', amount: 1, isArchived: true }]);
  const r = await Thing.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]);
  assert.deepEqual(r, [{ _id: 'A', n: 2, total: 15 }, { _id: 'B', n: 1, total: 1 }]);
  const all = await Thing.aggregate([{ $match: { status: { $ne: 'Z' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  assert.equal(all[0].total, 17);
  const comp = await Thing.aggregate([{ $group: { _id: { s: '$status', a: '$isArchived' }, n: { $sum: 1 } } }]);
  assert.equal(comp.length, 3);
});

test('updateOne/updateMany/findOneAndUpdate: $set, $unset, $addToSet, $pull, $inc, mixed plain fields, upsert', async () => {
  const t = await Thing.create({ title: 'u', removable: new Date(), tags: ['a'] });
  await Thing.updateOne({ _id: t._id }, { $unset: { removable: 1 }, amount: 3, $addToSet: { tags: 'b' } });
  let back = await Thing.findById(t._id);
  assert.equal(back.removable, undefined); assert.equal(back.amount, 3); assert.deepEqual(back.tags, ['a', 'b']);
  await Thing.updateOne({ _id: t._id }, { $addToSet: { tags: 'b' }, $inc: { amount: 2 }, $pull: { tags: 'a' } });
  back = await Thing.findById(t._id);
  assert.deepEqual(back.tags, ['b']); assert.equal(back.amount, 5);
  await Thing.create({ title: 'v' });
  const res = await Thing.updateMany({ status: 'A' }, { status: 'B' });
  assert.equal(res.modifiedCount, 2);
  const up = await Thing.findOneAndUpdate({ title: 'new-one' }, { $setOnInsert: { status: 'B', amount: 9 } }, { upsert: true, new: true });
  assert.equal(up.amount, 9); assert.equal(up.status, 'B'); assert.equal(up.title, 'new-one'); assert.equal(up.isArchived, false, 'defaults on upsert');
  const again = await Thing.findOneAndUpdate({ title: 'new-one' }, { $setOnInsert: { amount: 1 } }, { upsert: true, new: true });
  assert.equal(again._id, up._id); assert.equal(again.amount, 9, '$setOnInsert ignored for existing doc');
  const del = await Thing.findOneAndDelete({ title: 'v' });
  assert.equal(del.title, 'v'); assert.equal(await Thing.exists({ title: 'v' }), null);
});

test('naturalId + appendOnly + pre(save) hooks', async () => {
  const N = model('OdmNatural', new Schema({ key: String, n: Number }, { naturalId: (d) => (d.key ? require('../core/db/odm').hashId(d.key) : undefined) }));
  const a = await N.create({ key: 'one', n: 1 });
  await assert.rejects(N.create({ key: 'one', n: 2 }), (e) => !!(e.code === 11000));
  assert.equal(await N.countDocuments({}), 1);
  assert.match(a._id, /^[0-9a-f]{24}$/);

  const L = model('OdmLog', new Schema({ msg: String }, { appendOnly: true }));
  const l = await L.create({ msg: 'x' });
  l.msg = 'y';
  await assert.rejects(l.save(), /append-only/);
  await assert.rejects(L.updateMany({}, { msg: 'z' }), /append-only/);
  await assert.rejects(L.deleteMany({}), /append-only/);

  const hs = new Schema({ v: Number });
  hs.pre('save', async function guard() { if (this.v > 5) throw new Error('too big'); });
  const H = model('OdmHook', hs);
  await H.create({ v: 1 });
  await assert.rejects(H.create({ v: 9 }), /too big/);
});

test('fast path: equality filters + timestamp sort run in Firestore; missing composite index falls back transparently', async () => {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Thing.create({ title: `f${i}`, status: i < 3 ? 'A' : 'B' });
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 2));
  }
  const fast = await Thing.find({ status: 'A' }).sort({ createdAt: -1 }).skip(1).limit(1);
  assert.deepEqual(fast.map((x) => x.title), ['f1']);
  mem.setFailComposite(true);
  const warn = console.warn; let warned = ''; console.warn = (...a) => { warned += a.join(' '); };
  const slow = await Thing.find({ status: 'A' }).sort({ createdAt: -1 }).skip(1).limit(1);
  console.warn = warn;
  assert.deepEqual(slow.map((x) => x.title), ['f1'], 'same answer after fallback');
  assert.match(warned, /falling back/);
});
