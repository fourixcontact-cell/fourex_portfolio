import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, put, del } from '../../services/crm';
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
import { initials } from '../../utils/format';
import './Clients.css';

export const CLIENT_TYPES = ['Individual', 'Startup', 'SME', 'Enterprise', 'Agency', 'Other'];

export function ClientForm({ values: v, set, errors }) {
  return (
    <div className="row g-3">
      <Field className="col-md-6" label="Company" name="company" value={v.company} onChange={set} />
      <Field className="col-md-6" label="Contact person" name="contactPerson" value={v.contactPerson} onChange={set} error={errors.contactPerson} required />
      <Field className="col-md-6" label="Email" name="email" type="email" value={v.email} onChange={set} error={errors.email} required />
      <Field className="col-md-6" label="Phone" name="phone" value={v.phone} onChange={set} error={errors.phone} />
      <Field className="col-md-4" label="Client type" name="clientType" value={v.clientType} onChange={set} options={CLIENT_TYPES} />
      <Field className="col-md-4" label="Country" name="country" value={v.country} onChange={set} />
      <Field className="col-md-4" label="GSTIN / Tax ID" name="gstin" value={v.gstin} onChange={set} />
      <Field className="col-12" label="Address" name="address" value={v.address} onChange={set} />
      <Field className="col-md-6" label="City" name="city" value={v.city} onChange={set} />
      <Field className="col-md-6" label="State" name="state" value={v.state} onChange={set} />
      <Field className="col-12" label="Notes" name="notes" rows={3} value={v.notes} onChange={set} />
    </div>
  );
}
export const validateClient = (v) => ({ ...(!v.contactPerson?.trim() ? { contactPerson: 'Contact person is required' } : {}), ...(!/^\S+@\S+\.\S+$/.test(v.email || '') ? { email: 'Valid email required' } : {}) });

export default function Clients() {
  const toast = useToast(); const nav = useNavigate();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [type, setType] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/clients', { page, search: q || undefined, type: type || undefined }), [page, q, type]);
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null);

  return (
    <>
      <PageHeader title="Clients" subtitle="Everyone you work with" crumbs={[{ label: 'Clients' }]} actions={<button className="btn btn-primary" onClick={() => setEdit({ clientType: 'Individual', country: 'India' })}><i className="bi bi-plus-lg me-1" />Add client</button>} />
      <div className="card-x">
        <div className="card-head flex-wrap">
          <div className="input-group" style={{ maxWidth: 340 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search clients…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search clients" /></div>
          <select className="form-select" style={{ width: 170 }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type"><option value="">All types</option>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} onRowClick={(r) => nav(`/crm/clients/${r._id}`)}
          empty={<EmptyState icon="bi-people" title="No clients yet" text="Convert a won lead or add a client manually." />}
          columns={[
            { key: 'company', label: 'Client', render: (r) => <div className="d-flex align-items-center gap-2"><span className="avatar">{initials(r.company || r.contactPerson)}</span><div><div className="fw-semibold">{r.company || r.contactPerson}</div><div className="tiny text-muted-x">{r.clientCode}</div></div></div> },
            { key: 'contactPerson', label: 'Contact', render: (r) => <div><div className="small">{r.contactPerson}</div><div className="tiny text-muted-x">{r.email}</div></div> },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
            { key: 'country', label: 'Country', render: (r) => r.country || '—' },
            { key: 'clientType', label: 'Type', render: (r) => <span className="badge-soft">{r.clientType}</span> },
            { key: 'projectCount', label: 'Projects', render: (r) => r.projectCount }
          ]}
          actions={(r) => (<><button className="btn btn-ghost btn-icon" onClick={() => setEdit(r)} aria-label="Edit"><i className="bi bi-pencil" /></button><button className="btn btn-ghost btn-icon text-danger" onClick={() => setRemove(r)} aria-label="Archive"><i className="bi bi-archive" /></button></>)} />
      </div>
      <FormModal show={!!edit} title={edit?._id ? 'Edit client' : 'Add client'} initial={edit || {}} validate={validateClient} onClose={() => setEdit(null)}
        onSubmit={async (v) => { if (v._id) await put(`/clients/${v._id}`, v); else await post('/clients', v); toast.success(v._id ? 'Client updated' : 'Client added'); reload(); }}>{(p) => <ClientForm {...p} />}</FormModal>
      <ConfirmModal show={!!remove} danger title="Archive client?" message={`“${remove?.company || remove?.contactPerson}” will be archived. Projects, invoices and payment history are preserved.`} confirmLabel="Archive" onClose={() => setRemove(null)}
        onConfirm={async () => { try { await del(`/clients/${remove._id}`); toast.success('Client archived'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
