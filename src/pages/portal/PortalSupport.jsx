import { useState } from 'react';
import api, { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/modals/FormModal';
import Field from '../../components/forms/Field';
import { SkeletonBlock } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import { fmtDateTime } from '../../utils/format';

export default function PortalSupport() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get('/portal/tickets').then((r) => r.data));
  const projects = useFetch(() => api.get('/portal/overview').then((r) => r.data));
  const [add, setAdd] = useState(false); const [reply, setReply] = useState({}); const [open, setOpen] = useState(null);
  const send = async (t) => { try { await api.post(`/portal/tickets/${t._id}/reply`, { message: reply[t._id] }); setReply({ ...reply, [t._id]: '' }); toast.success('Reply sent'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<div className="portal-support-page">
    <div className="portal-page-heading"><div><h1 className="mb-1">Support</h1></div><button className="btn btn-primary" onClick={() => setAdd(true)}><i className="bi bi-plus-lg me-1" />New ticket</button></div>
    {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonBlock lines={5} /> : !data.data.length ? <EmptyState icon="bi-life-preserver" title="No tickets" text="Need help? Raise a ticket and we’ll respond." /> : data.data.map((t) => (
      <div className="card-x portal-ticket-card mb-3" key={t._id}><button className="card-head portal-ticket-head w-100 border-0 text-start" onClick={() => setOpen(open === t._id ? null : t._id)}><div><b>{t.number}</b> · {t.subject}<div className="tiny text-muted-x">{fmtDateTime(t.updatedAt)}{t.project ? ` · ${t.project.name}` : ''}</div></div><StatusBadge status={t.status} /></button>
        {open === t._id && <div className="card-body-x portal-ticket-body"><div className="portal-message portal-message-client small">{t.message}</div>{t.replies.map((r) => <div key={r._id} className={`portal-message small ${r.from === 'admin' ? 'portal-message-support' : 'portal-message-client'}`}><b>{r.from === 'admin' ? `${r.authorName} (support)` : 'You'}</b> <span className="tiny text-muted-x">{fmtDateTime(r.at)}</span><div>{r.message}</div></div>)}
          {t.status !== 'Closed' && <div className="d-flex gap-2 mt-2"><input className="form-control" placeholder="Write a reply…" value={reply[t._id] || ''} onChange={(e) => setReply({ ...reply, [t._id]: e.target.value })} /><button className="btn btn-primary" disabled={!reply[t._id]?.trim()} onClick={() => send(t)}>Send</button></div>}</div>}</div>))}
    <FormModal show={add} title="New support ticket" size="md" initial={{ priority: 'Medium' }} validate={(v) => ({ ...(!v.subject || v.subject.trim().length < 3 ? { subject: 'Add a subject' } : {}), ...(!v.message || v.message.trim().length < 5 ? { message: 'Describe the issue' } : {}) })} onClose={() => setAdd(false)}
      onSubmit={async (v) => { await api.post('/portal/tickets', { ...v, project: v.project || undefined }); toast.success('Ticket created'); reload(); }}>
      {({ values: v, set, errors }) => <div className="row g-3"><Field className="col-12" label="Subject" name="subject" value={v.subject} onChange={set} error={errors.subject} required /><Field className="col-md-6" label="Project (optional)" name="project" value={v.project} onChange={set} options={[{ value: '', label: '— General —' }, ...(projects.data?.data.projects || []).map((p) => ({ value: p._id, label: p.name }))]} /><Field className="col-md-6" label="Priority" name="priority" value={v.priority} onChange={set} options={['Low', 'Medium', 'High']} /><Field className="col-12" label="Message" name="message" rows={4} value={v.message} onChange={set} error={errors.message} required /></div>}
    </FormModal>
  </div>);
}
