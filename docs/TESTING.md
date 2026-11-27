# Testing

## What was run
* `npm test` — Node tests (25): the Firestore model layer, the live cache, and complete flows through the in-browser API (`core-tests/flow.test.cjs`): first admin login + forced password change, leads, clients, projects, quotations + PDF, file upload/download in Firestore chunks (with signature check), portal account creation and reset, mirrors (internal notes never copied), client portal reads + submissions shown as pending, housekeeping applying them, website lead notification, reminders lock. Firestore is an in-memory double whose writes are validated by the real Firestore SDK.
* Browser UI flows (`e2e/e2e.cjs`, 28 flows) and a crawl of every page at 3 screen sizes (`e2e/crawl.cjs`) against `vite --mode e2e`, which swaps the Firebase SDK for an in-browser fake (`e2e/fake/`). All passed.
* The production build was loaded in Chromium with no network access to Firebase: public pages render with the built-in content; sign-in shows "Cannot reach the sign-in service".

## What could NOT be run here
* **firestore.rules** (no Firestore emulator available). Check them in the Firebase console Rules Playground — see README "Check the security rules".
* The real Firebase Web SDK against a real project, and the Cloudflare email function against Resend.

## Run the browser tests yourself
```
npm i -D playwright && npx playwright install chromium
npx vite --mode e2e --host 127.0.0.1 --port 5173      # terminal 1
node e2e/e2e.cjs && node e2e/crawl.cjs                # terminal 2
```
