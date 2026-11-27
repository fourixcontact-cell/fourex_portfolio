import { useState } from 'react';
import { get, put, del, upload, download } from '../../services/crm';
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
import { fmtDate, clientName } from '../../utils/format';

const CATS = ['Agreement', 'Quotation', 'Invoice', 'Receipt', 'Project File', 'Handover', 'Certificate', 'Other'];
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Documents() {
  const toast = useToast();
  const [page, setPage] = useState(1); const [cat, setCat] = useState(''); const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useFetch(() => get('/documents', { page, category: cat || undefined, search: q || undefined }), [page, cat, q]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const projects = useFetch(() => get('/projects', { limit: 100 }));
  const [up, setUp] = useState(false); const [files, setFiles] = useState([]); const [remove, setRemove] = useState(null);

  return (
    <>
      <PageHeader title="Documents" subtitle="Agreements, project files, receipts and handover documents" crumbs={[{ label: 'Documents' }]} actions={<button className="btn btn-primary" onClick={() => { setFiles([]); setUp(true); }}><i className="bi bi-upload me-1" />Upload</button>} />
      <div className="card-x">
        <div className="card-head flex-wrap"><div className="d-flex gap-2 flex-wrap"><div className="input-group" style={{ width: 260 }}><span className="input-group-text bg-white"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search file name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search documents" /></div><select className="form-select" style={{ width: 170 }} value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} aria-label="Category"><option value="">All categories</option>{CATS.concat('Expense Receipt').map((c) => <option key={c}>{c}</option>)}</select></div></div>
        <DataTable loading={loading} error={error} onRetry={reload} rows={data?.data} meta={data?.meta} onPage={setPage} empty={<EmptyState icon="bi-folder2-open" title="No documents" text="Upload agreements, project files and handover documents." />}
          columns={[
            { key: 'originalName', label: 'File', render: (r) => <span><i className="bi bi-file-earmark me-2 text-primary" />{r.originalName}</span> },
            { key: 'category', label: 'Category', render: (r) => <span className="badge-soft">{r.category}</span> },
            { key: 'client', label: 'Client', render: (r) => (r.client ? clientName(r.client) : '—') },
            { key: 'project', label: 'Project', render: (r) => r.project?.name || '—' },
            { key: 'size', label: 'Size', render: (r) => fmtSize(r.size) },
            { key: 'visibleToClient', label: 'Client access', render: (r) => <div className="form-check form-switch m-0"><input className="form-check-input" type="checkbox" checked={!!r.visibleToClient} aria-label="Visible to client" onClick={(e) => e.stopPropagation()} onChange={async (e) => { try { await put(`/documents/${r._id}/visibility`, { visibleToClient: e.target.checked }); reload(); } catch (err) { toast.error(errMsg(err)); } }} /></div> },
            { key: 'createdAt', label: 'Uploaded', render: (r) => <span className="small">{fmtDate(r.createdAt)}<div className="tiny text-muted-x">{r.uploadedBy?.name}</div></span> }
          ]}
          actions={(r) => (<><button className="btn btn-ghost btn-icon" aria-label="Download" onClick={() => download(`/documents/${r._id}/download`, r.originalName).catch((e) => toast.error(errMsg(e)))}><i className="bi bi-download" /></button><button className="btn btn-ghost btn-icon text-danger" aria-label="Delete" onClick={() => setRemove(r)}><i className="bi bi-trash" /></button></>)} />
      </div>
      <FormModal show={up} title="Upload documents" size="md" initial={{ category: 'Project File', visibleToClient: false }} submitLabel="Upload" onClose={() => setUp(false)}
        validate={() => (files.length ? {} : { files: 'Choose at least one file' })}
        onSubmit={async (v) => { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); fd.append('category', v.category); if (v.client) fd.append('client', v.client); if (v.project) fd.append('project', v.project); fd.append('visibleToClient', !!v.visibleToClient); await upload('/documents', fd); toast.success(`${files.length} file(s) uploaded`); reload(); }}>
        {({ values: v, set, errors }) => (<div className="row g-3">
          <div className="col-12"><label className="form-label">Files (max 5, 15 MB each)</label><input type="file" multiple className={`form-control ${errors.files ? 'is-invalid' : ''}`} onChange={(e) => setFiles([...e.target.files].slice(0, 5))} />{errors.files && <div className="form-text-error">{errors.files}</div>}<div className="tiny text-muted-x mt-1">Allowed: PDF, images, Office files, CSV, TXT, ZIP</div></div>
          <Field className="col-md-6" label="Category" name="category" value={v.category} onChange={set} options={CATS} />
          <Field className="col-md-6" label="Client" name="client" value={v.client} onChange={set} options={[{ value: '', label: '— None —' }, ...(clients.data?.data || []).map((c) => ({ value: c._id, label: clientName(c) }))]} />
          <Field className="col-12" label="Project" name="project" value={v.project} onChange={set} options={[{ value: '', label: '— None —' }, ...(projects.data?.data || []).map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} />
          <div className="col-12"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="dvc" checked={!!v.visibleToClient} onChange={(e) => set('visibleToClient', e.target.checked)} /><label className="form-check-label" htmlFor="dvc">Visible to the client in their portal</label></div></div>
        </div>)}
      </FormModal>
      <ConfirmModal show={!!remove} danger title="Delete document?" message={`“${remove?.originalName}” will be removed from the app. This is audit-logged.`} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/documents/${remove._id}`); toast.success('Document deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
