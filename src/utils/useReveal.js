import { useEffect } from 'react';

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
}
