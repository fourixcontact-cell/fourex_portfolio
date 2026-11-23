const { Schema, model, Types } = require('../db/odm');

const sessionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    audience: { type: String, enum: ['admin', 'client'], default: 'admin' },
    ip: String,
    userAgent: String,
    device: String,
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedBy: { type: Types.ObjectId, ref: 'User' },
    endReason: { type: String, enum: ['logout', 'forced', 'expired', 'password-change', null], default: null },
    // Login history is kept for one year. Enable a Firestore TTL policy on this field
    // (see README) and Firestore deletes old sessions automatically.
    purgeAt: { type: Date, default: () => new Date(Date.now() + 365 * 864e5) }
  },
  { versionKey: false }
);


module.exports = model('Session', sessionSchema);
