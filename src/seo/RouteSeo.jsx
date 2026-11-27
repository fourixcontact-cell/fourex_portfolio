import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applySeo } from './seo';

// Unique title + description per public page. Wording only restates what the pages already say.
const PAGES = {
  '/': { title: 'Fourix – Software Development Studio', description: 'Fourix is a software development studio building MERN-stack web apps, Spring Boot back ends, React Native mobile apps, Django, WordPress, UI/UX and DevOps solutions.' },
  '/about': { title: 'About Fourix – Freelance Software Development Agency', description: 'Learn about Fourix, a small team of developers and designers who deliver dependable software with written scope, itemised pricing and visible milestones.' },
  '/services': { title: 'Software Development Services | Fourix', description: 'Fourix services: MERN stack, Java Spring Boot, React Native apps, Python Django, WordPress, UI/UX design, DevOps and cloud deployment, and website maintenance.' },
  '/portfolio': { title: 'Portfolio – Software Projects by Fourix', description: 'Browse web and mobile projects designed and delivered by Fourix. Filter by category or technology to find work relevant to you.' },
  '/team': { title: 'Our Team | Fourix', description: 'Meet the engineers and designers at Fourix who build and support your product.' },
  '/technologies': { title: 'Technologies & Tech Stack | Fourix', description: 'The technologies Fourix uses in production: React, Node.js, Spring Boot, Django, MongoDB, PostgreSQL, Docker, AWS, WordPress and more.' },
  '/testimonials': { title: 'Client Testimonials | Fourix', description: 'Read what clients say about working with Fourix.' },
  '/contact': { title: 'Contact Fourix – Start Your Software Project', description: 'Contact Fourix to discuss your software project. Share a few details and we reply within one business day.' },
  '/quote': { title: 'Get a Free Software Quote | Fourix', description: 'Tell Fourix what you need and receive a clear, itemised quotation with scope, timeline and payment milestones.' },
  '/blog': { title: 'Blog & Case Studies | Fourix', description: 'Articles, lessons and project stories from the Fourix software development team.' },
  '/privacy': { title: 'Privacy Policy | Fourix', description: 'How Fourix collects, uses and protects information submitted through this website and the client portal.' },
  '/terms': { title: 'Terms & Conditions | Fourix', description: 'Terms covering quotations, payments, intellectual property and delivery for Fourix engagements.' }
};
// Dynamic pages: generic metadata until the page itself sets specific metadata (see useSeo).
const SECTION_FALLBACK = [
  ['/blog/', '/blog'],
  ['/portfolio/', '/portfolio']
];
// Private / transactional areas that must never be indexed.
const PRIVATE_PREFIXES = ['/crm', '/portal', '/admin', '/login', '/quotation/view'];

export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    if (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      applySeo({ title: 'Fourix', description: 'Private area.', path, noindex: true });
      return;
    }
    if (PAGES[path]) { applySeo({ ...PAGES[path], path }); return; }
    const fb = SECTION_FALLBACK.find(([prefix]) => path.startsWith(prefix));
    if (fb) applySeo({ ...PAGES[fb[1]], path });
  }, [pathname]);
  return null;
}
