# Fourix SEO guide

Canonical host: `https://www.fourix.in` (HTTPS, with `www`).

## What is implemented
- `index.html`: title, description, canonical, robots, Open Graph, Twitter, Organization + WebSite JSON-LD, `<noscript>` fallback with internal links.
- `src/seo/seo.js`, `src/seo/RouteSeo.jsx`: per-route title, description, canonical, robots, OG and Twitter tags (no extra dependency). Blog posts and portfolio items set their own metadata after their data loads.
- `public/robots.txt`, `public/sitemap.xml`, `public/_headers` (`X-Robots-Tag: noindex` for login, CRM, portal, quotation links).

## Adding pages to the sitemap
Static pages are listed in `public/sitemap.xml`. Blog posts and portfolio items live in Firestore, so add them by hand when published, e.g.
`<url><loc>https://www.fourix.in/blog/your-slug</loc></url>`. Add `/team` and `/testimonials` once they have real content.

## Redirect non-canonical hosts (Cloudflare dashboard, not code)
1. Make sure both `fourix.in` and `www.fourix.in` are DNS-proxied in Cloudflare.
2. Rules → Redirect Rules → "Redirect from root to www": when hostname equals `fourix.in`, redirect (dynamic) to `concat("https://www.fourix.in", http.request.uri.path)`, status 301, preserve query string.
3. SSL/TLS → Edge Certificates → turn on "Always Use HTTPS".

## Google Search Console
1. https://search.google.com/search-console → Add property → **Domain** → `fourix.in` → add the TXT record at your DNS (Cloudflare) → Verify. (Or URL-prefix `https://www.fourix.in/` with the HTML-tag method: paste the meta tag into `index.html`.)
2. Sitemaps → enter `sitemap.xml` → Submit. Status should read "Success".
3. URL Inspection → `https://www.fourix.in/` → "Test live URL" → check the rendered HTML and canonical → "Request indexing".
4. Repeat for `/about`, `/services`, `/contact`.
5. Check Pages and Core Web Vitals reports after a few days.
Indexing and ranking are decided by Google; nothing here guarantees position 1.

## Brand-search tips (off-site)
Create/claim a Google Business Profile only if you have a real business address or service area; add real LinkedIn/GitHub/Instagram URLs in the CRM site settings and then to `sameAs` in the JSON-LD in `index.html`; get links from your real social profiles and client sites.
