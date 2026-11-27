# Architecture — React + Firebase only

```
 Browser (React, built by Vite, hosted on Cloudflare Pages)
 ├─ public website ──► src/services/publicSite.js ──► Firestore: public/*, leads (create), quotationViews
 └─ CRM + client portal
      pages call api.get('/crm/...') as before
      └─ axios adapter (src/services/api.js)
           └─ core/app.js  (Express-style routes + controllers, bundled for the browser)
                ├─ core/db/odm.js     Mongoose-style models over Firestore (+ live cache for admins)
                ├─ Firebase Auth      sign-in, password change, portal accounts
                └─ /api/email         optional Cloudflare Pages Function (Resend key stays secret)

 Firebase (Spark / free plan): Authentication (email + password) and Cloud Firestore.
 firestore.rules = the security boundary.
```

* **core/** is the old Express back end, kept almost unchanged. `core/lib/router.js` imitates the parts of Express it uses; `core/runtime.js` receives Firestore, Auth, pdfkit and email from `src/services/coreHost.js`. `npm run build` bundles it to `src/generated/core.js` (loaded only by CRM/portal pages).
* **Admins** read and write the real collections. Their browser keeps a live copy of each collection (`core/db/cache.js`), so lists don't cost a Firestore read per page view.
* **Clients** never read CRM collections. They read `portal/{clientId}` (a copy without internal notes, profit, other clients) and write requests to `portalInbox`.
* **Visitors** read `public/*` (falls back to built-in content until an admin has opened the CRM once) and can only create a correctly-shaped lead.
* **Housekeeping** (`core/services/housekeeping.js`) runs in an admin's browser when the dashboard loads or the bell polls: apply portal inbox → website-lead notifications → quotation "Viewed" → reminders (once per 6 h for all admins, lock in `_meta/scheduler`) → refresh the copies (`core/services/mirrorService.js`, only changed copies are rewritten).
* **Files**: `core/services/storageService.js` stores files as 700 KB chunks in Firestore (no Cloud Storage on the free plan).
* **PDFs**: drawn in the browser with pdfkit; fonts and logo are in `public/pdf/` and load on the first PDF.
