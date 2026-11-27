# Browser UI tests (Playwright)

They run the real React app with Firebase swapped for an in-browser fake (`e2e/fake/`), so no Firebase project is needed. Four admins are pre-made: `a1@ui.test` … `a4@ui.test`, password `Demo0Passw0rd!`.

1. `npm i -D playwright && npx playwright install chromium` (not part of the app)
2. `npx vite --mode e2e --host 127.0.0.1 --port 5173`
3. `node e2e/e2e.cjs` (28 user flows) · `node e2e/crawl.cjs` (every page, 3 screen sizes)

Each run starts with an empty fake database (new browser profile). The fake does not check firestore.rules.
