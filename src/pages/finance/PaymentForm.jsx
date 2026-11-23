import Field from '../../components/forms/Field';
import { money } from '../../utils/format';

export const PAYMENT_TYPES = ['Advance', 'Milestone', 'Final', 'Partial', 'Other Income'];
export const METHODS = ['Bank Transfer', 'UPI', 'Cash', 'Other'];

/** Records money that has ACTUALLY arrived. Optionally ties it to an open invoice. */
export default function PaymentForm({ values: v, set, errors, invoices = [], projects, clients }) {
  const inv = invoices.find((i) => i._id === v.invoice);
  return (
    <div className="row g-3">
      <div className="col-12"><div className="alert alert-warning py-2 small mb-0"><i className="bi bi-exclamation-triangle me-1" />Only record money that has actually been received. Payments are never created automatically.</div></div>
      {projects && <Field className="col-md-6" label="Project" name="project" value={v.project} onChange={set} options={[{ value: '', label: '— None —' }, ...projects.map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} />}
      {clients && !v.project && <Field className="col-md-6" label="Client" name="client" value={v.client} onChange={set} options={[{ value: '', label: '— Select —' }, ...clients.map((c) => ({ value: c._id, label: c.company || c.contactPerson }))]} />}
      {invoices.length > 0 && <Field className="col-md-6" label="Against invoice (optional)" name="invoice" value={v.invoice} onChange={set} options={[{ value: '', label: '— Not tied to an invoice —' }, ...invoices.map((i) => ({ value: i._id, label: `${i.number} · balance ${money(i.balance)}` }))]} />}
      <Field className="col-md-4" label="Amount received (₹)" name="amount" type="number" min="0.01" step="0.01" value={v.amount} onChange={set} error={errors.amount} required hint={inv ? `Invoice balance ${money(inv.balance)}` : undefined} />
      <Field className="col-md-4" label="Payment type" name="paymentType" value={v.paymentType} onChange={set} options={PAYMENT_TYPES} />
      <Field className="col-md-4" label="Method" name="method" value={v.method} onChange={set} options={METHODS} />
      <Field className="col-md-4" label="Date received" name="paidOn" type="date" max={new Date().toISOString().slice(0, 10)} value={v.paidOn} onChange={set} required />
      <Field className="col-md-8" label="Reference (UTR / txn id)" name="reference" value={v.reference} onChange={set} hint="Stored privately, never written to the audit log" />
      <Field className="col-12" label="Notes" name="notes" rows={2} value={v.notes} onChange={set} />
    </div>
  );
}
