const { config } = require('../config/env');
const { rt } = require('../runtime');
const User = require('../models/User');
const Session = require('../models/Session');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const liveCache = require('../db/cache');

/**
 * Who is signed in (Firebase Authentication) and are they allowed here?
 *
 * These checks give the app the right behaviour (redirects, messages). The real protection
 * is in firestore.rules, which applies the same conditions to every database read/write:
 * the four admin emails, active account, first password changed, not signed out by another
 * admin, and a 12-hour maximum session.
 */
let lastTouch = 0;

function buildAuth(audience, requireChangedPassword = false) {
  return asyncHandler(async (req, res, next) => {
    const auth = rt.authApi;
    const cu = auth && (await auth.currentUser());
    if (!cu) throw new AppError('Authentication required', 401);

    const info = await auth.tokenInfo();
    if (Date.now() - info.authTimeMs > config.sessionHours * 3600 * 1000) {
      await auth.signOut();
      throw new AppError('Your session has expired. Please sign in again.', 401);
    }

    // Live mirror only for admins (clients may not list whole collections).
    rt.cacheEnabled = audience === 'admin';

    let user;
    try {
      user = await User.findById(cu.uid);
    } catch (e) {
      if (e.code === 'permission-denied') throw new AppError('Session has ended. Please sign in again.', 401);
      throw e;
    }
    if (!user || !user.isActive || user.role !== audience) throw new AppError('Account not available', 401);
    if (user.forcedOutAt && info.authTimeMs < new Date(user.forcedOutAt).getTime()) {
      await auth.signOut();
      throw new AppError('You were signed out. Please sign in again.', 401);
    }
    if (audience === 'admin' && requireChangedPassword && !user.isPasswordChanged) {
      throw new AppError('Change your password before accessing the admin panel', 403);
    }

    const sid = rt.sessionStore && rt.sessionStore.get(cu.uid);
    let session = null;
    if (sid) {
      try { session = await Session.findById(sid); } catch { session = null; }
    }
    // Light "last seen" update (at most every 5 minutes) for the Sessions screen.
    if (session && !session.revokedAt && Date.now() - lastTouch > 5 * 60000) {
      lastTouch = Date.now();
      session.lastSeenAt = new Date();
      session.save().catch(() => {});
    }

    req.user = user;
    req.session = session || { _id: null, audience };
    return next();
  });
}

/** Only the four configured admins. */
const requireAdmin = buildAuth('admin');
const requireAdminPasswordChanged = buildAuth('admin', true);
/** Only client-portal users. */
const requireClient = buildAuth('client');

/** Call after sign-in/sign-out so listeners restart with the new identity's permissions. */
const resetLiveData = () => liveCache.stopAll();

module.exports = { requireAdmin, requireAdminPasswordChanged, requireClient, resetLiveData };
