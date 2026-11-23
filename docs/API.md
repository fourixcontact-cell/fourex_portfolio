# API reference

There is no HTTP server. These are the paths the React pages call through `src/services/api.js`; an axios adapter answers them in the browser (`/public/*` → `src/services/publicSite.js`, everything else → `core/app.js`). JSON responses `{success, data?, meta?, message?}`; validation errors `{success:false,message,details:[{field,message}]}`. The only real HTTP endpoint is `POST /email` (Cloudflare Pages Function, optional). List endpoints accept `page,limit,search` plus filters.

## /auth — admin session (public: login only)
```
POST    /auth/login
POST    /auth/logout
GET     /auth/me
POST    /auth/change-password
GET     /auth/admins
GET     /auth/sessions
GET     /auth/login-history
POST    /auth/sessions/:id/revoke
```
## /public — no sign-in
```
GET     /public/options
GET     /public/site
GET     /public/portfolio
GET     /public/portfolio/:id
GET     /public/blog/:slug
GET     /public/quotation-view/:token
POST    /public/contact
POST    /public/quote
```
## /portal — client auth (separate identity, role `client`), data scoped to the client
```
POST    /portal/auth/login
POST    /portal/auth/logout
GET     /portal/auth/me
POST    /portal/auth/change-password
GET     /portal/overview
GET     /portal/projects/:id
POST    /portal/projects/:id/feedback
POST    /portal/projects/:id/change-requests
GET     /portal/projects/:id/certificate
POST    /portal/quotations/:id/decision
GET     /portal/quotations/:id/pdf
GET     /portal/invoices/:id/pdf
GET     /portal/documents/:id/download
GET     /portal/tickets
POST    /portal/tickets
POST    /portal/tickets/:id/reply
```
## /crm — admin auth required on every route
```
GET     /crm/dashboard
GET     /crm/team
GET     /crm/admins
GET     /crm/leads
POST    /crm/leads
GET     /crm/leads/:id
PUT     /crm/leads/:id
DELETE  /crm/leads/:id
POST    /crm/leads/:id/communications
POST    /crm/leads/:id/convert
GET     /crm/clients
POST    /crm/clients
GET     /crm/clients/:id
PUT     /crm/clients/:id
DELETE  /crm/clients/:id
POST    /crm/clients/:id/portal-access
GET     /crm/projects
POST    /crm/projects
GET     /crm/projects/:id
PUT     /crm/projects/:id
DELETE  /crm/projects/:id
PUT     /crm/projects/:id/portfolio
PUT     /crm/projects/:id/checklist/:itemId
POST    /crm/projects/:id/checklist
POST    /crm/projects/:id/handover/confirm
POST    /crm/projects/:id/change-requests
PUT     /crm/projects/:id/change-requests/:crId
POST    /crm/projects/:id/feedback
POST    /crm/projects/:id/contributions
GET     /crm/projects/:id/milestones
POST    /crm/projects/:id/milestones
PUT     /crm/projects/:id/milestones/:mid
DELETE  /crm/projects/:id/milestones/:mid
GET     /crm/projects/:id/certificate/eligibility
GET     /crm/projects/:id/certificate/preview
POST    /crm/projects/:id/certificate
GET     /crm/projects/:id/certificate/download
GET     /crm/tasks
POST    /crm/tasks
PUT     /crm/tasks/:id
DELETE  /crm/tasks/:id
POST    /crm/tasks/:id/comments
GET     /crm/quotations/defaults
GET     /crm/quotations
POST    /crm/quotations
GET     /crm/quotations/:id
PUT     /crm/quotations/:id
DELETE  /crm/quotations/:id
POST    /crm/quotations/:id/duplicate
GET     /crm/quotations/:id/pdf
POST    /crm/quotations/:id/send
PUT     /crm/quotations/:id/status
POST    /crm/quotations/:id/create-project
GET     /crm/invoices
POST    /crm/invoices
GET     /crm/invoices/:id
PUT     /crm/invoices/:id
POST    /crm/invoices/:id/cancel
DELETE  /crm/invoices/:id
GET     /crm/invoices/:id/pdf
POST    /crm/invoices/:id/send
POST    /crm/invoices/:id/mark-sent
POST    /crm/invoices/:id/remind
GET     /crm/payments
POST    /crm/payments
PUT     /crm/payments/:id
POST    /crm/payments/:id/void
GET     /crm/payments/:id/receipt
POST    /crm/payments/:id/email-receipt
GET     /crm/expenses/categories
GET     /crm/expenses
POST    /crm/expenses
PUT     /crm/expenses/:id
DELETE  /crm/expenses/:id
POST    /crm/expenses/:id/receipt
GET     /crm/documents
POST    /crm/documents
GET     /crm/documents/:id/download
PUT     /crm/documents/:id/visibility
DELETE  /crm/documents/:id
GET     /crm/reports
GET     /crm/reports/:type
GET     /crm/audit-logs
GET     /crm/audit-logs/:id
GET     /crm/notifications
PUT     /crm/notifications/read-all
PUT     /crm/notifications/:id/read
GET     /crm/settings
PUT     /crm/settings
GET     /crm/tickets
POST    /crm/tickets/:id/reply
```
Reports: `GET /crm/reports/:type?format=csv|pdf`. Quotation view link: `GET /public/quotation-view/:token` marks 'Viewed' only when opened.
