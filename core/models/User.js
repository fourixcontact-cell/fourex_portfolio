const { Schema, model, Types } = require('../db/odm');

/**
 * One collection for both admins and client-portal users, separated by `role`.
 * Admins are limited to the four emails listed in firestore.rules.
 *
 * Passwords are NOT stored here: they live in Firebase Authentication. This document's `_id`
 * is the person's Firebase Auth uid.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['admin', 'client'], required: true },
    adminSlot: { type: Number, min: 1, max: 4 }, // 1..4 for admins
    clientId: { type: Types.ObjectId, ref: 'Client' }, // for role=client
    phone: String,
    avatarColor: { type: String, default: '#7c3aed' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    lastLoginIp: String,
    lastLoginDevice: String,
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    isPasswordChanged: Boolean,
    passwordChangedAt: Date,
    // Logins that started before this moment are signed out (set by "Sign out everywhere"
    // and by a password change). Enforced by firestore.rules.
    forcedOutAt: Date
  },
  { timestamps: true }
);

// Who may be an admin is enforced by firestore.rules (the four admin emails listed there).

userSchema.methods.toSafe = function toSafe() {
  return this.toObject();
};

module.exports = model('User', userSchema);
