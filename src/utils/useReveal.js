import { useEffect } from 'react';

<<<<<<< HEAD
const AUTO_REVEAL = [
  '.pub-main .page-hero > .container',
  '.pub-main .sec-head',
  '.pub-main .card-x',
  '.pub-main .technology-category-card',
  '.pub-main form',
  '.pub-main img[alt]:not([alt=""])',
  '.crm-main .page-header',
  '.crm-main .card-x',
  '.crm-main .table-responsive',
  '.crm-main .chart-wrap',
  '.crm-main .state-box',
  '.crm-main img[alt]:not([alt=""])',
  '.portal-content > *',
  '.portal-content .card-x',
  '.portal-content img[alt]:not([alt=""])',
  '.login-main .login-card'
].join(', ');

const isImage = (element) => element.tagName === 'IMG';

/** One app-wide, one-shot observer for scroll reveals and dynamic route content. */
export default function useReveal() {
  useEffect(() => {
    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
    let observer = null;

    const reveal = (element) => {
      element.classList.add('in');
      delete element.dataset.revealVisible;
      delete element.dataset.revealLoadBound;
      observer?.unobserve(element);
    };

    const watch = (element) => {
      if (motionPreference.matches || !observer) {
        element.classList.add('in');
      } else {
        observer.observe(element);
      }
    };

    const prepare = (element) => {
      if (element.closest('.modal')) return;

      if (!element.matches('.reveal') && element.matches(AUTO_REVEAL) && !element.closest('.modal')) {
        if (element.closest('.reveal')) return;
        element.classList.add('reveal');

        if (element.matches('.stat-card, .feature-card')) {
          element.classList.add('reveal-scale');
        } else {
          const column = element.closest('.row > [class*="col-"]');
          if (column) {
            const columns = Array.from(column.parentElement.children);
            const index = columns.indexOf(column);
            if (columns.length > 1) element.classList.add(index % 2 === 0 ? 'reveal-left' : 'reveal-right');
            element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 55}ms`);
          } else if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children).filter((sibling) => sibling.matches(AUTO_REVEAL));
            const index = siblings.indexOf(element);
            if (siblings.length > 1) element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 55}ms`);
          }
        }
      }

      if (element.matches('.sec-head, .page-header')) element.classList.add('reveal-down');
      if (element.matches('.reveal:not(.in)')) watch(element);
    };

    const scan = (node) => {
      if (node.nodeType !== 1) return;
      prepare(node);
      node.querySelectorAll(`${AUTO_REVEAL}, .reveal:not(.in)`).forEach(prepare);
    };

    const createObserver = () => {
      if (!motionPreference.matches && 'IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
          const element = entry.target;
          if (!entry.isIntersecting) {
            if (isImage(element)) element.dataset.revealVisible = 'false';
            return;
          }

          if (isImage(element) && !element.complete) {
            element.dataset.revealVisible = 'true';
            if (element.dataset.revealLoadBound !== 'true') {
              element.dataset.revealLoadBound = 'true';
              const onLoad = () => {
                if (element.dataset.revealVisible === 'true') reveal(element);
                else delete element.dataset.revealLoadBound;
              };
              element.addEventListener('load', onLoad, { once: true });
              element.addEventListener('error', onLoad, { once: true });
            }
            return;
          }

          reveal(element);
        }), { threshold: 0.12, rootMargin: '0px 0px -20px 0px' });
      } else {
        observer = null;
      }
    };

    const onMotionPreferenceChange = () => {
      observer?.disconnect();
      createObserver();
      if (motionPreference.matches) {
        document.querySelectorAll('.reveal:not(.in)').forEach((element) => element.classList.add('in'));
      } else if (document.body) {
        scan(document.body);
      }
    };

    createObserver();
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(scan)));
    if (document.body) {
      mutations.observe(document.body, { childList: true, subtree: true });
      scan(document.body);
    }

    if (motionPreference.addEventListener) motionPreference.addEventListener('change', onMotionPreferenceChange);
    else motionPreference.addListener?.(onMotionPreferenceChange);

    return () => {
      observer?.disconnect();
      mutations.disconnect();
      if (motionPreference.removeEventListener) motionPreference.removeEventListener('change', onMotionPreferenceChange);
      else motionPreference.removeListener?.(onMotionPreferenceChange);
    };
  }, []);
=======
/** Scroll reveal for public pages. No-ops under prefers-reduced-motion (CSS also neutralises it). */
export default function useReveal(dep) {
  useEffect(() => {
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      }), { threshold: 0.12 })
      : null;
    const observe = (element) => {
      if (element.classList.contains('reveal') && !element.classList.contains('in')) {
        if (io) io.observe(element);
        else element.classList.add('in');
      }
    };
    const observeTree = (node) => {
      if (node.nodeType !== 1) return;
      observe(node);
      node.querySelectorAll('.reveal:not(.in)').forEach(observe);
    };

    document.querySelectorAll('.reveal:not(.in)').forEach(observe);
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(observeTree)));
    if (document.body) mutations.observe(document.body, { childList: true, subtree: true });

    return () => { io?.disconnect(); mutations.disconnect(); };
  }, [dep]);
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
}
