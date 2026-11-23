const { Router, makeRequest, makeResponse } = require('./lib/router');
const { rt, setRuntime } = require('./runtime');
const { requireAdminPasswordChanged } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const housekeeping = require('./services/housekeeping');

/**
 * The whole CRM + portal "API", running in the browser.
 *
 * handle({ method, url, params, data, headers }) is called by the axios adapter in
 * src/services/api.js for every /auth, /crm and /portal request the React pages make. It runs
 * the same route files and controllers the Express server used to run, reading and writing
 * Firestore directly (firestore.rules decide what each signed-in user may touch).
 */
const app = new Router();

const timeout = (ms) => new Promise((r) => setTimeout(r, ms));

// Background work an admin's browser does (see services/housekeeping.js).
function housekeepingHook(req, res, next) {
  if (req.method === 'GET' && req.path === '/crm/dashboard') {
    // Wait a little so the dashboard shows fresh numbers, but never hold it up for long.
    Promise.race([housekeeping.run({ force: true }), timeout(8000)]).catch(() => {}).finally(() => next());
    return;
  }
  if (req.method === 'GET' && req.path === '/crm/notifications') housekeeping.run().catch(() => {});
  if (req.method !== 'GET') {
    const done = () => { if (res.statusCode < 400) housekeeping.afterAdminWrite(); };
    res.__after = done;
  }
  next();
}

app.use('/auth', require('./routes/authRoutes'));
app.use('/portal', require('./routes/portalRoutes'));
// req.path keeps the full path inside mounted routers.
app.use('/crm', requireAdminPasswordChanged, housekeepingHook, require('./routes/crmRoutes'));
app.use(notFound);
app.use(errorHandler);

function splitUrl(url) {
  const u = new URL(url, 'http://local');
  const query = {};
  u.searchParams.forEach((v, k) => {
    if (query[k] === undefined) query[k] = v;
    else query[k] = [].concat(query[k], v);
  });
  return { path: u.pathname.replace(/^\/api(?=\/)/, ''), query };
}

/** FormData -> { body, files } */
function fromFormData(fd) {
  const body = {};
  const files = [];
  fd.forEach((v, k) => {
    if (typeof File !== 'undefined' && v instanceof Blob) files.push({ field: k, file: v });
    else if (!['__proto__', 'constructor', 'prototype'].includes(k)) body[k] = v;
  });
  return { body, files };
}

/** Run one request; resolves { status, headers, data }. */
function handle({ method = 'GET', url, params, data, headers = {} }) {
  const { path, query } = splitUrl(url);
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') query[k] = Array.isArray(v) ? v.map(String) : String(v); });

  let body = data;
  let files = [];
  if (typeof FormData !== 'undefined' && data instanceof FormData) ({ body, files } = fromFormData(data));
  else if (typeof data === 'string') { try { body = JSON.parse(data); } catch { body = {}; } }

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const req = makeRequest({ method: method.toUpperCase(), path, query, body: body || {}, headers: { 'user-agent': ua, ...headers }, files });

  return new Promise((resolve) => {
    const res = makeResponse((r) => {
      if (typeof r.__after === 'function') r.__after();
      resolve({ status: r.statusCode, headers: r.headers, data: r.body });
    });
    app.handle(req, res, (err) => {
      if (res.finished) return;
      if (err) errorHandler(err, req, res, () => {});
      else notFound(req, res);
    });
  });
}

module.exports = { handle, setRuntime, rt, housekeeping, User: require('./models/User'), liveCache: require('./db/cache'), mirrors: require('./services/mirrorService'), resetLiveData: require('./middleware/auth').resetLiveData };
