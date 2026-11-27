import api from './api';
const unwrap = (p) => p.then((r) => r.data);
export const publicApi = {
  options: () => unwrap(api.get('/public/options')),
  site: () => unwrap(api.get('/public/site')),
  portfolio: (params) => unwrap(api.get('/public/portfolio', { params })),
  portfolioItem: (id) => unwrap(api.get(`/public/portfolio/${id}`)),
  post: (slug) => unwrap(api.get(`/public/blog/${slug}`)),
  contact: (body) => unwrap(api.post('/public/contact', body)),
  quote: (body) => unwrap(api.post('/public/quote', body)),
  quotationView: (token) => unwrap(api.get(`/public/quotation-view/${token}`))
};
