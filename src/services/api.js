import axios from 'axios';
import { publicHandle } from './publicSite';

/**
 * The pages still call `api.get('/crm/leads')`, `api.post('/portal/...')` etc. exactly as before,
 * but there is no server any more: this axios adapter answers those calls in the browser.
 *   /public/*            -> ./publicSite.js (small, for website visitors)
 *   /auth, /crm, /portal -> the CRM logic in /core (loaded on first use), talking to Firestore
 */
async function localAdapter(config) {
  const url = String(config.url || '').replace(/^\/api(?=\/)/, '');
  const req = { method: (config.method || 'get').toUpperCase(), url, params: config.params, data: config.data, headers: (config.headers && typeof config.headers.toJSON === 'function' ? config.headers.toJSON() : { ...(config.headers || {}) }) };
  const out = url.startsWith('/public/') ? await publicHandle(req) : await (await (await import('./coreHost')).loadCore()).handle(req);

  let data = out.data;
  const ct = String(out.headers?.['content-type'] || '');
  // Files (PDFs, CSV exports, documents) come back as Blobs, like a real download.
  if (out.status < 400 && (config.responseType === 'blob' || data instanceof Uint8Array)) {
    data = data instanceof Blob ? data : new Blob([data instanceof Uint8Array ? data : typeof data === 'string' ? data : JSON.stringify(data)], { type: ct || 'application/octet-stream' });
  }
  const response = { data, status: out.status, statusText: String(out.status), headers: out.headers || {}, config, request: {} };
  if (out.status >= 400) {
    const err = new axios.AxiosError(data?.message || `Request failed with status ${out.status}`, String(out.status), config, {}, response);
    throw err;
  }
  return response;
}

const api = axios.create({ adapter: localAdapter, timeout: 0 });

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Central 401 handling: tell the auth context the session ended.
    const status = err.response?.status;
    const url = err.config?.url || '';
    if (status === 401 && !url.includes('/login') && !url.endsWith('/me')) {
      const kind = url.startsWith('/portal') ? 'portal' : 'admin';
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: kind }));
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e, fallback = 'Something went wrong') => {
  const d = e?.response?.data;
  if (d?.details?.length) return d.details.map((x) => x.message).join('. ');
  return d?.message || e?.message || fallback;
};
export const fieldErrors = (e) => Object.fromEntries((e?.response?.data?.details || []).filter((d) => d.field).map((d) => [d.field, d.message]));

export default api;
