import { useState } from 'react';
import { get, post } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/modals/FormModal';
import Field from '../../components/forms/Field';
import { EmptyState } from '../../components/common/States';
import { fmtDateTime, clientName } from '../../utils/format';

export default function Tickets() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch(() => get('/tickets', { page, status: status || undefined }), [page, status]);
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHeader title="Support tickets" subtitle="Requests raised by clients in their portal" crumbs={[{ label: 'Support tickets' }]} />
      <div className="card-x">
        <div className="card-head"><select className="form-select" style={{ width: 170 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option>{['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={setOpen} empty={<EmptyState icon="bi-life-preserver" title="No tickets" text="Tickets from the client portal appear here." />}
          columns={[{ key: 'number', label: 'Ticket', render: (r) => <span className="fw-semibold">{r.number}</span> }, { key: 'subject', label: 'Subject' }, { key: 'client', label: 'Client', render: (r) => clientName(r.client) }, { key: 'project', label: 'Project', render: (r) => r.project?.name || '—' }, { key: 'priority', label: 'Priority', render: (r) => <StatusBadge status={r.priority} /> }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'updatedAt', label: 'Updated', render: (r) => fmtDateTime(r.updatedAt) }]} />
      </div>
      <FormModal show={!!open} title={`${open?.number} · ${open?.subject}`} initial={{ status: open?.status, message: '' }} submitLabel="Send / update" onClose={(s) => { setOpen(null); if (s) reload(); }}
        onSubmit={async (v) => { if (!v.message?.trim() && v.status === open.status) throw new Error('Write a reply or change the status'); await post(`/tickets/${open._id}/reply`, { message: v.message, status: v.status }); toast.success('Ticket updated'); }}>
        {({ values: v, set }) => (<>
          <div className="mb-3 p-3 rounded bg-light"><div className="tiny text-muted-x mb-1">{clientName(open?.client)} · {fmtDateTime(open?.createdAt)}</div>{open?.message}</div>
          {open?.replies.map((r) => <div key={r._id} className={`mb-2 p-2 rounded small ${r.from === 'admin' ? 'bg-primary bg-opacity-10' : 'bg-light'}`}><b>{r.authorName}</b> <span className="tiny text-muted-x">{fmtDateTime(r.at)}</span><div>{r.message}</div></div>)}
          <div className="row g-3 mt-1"><Field className="col-md-4" label="Status" name="status" value={v.status} onChange={set} options={['Open', 'In Progress', 'Resolved', 'Closed']} /><Field className="col-12" label="Reply" name="message" rows={3} value={v.message} onChange={set} /></div>
        </>)}
      </FormModal>
    </>
  );
}
