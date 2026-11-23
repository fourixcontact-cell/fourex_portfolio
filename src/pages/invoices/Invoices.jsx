import { useState } from 'react';
import { get, post, put, del, download, openBlob } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/modals/FormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import Field from '../../components/forms/Field';
import PaymentForm from '../finance/PaymentForm';
import { EmptyState } from '../../components/common/States';
import { money, fmtDate, clientName } from '../../utils/format';
import './Invoices.css';

const INV_STATUS = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
const TYPES = ['Advance', 'Milestone', 'Final', 'Partial', 'Full'];
const blank = { invoiceType: 'Full', taxName: 'GST', taxRate: 18, items: [{ description: '', quantity: 1, unitPrice: '' }], discountAmount: 0, invoiceDate: new Date().toISOString().slice(0, 10) };

export default function Invoices() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/invoices', { page, status: status || undefined, search: q || undefined }), [page, status, q]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const projects = useFetch(() => get('/projects', { limit: 100 })); const quotes = useFetch(() => get('/quotations', { status: 'Accepted', limit: 100 }));
  const [edit, setEdit] = useState(null); const [pay, setPay] = useState(null); const [remove, setRemove] = useState(null); const [cancel, setCancel] = useState(null); const [mail, setMail] = useState(null); const [markSent, setMarkSent] = useState(null);
  const guard = (fn) => async () => { try { await fn(); } catch (e) { toast.error(errMsg(e)); } };
  const s = data?.summary || {};

  return (
    <>
      <PageHeader title="Invoices" subtitle="Bill clients and track what's been paid" crumbs={[{ label: 'Invoices' }]} actions={<button className="btn btn-primary" onClick={() => setEdit({ ...blank })}><i className="bi bi-plus-lg me-1" />New invoice</button>} />
      <div className="row g-3 mb-3">{[['Invoiced', s.invoiced], ['Paid (confirmed)', s.paid], ['Outstanding', s.balance]].map(([l, v]) => <div className="col-md-4" key={l}><div className="card-x card-body-x py-3"><div className="small text-muted-x">{l}</div><div className="fs-5 fw-bold money">{money(v || 0)}</div></div></div>)}</div>
      <div className="card-x">
        <div className="card-head flex-wrap"><div className="d-flex gap-2 flex-wrap"><div className="input-group" style={{ width: 280 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search invoices…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search invoices" /></div><select className="form-select" style={{ width: 170 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option>{INV_STATUS.map((x) => <option key={x}>{x}</option>)}</select></div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage}
          empty={<EmptyState icon="bi-receipt" title="No invoices" text="Create an invoice from scratch or from an accepted quotation." />}
          columns={[
            { key: 'number', label: 'Invoice', render: (r) => <div><div className="fw-semibold text-nowrap">{r.number}</div><div className="tiny text-muted-x">{r.invoiceType}</div></div> },
            { key: 'client', label: 'Client', render: (r) => clientName(r.client) },
            { key: 'projectName', label: 'Project', render: (r) => r.projectName || '—' },
            { key: 'total', label: 'Total', render: (r) => <span className="money fw-semibold">{money(r.total)}</span> },
            { key: 'amountPaid', label: 'Paid', render: (r) => <span className="money text-success">{money(r.amountPaid)}</span> },
            { key: 'balance', label: 'Balance', render: (r) => <span className="money">{money(r.balance)}</span> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'dueDate', label: 'Due', render: (r) => <span className={r.status === 'Overdue' ? 'text-danger fw-semibold' : ''}>{fmtDate(r.dueDate)}</span> }
          ]}
          actions={(r) => (<>
            {r.balance > 0 && r.status !== 'Cancelled' && r.status !== 'Draft' && <button className="btn btn-soft btn-sm" onClick={() => setPay(r)}>Record payment</button>}
            <button className="btn btn-ghost btn-icon" title="Preview" aria-label="Preview" onClick={guard(() => openBlob(`/invoices/${r._id}/pdf?inline=1`))}><i className="bi bi-eye" /></button>
            <button className="btn btn-ghost btn-icon" title="Download PDF" aria-label="Download PDF" onClick={guard(() => download(`/invoices/${r._id}/pdf`, `${r.number}.pdf`))}><i className="bi bi-download" /></button>
            {r.status === 'Draft' && <button className="btn btn-ghost btn-icon" title="Mark as sent (delivered without email)" aria-label="Mark as sent" onClick={() => setMarkSent(r)}><i className="bi bi-check2-circle" /></button>}
            <button className="btn btn-ghost btn-icon" title={r.status === 'Draft' ? 'Send invoice' : 'Send payment reminder'} aria-label="Send email" disabled={r.status === 'Cancelled' || (r.status !== 'Draft' && r.balance <= 0)} onClick={() => setMail({ inv: r, reminder: r.status !== 'Draft' })}><i className={`bi ${r.status === 'Draft' ? 'bi-send' : 'bi-bell'}`} /></button>
            <button className="btn btn-ghost btn-icon" title="Edit" aria-label="Edit" disabled={r.status === 'Cancelled'} onClick={guard(async () => { const x = (await get(`/invoices/${r._id}`)).data.invoice; setEdit({ ...x, client: x.client, project: x.project || '', dueDate: x.dueDate?.slice(0, 10), invoiceDate: x.invoiceDate?.slice(0, 10), items: x.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) }); })}><i className="bi bi-pencil" /></button>
            {r.status !== 'Cancelled' && <button className="btn btn-ghost btn-icon text-danger" title="Cancel invoice" aria-label="Cancel invoice" onClick={() => setCancel(r)}><i className="bi bi-slash-circle" /></button>}
            <button className="btn btn-ghost btn-icon text-danger" title="Delete" aria-label="Delete" onClick={() => setRemove(r)}><i className="bi bi-trash" /></button></>)} />
      </div>

      <FormModal show={!!edit} title={edit?._id ? `Edit ${edit.number}` : 'New invoice'} initial={edit || {}} size="xl" submitLabel={edit?._id ? 'Save changes' : 'Create invoice'} onClose={() => setEdit(null)}
        validate={(v) => ({ ...(!v.client && !v.fromQuotation ? { client: 'Select a client' } : {}), ...(!v.items?.length || v.items.some((i) => !i.description?.trim() || !(Number(i.quantity) > 0) || i.unitPrice === '') ? { items: 'Each line needs a description, quantity and unit price' } : {}) })}
        onSubmit={async (v) => { const body = { client: v.client || undefined, project: v.project || undefined, invoiceType: v.invoiceType, invoiceDate: v.invoiceDate, dueDate: v.dueDate || undefined, taxName: v.taxName, taxRate: Number(v.taxRate) || 0, discountAmount: Number(v.discountAmount) || 0, notes: v.notes, paymentInstructions: v.paymentInstructions, showInPortal: !!v.showInPortal, items: v.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })), fromQuotation: v._id ? undefined : v.fromQuotation || undefined, percentOfQuotation: v.fromQuotation ? Number(v.percentOfQuotation) || 100 : undefined }; if (v._id) await put(`/invoices/${v._id}`, body); else await post('/invoices', body); toast.success(v._id ? 'Invoice updated' : 'Invoice created'); reload(); }}>
        {({ values: v, set, errors }) => {
          const sub = v.items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0); const disc = Math.min(Number(v.discountAmount) || 0, sub); const tax = ((sub - disc) * (Number(v.taxRate) || 0)) / 100;
          const setItem = (i, k, val) => set('items', v.items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)));
          const projs = (projects.data?.data || []).filter((p) => !v.client || p.client?._id === v.client);
          return (<div className="row g-3">
            {!v._id && <><Field className="col-md-8" label="Pre-fill from accepted quotation (optional)" name="fromQuotation" value={v.fromQuotation} onChange={set} options={[{ value: '', label: '— Start blank —' }, ...(quotes.data?.data || []).filter((x) => x.client).map((x) => ({ value: x._id, label: `${x.number} · ${x.projectName} · ${money(x.grandTotal)}` }))]} />{v.fromQuotation && <Field className="col-md-4" label="% of quotation to bill" name="percentOfQuotation" type="number" min="1" max="100" value={v.percentOfQuotation ?? 100} onChange={set} hint="e.g. 50 for an advance invoice" />}</>}
            {!v.fromQuotation && <><Field className="col-md-6" label="Client" name="client" value={v.client} onChange={set} error={errors.client} required options={[{ value: '', label: '— Select —' }, ...(clients.data?.data || []).map((c) => ({ value: c._id, label: clientName(c) }))]} /><Field className="col-md-6" label="Project" name="project" value={v.project} onChange={set} options={[{ value: '', label: '— None —' }, ...projs.map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} /></>}
            <Field className="col-md-3" label="Invoice type" name="invoiceType" value={v.invoiceType} onChange={set} options={TYPES} /><Field className="col-md-3" label="Invoice date" name="invoiceDate" type="date" value={v.invoiceDate} onChange={set} /><Field className="col-md-3" label="Due date" name="dueDate" type="date" value={v.dueDate} onChange={set} hint="Defaults to the invoice-due days in Settings" /><Field className="col-md-3" label="Tax rate %" name="taxRate" type="number" min="0" max="100" value={v.taxRate} onChange={set} />
            {!v.fromQuotation && <div className="col-12"><div className="d-flex justify-content-between mb-2"><label className="form-label mb-0">Line items *</label><button type="button" className="btn btn-soft btn-sm" onClick={() => set('items', [...v.items, { description: '', quantity: 1, unitPrice: '' }])}>Add line</button></div>
              <div className="inv-items">{v.items.map((it, i) => <div className="inv-row" key={i}><input className="form-control" aria-label="Description" placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} /><input className="form-control" aria-label="Qty" type="number" min="0.01" step="any" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /><input className="form-control" aria-label="Unit price" type="number" min="0" step="any" placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} /><div className="text-end pt-2 money fw-semibold">{money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}</div><button type="button" className="btn btn-ghost btn-icon text-danger" disabled={v.items.length === 1} onClick={() => set('items', v.items.filter((_, x) => x !== i))} aria-label="Remove"><i className="bi bi-x-lg" /></button></div>)}</div>
              {errors.items && <div className="form-text-error">{errors.items}</div>}
              <div className="text-end small mt-2">Subtotal <b className="money">{money(sub)}</b> · Tax <b className="money">{money(tax)}</b> · Total <b className="money">{money(sub - disc + tax)}</b></div></div>}
            <Field className="col-md-3" label="Discount (₹)" name="discountAmount" type="number" min="0" value={v.discountAmount} onChange={set} />
            <Field className="col-md-9" label="Payment instructions" name="paymentInstructions" rows={2} value={v.paymentInstructions} onChange={set} hint="Defaults to the bank details in Settings" />
            <Field className="col-12" label="Notes" name="notes" rows={2} value={v.notes} onChange={set} />
            <div className="col-12"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="isp" checked={!!v.showInPortal} onChange={(e) => set('showInPortal', e.target.checked)} /><label className="form-check-label" htmlFor="isp">Show in client portal</label></div></div>
          </div>);
        }}
      </FormModal>

      <FormModal show={!!pay} title={`Record payment · ${pay?.number}`} size="lg" initial={pay ? { invoice: pay._id, amount: pay.balance, paymentType: pay.invoiceType === 'Advance' ? 'Advance' : pay.invoiceType === 'Final' ? 'Final' : pay.invoiceType === 'Milestone' ? 'Milestone' : 'Partial', method: 'Bank Transfer', paidOn: new Date().toISOString().slice(0, 10) } : {}} submitLabel="Record payment" onClose={() => setPay(null)}
        validate={(v) => (Number(v.amount) > 0 ? (Number(v.amount) > pay.balance + 0.001 ? { amount: `Cannot exceed balance ${money(pay.balance)}` } : {}) : { amount: 'Enter the amount received' })}
        onSubmit={async (v) => { await post('/payments', { ...v, amount: Number(v.amount) }); toast.success('Payment recorded'); reload(); }}>
        {(f) => <PaymentForm {...f} invoices={pay ? [pay] : []} />}
      </FormModal>
      <ConfirmModal show={!!markSent} title="Mark invoice as sent?" message={`${markSent?.number} will move from Draft to Sent without emailing the client. Use this when you delivered it yourself (e.g. WhatsApp) or email is unavailable. Payments can then be recorded.`} confirmLabel="Mark as sent" onClose={() => setMarkSent(null)}
        onConfirm={async () => { try { const r = await post(`/invoices/${markSent._id}/mark-sent`); toast.success(r.message); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!mail} title={mail?.reminder ? 'Send payment reminder?' : 'Email invoice?'} message={`${mail?.inv?.number} (PDF attached) will be emailed to ${mail?.inv?.clientSnapshot?.email} via Resend.`} confirmLabel="Send" onClose={() => setMail(null)}
        onConfirm={async () => { try { const r = await post(`/invoices/${mail.inv._id}/${mail.reminder ? 'remind' : 'send'}`); toast.success(r.message); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!cancel} danger title="Cancel invoice?" message={`${cancel?.number} will be marked Cancelled. It stays on record.`} confirmLabel="Cancel invoice" onClose={() => setCancel(null)} onConfirm={async () => { try { await post(`/invoices/${cancel._id}/cancel`); toast.success('Invoice cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!remove} danger title="Delete invoice?" message={`${remove?.number} will be archived.`} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/invoices/${remove._id}`); toast.success('Invoice archived'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
