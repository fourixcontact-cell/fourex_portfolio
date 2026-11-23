import { useMemo } from 'react';
import Field from '../../components/forms/Field';
import { money } from '../../utils/format';

const lines = (t) => (t || '').split('\n').map((s) => s.trim()).filter(Boolean);

export const toForm = (q, defaults = {}) => q?._id ? {
  ...q, client: q.client?._id || q.client || '', project: q.project?._id || q.project || '', lead: q.lead || '',
  quotationDate: q.quotationDate?.slice(0, 10), expiryDate: q.expiryDate?.slice(0, 10),
  scopeText: (q.scopeOfWork || []).join('\n'), deliverablesText: (q.deliverables || []).join('\n'), techText: (q.techStack || []).join(', '),
  items: q.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
  milestonePayments: q.milestonePayments || []
} : {
  client: q?.client || '', project: '', quotationDate: new Date().toISOString().slice(0, 10),
  expiryDate: new Date(Date.now() + (defaults.validityDays || 15) * 864e5).toISOString().slice(0, 10),
  projectName: '', projectDescription: '', scopeText: '', deliverablesText: '', techText: '', items: [{ description: '', quantity: 1, unitPrice: '' }],
  discountType: 'flat', discountValue: 0, taxName: defaults.taxName || 'GST', taxRate: defaults.taxRate ?? 18,
  paymentTerms: defaults.paymentTerms || '', advancePercent: 50, milestonePayments: [], deliveryTimeline: '', terms: defaults.terms || '', notes: '', currency: defaults.currency || 'INR', showInPortal: false
};

export const toBody = (v) => ({
  client: v.client || undefined, lead: v.lead || undefined, project: v.project || undefined,
  quotationDate: v.quotationDate, expiryDate: v.expiryDate, projectName: v.projectName, projectDescription: v.projectDescription,
  scopeOfWork: lines(v.scopeText), deliverables: lines(v.deliverablesText), techStack: (v.techText || '').split(',').map((s) => s.trim()).filter(Boolean),
  items: v.items.map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })),
  discountType: v.discountType, discountValue: Number(v.discountValue) || 0, taxName: v.taxName, taxRate: Number(v.taxRate) || 0,
  paymentTerms: v.paymentTerms, advancePercent: Number(v.advancePercent) || 0,
  milestonePayments: (v.milestonePayments || []).filter((m) => m.name).map((m) => ({ name: m.name, percentage: Number(m.percentage) || 0, dueNote: m.dueNote })),
  deliveryTimeline: v.deliveryTimeline, terms: v.terms, notes: v.notes, currency: v.currency, showInPortal: !!v.showInPortal, revisionNote: v.revisionNote
});

export const validateQuotation = (v) => {
  const e = {};
  if (!v.client && !v.lead) e.client = 'Select a client';
  if (!v.projectName?.trim()) e.projectName = 'Project name is required';
  if (!v.expiryDate) e.expiryDate = 'Expiry date is required';
  else if (v.quotationDate && v.expiryDate < v.quotationDate) e.expiryDate = 'Expiry must be after the quotation date';
  if (!v.items?.length || v.items.some((i) => !i.description?.trim() || !(Number(i.quantity) > 0) || i.unitPrice === '' || Number(i.unitPrice) < 0)) e.items = 'Every line needs a description, quantity above 0 and a unit price';
  return e;
};

/** Live preview totals (server recalculates authoritatively on save). */
export function previewTotals(v) {
  const sub = v.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  let disc = v.discountType === 'percent' ? (sub * (Number(v.discountValue) || 0)) / 100 : Number(v.discountValue) || 0;
  disc = Math.min(disc, sub);
  const tax = ((sub - disc) * (Number(v.taxRate) || 0)) / 100;
  const total = sub - disc + tax;
  return { sub, disc, tax, total, advance: (total * (Number(v.advancePercent) || 0)) / 100 };
}

export default function QuotationForm({ values: v, set, errors, clients, projects }) {
  const t = useMemo(() => previewTotals(v), [v]);
  const setItem = (i, k, val) => set('items', v.items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)));
  const setMs = (i, k, val) => set('milestonePayments', v.milestonePayments.map((m, idx) => (idx === i ? { ...m, [k]: val } : m)));
  const clientProjects = (projects || []).filter((p) => !v.client || (p.client?._id || p.client) === v.client);
  return (
    <div className="row g-3">
      <Field className="col-md-6" label="Client" name="client" value={v.client} onChange={set} error={errors.client} required options={[{ value: '', label: '— Select client —' }, ...(clients || []).map((c) => ({ value: c._id, label: c.company || c.contactPerson }))]} />
      <Field className="col-md-6" label="Link to project (optional)" name="project" value={v.project} onChange={set} options={[{ value: '', label: '— None —' }, ...clientProjects.map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} />
      <Field className="col-md-6" label="Project name" name="projectName" value={v.projectName} onChange={set} error={errors.projectName} required />
      <Field className="col-md-3" label="Quotation date" name="quotationDate" type="date" value={v.quotationDate} onChange={set} />
      <Field className="col-md-3" label="Expiry date" name="expiryDate" type="date" value={v.expiryDate} onChange={set} error={errors.expiryDate} required />
      <Field className="col-12" label="Project description" name="projectDescription" rows={3} value={v.projectDescription} onChange={set} />
      <Field className="col-md-6" label="Scope of work (one per line)" name="scopeText" rows={4} value={v.scopeText} onChange={set} />
      <Field className="col-md-6" label="Deliverables (one per line)" name="deliverablesText" rows={4} value={v.deliverablesText} onChange={set} />
      <Field className="col-md-8" label="Technology stack" name="techText" value={v.techText} onChange={set} hint="Comma separated" />
      <Field className="col-md-4" label="Delivery timeline" name="deliveryTimeline" value={v.deliveryTimeline} onChange={set} placeholder="e.g. 8 weeks" />

      <div className="col-12"><div className="d-flex justify-content-between align-items-center mb-2"><label className="form-label mb-0">Itemised services <span className="text-danger">*</span></label><button type="button" className="btn btn-soft btn-sm" onClick={() => set('items', [...v.items, { description: '', quantity: 1, unitPrice: '' }])}><i className="bi bi-plus-lg me-1" />Add line</button></div>
        <div className="q-items">
          <div className="q-row q-head d-none d-md-grid"><span>Description</span><span>Qty</span><span>Unit price</span><span className="text-end">Amount</span><span /></div>
          {v.items.map((it, i) => (<div className="q-row" key={i}>
            <input className="form-control" aria-label="Description" placeholder="Service / item" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
            <input className="form-control" aria-label="Quantity" type="number" min="0.01" step="any" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
            <input className="form-control" aria-label="Unit price" type="number" min="0" step="any" placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
            <div className="text-end fw-semibold money pt-2">{money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), v.currency)}</div>
            <button type="button" className="btn btn-ghost btn-icon text-danger" disabled={v.items.length === 1} onClick={() => set('items', v.items.filter((_, x) => x !== i))} aria-label="Remove line"><i className="bi bi-x-lg" /></button></div>))}
        </div>{errors.items && <div className="form-text-error">{errors.items}</div>}</div>

      <div className="col-lg-7"><div className="row g-3">
        <Field className="col-md-4" label="Discount type" name="discountType" value={v.discountType} onChange={set} options={[{ value: 'flat', label: 'Flat (₹)' }, { value: 'percent', label: 'Percent (%)' }]} />
        <Field className="col-md-4" label="Discount" name="discountValue" type="number" min="0" value={v.discountValue} onChange={set} />
        <Field className="col-md-4" label="Advance %" name="advancePercent" type="number" min="0" max="100" value={v.advancePercent} onChange={set} />
        <Field className="col-md-4" label="Tax name" name="taxName" value={v.taxName} onChange={set} />
        <Field className="col-md-4" label="Tax rate %" name="taxRate" type="number" min="0" max="100" value={v.taxRate} onChange={set} />
        <Field className="col-md-4" label="Currency" name="currency" value={v.currency} onChange={set} options={['INR', 'USD', 'EUR', 'GBP', 'AED']} />
      </div></div>
      <div className="col-lg-5"><div className="q-totals">
        <div><span>Subtotal</span><b className="money">{money(t.sub, v.currency)}</b></div>
        {t.disc > 0 && <div><span>Discount</span><b className="money text-success">−{money(t.disc, v.currency)}</b></div>}
        {Number(v.taxRate) > 0 && <div><span>{v.taxName} ({v.taxRate}%)</span><b className="money">{money(t.tax, v.currency)}</b></div>}
        <div className="grand"><span>Grand total</span><b className="money">{money(t.total, v.currency)}</b></div>
        {t.advance > 0 && <div><span>Advance due</span><b className="money">{money(t.advance, v.currency)}</b></div>}
      </div></div>

      <div className="col-12"><div className="d-flex justify-content-between align-items-center mb-2"><label className="form-label mb-0">Milestone payment plan</label><button type="button" className="btn btn-soft btn-sm" onClick={() => set('milestonePayments', [...v.milestonePayments, { name: '', percentage: '', dueNote: '' }])}><i className="bi bi-plus-lg me-1" />Add milestone</button></div>
        {v.milestonePayments.map((m, i) => (<div className="row g-2 mb-2" key={i}><div className="col-md-5"><input className="form-control" placeholder="Milestone" aria-label="Milestone" value={m.name} onChange={(e) => setMs(i, 'name', e.target.value)} /></div><div className="col-6 col-md-2"><input className="form-control" type="number" min="0" max="100" placeholder="%" aria-label="Percent" value={m.percentage} onChange={(e) => setMs(i, 'percentage', e.target.value)} /></div><div className="col-6 col-md-4"><input className="form-control" placeholder="When due" aria-label="When due" value={m.dueNote} onChange={(e) => setMs(i, 'dueNote', e.target.value)} /></div><div className="col-md-1"><button type="button" className="btn btn-ghost btn-icon text-danger" onClick={() => set('milestonePayments', v.milestonePayments.filter((_, x) => x !== i))} aria-label="Remove"><i className="bi bi-x-lg" /></button></div></div>))}</div>
      <Field className="col-12" label="Payment terms" name="paymentTerms" rows={2} value={v.paymentTerms} onChange={set} />
      <Field className="col-12" label="Terms & conditions" name="terms" rows={4} value={v.terms} onChange={set} />
      <Field className="col-12" label="Notes" name="notes" rows={2} value={v.notes} onChange={set} />
      <div className="col-md-6"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="qsp" checked={!!v.showInPortal} onChange={(e) => set('showInPortal', e.target.checked)} /><label className="form-check-label" htmlFor="qsp">Show in client portal (client can accept/reject)</label></div></div>
      {v._id && ['Sent', 'Viewed', 'Rejected', 'Expired'].includes(v.status) && <Field className="col-md-6" label="Revision note" name="revisionNote" value={v.revisionNote} onChange={set} hint="Editing a sent quotation creates a new revision (back to Draft)" />}
    </div>
  );
}
