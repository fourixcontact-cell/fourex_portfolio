import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from 'react-bootstrap';
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
import { EmptyState } from '../../components/common/States';
import QuotationForm, { toForm, toBody, validateQuotation } from './QuotationForm';
import { money, fmtDate, clientName, fmtDateTime } from '../../utils/format';
import './Quotations.css';

const QSTATUS = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'];

export default function Quotations() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/quotations', { page, status: status || undefined, search: q || undefined }), [page, status, q]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const projects = useFetch(() => get('/projects', { limit: 100 })); const defaults = useFetch(() => get('/quotations/defaults'));
  const [edit, setEdit] = useState(null); const [view, setView] = useState(null); const [remove, setRemove] = useState(null); const [send, setSend] = useState(null); const [decide, setDecide] = useState(null);
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast.error(errMsg(e)); } };
  const sum = Object.fromEntries((data?.summary || []).map((s) => [s._id, s]));

  return (
    <>
      <PageHeader title="Quotations" subtitle="Create, send and track quotations" crumbs={[{ label: 'Quotations' }]} actions={<button className="btn btn-primary" onClick={() => setEdit(toForm({}, defaults.data?.data))}><i className="bi bi-plus-lg me-1" />New quotation</button>} />
      <div className="row g-3 mb-3">{[['Draft', 'secondary'], ['Sent', 'info'], ['Accepted', 'success'], ['Rejected', 'danger']].map(([s]) => <div className="col-6 col-lg-3" key={s}><div className="card-x card-body-x py-3"><div className="small text-muted-x">{s}</div><div className="fs-5 fw-bold money">{money(sum[s]?.value || 0)}</div><div className="tiny text-muted-x">{sum[s]?.n || 0} quotation{sum[s]?.n === 1 ? '' : 's'} · not income</div></div></div>)}</div>
      <div className="card-x">
        <div className="card-head flex-wrap"><div className="d-flex gap-2 flex-wrap"><div className="input-group" style={{ width: 280 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search number, project, client…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search quotations" /></div><select className="form-select" style={{ width: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option>{QSTATUS.map((s) => <option key={s}>{s}</option>)}</select></div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={setView}
          empty={<EmptyState icon="bi-file-earmark-text" title="No quotations" text="Create your first itemised quotation." />}
          columns={[
            { key: 'number', label: 'Number', render: (r) => <div><div className="fw-semibold">{r.number}</div>{r.revision > 1 && <div className="tiny text-muted-x">Revision {r.revision}</div>}</div> },
            { key: 'projectName', label: 'Project' },
            { key: 'client', label: 'Client', render: (r) => clientName(r.client) !== '—' ? clientName(r.client) : (r.clientSnapshot?.company || r.clientSnapshot?.contactPerson || '—') },
            { key: 'grandTotal', label: 'Total', render: (r) => <span className="money fw-semibold">{money(r.grandTotal, r.currency)}</span> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'expiryDate', label: 'Expires', render: (r) => fmtDate(r.expiryDate) }
          ]}
          actions={(r) => (<>
            <button className="btn btn-ghost btn-icon" title="Preview PDF" aria-label="Preview PDF" onClick={guard(() => openBlob(`/quotations/${r._id}/pdf?inline=1`))}><i className="bi bi-eye" /></button>
            <button className="btn btn-ghost btn-icon" title="Download PDF" aria-label="Download PDF" onClick={guard(() => download(`/quotations/${r._id}/pdf`, `${r.number}.pdf`))}><i className="bi bi-download" /></button>
            <button className="btn btn-ghost btn-icon" title="Send by email" aria-label="Send by email" disabled={r.status === 'Accepted'} onClick={() => setSend(r)}><i className="bi bi-send" /></button>
            <button className="btn btn-ghost btn-icon" title="Edit" aria-label="Edit" disabled={r.status === 'Accepted'} onClick={guard(async () => setEdit(toForm((await get(`/quotations/${r._id}`)).data)))}><i className="bi bi-pencil" /></button>
            <button className="btn btn-ghost btn-icon" title="Duplicate" aria-label="Duplicate" onClick={guard(async () => { await post(`/quotations/${r._id}/duplicate`); toast.success('Duplicated as a new draft'); reload(); })}><i className="bi bi-copy" /></button>
            <button className="btn btn-ghost btn-icon text-danger" title="Delete" aria-label="Delete" onClick={() => setRemove(r)}><i className="bi bi-trash" /></button></>)} />
      </div>

      <FormModal show={!!edit} title={edit?._id ? `Edit ${edit.number}` : 'New quotation'} initial={edit || {}} size="xl" validate={validateQuotation} submitLabel={edit?._id ? 'Save changes' : 'Create quotation'} onClose={() => setEdit(null)}
        onSubmit={async (v) => { if (v._id) await put(`/quotations/${v._id}`, toBody(v)); else await post('/quotations', toBody(v)); toast.success(v._id ? 'Quotation updated' : 'Quotation created'); reload(); }}>
        {(f) => <QuotationForm {...f} clients={clients.data?.data} projects={projects.data?.data} />}
      </FormModal>

      <QuotationView q={view} onClose={() => setView(null)} onDecide={setDecide} onSend={setSend} reloadList={reload} />
      <ConfirmModal show={!!send} title="Email quotation to client?" message={`${send?.number} (PDF attached) will be emailed to ${send?.clientSnapshot?.email} using Resend. Status becomes “Sent”.`} confirmLabel="Send email" onClose={() => setSend(null)}
        onConfirm={async () => { try { const r = await post(`/quotations/${send._id}/send`); toast.success(r.message); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!decide} title={`Mark as ${decide?.status}?`} message={decide?.status === 'Accepted' ? 'Records that the client accepted. The quotation becomes locked, and a linked project’s accepted amount is updated. This does not record any payment.' : 'Records that the client rejected this quotation.'} confirmLabel={`Mark ${decide?.status}`} danger={decide?.status === 'Rejected'} onClose={() => setDecide(null)}
        onConfirm={async () => { try { await put(`/quotations/${decide.q._id}/status`, { status: decide.status }); toast.success(`Marked ${decide.status}`); reload(); setView(null); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmModal show={!!remove} danger title="Delete quotation?" message={`${remove?.number} will be archived (kept in audit history).`} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/quotations/${remove._id}`); toast.success('Quotation archived'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}

function QuotationView({ q: row, onClose, onDecide, onSend, reloadList }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch(() => (row ? get(`/quotations/${row._id}`) : Promise.resolve(null)), [row?._id, row?.status]);
  const q = data?.data;
  const mk = async () => { try { const r = await post(`/quotations/${q._id}/create-project`, {}); toast.success(`Project ${r.data.projectId} created`); reload(); reloadList(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal show={!!row} onHide={onClose} size="lg" centered scrollable>
      <Modal.Header closeButton><Modal.Title>{row?.number} <StatusBadge status={q?.status || row?.status} /></Modal.Title></Modal.Header>
      <Modal.Body>{loading || !q ? <div className="skeleton" style={{ height: 240 }} /> : (<>
        <div className="d-flex gap-2 flex-wrap mb-3">
          {['Draft', 'Sent', 'Viewed'].includes(q.status) && <><button className="btn btn-primary btn-sm" onClick={() => onSend(q)}><i className="bi bi-send me-1" />Send</button><button className="btn btn-soft btn-sm" onClick={() => onDecide({ q, status: 'Accepted' })}>Mark accepted</button><button className="btn btn-ghost btn-sm text-danger" onClick={() => onDecide({ q, status: 'Rejected' })}>Mark rejected</button></>}
          {q.status === 'Accepted' && !q.project && <button className="btn btn-primary btn-sm" onClick={mk} disabled={!q.client}><i className="bi bi-kanban me-1" />Create project from this quotation</button>}
          {q.project && <Link className="btn btn-soft btn-sm" to={`/crm/projects/${q.project._id}`}>Project {q.project.projectId}</Link>}
          <button className="btn btn-ghost btn-sm" onClick={() => openBlob(`/quotations/${q._id}/pdf?inline=1`).catch((e) => toast.error(errMsg(e)))}><i className="bi bi-file-earmark-pdf me-1" />PDF</button>
        </div>
        <div className="row g-3 mb-3">{[['Client', q.clientSnapshot?.company || q.clientSnapshot?.contactPerson], ['Project', q.projectName], ['Date', fmtDate(q.quotationDate)], ['Expires', fmtDate(q.expiryDate)], ['Sent', fmtDateTime(q.sentAt)], ['Viewed', q.viewedAt ? fmtDateTime(q.viewedAt) : 'Not tracked yet'], ['Total', money(q.grandTotal, q.currency)], ['Advance', money(q.advanceAmount, q.currency)]].map(([k, v]) => <div className="col-6 col-md-3" key={k}><div className="tiny text-muted-x">{k}</div><div className="small fw-semibold">{v || '—'}</div></div>)}</div>
        <div className="table-responsive"><table className="table-x"><thead><tr><th>Item</th><th className="text-end">Qty</th><th className="text-end">Unit</th><th className="text-end">Amount</th></tr></thead><tbody>{q.items.map((i) => <tr key={i._id}><td>{i.description}</td><td className="text-end">{i.quantity}</td><td className="text-end money">{money(i.unitPrice, q.currency)}</td><td className="text-end money">{money(i.amount, q.currency)}</td></tr>)}</tbody></table></div>
        <h6 className="mt-3">Revision history</h6>
        {q.revisions.map((r) => <div key={r.revision + r.at} className="small border-bottom py-1">Rev {r.revision} · {money(r.grandTotal, q.currency)} · {r.byName} · {fmtDateTime(r.at)} <span className="text-muted-x">{r.note}</span></div>)}
      </>)}</Modal.Body>
    </Modal>
  );
}
