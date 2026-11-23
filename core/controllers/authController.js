const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const { config } = require('../config/env');
const { rt } = require('../runtime');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const { clientInfo, assertObjectId } = require('../utils/helpers');
const { resetLiveData } = require('../middleware/auth');

/**
 * Sign-in with Firebase Authentication, directly from the browser.
 * Firebase checks the password and throttles repeated wrong attempts itself. Who may act as
 * an admin is decided by firestore.rules (the four admin emails listed there).
 */
function passwordPolicy(pw = '') {
  if (typeof pw !== 'string') return 'Password is required';
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 128) return 'Password must be 128 characters or fewer';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Password needs upper case, lower case and a number';
  return null;
}

const prettyName = (email) => String(email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function authError(e) {
  const code = String(e && e.code);
  if (code === 'auth/too-many-requests') return new AppError('Too many attempts. Try again in a few minutes.', 429);
  if (code === 'auth/network-request-failed') return new AppError('Cannot reach the sign-in service. Check your connection.', 503);
  if (code === 'auth/user-disabled') return new AppError('This account has been disabled.', 401);
  return new AppError('Invalid email or password', 401);
}

function makeLogin(audience) {
  return asyncHandler(async (req, res) => {
    if (typeof req.body.email !== 'string' || typeof req.body.password !== 'string') throw new AppError('Email and password are required', 400);
    const email = req.body.email.trim().toLowerCase().slice(0, 160);
    const password = req.body.password.slice(0, 200);
    if (!email || !password) throw new AppError('Email and password are required', 400);

    const auth = rt.authApi;
    let cred;
    try { cred = await auth.signIn(email, password); } catch (e) { throw authError(e); }
    resetLiveData();

    const deny = async (msg, status = 401) => { await auth.signOut().catch(() => {}); throw new AppError(msg, status); };
    let user = null;
    try { user = await User.findById(cred.uid); } catch (e) { if (e.code !== 'permission-denied') throw e; }

    if (!user && audience === 'admin') {
      // First sign-in of an admin: firestore.rules only allow this for the four admin emails.
      try {
        user = await User.create({ _id: cred.uid, name: cred.displayName || prettyName(email), email, role: 'admin', isActive: true, isPasswordChanged: false });
      } catch (e) {
        if (e.code === 'permission-denied') await deny('This account is not one of the Fourix admins.', 403);
        throw e;
      }
    }
    if (!user || user.role !== audience) {
      await deny(audience === 'admin' ? 'This account is not one of the Fourix admins.' : 'Invalid email or password', audience === 'admin' ? 403 : 401);
    }
    if (!user.isActive) await deny('This account has been disabled.');

    const info = clientInfo(req);
    user.lastLoginAt = new Date();
    user.lastLoginDevice = info.device;
    await user.save();

    const session = await Session.create({
      user: user._id,
      audience,
      userAgent: info.userAgent,
      device: info.device,
      expiresAt: new Date(Date.now() + config.sessionHours * 3600 * 1000)
    });
    if (rt.sessionStore) rt.sessionStore.set(user._id, session._id);
    await audit.record(req, { action: 'LOGIN', module: audience === 'client' ? 'portal-auth' : 'auth', recordId: user._id, description: `${user.name} signed in`, actor: user });

    res.json({ success: true, user: user.toSafe() });
  });
}

const adminLogin = makeLogin('admin');
const portalLogin = makeLogin('client');

function makeLogout(moduleName) {
  return asyncHandler(async (req, res) => {
    if (req.session && req.session._id && typeof req.session.save === 'function') {
      req.session.revokedAt = new Date();
      req.session.endReason = 'logout';
      await req.session.save().catch(() => {});
    }
    await audit.record(req, { action: 'LOGOUT', module: moduleName, recordId: req.user._id, description: `${req.user.name} signed out` });
    resetLiveData();
    await rt.authApi.signOut();
    res.json({ success: true });
  });
}

const adminLogout = makeLogout('auth');
const portalLogout = makeLogout('portal-auth');

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafe(), sessionId: req.session?._id || null });
});

function makeChangePassword(moduleName) {
  return asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      throw new AppError('Current and new password are required', 400);
    }
    const problem = passwordPolicy(newPassword);
    if (problem) throw new AppError(problem, 400);
    if (newPassword === currentPassword) throw new AppError('New password must be different', 400);

    try {
      await rt.authApi.changePassword(currentPassword, newPassword);
    } catch (e) {
      const code = String(e && e.code);
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') throw new AppError('Current password is incorrect', 400);
      if (code === 'auth/weak-password') throw new AppError('Password is too weak', 400);
      throw authError(e);
    }
    const info = await rt.authApi.tokenInfo();

    const user = await User.findById(req.user._id);
    user.passwordChangedAt = new Date();
    if (moduleName === 'auth') user.isPasswordChanged = true;
    // Every login older than this one is signed out (enforced by firestore.rules).
    user.forcedOutAt = new Date(info.authTimeMs);
    await user.save();

    const others = await Session.find({ user: user._id, revokedAt: { $exists: false } });
    for (const s of others) {
      if (String(s._id) === String(req.session?._id)) continue;
      s.revokedAt = new Date(); s.endReason = 'password-change'; s.revokedBy = user._id;
      // eslint-disable-next-line no-await-in-loop
      await s.save().catch(() => {});
    }
    await audit.record(req, { action: 'PASSWORD_CHANGE', module: moduleName, recordId: user._id, description: `${user.name} changed their password`, actor: user });
    resetLiveData(); // permissions may have changed (first password change unlocks the CRM)
    res.json({ success: true, message: 'Password updated. Other sessions were signed out.', ...(moduleName === 'auth' ? { user: user.toSafe() } : {}) });
  });
}

/* ---------- Admin-only: team login visibility ---------- */

const listAdmins = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: 'admin' }).sort({ adminSlot: 1 });
  const now = new Date();
  const activeSessions = await Session.find({ audience: 'admin', revokedAt: { $exists: false }, expiresAt: { $gt: now } });
  const failed = await AuditLog.aggregate([
    { $match: { action: 'FAILED_LOGIN', module: 'auth', createdAt: { $gte: new Date(Date.now() - 7 * 864e5) } } },
    { $group: { _id: '$adminId', count: { $sum: 1 } } }
  ]);
  const failedMap = Object.fromEntries(failed.filter((f) => f._id).map((f) => [String(f._id), f.count]));

  const data = await Promise.all(
    admins.map(async (a) => {
      const sessions = activeSessions.filter((s) => String(s.user) === String(a._id));
      const recent = await Session.find({ user: a._id, audience: 'admin' }).sort({ createdAt: -1 }).limit(5);
      return {
        ...a.toSafe(),
        online: sessions.some((s) => now - s.lastSeenAt < 10 * 60000),
        activeSessionCount: sessions.length,
        failedAttempts7d: failedMap[String(a._id)] || 0,
        recentLogins: recent.map((s) => ({ at: s.createdAt, ip: s.ip, device: s.device, endReason: s.endReason }))
      };
    })
  );
  res.json({ success: true, data, maxAdmins: 4 });
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ audience: 'admin', revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .populate('user', 'name email adminSlot')
    .sort({ lastSeenAt: -1 });
  res.json({ success: true, data: sessions.map((s) => ({ ...s.toObject(), current: String(s._id) === String(req.session._id) })) });
});

const loginHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const sessions = await Session.find({ audience: 'admin' }).populate('user', 'name email').sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, data: sessions });
});

/**
 * Firebase can't end one specific device from the browser, so this signs that person out
 * EVERYWHERE: every login older than now stops working immediately (firestore.rules).
 */
const revokeSession = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'session id');
  const s = await Session.findById(req.params.id).populate('user', 'name email');
  if (!s || s.audience !== 'admin') throw new AppError('Session not found', 404);
  if (s.revokedAt) throw new AppError('Session already ended', 400);
  const targetId = s.user?._id || s.user;
  if (String(targetId) === String(req.user._id)) throw new AppError('Use "Sign out" for your own account, or change your password to sign out your other devices.', 400);

  const target = await User.findById(targetId);
  if (target) { target.forcedOutAt = new Date(); await target.save(); }
  const active = await Session.find({ user: targetId, revokedAt: { $exists: false } });
  for (const x of active) {
    x.revokedAt = new Date(); x.revokedBy = req.user._id; x.endReason = 'forced';
    // eslint-disable-next-line no-await-in-loop
    await x.save();
  }
  await audit.record(req, {
    action: 'SESSION_TERMINATED',
    module: 'auth',
    recordId: s._id,
    description: `${req.user.name} signed ${s.user?.name || 'an admin'} out of all devices`
  });
  res.json({ success: true, message: `${s.user?.name || 'Admin'} was signed out of all devices` });
});

module.exports = {
  adminLogin, portalLogin, adminLogout, portalLogout, me,
  adminChangePassword: makeChangePassword('auth'),
  portalChangePassword: makeChangePassword('portal-auth'),
  listAdmins, listSessions, loginHistory, revokeSession, passwordPolicy, prettyName
};
