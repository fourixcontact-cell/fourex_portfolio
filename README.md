# Fourix — website, CRM and client portal

**React + Firebase only.** No server to host: the site is static files on **Cloudflare Pages**, and the data lives in **Firebase (free Spark plan)** — Authentication for logins, Cloud Firestore for everything else. No card needed.

| Part | Address |
|---|---|
| Public website | `/` |
| CRM (4 admins) | `/admin/login` → `/crm` |
| Client portal | `/login` → `/portal` |

---

## Part 1 — Firebase (project `fourex-93596`)

You already did: ✅ Firestore database · ✅ Email/Password sign-in · ✅ Web app registered.

### Step 1. Add the 4 admin logins
Firebase console → **Authentication** → **Users** → **Add user**. Enter each admin's email and a temporary password (at least 8 characters). Do it 4 times.

### Step 2. Publish the security rules (important)
1. Open the file `firestore.rules` from this project.
2. At the top, replace `admin1@example.com` … `admin4@example.com` with the same 4 emails (lowercase).
3. Firebase console → **Firestore Database** → **Rules** tab → delete everything → paste the whole file → **Publish**.

These rules are what protect your data, since there is no server.

### Step 3. Allow your website address
Firebase console → **Authentication** → **Settings** → **Authorized domains** → **Add domain**: your Cloudflare address (e.g. `fourix.pages.dev`) and your own domain if you have one. (Needed for password-reset emails.)

---

## Part 2 — Cloudflare Pages

1. Put this folder in a GitHub repository.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the repository.
3. Build settings:
   * Framework preset: **None** (or Vite)
   * Build command: `npm run build`
   * Build output directory: `dist`
4. **Environment variables** (Settings → Variables and secrets). Values are in Firebase console → Project settings → Your apps → Web app:

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | `AIza…` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `fourex-93596.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | `fourex-93596` |
   | `VITE_FIREBASE_APP_ID` | `1:…:web:…` |
   | `NODE_VERSION` | `20` |

5. **Save and Deploy**. Your site is at `https://<name>.pages.dev`.

> Use the Git connection (not drag-and-drop upload): only then is the `functions/` folder (emails) deployed too.

The Firebase web keys above are not secrets — every Firebase website ships them. Security comes from the rules in Step 2.

---

## Part 3 — First sign-in
1. Open `https://<your-site>/admin/login` and sign in with an admin email + temporary password.
2. You are asked to choose a new password. Do it.
3. Open the **Dashboard** once: this publishes the website content (services, blog, portfolio) and starts the reminders.
4. Repeat for the other admins when they first sign in.

Give a client portal access from **CRM → Clients → (client) → Portal access**. You get a temporary password to share; for an existing login, a password-reset email is sent by Firebase instead.

---

## Part 4 (optional) — Emails
Without this, everything works except sending emails (quotation/invoice emails, enquiry alerts).

1. Create a free account at resend.com and verify your domain.
2. Cloudflare Pages → Settings → **Variables and secrets** → add:

   | Name | Example |
   |---|---|
   | `RESEND_API_KEY` (secret) | `re_…` |
   | `EMAIL_FROM` | `Fourix <hello@yourdomain.com>` |
   | `FIREBASE_PROJECT_ID` | `fourex-93596` |
   | `ADMIN_EMAILS` | the 4 admin emails, comma-separated |
   | `AGENCY_EMAIL` | where new enquiries go (optional) |
   | `SEND_ACKNOWLEDGEMENT` | `on` to also email visitors a "we got your message" note |

3. Redeploy (Deployments → … → Retry deployment).

---

## Part 5 — Check the security rules (recommended, 5 minutes)
Firebase console → Firestore → **Rules** → **Rules Playground**. Each line should give the result shown:

| Simulation | Location | Signed in as | Expected |
|---|---|---|---|
| get | `public/site` | not signed in | ✅ allowed |
| get | `leads/anything` | not signed in | ❌ denied |
| get | `clients/anything` | not signed in | ❌ denied |
| create | `leads/test1` with `{"name":"Test"}` | not signed in | ❌ denied (incomplete lead) |
| get | `users/<your admin uid>` | that admin (Firebase UID + email) | ✅ allowed |
| get | `clients/anything` | an email NOT in the list | ❌ denied |
| get | `auditlogs/anything` then **delete** | an admin | get ✅ / delete ❌ |

(Admin checks need the admin's `users` document, which is created on their first sign-in, and the password already changed.)

---

## How it works (short)
* No server. The CRM's business logic runs in the admin's browser and reads/writes Firestore directly; `firestore.rules` decide who may touch what.
* Clients and visitors only see **copies** that the CRM publishes (`portal/…`, `public/…`), never internal notes or other clients' data.
* Background jobs (reminders, applying client portal requests, new-enquiry alerts) run **when an admin opens the dashboard**. On days nobody signs in, nothing runs; client requests show as "Pending" until then.
* One sign-in per browser: signing into the portal signs the admin out in that browser.
* Files are kept inside Firestore (max 10 MB each; 1 GiB free in total).
* Free limits per day: 50,000 reads, 20,000 writes — plenty for a small agency.

More: `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/TESTING.md`.

## Developing on your computer
```
cp .env.example .env.local     # fill in the Firebase values
npm install
npm run dev                    # http://localhost:5173
npm test                       # logic tests
```
