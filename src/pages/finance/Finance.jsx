import { useState } from 'react';
import { get, post, download } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/modals/FormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import PaymentForm, { PAYMENT_TYPES, METHODS } from './PaymentForm';
import { BarChart } from '../../components/charts/Charts';
import { SkeletonStatCards, SkeletonBlock } from '../../components/loaders/Skeletons';
import { EmptyState } from '../../components/common/States';
import { money, fmtDate, clientName } from '../../utils/format';
import './Finance.css';

export default function Finance() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [type, setType] = useState(''); const [method, setMethod] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [showVoided, setShowVoided] = useState(false);
  const dash = useFetch(() => get('/dashboard'), []);
  const { data, loading, error, reload } = useFetch(() => get('/payments', { page, type: type || undefined, method: method || undefined, from: from || undefined, to: to || undefined, status: showVoided ? 'all' : undefined }), [page, type, method, from, to, showVoided]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const projects = useFetch(() => get('/projects', { limit: 100 }));
  const [add, setAdd] = useState(false); const [voiding, setVoiding] = useState(null);
  const s = dash.data?.data?.stats; const d = dash.data?.data;

  return (
    <>
      <PageHeader title="Finance" subtitle="Income is only what has actually been received" crumbs={[{ label: 'Finance' }]} actions={<button className="btn btn-primary" onClick={() => setAdd(true)}><i className="bi bi-plus-lg me-1" />Record payment / income</button>} />
      {dash.loading || !s ? <SkeletonStatCards count={4} /> : (
        <div className="row g-3 mb-1">
          <div className="col-6 col-lg-3"><StatCard icon="bi-file-earmark-text" label="Quotation value" value={money(s.totalQuotationValue)} color="info" hint="Not income" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-check2-circle" label="Accepted project value" value={money(s.acceptedQuotationValue)} color="purple" hint="Agreed, not yet received" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-cash-coin" label="Actual received" value={money(s.totalReceived)} color="success" hint="Confirmed payments" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-clock-history" label="Outstanding" value={money(s.outstandingPayments)} color="warn" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-wallet2" label="Total expenses" value={money(s.totalExpenses)} color="danger" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-graph-up-arrow" label="Actual profit" value={money(s.netProfit)} color={s.netProfit >= 0 ? 'success' : 'danger'} hint="Received − expenses" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-calendar-month" label="Revenue this month" value={money(s.monthlyRevenue)} color="primary" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-calendar2-minus" label="Expenses this month" value={money(s.monthlyExpenses)} color="danger" /></div>
        </div>)}
      <div className="row g-3 mt-1">
        <div className="col-lg-6"><div className="card-x"><div className="card-head"><h5>Monthly income</h5></div><div className="card-body-x">{d ? <BarChart data={d.revenueSeries} color="#16a34a" /> : <SkeletonBlock lines={6} />}</div></div></div>
        <div className="col-lg-6"><div className="card-x"><div className="card-head"><h5>Monthly expenses</h5></div><div className="card-body-x">{d ? <BarChart data={d.expenseSeries} color="#dc2626" /> : <SkeletonBlock lines={6} />}</div></div></div>
      </div>

      <div className="card-x mt-3">
        <div className="card-head flex-wrap"><h5>Income ledger</h5>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <select className="form-select form-select-sm" style={{ width: 140 }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type"><option value="">All types</option>{PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <select className="form-select form-select-sm" style={{ width: 140 }} value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} aria-label="Method"><option value="">All methods</option>{METHODS.map((t) => <option key={t}>{t}</option>)}</select>
            <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" /><input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" />
            <div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="vv" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /><label className="form-check-label small" htmlFor="vv">Show voided</label></div>
          </div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} empty={<EmptyState icon="bi-cash-coin" title="No payments in this view" text="Record a payment once money has actually been received." />}
          columns={[
            { key: 'receiptNumber', label: 'Receipt', render: (r) => <span className="fw-semibold">{r.receiptNumber}</span> },
            { key: 'paidOn', label: 'Date', render: (r) => fmtDate(r.paidOn) },
            { key: 'client', label: 'Client', render: (r) => clientName(r.client) },
            { key: 'project', label: 'Project', render: (r) => r.project?.name || <span className="text-muted-x">—</span> },
            { key: 'invoice', label: 'Invoice', render: (r) => r.invoice?.number || '—' },
            { key: 'paymentType', label: 'Type' }, { key: 'method', label: 'Method' },
            { key: 'amount', label: 'Amount', render: (r) => <span className={`money fw-semibold ${r.status === 'voided' ? 'text-decoration-line-through text-muted-x' : ''}`}>{money(r.amount)}</span> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }
          ]}
          actions={(r) => (<><button className="btn btn-ghost btn-icon" aria-label="Download receipt" title="Download receipt" onClick={() => download(`/payments/${r._id}/receipt`, `${r.receiptNumber}.pdf`).catch((e) => toast.error(errMsg(e)))}><i className="bi bi-download" /></button>
            {r.status === 'confirmed' && <><button className="btn btn-ghost btn-icon" aria-label="Email receipt" title="Email receipt to client" onClick={async () => { try { const x = await post(`/payments/${r._id}/email-receipt`); toast.success(x.message); } catch (e) { toast.error(errMsg(e)); } }}><i className="bi bi-envelope" /></button><button className="btn btn-ghost btn-icon text-danger" aria-label="Void" title="Void payment" onClick={() => setVoiding(r)}><i className="bi bi-x-octagon" /></button></>}</>)} />
        {data && <div className="px-3 pb-3 small text-muted-x">Total in this view (confirmed): <b className="money text-dark">{money(data.total)}</b></div>}
      </div>

      <FormModal show={add} title="Record received payment / income" size="lg" initial={{ paymentType: 'Partial', method: 'Bank Transfer', paidOn: new Date().toISOString().slice(0, 10) }} submitLabel="Record" onClose={() => setAdd(false)}
        validate={(v) => ({ ...(Number(v.amount) > 0 ? {} : { amount: 'Enter the amount received' }), ...(v.paymentType !== 'Other Income' && !v.project && !v.client ? { amount: 'Select a project or client for this payment' } : {}) })}
        onSubmit={async (v) => { await post('/payments', { ...v, amount: Number(v.amount), project: v.project || undefined, client: v.client || undefined }); toast.success('Payment recorded'); reload(); dash.reload(); }}>
        {(f) => <PaymentForm {...f} projects={projects.data?.data} clients={clients.data?.data} />}
      </FormModal>
      <ConfirmModal show={!!voiding} danger title="Void this payment?" message={`${voiding?.receiptNumber} (${money(voiding?.amount)}) will stop counting as income. It stays visible in history.`} requireText="Reason for voiding (min 5 characters)" confirmLabel="Void payment" onClose={() => setVoiding(null)}
        onConfirm={async (reason) => { try { await post(`/payments/${voiding._id}/void`, { reason }); toast.success('Payment voided'); reload(); dash.reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
