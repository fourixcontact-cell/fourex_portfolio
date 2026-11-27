export const money = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n) || 0);
export const moneyShort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 30) return `${dd}d ago`;
  return fmtDate(d);
};
export const initials = (n = '') => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export const clientName = (c) => c?.company || c?.contactPerson || '—';

const TONE = {
  New: 'primary', Contacted: 'info', Discussion: 'purple', 'Quotation Sent': 'warn', Negotiation: 'warn', Won: 'success', Lost: 'danger',
  'Not Started': '', Planning: 'info', 'In Progress': 'primary', 'On Hold': 'warn', Testing: 'purple', 'Client Review': 'info', Completed: 'success', Cancelled: 'danger',
  Draft: '', Sent: 'info', Viewed: 'purple', Accepted: 'success', Rejected: 'danger', Expired: 'warn',
  'Partially Paid': 'warn', Paid: 'success', Overdue: 'danger',
  Pending: 'warn', Approved: 'success', Implemented: 'success',
  'To Do': '', Review: 'purple', Low: '', Medium: 'info', High: 'warn', Urgent: 'danger',
  Open: 'primary', Resolved: 'success', Closed: '', confirmed: 'success', voided: 'danger'
};
export const tone = (s) => TONE[s] ?? '';
