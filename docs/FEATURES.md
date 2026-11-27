# Feature list & limitations

## Implemented (code written; see TESTING.md for what was actually run)
* Public site: Home, About, Services, Portfolio (filter + detail, opt-in projects only), Team, Technologies, Testimonials, Contact, Get a Quote, Blog/Case studies, Privacy, Terms.
* Lead capture: form validation in the page AND in firestore.rules, save-first, honeypot, optional emails through the Cloudflare email function (a lead is never lost if email fails).
* Auth (Firebase Authentication): 4 admins listed in firestore.rules, forced first password change, sessions list, "sign out everywhere", login history, change password; client portal logins created from the CRM.
* CRM: dashboard (stats, charts), leads (+convert), clients, projects (kanban/tasks, milestones, handover checklist, change requests, feedback, portfolio flags, contributions), quotations (PDF, email, revisions, tracked "Viewed"), invoices, payments + receipts (never auto-paid, void not delete), finance & expenses, team contribution, completion certificates (guarded, audit-logged), documents, notifications + scheduler reminders, 12 reports (CSV/PDF), settings, support tickets, append-only audit log UI with diff.
* Client portal: own projects, milestones, payments, shared quotations (accept/decline), invoices, documents, certificate, change requests, feedback, tickets.
* Security: firestore.rules (admins only for CRM data; clients read only their own portal copy; visitors read only the public website copy), upload type/size/signature checks, append-only audit log, soft delete, CSP headers on Cloudflare.

## Limitations / honest gaps
1. **No server.** Everything runs in the browser against Firebase. Background jobs (reminders, applying client portal submissions, website-lead notifications, publishing the website/portal copies) run when an admin opens the CRM dashboard or the notification bell refreshes. On days nobody signs in, nothing runs.
2. Client portal submissions (tickets, feedback, change requests, quotation accept/decline) show as "Pending" until an admin next opens the CRM.
3. One Firebase sign-in per browser: signing into the portal signs the admin out in that browser, and vice versa.
4. "Sign out" of another admin signs them out everywhere (no per-device sign-out). Failed login attempts are not recorded and IP addresses are not shown (Firebase handles lockouts after many wrong passwords).
5. Files are stored inside Firestore (free plan has no Cloud Storage): max 10 MB per file, 1 GiB in total for the whole database.
6. Free-plan limits: 50,000 reads / 20,000 writes / 20,000 deletes per day. Plenty for a small agency; the CRM keeps a live copy in the browser to save reads.
7. Website forms can't check duplicates or rate-limit per visitor (no server); the honeypot and the rules' field checks remain.
8. Emails need the optional Cloudflare Pages Function + a Resend key; without them everything works except sending emails.
9. Privacy/Terms pages are templates — have a lawyer review. No 2FA for admins.
