const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const monthly = require('../utils/monthly');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/helpers');

const ACTIVE = ['Planning', 'In Progress', 'Testing', 'Client Review'];
const PENDING = ['Not Started', 'On Hold'];

function monthBuckets(n = 12) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleString('en', { month: 'short', year: '2-digit' }), start: m });
  }
  return out;
}

async function monthlySeries(Model, dateField, amountField, match = {}, n = 12) {
  const buckets = monthBuckets(n);
  const rows = await monthly(Model, { ...match, [dateField]: { $gte: buckets[0].start } }, dateField, amountField);
  const map = Object.fromEntries(rows.map((r) => [`${r._id.y}-${String(r._id.m).padStart(2, '0')}`, r.total]));
  return buckets.map((b) => ({ key: b.key, label: b.label, total: round2(map[b.key] || 0) }));
}

const overview = asyncHandler(async (req, res) => {
  const now = new Date();
  const [
    totalLeads, wonLeads, totalClients, projectStatus, quoteAgg, received, expenses, outstanding,
    revenueSeries, expenseSeries, recentLeads, activity, logins, deadlines, pendingInvoices, progress
  ] = await Promise.all([
    Lead.countDocuments({ isArchived: false }),
    Lead.countDocuments({ isArchived: false, status: 'Won' }),
    Client.countDocuments({ isArchived: false }),
    Project.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Quotation.aggregate([{ $match: { isArchived: false } }, { $group: { _id: '$status', value: { $sum: '$grandTotal' }, n: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'confirmed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { isArchived: false } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Project.aggregate([{ $match: { isArchived: false, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: '$pendingBalance' } } }]),
    monthlySeries(Payment, 'paidOn', 'amount', { status: 'confirmed' }),
    monthlySeries(Expense, 'expenseDate', 'amount', { isArchived: false }),
    Lead.find({ isArchived: false }).sort({ createdAt: -1 }).limit(6).select('name company service status createdAt'),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).select('adminName action module description createdAt'),
    Session.find({ audience: 'admin' }).populate('user', 'name').sort({ createdAt: -1 }).limit(8),
    Project.find({ isArchived: false, status: { $nin: ['Completed', 'Cancelled'] }, expectedDeadline: { $gte: new Date(now.getTime() - 7 * 864e5) } }).sort({ expectedDeadline: 1 }).limit(6).select('name projectId expectedDeadline status progress'),
    Invoice.find({ isArchived: false, status: { $in: ['Sent', 'Partially Paid', 'Overdue'] }, balance: { $gt: 0 } }).sort({ dueDate: 1 }).limit(6).populate('client', 'company contactPerson').select('number balance dueDate status client'),
    Project.find({ isArchived: false, status: { $in: ACTIVE } }).sort({ expectedDeadline: 1 }).limit(8).select('name projectId progress status expectedDeadline')
  ]);

  const statusMap = Object.fromEntries(projectStatus.map((s) => [s._id, s.n]));
  const totalProjects = projectStatus.reduce((s, x) => s + x.n, 0);
  const sumStatuses = (arr) => arr.reduce((s, k) => s + (statusMap[k] || 0), 0);
  const qMap = Object.fromEntries(quoteAgg.map((q) => [q._id, q]));
  const totalQuoteValue = quoteAgg.reduce((s, q) => s + q.value, 0);
  const totalReceived = round2(received[0]?.total || 0);
  const totalExpenses = round2(expenses[0]?.total || 0);
  const thisMonth = revenueSeries[revenueSeries.length - 1];
  const thisMonthExp = expenseSeries[expenseSeries.length - 1];

  res.json({
    success: true,
    data: {
      stats: {
        totalLeads,
        totalClients,
        totalProjects,
        activeProjects: sumStatuses(ACTIVE),
        completedProjects: statusMap.Completed || 0,
        pendingProjects: sumStatuses(PENDING),
        totalQuotationValue: round2(totalQuoteValue),
        acceptedQuotationValue: round2(qMap.Accepted?.value || 0),
        totalReceived,
        outstandingPayments: round2(outstanding[0]?.total || 0),
        totalExpenses,
        netProfit: round2(totalReceived - totalExpenses),
        monthlyRevenue: thisMonth?.total || 0,
        monthlyExpenses: thisMonthExp?.total || 0,
        leadConversionRate: totalLeads ? round2((wonLeads / totalLeads) * 100) : 0
      },
      revenueSeries,
      expenseSeries,
      projectStatus: projectStatus.map((s) => ({ status: s._id, count: s.n })),
      recentLeads,
      activity,
      logins: logins.map((s) => ({ _id: s._id, name: s.user?.name, at: s.createdAt, ip: s.ip, device: s.device, active: !s.revokedAt && s.expiresAt > now })),
      deadlines,
      pendingInvoices,
      progress
    }
  });
});

module.exports = { overview, monthlySeries, monthBuckets };
