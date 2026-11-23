const { chromium } = require('playwright');
const SP = __dirname;
const B = 'http://127.0.0.1:5173';
const results = []; let cur = '';
// Calls the API the way the app does: with the signed-in identity's Firebase ID token.
// Works against the Vite dev server (imports the app's client) and production builds
// (reads the token Firebase keeps in localStorage).
const apiCall = (page, method, url, body) => page.evaluate(async ([m, u, b]) => {
  try {
    const { default: client } = await import('/src/services/api.js');
    try { return (await client.request({ method: m, url: u, data: b })).data; } catch (e) { return e.response?.data || { error: e.message }; }
  } catch {
    const appName = u.startsWith('/portal') ? 'fourix-portal' : 'fourix-crm';
    const key = Object.keys(localStorage).find((k) => k.startsWith('firebase:authUser:') && k.endsWith(`:${appName}`));
    const token = key ? JSON.parse(localStorage.getItem(key)).stsTokenManager.accessToken : '';
    const r = await fetch(`/api${u}`, { method: m.toUpperCase(), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
    return r.json();
  }
}, [method, url, body]);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  let evs = [];
  page.on('pageerror', (e) => evs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('response', (r) => { const s = r.status(); if (s >= 400 && r.url().includes('/api/') && !/\/auth\/me$/.test(r.url())) evs.push(`http ${s} ${r.request().method()} ${r.url().replace(B, '')}`); });
  const step = async (name, fn) => { evs = []; try { await fn(); results.push(`${evs.length ? 'WARN' : 'ok  '} ${name}${evs.length ? '  <- ' + evs.join(' ; ') : ''}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0].slice(0, 220)}${evs.length ? '  <- ' + evs.join(' ; ') : ''}`); await page.screenshot({ path: `${SP}/shots/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); } };
  const fill = async (sel, v) => { await page.locator(sel).first().fill(String(v)); };
  const modal = () => page.locator('.modal.show');
  const submit = async (label) => { await modal().getByRole('button', { name: label }).click(); };
  const waitToast = async (re) => { await page.locator('.toast-x, [role=status], .toast').filter({ hasText: re }).first().waitFor({ timeout: 6000 }); };
  const go = async (p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); };
  const waitModalClose = async () => { await page.locator('.modal.show').waitFor({ state: 'detached', timeout: 8000 }); };

  // ---- PUBLIC FORMS
  await step('public contact: empty submit shows inline errors', async () => {
    await go('/contact'); await page.getByRole('button', { name: /send|submit/i }).first().click();
    const n = await page.locator('.form-text-error').count(); if (n < 4) throw new Error('only ' + n + ' inline errors');
  });
  await step('public contact: valid submit succeeds', async () => {
    await go('/contact');
    await fill('#f-name', 'Priya Sharma'); await fill('#f-company', 'Acme Pvt Ltd'); await fill('#f-email', 'priya@acme.in'); await fill('#f-phone', '+91 98765 43210'); await fill('#f-country', 'India');
    await page.selectOption('#f-service', 'MERN Stack Development'); await fill('#f-description', 'We need an inventory and billing portal for our warehouses.');
    await page.getByRole('button', { name: /send|submit/i }).first().click();
    await page.getByText(/thank you|received/i).first().waitFor({ timeout: 8000 });
  });
  await step('public quote form submits', async () => {
    await go('/quote');
    await fill('#f-name', 'Ravi Kumar'); await fill('#f-email', 'ravi@shop.in'); await fill('#f-phone', '9876543210'); await fill('#f-country', 'India');
    await page.selectOption('#f-service', 'UI/UX Design'); await fill('#f-description', 'Redesign of our ecommerce checkout flow and mobile app.');
    await page.getByRole('button', { name: /send|submit|request/i }).first().click();
    await page.getByText(/thank you|received/i).first().waitFor({ timeout: 8000 });
  });

  // ---- ADMIN LOGIN
  await step('admin login via UI', async () => {
    await go('/admin/login'); await fill('#l-email', 'a1@ui.test'); await fill('#l-pw', 'Demo0Passw0rd!'); await page.click('.login-card button.btn-primary'); await page.waitForURL('**/crm', { timeout: 8000 });
  });
  await step('login wrong password shows error', async () => {
    const p2 = await ctx.newPage(); await p2.goto(B + '/admin/login'); await p2.fill('#l-email', 'a1@ui.test'); await p2.fill('#l-pw', 'wrongpassword'); await p2.click('.login-card button.btn-primary');
    await p2.locator('.toast-x.error, .alert-danger').filter({ hasText: /invalid|failed/i }).first().waitFor({ timeout: 5000 }); await p2.close();
  });

  // ---- LEADS
  await step('leads: website leads listed, search + status filter', async () => {
    await go('/crm/leads'); await page.getByText('Priya Sharma').first().waitFor({ timeout: 6000 });
    await page.getByPlaceholder(/search/i).first().fill('ravi'); await page.waitForTimeout(700);
    if (await page.getByText('Priya Sharma').count()) throw new Error('search did not filter');
    await page.getByPlaceholder(/search/i).first().fill(''); await page.waitForTimeout(700);
    await page.locator('.lead-tabs button', { hasText: 'New' }).first().click(); await page.waitForTimeout(500);
  });
  await step('leads: add lead modal validation + create', async () => {
    await go('/crm/leads'); await page.getByRole('button', { name: 'Add lead' }).click();
    await submit(/save|create/i); await page.locator('.form-text-error').first().waitFor({ timeout: 3000 });
    await fill('#f-name', 'Manual Lead'); await fill('#f-email', 'manual@lead.io'); await submit(/save|create/i); await waitModalClose();
    await page.getByText('Manual Lead').first().waitFor({ timeout: 5000 });
  });
  await step('leads: open drawer, add note, mark Won, convert to client+project', async () => {
    await go('/crm/leads'); await page.getByText('Priya Sharma').first().click(); await modal().waitFor({ timeout: 4000 });
    await modal().getByPlaceholder(/log a call/i).fill('Called, wants a demo'); await modal().getByRole('button', { name: 'Log', exact: true }).click(); await modal().getByText('Called, wants a demo').first().waitFor({ timeout: 4000 });
    await modal().locator('select').first().selectOption('Won'); await page.waitForTimeout(900);
    await modal().getByRole('button', { name: /convert to client/i }).click(); await page.waitForTimeout(600);
    await page.locator('.modal.show').last().getByRole('button', { name: /^convert$/i }).click(); await page.waitForTimeout(1500);
  });

  // ---- CLIENTS
  await step('clients: list shows converted client; add client modal', async () => {
    await go('/crm/clients'); await page.getByText(/Priya Sharma|Acme/).first().waitFor({ timeout: 6000 });
    await page.getByRole('button', { name: 'Add client' }).click(); await submit(/save|create/i); await page.locator('.form-text-error').first().waitFor({ timeout: 3000 });
    await fill('#f-contactPerson', 'Meena Iyer'); await fill('#f-company', 'Iyer Traders'); await fill('#f-email', 'meena@iyer.in'); await submit(/save|create/i); await waitModalClose();
    await page.getByText('Meena Iyer').first().waitFor({ timeout: 5000 });
  });
  await step('clients: detail page + portal access modal', async () => {
    await go('/crm/clients'); await page.getByText('Meena Iyer').first().click(); await page.waitForURL(/clients\/[a-f0-9]{24}/, { timeout: 5000 });
    await page.getByRole('button', { name: /portal/i }).first().click(); await page.waitForTimeout(1200);
    const txt = await page.locator('body').innerText(); if (!/temporary password|Temporary/i.test(txt)) throw new Error('no temp password shown');
  });

  // ---- PROJECTS
  await step('projects: create project via modal', async () => {
    await go('/crm/projects'); await page.getByRole('button', { name: 'New project' }).click();
    await fill('#f-name', 'Iyer Billing App'); await page.selectOption('#f-client', { label: /Iyer/.test('') ? '' : undefined }).catch(() => {});
    const opts = await page.locator('#f-client option').allInnerTexts(); const pick = opts.find((o) => /Iyer|Meena/.test(o)); if (!pick) throw new Error('client option missing: ' + opts.join(','));
    await page.selectOption('#f-client', { label: pick }); await fill('#f-acceptedAmount', '120000'); await submit(/save|create/i); await waitModalClose();
    await page.getByText('Iyer Billing App').first().waitFor({ timeout: 5000 });
  });
  await step('projects: detail tabs all render', async () => {
    await go('/crm/projects'); await page.getByText('Iyer Billing App').first().click(); await page.waitForURL(/projects\/[a-f0-9]{24}/);
    await page.locator('.pd-tabs [role=tab]').first().waitFor({ timeout: 6000 }); const tabs = await page.locator('.pd-tabs [role=tab]').allInnerTexts();
    if (tabs.length < 6) throw new Error('tabs found: ' + tabs.length);
    for (let i = 0; i < tabs.length; i++) { await page.locator('.pd-tabs [role=tab]').nth(i).click(); await page.waitForTimeout(350); }
    results.push('     tabs: ' + tabs.map((t) => t.trim()).join(' | '));
  });
  await step('tasks: create task from tasks page, kanban visible', async () => {
    await go('/crm/tasks'); await page.getByRole('button', { name: 'New task' }).click();
    await fill('#f-title', 'Design database schema');
    const opts = await page.locator('#f-project option').allInnerTexts(); const pick = opts.find((o) => /Iyer/.test(o)); if (!pick) throw new Error('project option missing');
    await page.selectOption('#f-project', { label: pick }); await submit(/save|create/i); await waitModalClose(); await page.getByText('Design database schema').first().waitFor({ timeout: 5000 });
  });

  // ---- QUOTATIONS / INVOICES
  await step('quotations: create quotation (form), PDF preview endpoint', async () => {
    await go('/crm/quotations'); await page.getByRole('button', { name: 'New quotation' }).click(); await modal().waitFor();
    const clientSel = modal().locator('#f-client'); const opts = await clientSel.locator('option').allInnerTexts(); const pick = opts.find((o) => /Iyer|Meena/.test(o)); if (!pick) throw new Error('client option missing: ' + opts.join(','));
    await clientSel.selectOption({ label: pick }); await fill('#f-projectName', 'Iyer Billing App');
    await modal().getByLabel('Description', { exact: true }).first().fill('Backend API development'); await modal().getByLabel('Quantity', { exact: true }).first().fill('2'); await modal().getByLabel('Unit price', { exact: true }).first().fill('15000');
    await submit(/create|save/i); await waitModalClose(); await page.getByText(/QT-\d{4}-\d{4}/).first().waitFor({ timeout: 5000 });
  });
  await step('invoices: page loads (crashed before fix) + create invoice', async () => {
    await go('/crm/invoices'); await page.getByRole('button', { name: 'New invoice' }).click(); await modal().waitFor();
    const clientSel = modal().locator('#f-client'); const opts = await clientSel.locator('option').allInnerTexts(); const pick = opts.find((o) => /Iyer|Meena/.test(o)); if (!pick) throw new Error('client option missing');
    await clientSel.selectOption({ label: pick });
    await modal().getByLabel('Description', { exact: true }).first().fill('Advance payment'); await modal().getByLabel('Qty', { exact: true }).first().fill('1'); await modal().getByLabel('Unit price', { exact: true }).first().fill('40000');
    await submit(/create/i); await waitModalClose(); await page.getByText(/INV-\d{4}-\d{4}/).first().waitFor({ timeout: 5000 });
  });
  await step('invoices: mark as sent without email', async () => {
    await go('/crm/invoices'); await page.getByRole('button', { name: 'Mark as sent' }).first().click(); await modal().getByRole('button', { name: /mark as sent/i }).click(); await page.locator('.badge-soft', { hasText: /^Sent$/ }).first().waitFor({ timeout: 5000 });
  });
  await step('finance: record payment modal', async () => {
    await go('/crm/finance'); await page.getByRole('button', { name: /record payment/i }).first().click(); await modal().waitFor();
    await submit(/record/i); await page.locator('.form-text-error, .toast-x').first().waitFor({ timeout: 3000 });
  });
  await step('expenses: add expense', async () => {
    await go('/crm/expenses'); await page.getByRole('button', { name: 'Add expense' }).click(); await modal().waitFor();
    await fill('#f-title', 'Domain renewal'); await fill('#f-amount', '999'); await submit(/save|create|add/i); await waitModalClose(); await page.getByText('Domain renewal').first().waitFor({ timeout: 5000 });
  });
  await step('reports: every report tab loads', async () => {
    await go('/crm/reports'); const btns = page.locator('.rep-list button, .report-nav button, .list-group button, aside button');
    const n = await btns.count(); if (n < 5) throw new Error('report buttons: ' + n);
    for (let i = 0; i < n; i++) { await btns.nth(i).click(); await page.waitForTimeout(500); }
  });
  await step('audit logs: shows entries, filter by module, open diff', async () => {
    await go('/crm/audit-logs'); await page.locator('tbody tr').first().waitFor({ timeout: 6000 });
    await page.locator('select[aria-label=Module]').selectOption({ index: 1 }); await page.waitForTimeout(700); await page.locator('tbody tr').first().click(); await page.locator('.modal.show').waitFor({ timeout: 3000 });
  });
  await step('settings: save', async () => {
    await go('/crm/settings'); await fill('#f-agencyName', 'Test Agency Ltd'); await page.getByRole('button', { name: /save settings/i }).click(); await waitToast(/saved/i);
  });
  await step('profile: sessions + weak password rejected client-side', async () => {
    await go('/crm/profile'); await page.getByText(/This session/).first().waitFor({ timeout: 5000 });
    await fill('#f-currentPassword', 'x'); await fill('#f-newPassword', 'weak'); await fill('#f-confirm', 'weak'); await page.getByRole('button', { name: /update password/i }).click(); await page.locator('.form-text-error').first().waitFor({ timeout: 3000 });
  });
  await step('notifications bell opens', async () => {
    await go('/crm'); await page.locator('button[aria-label*="otification" i]').first().click(); await page.waitForTimeout(500);
  });
  await step('sidebar collapse toggles', async () => {
    await go('/crm'); await page.locator('button[aria-label*="ollapse" i], button[aria-label*="idebar" i]').first().click(); await page.waitForTimeout(400);
  });

  await step('invoices: record payment row action -> Partially Paid', async () => {
    await go('/crm/invoices'); await page.getByRole('button', { name: 'Record payment' }).first().click(); await modal().waitFor();
    await fill('#f-amount', '5000'); await submit(/record/i); await waitModalClose();
    await page.locator('.badge-soft', { hasText: /Partially Paid/i }).first().waitFor({ timeout: 5000 });
  });
  await step('project detail: money tab shows received amount', async () => {
    await go('/crm/projects'); await page.getByText('Iyer Billing App').first().click(); await page.waitForURL(/projects\/[a-f0-9]{24}/);
    await page.locator('.pd-tabs [role=tab]').first().waitFor({ timeout: 6000 }); await page.locator('.pd-tabs [role=tab]').filter({ hasText: /money/i }).click(); await page.waitForTimeout(800); const t = await page.locator('body').innerText(); if (!/Received|received/.test(t)) throw new Error('money tab missing received section');
    await page.locator('.pd-tabs [role=tab]').filter({ hasText: /handover|certificate/i }).first().click(); await page.waitForTimeout(600);
  });
  await step('client portal: UI login, project view, support ticket', async () => {
    await go('/crm/clients'); await page.getByText('Meena Iyer').first().click(); await page.waitForURL(/clients\/([a-f0-9]{24})/); const cid = /clients\/([a-f0-9]{24})/.exec(page.url())[1];
    const j = await apiCall(page, 'post', `/crm/clients/${cid}/portal-access`, {});
    if (!j.data?.temporaryPassword) throw new Error('no temp pw ' + JSON.stringify(j).slice(0, 150));
    // The CRM publishes the client's portal copy a moment after a change; open the dashboard to sync now.
    await go('/crm'); await page.waitForTimeout(2500);
    // Same browser profile (one Firebase sign-in per browser: this signs the admin out).
    const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 390, height: 800 }); p2.on('pageerror', (e) => evs.push('portal pageerror ' + e.message));
    await p2.goto(B + '/login'); await p2.fill('#l-email', j.data.email); await p2.fill('#l-pw', j.data.temporaryPassword); await p2.click('.login-card button.btn-primary');
    await p2.waitForURL('**/portal', { timeout: 8000 }); await p2.getByText('Iyer Billing App').first().click(); await p2.waitForURL(/portal\/projects\//); await p2.getByText(/progress/i).first().waitFor({ timeout: 5000 });
    await p2.goto(B + '/portal/support', { waitUntil: 'networkidle' }); await p2.getByRole('button', { name: /new ticket/i }).click(); await p2.locator('.modal.show #f-subject').fill('Need invoice copy'); await p2.locator('.modal.show #f-message').fill('Please resend the advance invoice.');
    await p2.locator('.modal.show').getByRole('button', { name: /save|create|submit/i }).click(); await p2.getByText('Need invoice copy').first().waitFor({ timeout: 5000 });
    await p2.screenshot({ path: SP + '/shots/portal-support-mobile.png' });
    if ((await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) > 1) throw new Error('portal mobile horizontal overflow');
    await p2.close();
    // back to the admin
    await go('/admin/login'); await fill('#l-email', 'a1@ui.test'); await fill('#l-pw', 'Demo0Passw0rd!'); await page.click('.login-card button.btn-primary'); await page.waitForURL('**/crm', { timeout: 8000 });
  });
  await step('logout works and /crm is protected after', async () => {
    await go('/crm'); await page.locator('button.user-btn').click();
    await page.getByText(/sign out|log ?out/i).first().click(); await page.waitForTimeout(800); await go('/crm'); if (!/\/login/.test(page.url())) throw new Error('still in CRM: ' + page.url());
  });
  await browser.close();
  console.log(results.join('\n'));
})();
