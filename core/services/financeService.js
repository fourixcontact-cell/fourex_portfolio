const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Project = require('../models/Project');
const Invoice = require('../models/Invoice');
const { round2 } = require('../utils/helpers');

/** Shared maths for quotations and invoices. Always computed on the server. */
function calcTotals({ items = [], discountType = 'flat', discountValue = 0, taxRate = 0, advancePercent = 0 }) {
  const lines = items.map((i) => {
    const quantity = Number(i.quantity) || 0;
    const unitPrice = Number(i.unitPrice) || 0;
    return { ...i, quantity, unitPrice, amount: round2(quantity * unitPrice) };
  });
  const subtotal = round2(lines.reduce((s, i) => s + i.amount, 0));
  let discountAmount = discountType === 'percent' ? round2((subtotal * Number(discountValue || 0)) / 100) : round2(Number(discountValue || 0));
  discountAmount = Math.min(discountAmount, subtotal);
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2((taxable * Number(taxRate || 0)) / 100);
  const grandTotal = round2(taxable + taxAmount);
  const advanceAmount = round2((grandTotal * Number(advancePercent || 0)) / 100);
  return { items: lines, subtotal, discountAmount, taxAmount, grandTotal, advanceAmount };
}

async function sumConfirmed(match) {
  const r = await Payment.aggregate([{ $match: { ...match, status: 'confirmed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  return round2(r[0]?.total || 0);
}

/**
 * Profit = money actually received − expenses actually recorded.
 * Quotation / accepted value is shown separately as pendingBalance, never as income.
 */
async function refreshProject(projectId) {
  if (!projectId) return null;
  const project = await Project.findById(projectId);
  if (!project) return null;
  const received = await sumConfirmed({ project: project._id });
  const exp = await Expense.aggregate([
    { $match: { project: project._id, isArchived: false } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const expenses = round2(exp[0]?.total || 0);
  project.amountReceived = received;
  project.totalExpenses = expenses;
  project.profit = round2(received - expenses);
  project.pendingBalance = round2(Math.max(0, (project.acceptedAmount || 0) - received));
  await project.save();
  return project;
}

async function refreshInvoice(invoiceId) {
  if (!invoiceId) return null;
  const inv = await Invoice.findById(invoiceId);
  if (!inv) return null;
  inv.amountPaid = await sumConfirmed({ invoice: inv._id });
  inv.balance = round2(Math.max(0, inv.total - inv.amountPaid));
  if (inv.status !== 'Cancelled' && inv.status !== 'Draft') {
    if (inv.balance <= 0 && inv.total > 0) inv.status = 'Paid';
    else if (inv.amountPaid > 0) inv.status = 'Partially Paid';
    else if (inv.status === 'Paid' || inv.status === 'Partially Paid') inv.status = 'Sent';
    if (inv.balance > 0 && inv.dueDate < new Date() && ['Sent', 'Partially Paid'].includes(inv.status)) inv.status = 'Overdue';
  }
  await inv.save();
  return inv;
}

module.exports = { calcTotals, refreshProject, refreshInvoice, sumConfirmed };
