import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { get } from '../../services/crm';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/tables/DataTable';
import { EmptyState } from '../../components/common/States';
import { fmtDateTime } from '../../utils/format';
import './AuditLogs.css';

const ACTION_TONE = { CREATE: 'success', UPDATE: 'info', DELETE: 'danger', LOGIN: 'primary', LOGOUT: '', FAILED_LOGIN: 'danger', STATUS_CHANGE: 'purple', SESSION_TERMINATED: 'warn', EXPORT: 'warn', PAYMENT_VOIDED: 'danger' };

export default function AuditLogs() {
  const [page, setPage] = useState(1); const [f, setF] = useState({ admin: '', module: '', action: '', from: '', to: '', search: '' });
  const q = useDebounce(f.search);
  const { data, loading, error, reload } = useFetch(() => get('/audit-logs', { page, admin: f.admin || undefined, module: f.module || undefined, action: f.action || undefined, from: f.from || undefined, to: f.to || undefined, search: q || undefined }), [page, f.admin, f.module, f.action, f.from, f.to, q]);
  const admins = useFetch(() => get('/admins'));
  const [view, setView] = useState(null);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const any = Object.values(f).some(Boolean);

  return (
    <>
      <PageHeader title="Audit logs" subtitle="Read-only record of every important action. It cannot be edited or deleted." crumbs={[{ label: 'Audit logs' }]} actions={any && <button className="btn btn-ghost" onClick={() => { setF({ admin: '', module: '', action: '', from: '', to: '', search: '' }); setPage(1); }}>Clear filters</button>} />
      <div className="card-x">
        <div className="card-head flex-wrap"><div className="row g-2 w-100">
          <div className="col-md-4 col-xl-3"><div className="input-group"><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search description, admin, record id…" value={f.search} onChange={(e) => set('search', e.target.value)} aria-label="Search" /></div></div>
          <div className="col-6 col-md-2"><select className="form-select" value={f.admin} onChange={(e) => set('admin', e.target.value)} aria-label="Admin"><option value="">All admins</option>{admins.data?.data.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select></div>
          <div className="col-6 col-md-2"><select className="form-select" value={f.module} onChange={(e) => set('module', e.target.value)} aria-label="Module"><option value="">All modules</option>{data?.filters.modules.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="col-6 col-md-2"><select className="form-select" value={f.action} onChange={(e) => set('action', e.target.value)} aria-label="Action"><option value="">All actions</option>{data?.filters.actions.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="col-3 col-md-1"><input type="date" className="form-control" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" title="From" /></div>
          <div className="col-3 col-md-1"><input type="date" className="form-control" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" title="To" /></div>
        </div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={setView} empty={<EmptyState icon="bi-shield-check" title="No matching audit records" />}
          columns={[
            { key: 'createdAt', label: 'When', render: (r) => <span className="small">{fmtDateTime(r.createdAt)}</span> },
            { key: 'adminName', label: 'Who', render: (r) => <div><div className="small fw-semibold">{r.adminName || (r.actorType === 'public' ? 'Public visitor' : 'System')}</div><div className="tiny text-muted-x">{r.adminEmail}</div></div> },
            { key: 'action', label: 'Action', render: (r) => <span className={`badge-soft ${ACTION_TONE[r.action] ? `s-${ACTION_TONE[r.action]}` : ''}`}>{r.action}</span> },
            { key: 'module', label: 'Module', render: (r) => <span className="badge-soft">{r.module}</span> },
            { key: 'description', label: 'Description', render: (r) => <span className="small">{r.description}</span> },
            { key: 'ip', label: 'IP', render: (r) => <span className="tiny text-muted-x">{r.ip || '—'}</span> },
            { key: 'chg', label: 'Changes', render: (r) => (r.oldValues || r.newValues ? <span className="badge-soft s-primary">View diff</span> : '—') }
          ]} />
      </div>
      <Modal show={!!view} onHide={() => setView(null)} size="lg" centered scrollable>
        <Modal.Header closeButton><Modal.Title>Audit record</Modal.Title></Modal.Header>
        <Modal.Body>{view && (<>
          <div className="row g-3 mb-3">{[['When', fmtDateTime(view.createdAt)], ['Admin', `${view.adminName || '—'} ${view.adminEmail ? `(${view.adminEmail})` : ''}`], ['Action', view.action], ['Module', view.module], ['Record ID', view.recordId], ['IP address', view.ip], ['Device / browser', view.device]].map(([k, v]) => <div className="col-6 col-md-4" key={k}><div className="tiny text-muted-x">{k}</div><div className="small fw-semibold text-break">{v || '—'}</div></div>)}</div>
          <p className="mb-3">{view.description}</p>
          <Diff oldV={view.oldValues} newV={view.newValues} />
        </>)}</Modal.Body>
      </Modal>
    </>
  );
}

const show = (v) => (v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v));
function Diff({ oldV, newV }) {
  const keys = [...new Set([...Object.keys(oldV || {}), ...Object.keys(newV || {})])];
  if (!keys.length) return <p className="small text-muted-x">No before/after values were recorded for this event.</p>;
  return (
    <div className="table-responsive"><table className="table-x diff"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
      <tbody>{keys.map((k) => <tr key={k}><td className="fw-semibold small">{k}</td><td><pre className="diff-old">{show(oldV?.[k])}</pre></td><td><pre className="diff-new">{show(newV?.[k])}</pre></td></tr>)}</tbody></table></div>
  );
}
