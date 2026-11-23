import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, put, download, upload } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import { SkeletonProfile, SkeletonTable } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/modals/FormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import StatCard from '../../components/common/StatCard';
import { ClientForm, validateClient } from './Clients';
import { post } from '../../services/crm';
import { money, fmtDate, initials, clientName } from '../../utils/format';
import './ClientDetail.css';

export default function ClientDetail() {
  const { id } = useParams(); const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => get(`/clients/${id}`), [id]);
  const [tab, setTab] = useState('projects'); const [edit, setEdit] = useState(false); const [cred, setCred] = useState(null); const [portal, setPortal] = useState(false);
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  const d = data?.data; const c = d?.client;

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const uploadDoc = async (e) => {
    e.preventDefault(); if (!file) return; setBusy(true);
    try { const fd = new FormData(); fd.append('files', file); fd.append('client', id); fd.append('category', 'Agreement'); await upload('/documents', fd); toast.success('Document uploaded'); setFile(null); e.target.reset(); reload(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const tabs = [['projects', 'Projects', d?.projects.length], ['quotations', 'Quotations', d?.quotations.length], ['invoices', 'Invoices', d?.invoices.length], ['payments', 'Payments', d?.payments.length], ['documents', 'Documents', d?.documents.length]];

  return (
    <>
      <PageHeader title={c ? clientName(c) : 'Client'} crumbs={[{ label: 'Clients', to: '/crm/clients' }, { label: c?.clientCode || '…' }]} actions={c && <><button className="btn btn-ghost" onClick={() => setPortal(true)}><i className="bi bi-key me-1" />{c.portalUser ? 'Reset portal password' : 'Enable portal access'}</button><button className="btn btn-primary" onClick={() => setEdit(true)}><i className="bi bi-pencil me-1" />Edit</button></>} />
      {loading || !c ? <SkeletonProfile /> : (<>
        <div className="card-x card-body-x mb-3">
          <div className="d-flex gap-3 align-items-center flex-wrap"><span className="avatar cd-av">{initials(clientName(c))}</span><div className="flex-grow-1"><h4 className="mb-0">{clientName(c)}</h4><div className="text-muted-x small">{c.company ? `${c.contactPerson} · ` : ''}{c.clientType}</div></div>{c.portalUser && <span className="badge-soft s-success"><i className="bi bi-person-check" />Portal active</span>}</div>
          <div className="row g-3 mt-2">{[['Email', c.email], ['Phone', c.phone], ['Country', c.country], ['Address', [c.address, c.city, c.state].filter(Boolean).join(', ')], ['GSTIN', c.gstin], ['Client since', fmtDate(c.createdAt)]].map(([k, v]) => <div className="col-6 col-md-4" key={k}><div className="tiny text-muted-x">{k}</div><div className="small fw-semibold text-break">{v || '—'}</div></div>)}</div>
          {c.notes && <p className="small mt-3 mb-0 cd-notes">{c.notes}</p>}
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-4"><StatCard icon="bi-receipt" label="Total invoiced" value={money(d.totals.invoiced)} color="info" /></div>
          <div className="col-md-4"><StatCard icon="bi-cash-coin" label="Received" value={money(d.totals.received)} color="success" hint="Confirmed payments" /></div>
          <div className="col-md-4"><StatCard icon="bi-clock-history" label="Outstanding" value={money(d.totals.outstanding)} color="warn" /></div>
        </div>
        <div className="card-x">
          <div className="cd-tabs">{tabs.map(([k, l, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span>{n}</span></button>)}</div>
          <div className="table-responsive">
            {tab === 'projects' && (d.projects.length ? <table className="table-x table-responsive-stack"><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Accepted</th><th>Received</th><th>Deadline</th></tr></thead><tbody>{d.projects.map((p) => <tr key={p._id}><td data-label="Project"><Link to={`/crm/projects/${p._id}`} className="fw-semibold">{p.name}</Link><div className="tiny text-muted-x">{p.projectId}</div></td><td data-label="Status"><StatusBadge status={p.status} /></td><td data-label="Progress" style={{ minWidth: 120 }}><div className="progress-x"><span style={{ width: `${p.progress}%` }} /></div></td><td data-label="Accepted" className="money">{money(p.acceptedAmount)}</td><td data-label="Received" className="money">{money(p.amountReceived)}</td><td data-label="Deadline">{fmtDate(p.expectedDeadline)}</td></tr>)}</tbody></table> : <EmptyState icon="bi-kanban" title="No projects" />)}
            {tab === 'quotations' && (d.quotations.length ? <table className="table-x table-responsive-stack"><thead><tr><th>Number</th><th>Project</th><th>Total</th><th>Status</th><th>Expiry</th></tr></thead><tbody>{d.quotations.map((q) => <tr key={q._id}><td data-label="Number" className="fw-semibold">{q.number}</td><td data-label="Project">{q.projectName}</td><td data-label="Total" className="money">{money(q.grandTotal)}</td><td data-label="Status"><StatusBadge status={q.status} /></td><td data-label="Expiry">{fmtDate(q.expiryDate)}</td></tr>)}</tbody></table> : <EmptyState icon="bi-file-earmark-text" title="No quotations" />)}
            {tab === 'invoices' && (d.invoices.length ? <table className="table-x table-responsive-stack"><thead><tr><th>Number</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th></tr></thead><tbody>{d.invoices.map((i) => <tr key={i._id}><td data-label="Number" className="fw-semibold">{i.number}</td><td data-label="Total" className="money">{money(i.total)}</td><td data-label="Paid" className="money">{money(i.amountPaid)}</td><td data-label="Balance" className="money">{money(i.balance)}</td><td data-label="Status"><StatusBadge status={i.status} /></td><td data-label="Due">{fmtDate(i.dueDate)}</td></tr>)}</tbody></table> : <EmptyState icon="bi-receipt" title="No invoices" />)}
            {tab === 'payments' && (d.payments.length ? <table className="table-x table-responsive-stack"><thead><tr><th>Receipt</th><th>Date</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{d.payments.map((p) => <tr key={p._id}><td data-label="Receipt" className="fw-semibold">{p.receiptNumber}</td><td data-label="Date">{fmtDate(p.paidOn)}</td><td data-label="Type">{p.paymentType}</td><td data-label="Method">{p.method}</td><td data-label="Amount" className="money">{money(p.amount)}</td><td data-label="Status"><StatusBadge status={p.status} /></td></tr>)}</tbody></table> : <EmptyState icon="bi-cash-coin" title="No payments recorded" />)}
            {tab === 'documents' && (<div className="p-3"><form onSubmit={uploadDoc} className="d-flex gap-2 mb-3 flex-wrap"><input type="file" className="form-control" style={{ maxWidth: 360 }} onChange={(e) => setFile(e.target.files[0])} /><button className="btn btn-primary" disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload'}</button></form>
              {d.documents.length ? d.documents.map((x) => <div key={x._id} className="dl-row"><div><i className="bi bi-file-earmark me-2" />{x.originalName}<span className="badge-soft ms-2">{x.category}</span></div><button className="btn btn-ghost btn-sm" onClick={() => download(`/documents/${x._id}/download`, x.originalName).catch((e) => toast.error(errMsg(e)))}><i className="bi bi-download" /></button></div>) : <EmptyState icon="bi-folder2-open" title="No documents" />}</div>)}
          </div>
        </div>
      </>)}
      <FormModal show={edit} title="Edit client" initial={c || {}} validate={validateClient} onClose={() => setEdit(false)} onSubmit={async (v) => { await put(`/clients/${id}`, v); toast.success('Client updated'); reload(); }}>{(p) => <ClientForm {...p} />}</FormModal>
      <ConfirmModal show={portal} title={c?.portalUser ? 'Reset portal password?' : 'Enable client portal access?'} message={c?.portalUser ? `A password-reset email will be sent to ${c?.email}. The client chooses a new password from that email.` : `A temporary password will be generated for ${c?.email}. It is shown once; share it securely.`} confirmLabel={c?.portalUser ? 'Send reset email' : 'Generate'} onClose={() => setPortal(false)}
        onConfirm={async () => { try { const r = await post(`/clients/${id}/portal-access`); if (r.data?.resetEmailSent) toast.success(r.message || 'Reset email sent'); else setCred(r.data); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!cred} title="Portal credentials" confirmLabel="Done" onClose={() => setCred(null)} onConfirm={async () => {}}>
        <div className="alert alert-warning small">Copy this now. It cannot be shown again.</div>
        <div className="small text-muted-x">Login email</div><div className="fw-semibold mb-2">{cred?.email}</div>
        <div className="small text-muted-x">Temporary password</div><div className="cred-box"><code>{cred?.temporaryPassword}</code><button type="button" className="btn btn-soft btn-sm" onClick={() => { navigator.clipboard?.writeText(cred.temporaryPassword); toast.info('Copied'); }}>Copy</button></div>
      </ConfirmModal>
    </>
  );
}
