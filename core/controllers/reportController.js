const Lead = require('../models/Lead');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { tablePdf } = require('../services/pdfService');
const { round2 } = require('../utils/helpers');

function range(q, field) {
  const m = {};
  if (q.from || q.to) {
    m[field] = {};
    if (q.from) m[field].$gte = new Date(q.from);
    if (q.to) m[field].$lte = new Date(`${q.to}T23:59:59.999Z`);
  }
  return m;
}
const monthly = require('../utils/monthly');
const label = (id) => `${id.y}-${String(id.m).padStart(2, '0')}`;

/** Per-admin/area contribution totals (in JS: portable, no $unwind). */
async function contributionTotals(q) {
  const from = q.from ? new Date(q.from) : null; const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : null;
  const rows = new Map();
  (await Project.find({ 'contributions.0': { $exists: true } }).select('contributions').lean()).forEach((p) => p.contributions.forEach((c) => {
    if ((from && c.at < from) || (to && c.at > to)) return;
    const k = `${c.admin}|${c.area}`; const cur = rows.get(k) || { _id: { u: c.admin, area: c.area }, hours: 0, n: 0 };
    cur.hours += c.hours || 0; cur.n += 1; rows.set(k, cur);
  }));
  return [...rows.values()];
}
async function teamCounts() {
  const m = new Map();
  (await Project.find({ isArchived: false }).select('team').lean()).forEach((p) => (p.team || []).forEach((u) => m.set(String(u), (m.get(String(u)) || 0) + 1)));
  return [...m.entries()].map(([id, n]) => ({ _id: id, n }));
}

/** Each builder returns { title, columns:[{key,label,money?}], rows } computed from live DB data. */
const builders = {
  'monthly-revenue': async (q) => {
    const r = await monthly(Payment, { status: 'confirmed', ...range(q, 'paidOn') }, 'paidOn');
    return { title: 'Monthly revenue (confirmed payments)', columns: [{ key: 'month', label: 'Month' }, { key: 'payments', label: 'Payments' }, { key: 'revenue', label: 'Revenue', money: true }], rows: r.map((x) => ({ month: label(x._id), payments: x.count, revenue: round2(x.total) })) };
  },
  'monthly-expenses': async (q) => {
    const r = await monthly(Expense, { isArchived: false, ...range(q, 'expenseDate') }, 'expenseDate');
    return { title: 'Monthly expenses', columns: [{ key: 'month', label: 'Month' }, { key: 'entries', label: 'Entries' }, { key: 'expenses', label: 'Expenses', money: true }], rows: r.map((x) => ({ month: label(x._id), entries: x.count, expenses: round2(x.total) })) };
  },
  'profit-loss': async (q) => {
    const [rev, exp] = await Promise.all([
      monthly(Payment, { status: 'confirmed', ...range(q, 'paidOn') }, 'paidOn'),
      monthly(Expense, { isArchived: false, ...range(q, 'expenseDate') }, 'expenseDate')
    ]);
    const map = {};
    rev.forEach((x) => { map[label(x._id)] = { ...(map[label(x._id)] || {}), revenue: x.total }; });
    exp.forEach((x) => { map[label(x._id)] = { ...(map[label(x._id)] || {}), expenses: x.total }; });
    const rows = Object.keys(map).sort().map((k) => ({ month: k, revenue: round2(map[k].revenue || 0), expenses: round2(map[k].expenses || 0), profit: round2((map[k].revenue || 0) - (map[k].expenses || 0)) }));
    const t = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, expenses: a.expenses + r.expenses }), { revenue: 0, expenses: 0 });
    if (rows.length) rows.push({ month: 'TOTAL', revenue: round2(t.revenue), expenses: round2(t.expenses), profit: round2(t.revenue - t.expenses) });
    return { title: 'Profit & loss (cash basis)', columns: [{ key: 'month', label: 'Month' }, { key: 'revenue', label: 'Received', money: true }, { key: 'expenses', label: 'Expenses', money: true }, { key: 'profit', label: 'Profit', money: true }], rows };
  },
  'project-profitability': async () => {
    const p = await Project.find({ isArchived: false }).populate('client', 'company contactPerson').sort({ profit: -1 });
    return {
      title: 'Project profitability (received − expenses)',
      columns: [{ key: 'project', label: 'Project' }, { key: 'client', label: 'Client' }, { key: 'status', label: 'Status' }, { key: 'accepted', label: 'Accepted', money: true }, { key: 'received', label: 'Received', money: true }, { key: 'pending', label: 'Pending', money: true }, { key: 'expenses', label: 'Expenses', money: true }, { key: 'profit', label: 'Profit', money: true }],
      rows: p.map((x) => ({ project: `${x.projectId} ${x.name}`, client: x.client?.company || x.client?.contactPerson, status: x.status, accepted: x.acceptedAmount, received: x.amountReceived, pending: x.pendingBalance, expenses: x.totalExpenses, profit: x.profit }))
    };
  },
  'client-revenue': async (q) => {
    const r = await Payment.aggregate([
      { $match: { status: 'confirmed', client: { $ne: null }, ...range(q, 'paidOn') } },
      { $group: { _id: '$client', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);
    const Client = require('../models/Client');
    const byId = Object.fromEntries((await Client.find({ _id: { $in: r.map((x) => x._id) } }).select('company contactPerson').lean()).map((c) => [String(c._id), c]));
    r.forEach((x) => { x.c = byId[String(x._id)] || { contactPerson: 'Unknown client' }; });
    return { title: 'Client-wise revenue', columns: [{ key: 'client', label: 'Client' }, { key: 'payments', label: 'Payments' }, { key: 'revenue', label: 'Revenue', money: true }], rows: r.map((x) => ({ client: x.c.company || x.c.contactPerson, payments: x.count, revenue: round2(x.total) })) };
  },
  'pending-payments': async () => {
    const inv = await Invoice.find({ isArchived: false, status: { $in: ['Sent', 'Partially Paid', 'Overdue'] }, balance: { $gt: 0 } }).sort({ dueDate: 1 });
    const now = Date.now();
    return {
      title: 'Outstanding payments (open invoices)',
      columns: [{ key: 'invoice', label: 'Invoice' }, { key: 'client', label: 'Client' }, { key: 'due', label: 'Due date' }, { key: 'daysOverdue', label: 'Days overdue' }, { key: 'total', label: 'Total', money: true }, { key: 'balance', label: 'Balance', money: true }],
      rows: inv.map((i) => ({ invoice: i.number, client: i.clientSnapshot?.company || i.clientSnapshot?.contactPerson, due: i.dueDate.toISOString().slice(0, 10), daysOverdue: Math.max(0, Math.floor((now - i.dueDate) / 864e5)), total: i.total, balance: i.balance }))
    };
  },
  'lead-conversion': async (q) => {
    const r = await Lead.aggregate([{ $match: { isArchived: false, ...range(q, 'createdAt') } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const total = r.reduce((s, x) => s + x.n, 0);
    const srcMap = new Map();
    (await Lead.find({ isArchived: false, ...range(q, 'createdAt') }).select('source status').lean()).forEach((l) => { const c = srcMap.get(l.source) || { _id: l.source, n: 0, won: 0 }; c.n += 1; if (l.status === 'Won') c.won += 1; srcMap.set(l.source, c); });
    const bySrc = [...srcMap.values()];
    return {
      title: 'Lead conversion by source',
      columns: [{ key: 'source', label: 'Source' }, { key: 'leads', label: 'Leads' }, { key: 'won', label: 'Won' }, { key: 'rate', label: 'Conversion %' }],
      rows: [...bySrc.map((x) => ({ source: x._id, leads: x.n, won: x.won, rate: x.n ? round2((x.won / x.n) * 100) : 0 })), { source: 'ALL SOURCES', leads: total, won: r.find((x) => x._id === 'Won')?.n || 0, rate: total ? round2(((r.find((x) => x._id === 'Won')?.n || 0) / total) * 100) : 0 }]
    };
  },
  'quotation-acceptance': async (q) => {
    const r = await Quotation.aggregate([{ $match: { isArchived: false, ...range(q, 'quotationDate') } }, { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$grandTotal' } } }]);
    const sent = r.filter((x) => x._id !== 'Draft').reduce((s, x) => s + x.n, 0);
    const acc = r.find((x) => x._id === 'Accepted')?.n || 0;
    return { title: `Quotation acceptance (rate ${sent ? round2((acc / sent) * 100) : 0}% of non-draft)`, columns: [{ key: 'status', label: 'Status' }, { key: 'count', label: 'Quotations' }, { key: 'value', label: 'Value', money: true }], rows: r.map((x) => ({ status: x._id, count: x.n, value: round2(x.value) })) };
  },
  'project-completion': async () => {
    const r = await Project.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const total = r.reduce((s, x) => s + x.n, 0);
    return { title: 'Project completion rate', columns: [{ key: 'status', label: 'Status' }, { key: 'count', label: 'Projects' }, { key: 'share', label: 'Share %' }], rows: r.map((x) => ({ status: x._id, count: x.n, share: total ? round2((x.n / total) * 100) : 0 })) };
  },
  'project-delays': async () => {
    const now = new Date();
    const p = (await Project.find({ isArchived: false, expectedDeadline: { $ne: null } }).populate('client', 'company contactPerson'))
      .filter((x) => (['Completed', 'Cancelled'].includes(x.status) ? x.status === 'Completed' && x.completionDate && x.completionDate > x.expectedDeadline : x.expectedDeadline < now));
    return {
      title: 'Delayed projects',
      columns: [{ key: 'project', label: 'Project' }, { key: 'client', label: 'Client' }, { key: 'status', label: 'Status' }, { key: 'deadline', label: 'Deadline' }, { key: 'delayDays', label: 'Days late' }],
      rows: p.map((x) => ({ project: `${x.projectId} ${x.name}`, client: x.client?.company || x.client?.contactPerson, status: x.status, deadline: x.expectedDeadline.toISOString().slice(0, 10), delayDays: Math.max(0, Math.floor(((x.completionDate || now) - x.expectedDeadline) / 864e5)) }))
    };
  },
  'admin-contribution': async (q) => {
    // Contribution is informational only. It is NOT ownership or a profit-sharing basis.
    const [tasks, contribs] = await Promise.all([
      Task.aggregate([{ $match: { status: 'Completed', completedBy: { $ne: null }, ...range(q, 'completedAt') } }, { $group: { _id: { u: '$completedBy', area: '$area' }, n: { $sum: 1 } } }]),
      contributionTotals(q)
    ]);
    const leads = await Lead.aggregate([{ $match: { isArchived: false, assignedTo: { $ne: null }, status: 'Won', ...range(q, 'createdAt') } }, { $group: { _id: '$assignedTo', n: { $sum: 1 } } }]);
    const projects = await teamCounts();
    const User = require('../models/User');
    const users = await User.find({ role: 'admin' }).sort({ adminSlot: 1 }).select('name');
    const rows = users.map((u) => {
      const id = String(u._id);
      const tcount = tasks.filter((t) => String(t._id.u) === id).reduce((s, t) => s + t.n, 0);
      const mine = contribs.filter((c) => String(c._id.u) === id);
      const hours = mine.reduce((s, c) => s + c.hours, 0);
      const areaCount = (a) => mine.filter((c) => c._id.area === a).reduce((s, c) => s + c.n, 0);
      return {
        admin: u.name,
        projects: projects.find((p) => String(p._id) === id)?.n || 0,
        tasksCompleted: tcount,
        development: areaCount('Development'),
        uiux: areaCount('UI/UX'),
        clientComm: areaCount('Client Communication'),
        deployment: areaCount('Deployment'),
        documentation: areaCount('Documentation'),
        wonLeads: leads.find((l) => String(l._id) === id)?.n || 0,
        hours: round2(hours)
      };
    });
    return {
      title: 'Admin contribution (informational – not ownership or profit share)',
      columns: [{ key: 'admin', label: 'Admin' }, { key: 'projects', label: 'Projects' }, { key: 'tasksCompleted', label: 'Tasks done' }, { key: 'development', label: 'Dev' }, { key: 'uiux', label: 'UI/UX' }, { key: 'clientComm', label: 'Client' }, { key: 'deployment', label: 'Deploy' }, { key: 'documentation', label: 'Docs' }, { key: 'wonLeads', label: 'Won leads' }, { key: 'hours', label: 'Hours' }],
      rows
    };
  },
  'expense-categories': async (q) => {
    const r = await Expense.aggregate([{ $match: { isArchived: false, ...range(q, 'expenseDate') } }, { $group: { _id: '$category', total: { $sum: '$amount' }, n: { $sum: 1 } } }, { $sort: { total: -1 } }]);
    const sum = r.reduce((s, x) => s + x.total, 0);
    return { title: 'Expenses by category', columns: [{ key: 'category', label: 'Category' }, { key: 'entries', label: 'Entries' }, { key: 'total', label: 'Total', money: true }, { key: 'share', label: 'Share %' }], rows: r.map((x) => ({ category: x._id, entries: x.n, total: round2(x.total), share: sum ? round2((x.total / sum) * 100) : 0 })) };
  }
};

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const run = asyncHandler(async (req, res) => {
  const b = builders[req.params.type];
  if (!b) throw new AppError('Unknown report', 404);
  const rep = await b(req.query);
  const format = req.query.format;
  if (format === 'csv') {
    const csv = [rep.columns.map((c) => csvCell(c.label)).join(','), ...rep.rows.map((r) => rep.columns.map((c) => csvCell(r[c.key])).join(','))].join('\n');
    await audit.record(req, { action: 'EXPORT', module: 'report', recordId: req.params.type, description: `Report "${req.params.type}" exported as CSV (${rep.rows.length} rows)` });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${req.params.type}.csv"` });
    return res.send(`﻿${csv}`);
  }
  if (format === 'pdf') {
    const buf = await tablePdf(rep.title, rep.columns, rep.rows, req.query);
    await audit.record(req, { action: 'EXPORT', module: 'report', recordId: req.params.type, description: `Report "${req.params.type}" exported as PDF` });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${req.params.type}.pdf"` });
    return res.send(buf);
  }
  return res.json({ success: true, data: rep });
});

const list = (req, res) => res.json({ success: true, data: Object.keys(builders) });

module.exports = { run, list };
