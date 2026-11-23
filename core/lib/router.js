/**
 * A tiny Express-compatible router that runs inside the browser.
 *
 * The CRM's route files (routes/*.js) and controllers were written for Express. This
 * implements the part of Express they use — Router(), use(), get/post/put/patch/delete,
 * ":params", middleware chains, next(err) — plus request/response objects with the methods
 * the controllers call (res.status().json(), res.set(), res.send(), …). The axios adapter
 * (../app.js) turns every `api.get('/crm/...')` call from the React pages into a call here,
 * so the pages talk to the same API as before, with no server in between.
 */

function compile(path) {
  const keys = [];
  const src = String(path)
    .replace(/\/+$/, '')
    .replace(/[.+*?^${}()[\]|\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp(`^${src || ''}/?$`, 'i'), keys };
}

class Router {
  constructor() {
    this.stack = [];
  }

  use(pathOrFn, ...fns) {
    if (typeof pathOrFn === 'string') this.stack.push({ kind: 'mount', prefix: pathOrFn.replace(/\/+$/, ''), handlers: fns });
    else this.stack.push({ kind: 'mw', handlers: [pathOrFn, ...fns] });
    return this;
  }

  route(method, path, handlers) {
    const { re, keys } = compile(path);
    this.stack.push({ kind: 'route', method, re, keys, handlers });
    return this;
  }

  get(p, ...h) { return this.route('GET', p, h); }
  post(p, ...h) { return this.route('POST', p, h); }
  put(p, ...h) { return this.route('PUT', p, h); }
  patch(p, ...h) { return this.route('PATCH', p, h); }
  delete(p, ...h) { return this.route('DELETE', p, h); }

  /** Runs the request through this router. Calls done(err?) if nothing handled it. */
  handle(req, res, done, path = req.path) {
    let i = 0;
    const layers = this.stack;
    const next = (err) => {
      if (res.finished) return;
      while (i < layers.length) {
        const layer = layers[i++];
        if (layer.kind === 'mw') return runChain(layer.handlers, req, res, next, err);
        if (layer.kind === 'mount') {
          if (path === layer.prefix || path.startsWith(`${layer.prefix}/`)) {
            const sub = path.slice(layer.prefix.length) || '/';
            const handlers = layer.handlers.map((h) => (h instanceof Router ? (rq, rs, nx) => h.handle(rq, rs, nx, sub) : h));
            return runChain(handlers, req, res, next, err);
          }
          continue;
        }
        if (layer.method !== req.method) continue;
        const m = layer.re.exec(path);
        if (!m) continue;
        req.params = {};
        layer.keys.forEach((k, j) => { req.params[k] = decodeURIComponent(m[j + 1]); });
        return runChain(layer.handlers, req, res, next, err);
      }
      return done(err);
    };
    next();
  }
}

/** Express semantics: (req,res,next) handlers are skipped while an error is pending; (err,req,res,next) handlers only run then. */
function runChain(handlers, req, res, outerNext, initialErr) {
  let j = 0;
  const step = (err) => {
    if (res.finished) return;
    if (j >= handlers.length) return outerNext(err);
    const h = handlers[j++];
    const isErrorHandler = h.length === 4;
    try {
      if (err) {
        if (isErrorHandler) return h(err, req, res, step);
        return step(err);
      }
      if (isErrorHandler) return step();
      const r = h(req, res, step);
      if (r && typeof r.catch === 'function') r.catch(step);
      return r;
    } catch (e) {
      return step(e);
    }
  };
  step(initialErr);
}

/** Request object with the Express API the controllers use. */
function makeRequest({ method, path, query, body, headers, files }) {
  const lower = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    path,
    url: path,
    originalUrl: path,
    query: query || {},
    params: {},
    body: body || {},
    headers: lower,
    rawFiles: files || [],
    ip: '',
    get(name) { return lower[String(name).toLowerCase()]; },
    is(type) { return String(lower['content-type'] || '').startsWith(type); },
    accepts() { return true; }
  };
}

/** Response object that records what the controller sends. */
function makeResponse(onFinish) {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    finished: false,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    set(k, v) {
      if (typeof k === 'object') Object.entries(k).forEach(([a, b]) => { this.headers[a.toLowerCase()] = String(b); });
      else this.headers[String(k).toLowerCase()] = String(v);
      return this;
    },
    setHeader(k, v) { return this.set(k, v); },
    header(k, v) { return this.set(k, v); },
    get(k) { return this.headers[String(k).toLowerCase()]; },
    type(t) { return this.set('content-type', t); },
    attachment(name) { return this.set('content-disposition', `attachment; filename="${name}"`); },
    json(obj) {
      if (!this.headers['content-type']) this.headers['content-type'] = 'application/json';
      return this.finish(JSON.parse(JSON.stringify(obj === undefined ? null : obj)));
    },
    send(data) { return this.finish(data); },
    end(data) { return this.finish(data); },
    finish(data) {
      if (this.finished) return this;
      this.body = data;
      this.finished = true;
      this.headersSent = true;
      onFinish(this);
      return this;
    }
  };
  return res;
}

module.exports = { Router, makeRequest, makeResponse, Express: { Router: () => new Router() } };
