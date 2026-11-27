const Project = require('../models/Project');
const Task = require('../models/Task');
const Invoice = require('../models/Invoice');
const Quotation = require('../models/Quotation');
const Expense = require('../models/Expense');
const { notify } = require('./notificationService');
const { notifyAdmins, esc } = require('./emailService');

const DAY = 864e5;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

async function scan() {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * DAY);
  const today = dayKey();
  const digest = [];

  // Upcoming project deadlines (next 3 days)
  const projects = await Project.find({ isArchived: false, status: { $nin: ['Completed', 'Cancelled'] }, expectedDeadline: { $gte: now, $lte: soon } }).select('name projectId expectedDeadline');
  for (const p of projects) {
    const n = await notify({ type: 'deadline', title: `Deadline approaching: ${p.name}`, message: `Due ${p.expectedDeadline.toDateString()}`, link: `/crm/projects/${p._id}`, dedupeKey: `deadline:${p._id}:${today}` });
    if (n) digest.push(`Project deadline: ${p.name}`);
  }

  // Overdue tasks
  const tasks = await Task.find({ status: { $ne: 'Completed' }, dueDate: { $lt: now } }).populate('project', 'name').limit(200);
  for (const t of tasks) {
    const n = await notify({ type: 'overdue_task', title: `Overdue task: ${t.title}`, message: t.project?.name, link: `/crm/tasks?project=${t.project?._id}`, dedupeKey: `task:${t._id}:${today}` });
    if (n) digest.push(`Overdue task: ${t.title}`);
  }

  // Pending client payments (overdue invoices) - also flips status to Overdue
  const invs = await Invoice.find({ isArchived: false, status: { $in: ['Sent', 'Partially Paid', 'Overdue'] }, balance: { $gt: 0 }, dueDate: { $lt: now } });
  for (const i of invs) {
    if (i.status !== 'Overdue') { i.status = 'Overdue'; await i.save(); }
    const n = await notify({ type: 'pending_payment', title: `Payment overdue: ${i.number}`, message: `Balance ₹${i.balance}`, link: '/crm/invoices', dedupeKey: `inv:${i._id}:${today}` });
    if (n) digest.push(`Invoice overdue: ${i.number}`);
  }

  // Quotation expiry: mark expired + warn 3 days before
  await Quotation.updateMany({ status: { $in: ['Draft', 'Sent', 'Viewed'] }, expiryDate: { $lt: now }, isArchived: false }, { status: 'Expired' });
  const expiring = await Quotation.find({ status: { $in: ['Sent', 'Viewed'] }, expiryDate: { $gte: now, $lte: soon }, isArchived: false }).select('number expiryDate');
  for (const q of expiring) {
    const n = await notify({ type: 'quotation_expiry', title: `Quotation expiring: ${q.number}`, message: `Expires ${q.expiryDate.toDateString()}`, link: '/crm/quotations', dedupeKey: `qexp:${q._id}` });
    if (n) digest.push(`Quotation expiring: ${q.number}`);
  }

  // Hosting / domain / subscription renewals (next 14 days)
  const renewals = await Expense.find({ isArchived: false, renewalDate: { $gte: now, $lte: new Date(now.getTime() + 14 * DAY) } }).select('title renewalDate');
  for (const r of renewals) {
    const n = await notify({ type: 'renewal', title: `Renewal due: ${r.title}`, message: `On ${r.renewalDate.toDateString()}`, link: '/crm/expenses', dedupeKey: `renew:${r._id}:${dayKey(r.renewalDate)}` });
    if (n) digest.push(`Renewal: ${r.title}`);
  }

  if (digest.length) {
<<<<<<< HEAD
    notifyAdmins(`CRM reminders (${digest.length})`, 'Daily reminders', `<ul style="font-size:14px;line-height:1.8">${digest.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`)
      .then((result) => { if (!result.ok) console.warn('[email] CRM reminder digest not sent:', result.error); })
      .catch((e) => console.warn('[email] CRM reminder digest failed:', e.message));
=======
    notifyAdmins(`CRM reminders (${digest.length})`, 'Daily reminders', `<ul style="font-size:14px;line-height:1.8">${digest.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`).catch(() => {});
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  }
}

// Runs from the `dailyReminders` Cloud Scheduler function (index.js). dedupeKeys keep it to one alert per item per day.
module.exports = { scan };
