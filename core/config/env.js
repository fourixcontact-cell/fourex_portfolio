/**
 * App configuration. In the browser it comes from the host (src/services/coreHost.js, which
 * reads VITE_* build variables); in tests from tests/support/nodeHost.js.
 * There are no secrets here: everything secret lives in Firebase Auth, Firestore security
 * rules or Cloudflare environment variables.
 */
const { rt } = require('../runtime');

const env = () => rt.env || {};

const config = {
  get env() { return env().mode || 'production'; },
  get isProd() { return env().mode !== 'development' && env().mode !== 'test'; },
  get clientUrl() { return String(env().clientUrl || (typeof location !== 'undefined' ? location.origin : 'http://localhost:5173')).replace(/\/$/, ''); },
  get sessionHours() { return Number(env().sessionHours) || 12; },
  // Uploaded files are stored inside Firestore on the free plan (1 GiB in total).
  get maxUploadMb() { return Math.min(Number(env().maxUploadMb) || 10, 15); },
  // Kept for code that still reads it; admin emails are enforced by firestore.rules.
  get admins() { return env().admins || []; },
  get agencyEmail() { return env().agency?.email || ''; },
  get agency() {
    const a = env().agency || {};
    return {
      name: a.name || 'Fourix',
      tagline: a.tagline || 'Software Development Studio',
      address: a.address || '',
      phone: a.phone || '',
      email: a.email || '',
      website: a.website || '',
      gstin: a.gstin || '',
      signatory: a.signatory || 'Authorized Signatory',
      bank: a.bank || '',
      logoPath: ''
    };
  }
};

const validateConfig = () => {};

module.exports = { config, validateConfig };
