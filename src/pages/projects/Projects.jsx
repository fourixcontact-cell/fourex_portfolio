import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post, del } from '../../services/crm';
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
import { EmptyState } from '../../components/common/States';
import { SkeletonProjectCards } from '../../components/loaders/Skeletons';
import { money, fmtDate, clientName } from '../../utils/format';
import './Projects.css';

export const STATUSES = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Testing', 'Client Review', 'Completed', 'Cancelled'];
export const CATEGORIES = ['MERN Stack', 'Java / Spring Boot', 'React Native', 'Python / Django', 'WordPress', 'UI/UX Design', 'DevOps & Cloud', 'Maintenance', 'Other'];

export function ProjectForm({ values: v, set, errors, clients, admins }) {
  const team = v.team || [];
  return (
    <div className="row g-3">
      <Field className="col-md-8" label="Project name" name="name" value={v.name} onChange={set} error={errors.name} required />
      <Field className="col-md-4" label="Category" name="category" value={v.category} onChange={set} options={CATEGORIES} />
      <Field className="col-md-6" label="Client" name="client" value={v.client} onChange={set} error={errors.client} required options={[{ value: '', label: '— Select client —' }, ...(clients || []).map((c) => ({ value: c._id, label: clientName(c) }))]} />
      <Field className="col-md-6" label="Status" name="status" value={v.status} onChange={set} options={STATUSES} />
      <Field className="col-12" label="Description" name="description" rows={3} value={v.description} onChange={set} />
      <Field className="col-12" label="Technology stack" name="techStackText" value={v.techStackText} onChange={set} hint="Comma separated, e.g. React, Node.js, MongoDB" />
      <Field className="col-md-4" label="Quotation amount (₹)" name="quotationAmount" type="number" min="0" value={v.quotationAmount} onChange={set} error={errors.quotationAmount} />
      <Field className="col-md-4" label="Accepted amount (₹)" name="acceptedAmount" type="number" min="0" value={v.acceptedAmount} onChange={set} error={errors.acceptedAmount} />
      <Field className="col-md-4" label="Advance amount (₹)" name="advanceAmount" type="number" min="0" value={v.advanceAmount} onChange={set} error={errors.advanceAmount} />
      <Field className="col-md-4" label="Start date" name="startDate" type="date" value={v.startDate} onChange={set} />
      <Field className="col-md-4" label="Expected deadline" name="expectedDeadline" type="date" value={v.expectedDeadline} onChange={set} />
      <Field className="col-md-4" label="Progress %" name="progress" type="number" min="0" max="100" value={v.progress} onChange={set} />
      <Field className="col-md-6" label="GitHub repository URL" name="githubUrl" value={v.githubUrl} onChange={set} error={errors.githubUrl} placeholder="https://github.com/…" />
      <Field className="col-md-6" label="Live website URL" name="liveUrl" value={v.liveUrl} onChange={set} error={errors.liveUrl} placeholder="https://…" />
      <div className="col-12"><label className="form-label">Assigned admins</label><div className="d-flex gap-2 flex-wrap">{(admins || []).map((a) => { const on = team.includes(a._id); return <button type="button" key={a._id} className={`chip-sel ${on ? 'on' : ''}`} onClick={() => set('team', on ? team.filter((x) => x !== a._id) : [...team, a._id])}><i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'} me-1`} />{a.name}</button>; })}</div></div>
      <Field className="col-12" label="Internal notes" name="internalNotes" rows={2} value={v.internalNotes} onChange={set} hint="Never shown publicly or to the client" />
    </div>
  );
}

export const toForm = (p = {}) => ({ ...p, client: p.client?._id || p.client || '', team: (p.team || []).map((t) => t._id || t), techStackText: (p.techStack || []).join(', '), startDate: p.startDate?.slice(0, 10) || '', expectedDeadline: p.expectedDeadline?.slice(0, 10) || '' });
export const toBody = (v) => {
  const b = { name: v.name, client: v.client, category: v.category, description: v.description, status: v.status, techStack: (v.techStackText || '').split(',').map((s) => s.trim()).filter(Boolean), quotationAmount: Number(v.quotationAmount) || 0, acceptedAmount: Number(v.acceptedAmount) || 0, advanceAmount: Number(v.advanceAmount) || 0, startDate: v.startDate || undefined, expectedDeadline: v.expectedDeadline || undefined, progress: v.progress === '' || v.progress === undefined ? undefined : Number(v.progress), githubUrl: v.githubUrl || undefined, liveUrl: v.liveUrl || undefined, team: v.team, internalNotes: v.internalNotes };
  return b;
};
export const validateProject = (v) => ({ ...(!v.name?.trim() ? { name: 'Project name is required' } : {}), ...(!v.client ? { client: 'Select a client' } : {}) });

export default function Projects() {
  const toast = useToast(); const nav = useNavigate();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [view, setView] = useState('table');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/projects', { page, limit: view === 'cards' ? 12 : 10, search: q || undefined, status: status || undefined }), [page, q, status, view]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const admins = useFetch(() => get('/admins'));
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null);

  return (
    <>
      <PageHeader title="Projects" subtitle="Track delivery, money and progress" crumbs={[{ label: 'Projects' }]} actions={<button className="btn btn-primary" onClick={() => setEdit(toForm({ status: 'Not Started', category: 'MERN Stack' }))}><i className="bi bi-plus-lg me-1" />New project</button>} />
      <div className="card-x">
        <div className="card-head flex-wrap">
          <div className="d-flex gap-2 flex-wrap">
            <div className="input-group" style={{ width: 280 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search projects…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search projects" /></div>
            <select className="form-select" style={{ width: 170 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div className="btn-group"><button className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')} aria-label="Table view"><i className="bi bi-list-ul" /></button><button className={`btn btn-sm ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('cards')} aria-label="Card view"><i className="bi bi-grid" /></button></div>
        </div>
        {view === 'table' ? (
          <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={(r) => nav(`/crm/projects/${r._id}`)}
            empty={<EmptyState icon="bi-kanban" title="No projects found" text="Create a project or convert a won lead." />}
            columns={[
              { key: 'name', label: 'Project', render: (r) => <div><div className="fw-semibold">{r.name}{r.portfolio?.visible && <i className="bi bi-globe2 text-primary ms-2" title="Public in portfolio" />}</div><div className="tiny text-muted-x">{r.projectId}</div></div> },
              { key: 'client', label: 'Client', render: (r) => clientName(r.client) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'progress', label: 'Progress', render: (r) => <div style={{ minWidth: 100 }}><div className="progress-x"><span style={{ width: `${r.progress}%` }} /></div><div className="tiny text-muted-x mt-1">{r.progress}%</div></div> },
              { key: 'acceptedAmount', label: 'Accepted', render: (r) => <span className="money">{money(r.acceptedAmount)}</span> },
              { key: 'amountReceived', label: 'Received', render: (r) => <span className="money text-success">{money(r.amountReceived)}</span> },
              { key: 'profit', label: 'Profit', render: (r) => <span className={`money fw-semibold ${r.profit < 0 ? 'text-danger' : ''}`}>{money(r.profit)}</span> },
              { key: 'expectedDeadline', label: 'Deadline', render: (r) => fmtDate(r.expectedDeadline) }
            ]}
            actions={(r) => (<><button className="btn btn-ghost btn-icon" onClick={() => setEdit(toForm(r))} aria-label="Edit"><i className="bi bi-pencil" /></button><button className="btn btn-ghost btn-icon text-danger" onClick={() => setRemove(r)} aria-label="Archive"><i className="bi bi-archive" /></button></>)} />
        ) : (
          <div className="p-3">{loading && !data ? <SkeletonProjectCards count={6} /> : data?.data.length ? (
            <div className="row g-3">{data.data.map((p) => (
              <div className="col-md-6 col-xl-4" key={p._id}><Link to={`/crm/projects/${p._id}`} className="card-x hoverable pj-card"><div className="d-flex justify-content-between align-items-start mb-2"><div className="tiny text-muted-x">{p.projectId}</div><StatusBadge status={p.status} /></div><h6 className="mb-1">{p.name}</h6><div className="small text-muted-x mb-3">{clientName(p.client)}</div><div className="progress-x mb-1"><span style={{ width: `${p.progress}%` }} /></div><div className="d-flex justify-content-between tiny text-muted-x mb-3"><span>{p.progress}% complete</span><span>Due {fmtDate(p.expectedDeadline)}</span></div><div className="d-flex justify-content-between small"><span>Received <b className="money text-success">{money(p.amountReceived)}</b></span><span>Pending <b className="money">{money(p.pendingBalance)}</b></span></div></Link></div>))}</div>
          ) : <EmptyState icon="bi-kanban" title="No projects found" />}</div>
        )}
      </div>
      <FormModal show={!!edit} title={edit?._id ? `Edit ${edit.projectId}` : 'New project'} initial={edit || {}} validate={validateProject} onClose={() => setEdit(null)} size="xl"
        onSubmit={async (v) => { if (v._id) { const { put } = await import('../../services/crm'); await put(`/projects/${v._id}`, toBody(v)); } else await post('/projects', toBody(v)); toast.success(v._id ? 'Project updated' : 'Project created'); reload(); }}>
        {(p) => <ProjectForm {...p} clients={clients.data?.data} admins={admins.data?.data} />}
      </FormModal>
      <ConfirmModal show={!!remove} danger title="Archive project?" message={`“${remove?.name}” will be archived and removed from the public portfolio. Payments and audit history are preserved.`} confirmLabel="Archive" onClose={() => setRemove(null)}
        onConfirm={async () => { try { await del(`/projects/${remove._id}`); toast.success('Project archived'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
