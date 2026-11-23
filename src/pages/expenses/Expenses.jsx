import { useState } from 'react';
import { get, post, put, del, upload, download } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/tables/DataTable';
import FormModal from '../../components/modals/FormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import Field from '../../components/forms/Field';
import { EmptyState } from '../../components/common/States';
import { money, fmtDate } from '../../utils/format';
import './Expenses.css';

const METHODS = ['Bank Transfer', 'UPI', 'Cash', 'Card', 'Other'];

export default function Expenses() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [cat, setCat] = useState(''); const [proj, setProj] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/expenses', { page, category: cat || undefined, project: proj || undefined, from: from || undefined, to: to || undefined, search: q || undefined }), [page, cat, proj, from, to, q]);
  const cats = useFetch(() => get('/expenses/categories')); const projects = useFetch(() => get('/projects', { limit: 100 }));
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null); const [receiptFile, setReceiptFile] = useState(null);
  const catList = cats.data?.data || [];

  return (
    <>
      <PageHeader title="Expenses" subtitle="Project-wise and company-wide spending" crumbs={[{ label: 'Expenses' }]} actions={<button className="btn btn-primary" onClick={() => { setReceiptFile(null); setEdit({ expenseDate: new Date().toISOString().slice(0, 10), method: 'Bank Transfer', category: 'Project Expense' }); }}><i className="bi bi-plus-lg me-1" />Add expense</button>} />
      {data?.byCategory?.length > 0 && <div className="row g-2 mb-3">{data.byCategory.slice(0, 4).map((c) => <div className="col-6 col-lg-3" key={c._id}><div className="card-x card-body-x py-2"><div className="tiny text-muted-x">{c._id}</div><div className="fw-bold money">{money(c.total)}</div></div></div>)}</div>}
      <div className="card-x">
        <div className="card-head flex-wrap"><div className="d-flex gap-2 flex-wrap">
          <div className="input-group" style={{ width: 230 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search expenses" /></div>
          <select className="form-select" style={{ width: 190 }} value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} aria-label="Category"><option value="">All categories</option>{catList.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="form-select" style={{ width: 200 }} value={proj} onChange={(e) => { setProj(e.target.value); setPage(1); }} aria-label="Project"><option value="">All (project + company)</option><option value="company">Company-wide only</option>{projects.data?.data.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
          <input type="date" className="form-control" style={{ width: 150 }} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" /><input type="date" className="form-control" style={{ width: 150 }} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" /></div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} empty={<EmptyState icon="bi-wallet2" title="No expenses" text="Track domains, hosting, subscriptions, freelancer payments and more." />}
          columns={[
            { key: 'expenseDate', label: 'Date', render: (r) => fmtDate(r.expenseDate) },
            { key: 'title', label: 'Expense', render: (r) => <div><div className="fw-semibold">{r.title}</div><div className="tiny text-muted-x">{r.vendor}</div></div> },
            { key: 'category', label: 'Category', render: (r) => <span className="badge-soft">{r.category}</span> },
            { key: 'project', label: 'Project', render: (r) => r.project ? r.project.name : <span className="badge-soft s-purple">Company</span> },
            { key: 'method', label: 'Method' },
            { key: 'renewalDate', label: 'Renewal', render: (r) => r.renewalDate ? fmtDate(r.renewalDate) : '—' },
            { key: 'amount', label: 'Amount', render: (r) => <span className="money fw-semibold">{money(r.amount)}</span> }
          ]}
          actions={(r) => (<>{r.receipt && <button className="btn btn-ghost btn-icon" aria-label="Download receipt" title="Receipt" onClick={() => download(`/documents/${r.receipt}/download`, 'receipt').catch((e) => toast.error(errMsg(e)))}><i className="bi bi-paperclip" /></button>}
            <button className="btn btn-ghost btn-icon" aria-label="Edit" onClick={() => { setReceiptFile(null); setEdit({ ...r, project: r.project?._id || '', expenseDate: r.expenseDate?.slice(0, 10), renewalDate: r.renewalDate?.slice(0, 10) || '' }); }}><i className="bi bi-pencil" /></button>
            <button className="btn btn-ghost btn-icon text-danger" aria-label="Delete" onClick={() => setRemove(r)}><i className="bi bi-trash" /></button></>)} />
        {data && <div className="px-3 pb-3 small text-muted-x">Total for this view: <b className="money text-dark">{money(data.total)}</b></div>}
      </div>
      <FormModal show={!!edit} title={edit?._id ? 'Edit expense' : 'Add expense'} initial={edit || {}} onClose={() => setEdit(null)}
        validate={(v) => ({ ...(!v.title?.trim() ? { title: 'Title is required' } : {}), ...(!(Number(v.amount) > 0) ? { amount: 'Amount must be above 0' } : {}), ...(!v.expenseDate ? { expenseDate: 'Date is required' } : {}) })}
        onSubmit={async (v) => { const body = { title: v.title, category: v.category, amount: Number(v.amount), expenseDate: v.expenseDate, method: v.method, vendor: v.vendor, description: v.description, project: v.project || undefined, renewalDate: v.renewalDate || undefined, isRecurring: !!v.isRecurring }; const r = v._id ? await put(`/expenses/${v._id}`, { ...body, project: v.project || '' }) : await post('/expenses', body);
          if (receiptFile) { const fd = new FormData(); fd.append('receipt', receiptFile); await upload(`/expenses/${r.data._id}/receipt`, fd); }
          toast.success(v._id ? 'Expense updated' : 'Expense added'); reload(); }}>
        {({ values: v, set, errors }) => (<div className="row g-3">
          <Field className="col-md-8" label="Title" name="title" value={v.title} onChange={set} error={errors.title} required />
          <Field className="col-md-4" label="Category" name="category" value={v.category} onChange={set} options={catList} />
          <Field className="col-md-4" label="Amount (₹)" name="amount" type="number" min="0.01" step="0.01" value={v.amount} onChange={set} error={errors.amount} required />
          <Field className="col-md-4" label="Date" name="expenseDate" type="date" value={v.expenseDate} onChange={set} error={errors.expenseDate} required />
          <Field className="col-md-4" label="Payment method" name="method" value={v.method} onChange={set} options={METHODS} />
          <Field className="col-md-6" label="Project (blank = company-wide)" name="project" value={v.project} onChange={set} options={[{ value: '', label: 'Company-wide' }, ...(projects.data?.data || []).map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} />
          <Field className="col-md-6" label="Vendor" name="vendor" value={v.vendor} onChange={set} />
          <Field className="col-md-6" label="Renewal date" name="renewalDate" type="date" value={v.renewalDate} onChange={set} hint="Domain / hosting / subscription: triggers a reminder" />
          <div className="col-md-6 d-flex align-items-center"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="rec" checked={!!v.isRecurring} onChange={(e) => set('isRecurring', e.target.checked)} /><label className="form-check-label" htmlFor="rec">Recurring</label></div></div>
          <Field className="col-12" label="Description" name="description" rows={2} value={v.description} onChange={set} />
          <div className="col-12"><label className="form-label">Receipt (PDF / image)</label><input type="file" className="form-control" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setReceiptFile(e.target.files[0] || null)} /></div>
        </div>)}
      </FormModal>
      <ConfirmModal show={!!remove} danger title="Delete expense?" message={`“${remove?.title}” (${money(remove?.amount)}) will be removed from totals. It stays in the audit history.`} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/expenses/${remove._id}`); toast.success('Expense removed'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
