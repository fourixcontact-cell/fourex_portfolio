import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from 'react-bootstrap';
import { get, post, put, del } from '../../services/crm';
import { publicApi } from '../../services/public';
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
import { fmtDate, fmtDateTime, toInputDate, timeAgo } from '../../utils/format';
import './Leads.css';

const STATUSES = ['New', 'Contacted', 'Discussion', 'Quotation Sent', 'Negotiation', 'Won', 'Lost'];
const COMM = ['note', 'call', 'email', 'meeting', 'whatsapp', 'other'];
const PROJECT_CATS = ['MERN Stack', 'Java / Spring Boot', 'React Native', 'Python / Django', 'WordPress', 'UI/UX Design', 'DevOps & Cloud', 'Maintenance', 'Other'];

export default function Leads() {
  const toast = useToast();
  const [services, setServices] = useState([]);
  useEffect(() => {
    let active = true;
    publicApi.options().then((r) => { if (active) setServices(r.services || []); }).catch((err) => toast.error(errMsg(err)));
    return () => { active = false; };
  }, [toast]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/leads', { page, status: status || undefined, search: q || undefined }), [page, status, q]);
  const admins = useFetch(() => get('/admins'));
  const [edit, setEdit] = useState(null);       // lead | {} (new)
  const [view, setView] = useState(null);       // lead id
  const [remove, setRemove] = useState(null);
  const [convert, setConvert] = useState(null);

  const adminOpts = [{ value: '', label: 'Unassigned' }, ...(admins.data?.data || []).map((a) => ({ value: a._id, label: a.name }))];
  const serviceOptions = ['', ...new Set([...services, ...(edit?.service ? [edit.service] : [])])];
  const counts = data?.statusCounts || {};

  const save = async (v) => {
    const body = { ...v, assignedTo: v.assignedTo || undefined };
    if (v._id) await put(`/leads/${v._id}`, body); else await post('/leads', body);
    toast.success(v._id ? 'Lead updated' : 'Lead created'); reload();
  };
  const quickStatus = async (lead, s) => { try { await put(`/leads/${lead._id}`, { status: s }); toast.success(`Marked as ${s}`); reload(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <>
      <PageHeader title="Leads" subtitle="Enquiries from the website and manually added prospects" crumbs={[{ label: 'Leads' }]} actions={<button className="btn btn-primary" onClick={() => setEdit({ status: 'New', source: 'Manual' })}><i className="bi bi-plus-lg me-1" />Add lead</button>} />
      <div className="lead-tabs">
        <button className={!status ? 'on' : ''} onClick={() => { setStatus(''); setPage(1); }}>All</button>
        {STATUSES.map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => { setStatus(s); setPage(1); }}>{s}{counts[s] ? <span>{counts[s]}</span> : null}</button>)}
      </div>
      <div className="card-x">
        <div className="card-head"><div className="input-group" style={{ maxWidth: 360 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search name, company, email, phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search leads" /></div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={(r) => setView(r._id)}
          empty={<EmptyState icon="bi-bullseye" title="No leads found" text={search || status ? 'Try changing the filters.' : 'New website enquiries will appear here automatically.'} />}
          columns={[
            { key: 'name', label: 'Lead', render: (r) => <div><div className="fw-semibold">{r.name}</div><div className="tiny text-muted-x">{r.company || r.email}</div></div> },
            { key: 'service', label: 'Service', render: (r) => r.service || '—' },
            { key: 'budget', label: 'Budget', render: (r) => r.budget || '—' },
            { key: 'source', label: 'Source', render: (r) => <span className="small">{r.source}</span> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'assignedTo', label: 'Assigned', render: (r) => r.assignedTo ? <span className="small">{r.assignedTo.name}</span> : <span className="text-muted-x small">—</span> },
            { key: 'follow', label: 'Follow-up', render: (r) => r.followUpDate ? <span className={`small ${new Date(r.followUpDate) < new Date() && !['Won', 'Lost'].includes(r.status) ? 'text-danger fw-semibold' : ''}`}>{fmtDate(r.followUpDate)}</span> : '—' },
            { key: 'createdAt', label: 'Received', render: (r) => <span className="small text-muted-x">{timeAgo(r.createdAt)}</span> }
          ]}
          actions={(r) => (<>
            {r.status === 'Won' && !r.convertedClient && <button className="btn btn-soft btn-sm" onClick={() => setConvert(r)}><i className="bi bi-arrow-right-circle me-1" />Convert</button>}
            <button className="btn btn-ghost btn-icon" onClick={() => setEdit({ ...r, assignedTo: r.assignedTo?._id || '', followUpDate: toInputDate(r.followUpDate) })} aria-label="Edit lead"><i className="bi bi-pencil" /></button>
            <button className="btn btn-ghost btn-icon text-danger" onClick={() => setRemove(r)} aria-label="Delete lead"><i className="bi bi-trash" /></button></>)} />
      </div>

      <FormModal show={!!edit} title={edit?._id ? 'Edit lead' : 'Add lead'} initial={edit || {}} onSubmit={save} onClose={() => setEdit(null)}
        validate={(v) => ({ ...(!v.name?.trim() ? { name: 'Name is required' } : {}), ...(!/^\S+@\S+\.\S+$/.test(v.email || '') ? { email: 'Valid email required' } : {}) })}>
        {({ values: v, set, errors }) => (
          <div className="row g-3">
            <Field className="col-md-6" label="Name" name="name" value={v.name} onChange={set} error={errors.name} required />
            <Field className="col-md-6" label="Company" name="company" value={v.company} onChange={set} />
            <Field className="col-md-6" label="Email" name="email" type="email" value={v.email} onChange={set} error={errors.email} required />
            <Field className="col-md-6" label="Phone" name="phone" value={v.phone} onChange={set} error={errors.phone} />
            <Field className="col-md-4" label="Country" name="country" value={v.country} onChange={set} />
            <Field className="col-md-4" label="Service" name="service" value={v.service} onChange={set} options={serviceOptions} />
            <Field className="col-md-4" label="Budget" name="budget" value={v.budget} onChange={set} />
            <Field className="col-md-4" label="Source" name="source" value={v.source} onChange={set} />
            <Field className="col-md-4" label="Status" name="status" value={v.status} onChange={set} options={STATUSES} />
            <Field className="col-md-4" label="Assigned admin" name="assignedTo" value={v.assignedTo} onChange={set} options={adminOpts} />
            <Field className="col-md-4" label="Follow-up date" name="followUpDate" type="date" value={v.followUpDate} onChange={set} error={errors.followUpDate} />
            <Field className="col-12" label="Description" name="description" rows={3} value={v.description} onChange={set} />
            <Field className="col-12" label="Internal notes" name="notes" rows={2} value={v.notes} onChange={set} />
          </div>)}
      </FormModal>

      <LeadDrawer id={view} onClose={() => setView(null)} onChanged={reload} onStatus={quickStatus} onConvert={setConvert} />
      <ConfirmModal show={!!remove} danger title="Archive this lead?" message={`“${remove?.name}” will be archived. It stays in the audit history.`} confirmLabel="Archive" onClose={() => setRemove(null)}
        onConfirm={async () => { try { await del(`/leads/${remove._id}`); toast.success('Lead archived'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />

      <FormModal show={!!convert} title="Convert lead to client" initial={{ createProject: true, projectName: convert?.service || '', category: 'MERN Stack', acceptedAmount: '' }} submitLabel="Convert" size="md" onClose={() => setConvert(null)}
        onSubmit={async (v) => { const r = await post(`/leads/${convert._id}/convert`, { createProject: v.createProject, project: { name: v.projectName || `${convert.name} project`, category: v.category, acceptedAmount: Number(v.acceptedAmount) || 0 } }); toast.success(r.data.createdClient ? 'Client created' + (r.data.project ? ' with a project' : '') : 'Linked to existing client'); reload(); }}>
        {({ values: v, set }) => (<>
          <p className="text-muted-x small">A client record will be created from <b>{convert?.name}</b> (or linked if the email already exists).</p>
          <div className="form-check form-switch mb-3"><input className="form-check-input" type="checkbox" id="cp" checked={!!v.createProject} onChange={(e) => set('createProject', e.target.checked)} /><label className="form-check-label" htmlFor="cp">Also create a project</label></div>
          {v.createProject && <div className="row g-3"><Field className="col-12" label="Project name" name="projectName" value={v.projectName} onChange={set} /><Field className="col-md-6" label="Category" name="category" value={v.category} onChange={set} options={PROJECT_CATS} /><Field className="col-md-6" label="Accepted amount (₹)" name="acceptedAmount" type="number" value={v.acceptedAmount} onChange={set} hint="Leave empty if not agreed yet" /></div>}
        </>)}
      </FormModal>
    </>
  );
}

function LeadDrawer({ id, onClose, onChanged, onStatus, onConvert }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch(() => (id ? get(`/leads/${id}`) : Promise.resolve(null)), [id]);
  const [note, setNote] = useState({ type: 'note', summary: '' });
  const [busy, setBusy] = useState(false);
  const lead = data?.data;
  const add = async (e) => {
    e.preventDefault(); if (!note.summary.trim()) return;
    setBusy(true);
    try { await post(`/leads/${id}/communications`, note); setNote({ type: 'note', summary: '' }); toast.success('Logged'); reload(); onChanged(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal show={!!id} onHide={onClose} size="lg" centered scrollable>
      <Modal.Header closeButton><Modal.Title>{lead?.name || 'Lead'}</Modal.Title></Modal.Header>
      <Modal.Body>
        {loading || !lead ? <div className="skeleton" style={{ height: 220 }} /> : (<>
          <div className="d-flex flex-wrap gap-2 align-items-center mb-3"><StatusBadge status={lead.status} />{lead.isQuoteRequest && <span className="badge-soft s-warn">Quote request</span>}
            <select className="form-select form-select-sm ms-auto" style={{ width: 170 }} value={lead.status} onChange={(e) => onStatus(lead, e.target.value).then(reload)} aria-label="Change status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            {lead.status === 'Won' && !lead.convertedClient && <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onConvert(lead); }}>Convert to client</button>}</div>
          <div className="row g-3 mb-3">
            {[['Company', lead.company], ['Email', lead.email], ['Phone', lead.phone], ['Country', lead.country], ['Service', lead.service], ['Budget', lead.budget], ['Preferred contact', lead.preferredContact], ['Source', lead.source], ['Assigned', lead.assignedTo?.name], ['Follow-up', fmtDate(lead.followUpDate)], ['Received', fmtDateTime(lead.createdAt)]].map(([k, v]) => <div className="col-6 col-md-4" key={k}><div className="tiny text-muted-x">{k}</div><div className="small fw-semibold text-break">{v || '—'}</div></div>)}
          </div>
          {lead.convertedClient && <div className="alert alert-success py-2 small">Converted to client <Link to={`/crm/clients/${lead.convertedClient._id}`}>{lead.convertedClient.company || lead.convertedClient.contactPerson}</Link>{lead.convertedProject && <> · project <Link to={`/crm/projects/${lead.convertedProject._id}`}>{lead.convertedProject.projectId}</Link></>}</div>}
          {lead.description && <><h6>Enquiry</h6><p className="lead-desc">{lead.description}</p></>}
          {lead.notes && <><h6>Notes</h6><p className="lead-desc">{lead.notes}</p></>}
          {lead.emailStatus && (lead.emailStatus.lastError || !lead.emailStatus.agencyNotified) && lead.source?.startsWith('Website') && <div className="alert alert-warning py-2 small"><i className="bi bi-envelope-exclamation me-1" />Email issue on submission: {lead.emailStatus.lastError || 'agency notification not sent'}. The lead itself was saved.</div>}
          <h6 className="mt-3">Communication history</h6>
          <form onSubmit={add} className="d-flex gap-2 mb-3 flex-wrap"><select className="form-select" style={{ width: 130 }} value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })} aria-label="Type">{COMM.map((c) => <option key={c}>{c}</option>)}</select><input className="form-control flex-grow-1" style={{ minWidth: 180 }} placeholder="Log a call, email, meeting or note…" value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} /><button className="btn btn-primary" disabled={busy || !note.summary.trim()}>Log</button></form>
          {lead.communications.length ? lead.communications.map((c) => <div key={c._id} className="comm"><span className="badge-soft">{c.type}</span><div className="flex-grow-1"><div className="small">{c.summary}</div><div className="tiny text-muted-x">{c.byName} · {fmtDateTime(c.at)}</div></div></div>) : <p className="small text-muted-x">No communication logged yet.</p>}
        </>)}
      </Modal.Body>
    </Modal>
  );
}
