const Notification = require('../models/Notification');
const User = require('../models/User');

/** Create an in-app notification; a repeated dedupeKey is silently ignored. */
async function notify({ type, title, message, link, dedupeKey, audience = 'admin', forClient }) {
  try {
    // App-level check first; the dedupeKey also maps to a fixed document id, so a race
    // between two instances still ends with exactly one notification.
    if (dedupeKey && (await Notification.exists({ dedupeKey }))) return null;
    const unreadBy = audience === 'admin'
      ? (await User.find({ role: 'admin', isActive: true }).select('_id').lean()).map((u) => u._id)
      : [];
    return await Notification.create({ type, title, message, link, dedupeKey, audience, forClient, unreadBy });
  } catch (e) {
    if (e.code === 11000) return null; // already notified
    console.error('notify failed', e.message);
    return null;
  }
}

module.exports = { notify };
