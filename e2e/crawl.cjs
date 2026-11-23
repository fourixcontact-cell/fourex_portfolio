const { chromium } = require('playwright');
const SP = __dirname;
const B = 'http://127.0.0.1:5173';
const PUBLIC = ['/', '/about', '/services', '/portfolio', '/team', '/technologies', '/testimonials', '/contact', '/quote', '/blog', '/privacy', '/terms', '/login', '/nonexistent-page'];
const CRM = ['/crm', '/crm/leads', '/crm/clients', '/crm/projects', '/crm/tasks', '/crm/documents', '/crm/tickets', '/crm/quotations', '/crm/invoices', '/crm/finance', '/crm/expenses', '/crm/reports', '/crm/team', '/crm/audit-logs', '/crm/settings', '/crm/profile'];
const issues = []; const VP = { mobile: [375, 740], tablet: [768, 1000], desktop: [1366, 800] };
(async () => {
  const browser = await chromium.launch();
  async function visit(ctxName, page, path, vpName) {
    const errs = []; const onc = (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); };
    const onr = (r) => { const s = r.status(); if (s >= 400 && !r.url().includes('favicon')) errs.push(`http ${s} ${r.request().method()} ${r.url().replace(B, '')}`); };
    const onp = (e) => errs.push('pageerror: ' + e.message.slice(0, 200));
    page.on('console', onc); page.on('response', onr); page.on('pageerror', onp);
    await page.goto(B + path, { waitUntil: 'networkidle' }).catch((e) => errs.push('nav: ' + e.message));
    await page.waitForTimeout(500);
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h1: (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 50), body: document.body.innerText.length }));
    if (ov.sw > ov.iw + 1) errs.push(`HORIZONTAL OVERFLOW ${ov.sw}>${ov.iw}`);
    if (ov.body < 40) errs.push('EMPTY PAGE');
    if (/Something went wrong|Cannot read|undefined|NaN/.test(await page.evaluate(() => document.body.innerText))) errs.push('suspicious text in page (undefined/NaN/error)');
    if (errs.length) issues.push(`[${ctxName}/${vpName}] ${path}: ${errs.join(' | ')}`);
    page.off('console', onc); page.off('response', onr); page.off('pageerror', onp);
    return ov;
  }
  // PUBLIC
  for (const [vn, [w, h]] of Object.entries(VP)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    for (const p of PUBLIC) { await visit('public', page, p, vn); if (p === '/' || p === '/contact') await page.screenshot({ path: `${SP}/shots/pub${p.replace(/\//g, '_') || '_home'}-${vn}.png`, fullPage: false }); }
    await ctx.close();
  }
  // ADMIN: login through the UI
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const page = await ctx.newPage();
  await page.goto(B + '/admin/login'); await page.fill('input[type=email]', 'a1@ui.test'); await page.fill('input[type=password]', 'Demo0Passw0rd!'); await page.click('.login-card button.btn-primary');
  await page.waitForURL('**/crm', { timeout: 8000 }).catch(() => issues.push('admin UI login did not reach /crm'));
  console.log('after login url', page.url());
  for (const [vn, [w, h]] of Object.entries(VP)) {
    await page.setViewportSize({ width: w, height: h });
    for (const p of CRM) { const ov = await visit('admin', page, p, vn); if (['/crm', '/crm/leads'].includes(p)) await page.screenshot({ path: `${SP}/shots/crm${p.replace(/\//g, '_')}-${vn}.png` }); }
  }
  await ctx.close(); await browser.close();
  const g={}; issues.forEach(i=>{const m0=/^\[(\w+)\/(\w+)\] (\S+): (.*)$/.exec(i); const m=m0||[0,'x','x','x',i]; const k=m[1]+' '+m[3]+' :: '+m[4].replace(/console: Failed to load resource[^|]*\|?/g,'').trim(); (g[k]=g[k]||[]).push(m[2]);}); console.log(Object.keys(g).length? Object.entries(g).map(([k,v])=>k+'  ['+v.join(',')+']').join('\n'):'NO ISSUES');
})();
