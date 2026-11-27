// Lightweight, dependency-free head manager for the React SPA (no react-helmet needed).
// It updates <title>, meta description, canonical, robots, Open Graph and Twitter tags at runtime.
// index.html already contains the same tags for the home page, so crawlers that do not run
// JavaScript still get correct, brand-first metadata.
import { useEffect } from 'react';

export const SITE_URL = 'https://www.fourix.in';
export const SITE_NAME = 'Fourix';
export const DEFAULT_IMAGE = `${SITE_URL}/brand/og-image.jpg`;

const absolute = (path = '/') => {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = ('/' + path).replace(/\/{2,}/g, '/');
  return clean === '/' ? `${SITE_URL}/` : `${SITE_URL}${clean.replace(/\/$/, '')}`;
};

function upsert(selector, tag, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(tag); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}
const metaName = (name, content) => upsert(`meta[name="${name}"]`, 'meta', { name, content });
const metaProp = (property, content) => upsert(`meta[property="${property}"]`, 'meta', { property, content });

export function applySeo({ title, description, path = '/', image, noindex = false, type = 'website' }) {
  if (typeof document === 'undefined') return;
  const url = absolute(path);
  const img = image && /^https?:\/\//i.test(image) ? image : DEFAULT_IMAGE;
  if (title) document.title = title;
  if (description) metaName('description', description);
  upsert('link[rel="canonical"]', 'link', { rel: 'canonical', href: url });
  metaName('robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  metaProp('og:type', type);
  metaProp('og:site_name', SITE_NAME);
  metaProp('og:url', url);
  if (title) { metaProp('og:title', title); metaName('twitter:title', title); }
  if (description) { metaProp('og:description', description); metaName('twitter:description', description); }
  metaProp('og:image', img);
  metaName('twitter:card', 'summary_large_image');
  metaName('twitter:image', img);
}

/** Page-level metadata for dynamic pages (blog post, portfolio item) once their data has loaded. */
export function useSeo(opts) {
  const { title, description, path, image, noindex, type } = opts || {};
  useEffect(() => {
    if (!title) return;
    applySeo({ title, description, path, image, noindex, type });
  }, [title, description, path, image, noindex, type]);
}

export const trim = (text = '', max = 158) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
