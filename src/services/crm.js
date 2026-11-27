import api from './api';

const unwrap = (p) => p.then((r) => r.data);
export const get = (url, params) => unwrap(api.get(`/crm${url}`, { params }));
export const post = (url, body) => unwrap(api.post(`/crm${url}`, body));
export const put = (url, body) => unwrap(api.put(`/crm${url}`, body));
export const del = (url) => unwrap(api.delete(`/crm${url}`));
export const upload = (url, formData) => unwrap(api.post(`/crm${url}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }));

/** Authenticated file download (PDFs, documents): fetch as blob then save. */
export async function download(url, fallbackName = 'download') {
  const res = await api.get(`/crm${url}`, { responseType: 'blob' });
  saveBlob(res, fallbackName);
}
export async function openBlob(url) {
  const res = await api.get(`/crm${url}`, { responseType: 'blob' });
  const u = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
  window.open(u, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
export function saveBlob(res, fallbackName) {
  const cd = res.headers['content-disposition'] || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const u = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
