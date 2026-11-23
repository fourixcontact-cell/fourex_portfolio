import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, put, del, download, openBlob, upload } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/common/StatCard';
import { SkeletonProfile, SkeletonStatCards } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import FormModal from '../../components/modals/FormModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import Field from '../../components/forms/Field';
import Kanban from '../tasks/Kanban';
import TaskModal from '../tasks/TaskModal';
import { ProjectForm, toForm, toBody, validateProject, STATUSES } from './Projects';
import PaymentForm from '../finance/PaymentForm';
import { money, fmtDate, fmtDateTime, clientName, timeAgo } from '../../utils/format';
import './ProjectDetail.css';

const TABS = [['overview', 'Overview', 'bi-info-circle'], ['tasks', 'Tasks', 'bi-check2-square'], ['milestones', 'Milestones', 'bi-flag'], ['money', 'Money', 'bi-cash-stack'], ['documents', 'Documents', 'bi-folder2-open'], ['handover', 'Handover & certificate', 'bi-patch-check'], ['portfolio', 'Portfolio', 'bi-globe2'], ['feedback', 'Changes & feedback', 'bi-chat-square-text'], ['team', 'Contribution', 'bi-people'], ['activity', 'Activity', 'bi-activity']];
const AREAS = ['Development', 'UI/UX', 'Client Communication', 'Lead Acquisition', 'Deployment', 'Documentation', 'Other'];

export default function ProjectDetail() {
  const { id } = useParams(); const toast = useToast(); const nav = useNavigate();
  const { data, loading, error, reload, setData } = useFetch(() => get(`/projects/${id}`), [id]);
  const clients = useFetch(() => get('/clients', { limit: 100 })); const admins = useFetch(() => get('/admins'));
  const [tab, setTab] = useState('overview'); const [editing, setEditing] = useState(false);
  const d = data?.data; const p = d?.project;

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const ctx = { id, d, p, reload, toast, admins: admins.data?.data };

  return (
    <>
      <PageHeader title={p?.name || 'Project'} crumbs={[{ label: 'Projects', to: '/crm/projects' }, { label: p?.projectId || '…' }]}
        subtitle={p && <span className="d-inline-flex gap-2 align-items-center flex-wrap"><StatusBadge status={p.status} /><span>{clientName(p.client)}</span></span>}
        actions={p && <><select className="form-select" style={{ width: 170 }} value={p.status} aria-label="Change status" onChange={async (e) => { try { await put(`/projects/${id}`, { status: e.target.value }); toast.success(`Status: ${e.target.value}`); reload(); } catch (err) { toast.error(errMsg(err)); } }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button className="btn btn-primary" onClick={() => setEditing(true)}><i className="bi bi-pencil me-1" />Edit</button></>} />
      {loading || !p ? <><SkeletonStatCards count={4} /><div className="mt-3"><SkeletonProfile /></div></> : (<>
        <div className="row g-3 mb-3">
          <div className="col-6 col-lg-3"><StatCard icon="bi-bullseye" label="Accepted value" value={money(p.acceptedAmount)} color="info" hint={`Quoted ${money(p.quotationAmount)}`} /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-cash-coin" label="Received" value={money(p.amountReceived)} color="success" hint="Confirmed payments" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-clock-history" label="Pending balance" value={money(p.pendingBalance)} color="warn" hint="Accepted − received" /></div>
          <div className="col-6 col-lg-3"><StatCard icon="bi-graph-up-arrow" label="Profit (actual)" value={money(p.profit)} color={p.profit >= 0 ? 'success' : 'danger'} hint={`Expenses ${money(p.totalExpenses)}`} /></div>
        </div>
        <div className="card-x">
          <div className="pd-tabs" role="tablist">{TABS.map(([k, l, i]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><i className={`bi ${i}`} /><span>{l}</span></button>)}</div>
          <div className="card-body-x" key={tab}>
            {tab === 'overview' && <Overview {...ctx} />}
            {tab === 'tasks' && <TasksTab {...ctx} />}
            {tab === 'milestones' && <MilestonesTab {...ctx} />}
            {tab === 'money' && <MoneyTab {...ctx} />}
            {tab === 'documents' && <DocsTab {...ctx} />}
            {tab === 'handover' && <HandoverTab {...ctx} />}
            {tab === 'portfolio' && <PortfolioTab {...ctx} />}
            {tab === 'feedback' && <FeedbackTab {...ctx} />}
            {tab === 'team' && <TeamTab {...ctx} />}
            {tab === 'activity' && <ActivityTab {...ctx} />}
          </div>
        </div>
      </>)}
      <FormModal show={editing} title={`Edit ${p?.projectId || 'project'}`} initial={p ? toForm(p) : {}} validate={validateProject} size="xl" onClose={() => setEditing(false)} onSubmit={async (v) => { await put(`/projects/${id}`, toBody(v)); toast.success('Project updated'); reload(); }}>{(f) => <ProjectForm {...f} clients={clients.data?.data} admins={admins.data?.data} />}</FormModal>
    </>
  );
}

function Overview({ p }) {
  return (
    <div className="row g-4">
      <div className="col-lg-8">
        <h6>Description</h6><p className="text-muted-x" style={{ whiteSpace: 'pre-wrap' }}>{p.description || 'No description yet.'}</p>
        <h6 className="mt-3">Progress</h6><div className="progress-x mb-1"><span style={{ width: `${p.progress}%` }} /></div><div className="small text-muted-x">{p.progress}% (updates automatically from completed tasks)</div>
        {p.internalNotes && <><h6 className="mt-4"><i className="bi bi-lock me-1" />Internal notes</h6><div className="pd-notes">{p.internalNotes}</div></>}
      </div>
      <div className="col-lg-4"><div className="pd-facts">
        {[['Category', p.category], ['Start', fmtDate(p.startDate)], ['Deadline', fmtDate(p.expectedDeadline)], ['Completed', fmtDate(p.completionDate)], ['Advance', money(p.advanceAmount)]].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        <div><span>Tech</span><b>{p.techStack?.length ? p.techStack.map((t) => <span className="tag" key={t}>{t}</span>) : '—'}</b></div>
        <div><span>Team</span><b>{p.team?.map((t) => t.name).join(', ') || '—'}</b></div>
        <div><span>Links</span><b>{p.githubUrl && <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" className="me-2"><i className="bi bi-github" /> Repo</a>}{p.liveUrl && <a href={p.liveUrl} target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right" /> Live</a>}{!p.githubUrl && !p.liveUrl && '—'}</b></div>
      </div></div>
    </div>
  );
}

function TasksTab({ id, d, reload, toast, admins }) {
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null);
  const move = async (t, status) => { try { await put(`/tasks/${t._id}`, { status }); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<>
    <div className="d-flex justify-content-between mb-3"><h6 className="mb-0">Task board</h6><button className="btn btn-primary btn-sm" onClick={() => setEdit({})}><i className="bi bi-plus-lg me-1" />Add task</button></div>
    {d.tasks.length ? <Kanban tasks={d.tasks} onMove={move} onOpen={setEdit} onDelete={setRemove} /> : <EmptyState icon="bi-check2-square" title="No tasks yet" text="Break the project into tasks and assign them to admins." />}
    {edit && <TaskModal task={edit} projects={[{ _id: id, projectId: d.project.projectId, name: d.project.name }]} admins={admins} fixedProject={id} onClose={() => setEdit(null)} onSaved={reload} />}
    <ConfirmModal show={!!remove} danger title="Delete task?" message={remove?.title} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/tasks/${remove._id}`); toast.success('Task deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
  </>);
}

function MilestonesTab({ id, d, reload, toast }) {
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null);
  const toggle = async (m) => { try { await put(`/projects/${id}/milestones/${m._id}`, { status: m.status === 'Completed' ? 'Pending' : 'Completed' }); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<>
    <div className="d-flex justify-content-between mb-3"><h6 className="mb-0">Milestones</h6><button className="btn btn-primary btn-sm" onClick={() => setEdit({ status: 'Pending' })}><i className="bi bi-plus-lg me-1" />Add milestone</button></div>
    {d.milestones.length ? d.milestones.map((m) => (
      <div key={m._id} className="ms-row"><button className={`ms-check ${m.status === 'Completed' ? 'on' : ''}`} onClick={() => toggle(m)} aria-label={m.status === 'Completed' ? 'Mark pending' : 'Mark complete'}><i className="bi bi-check-lg" /></button>
        <div className="flex-grow-1"><div className={`fw-semibold ${m.status === 'Completed' ? 'text-decoration-line-through text-muted-x' : ''}`}>{m.name}</div><div className="small text-muted-x">{m.description}</div><div className="tiny text-muted-x">Due {fmtDate(m.dueDate)}{m.completedAt ? ` · done ${fmtDate(m.completedAt)}` : ''}</div></div>
        <div className="text-end"><div className="fw-bold money">{m.paymentAmount ? money(m.paymentAmount) : '—'}</div><div className="tiny text-muted-x">planned payment</div></div>
        <button className="btn btn-ghost btn-icon" onClick={() => setEdit({ ...m, dueDate: m.dueDate?.slice(0, 10) })} aria-label="Edit"><i className="bi bi-pencil" /></button><button className="btn btn-ghost btn-icon text-danger" onClick={() => setRemove(m)} aria-label="Delete"><i className="bi bi-trash" /></button></div>)) : <EmptyState icon="bi-flag" title="No milestones" text="Milestones can carry a planned payment amount. Payments only count once you record them." />}
    <FormModal show={!!edit} title={edit?._id ? 'Edit milestone' : 'Add milestone'} initial={edit || {}} size="md" validate={(v) => (!v.name?.trim() ? { name: 'Name is required' } : {})} onClose={() => setEdit(null)}
      onSubmit={async (v) => { const b = { name: v.name, description: v.description, dueDate: v.dueDate || undefined, paymentAmount: Number(v.paymentAmount) || 0, status: v.status }; if (v._id) await put(`/projects/${id}/milestones/${v._id}`, b); else await post(`/projects/${id}/milestones`, b); toast.success('Milestone saved'); reload(); }}>
      {({ values: v, set, errors }) => <div className="row g-3"><Field className="col-12" label="Name" name="name" value={v.name} onChange={set} error={errors.name} required /><Field className="col-12" label="Description" name="description" rows={2} value={v.description} onChange={set} /><Field className="col-md-4" label="Due date" name="dueDate" type="date" value={v.dueDate} onChange={set} /><Field className="col-md-4" label="Payment amount (₹)" name="paymentAmount" type="number" min="0" value={v.paymentAmount} onChange={set} /><Field className="col-md-4" label="Status" name="status" value={v.status} onChange={set} options={['Pending', 'In Progress', 'Completed']} /></div>}
    </FormModal>
    <ConfirmModal show={!!remove} danger title="Delete milestone?" message={remove?.name} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/projects/${id}/milestones/${remove._id}`); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
  </>);
}

function MoneyTab({ id, d, p, reload, toast }) {
  const [pay, setPay] = useState(false); const [voiding, setVoiding] = useState(null);
  return (<>
    <div className="alert alert-light border small"><i className="bi bi-info-circle me-1" />Profit = <b>confirmed payments received</b> − <b>recorded expenses</b>. Quotation and accepted values are never counted as income.</div>
    <div className="d-flex justify-content-between mb-2"><h6 className="mb-0">Payments received</h6><button className="btn btn-primary btn-sm" onClick={() => setPay(true)}><i className="bi bi-plus-lg me-1" />Record payment</button></div>
    {d.payments.length ? <div className="table-responsive mb-4"><table className="table-x table-responsive-stack"><thead><tr><th>Receipt</th><th>Date</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{d.payments.map((x) => (
      <tr key={x._id}><td data-label="Receipt" className="fw-semibold">{x.receiptNumber}</td><td data-label="Date">{fmtDate(x.paidOn)}</td><td data-label="Type">{x.paymentType}</td><td data-label="Method">{x.method}</td><td data-label="Amount" className="money">{money(x.amount)}</td><td data-label="Status"><StatusBadge status={x.status} /></td>
        <td className="actions-cell text-end"><button className="btn btn-ghost btn-icon" onClick={() => download(`/payments/${x._id}/receipt`, `${x.receiptNumber}.pdf`).catch((e) => toast.error(errMsg(e)))} aria-label="Download receipt"><i className="bi bi-download" /></button>{x.status === 'confirmed' && <button className="btn btn-ghost btn-icon text-danger" onClick={() => setVoiding(x)} aria-label="Void payment"><i className="bi bi-x-octagon" /></button>}</td></tr>))}</tbody></table></div> : <EmptyState icon="bi-cash-coin" title="No payments recorded" text="Only record money you have actually received." />}
    <h6>Expenses</h6>
    {d.expenses.length ? <div className="table-responsive mb-4"><table className="table-x table-responsive-stack"><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th></tr></thead><tbody>{d.expenses.map((x) => <tr key={x._id}><td data-label="Date">{fmtDate(x.expenseDate)}</td><td data-label="Title">{x.title}</td><td data-label="Category">{x.category}</td><td data-label="Amount" className="money">{money(x.amount)}</td></tr>)}</tbody></table></div> : <p className="small text-muted-x">No expenses linked. Add them from the <Link to="/crm/expenses">Expenses</Link> page.</p>}
    <div className="row g-3"><div className="col-md-6"><h6>Quotations</h6>{d.quotations.length ? d.quotations.map((q) => <div key={q._id} className="dl-row"><span>{q.number}</span><span className="money">{money(q.grandTotal)}</span><StatusBadge status={q.status} /></div>) : <p className="small text-muted-x">None linked.</p>}</div>
      <div className="col-md-6"><h6>Invoices</h6>{d.invoices.length ? d.invoices.map((i) => <div key={i._id} className="dl-row"><span>{i.number}</span><span className="money">{money(i.balance)} due</span><StatusBadge status={i.status} /></div>) : <p className="small text-muted-x">None yet.</p>}</div></div>
    <FormModal show={pay} title="Record a received payment" size="lg" initial={{ project: id, paymentType: 'Partial', method: 'Bank Transfer', paidOn: new Date().toISOString().slice(0, 10) }} onClose={() => setPay(false)} submitLabel="Record payment"
      validate={(v) => (Number(v.amount) > 0 ? {} : { amount: 'Enter the amount received' })}
      onSubmit={async (v) => { await post('/payments', { ...v, amount: Number(v.amount), invoice: v.invoice || undefined }); toast.success('Payment recorded'); reload(); }}>
      {(f) => <PaymentForm {...f} invoices={d.invoices.filter((i) => i.balance > 0)} />}
    </FormModal>
    <ConfirmModal show={!!voiding} danger title="Void this payment?" message={`Receipt ${voiding?.receiptNumber} (${money(voiding?.amount)}) will stop counting as income. It remains in history.`} requireText="Reason for voiding (min 5 characters)" confirmLabel="Void payment" onClose={() => setVoiding(null)}
      onConfirm={async (reason) => { try { await post(`/payments/${voiding._id}/void`, { reason }); toast.success('Payment voided'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
  </>);
}

function DocsTab({ id, d, reload, toast }) {
  const [file, setFile] = useState(null); const [cat, setCat] = useState('Project File'); const [vis, setVis] = useState(false); const [busy, setBusy] = useState(false); const [remove, setRemove] = useState(null);
  const submit = async (e) => { e.preventDefault(); if (!file) return; setBusy(true); try { const fd = new FormData(); fd.append('files', file); fd.append('project', id); fd.append('client', d.project.client._id); fd.append('category', cat); fd.append('visibleToClient', vis); await upload('/documents', fd); toast.success('Uploaded'); setFile(null); e.target.reset(); reload(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); } };
  return (<>
    <form onSubmit={submit} className="d-flex gap-2 flex-wrap mb-3 align-items-end"><div><label className="form-label">File</label><input type="file" className="form-control" onChange={(e) => setFile(e.target.files[0])} /></div><div><label className="form-label">Category</label><select className="form-select" value={cat} onChange={(e) => setCat(e.target.value)}>{['Agreement', 'Quotation', 'Invoice', 'Receipt', 'Project File', 'Handover', 'Certificate', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></div><div className="form-check form-switch mb-2"><input className="form-check-input" type="checkbox" id="vis" checked={vis} onChange={(e) => setVis(e.target.checked)} /><label htmlFor="vis" className="form-check-label small">Visible to client</label></div><button className="btn btn-primary" disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload'}</button></form>
    {d.documents.length ? d.documents.map((x) => <div key={x._id} className="dl-row"><div className="min-w-0"><i className="bi bi-file-earmark me-2" />{x.originalName}<span className="badge-soft ms-2">{x.category}</span>{x.visibleToClient && <span className="badge-soft s-info ms-1">Client can see</span>}<div className="tiny text-muted-x">{fmtDate(x.createdAt)} · {(x.size / 1024).toFixed(0)} KB</div></div><div className="d-flex gap-1"><button className="btn btn-ghost btn-icon" onClick={() => download(`/documents/${x._id}/download`, x.originalName).catch((e) => toast.error(errMsg(e)))} aria-label="Download"><i className="bi bi-download" /></button><button className="btn btn-ghost btn-icon text-danger" onClick={() => setRemove(x)} aria-label="Delete"><i className="bi bi-trash" /></button></div></div>) : <EmptyState icon="bi-folder2-open" title="No documents" />}
    <ConfirmModal show={!!remove} danger title="Delete document?" message={remove?.originalName} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/documents/${remove._id}`); toast.success('Deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
  </>);
}

function HandoverTab({ id, d, p, reload, toast }) {
  const elig = useFetch(() => get(`/projects/${id}/certificate/eligibility`), [id, p.status, p.handoverConfirmed?.confirmed, p.certificate?.number, d.checklistComplete]);
  const [newItem, setNewItem] = useState(''); const [confirmH, setConfirmH] = useState(false); const [gen, setGen] = useState(null);
  const e = elig.data?.data; const done = p.handoverChecklist.filter((i) => i.done).length;
  const toggle = async (it) => { try { await put(`/projects/${id}/checklist/${it._id}`, { done: !it.done }); reload(); } catch (err) { toast.error(errMsg(err)); } };
  return (<div className="row g-4">
    <div className="col-lg-6"><div className="d-flex justify-content-between"><h6>Handover checklist</h6><span className="small text-muted-x">{done}/{p.handoverChecklist.length}</span></div><div className="progress-x mb-3"><span style={{ width: `${(done / Math.max(1, p.handoverChecklist.length)) * 100}%` }} /></div>
      {p.handoverChecklist.map((it) => <label key={it._id} className="hc-item"><input type="checkbox" className="form-check-input" checked={it.done} onChange={() => toggle(it)} /><span className={it.done ? 'text-decoration-line-through text-muted-x' : ''}>{it.label}</span></label>)}
      <form className="d-flex gap-2 mt-3" onSubmit={async (ev) => { ev.preventDefault(); if (!newItem.trim()) return; try { await post(`/projects/${id}/checklist`, { label: newItem }); setNewItem(''); reload(); } catch (err) { toast.error(errMsg(err)); } }}><input className="form-control" placeholder="Add checklist item…" value={newItem} onChange={(ev) => setNewItem(ev.target.value)} /><button className="btn btn-soft">Add</button></form></div>
    <div className="col-lg-6"><h6>Completion certificate</h6>
      <div className="card-x card-body-x bg-light">
        <ul className="elig">
          <li className={p.status === 'Completed' ? 'ok' : ''}><i className={`bi ${p.status === 'Completed' ? 'bi-check-circle-fill' : 'bi-circle'}`} />Project status is Completed</li>
          <li className={d.checklistComplete ? 'ok' : ''}><i className={`bi ${d.checklistComplete ? 'bi-check-circle-fill' : 'bi-circle'}`} />Handover checklist fully completed</li>
          <li className={p.handoverConfirmed?.confirmed ? 'ok' : ''}><i className={`bi ${p.handoverConfirmed?.confirmed ? 'bi-check-circle-fill' : 'bi-circle'}`} />Handover confirmed by an admin{p.handoverConfirmed?.at && <span className="tiny text-muted-x"> ({fmtDate(p.handoverConfirmed.at)})</span>}</li>
        </ul>
        {!p.handoverConfirmed?.confirmed && <button className="btn btn-soft w-100 mb-2" disabled={p.status !== 'Completed' || !d.checklistComplete} onClick={() => setConfirmH(true)}><i className="bi bi-shield-check me-1" />Confirm handover</button>}
        {e?.issued ? (<>
          <div className="alert alert-success small py-2"><b>{e.certificate.number}</b> issued {fmtDate(e.certificate.issuedAt)}{e.certificate.regenerations > 0 ? ` · regenerated ${e.certificate.regenerations}×` : ''}</div>
          <div className="d-flex gap-2 flex-wrap"><button className="btn btn-primary" onClick={() => download(`/projects/${id}/certificate/download`, `${e.certificate.number}.pdf`).catch((x) => toast.error(errMsg(x)))}><i className="bi bi-download me-1" />Download</button><button className="btn btn-ghost" onClick={() => openBlob(`/projects/${id}/certificate/preview`).catch((x) => toast.error(errMsg(x)))}>Preview</button><button className="btn btn-ghost text-danger" onClick={() => setGen('regenerate')}>Regenerate…</button></div>
        </>) : (<div className="d-flex gap-2 flex-wrap"><button className="btn btn-primary" disabled={!e?.eligible} onClick={() => setGen('new')}><i className="bi bi-patch-check me-1" />Generate certificate</button><button className="btn btn-ghost" disabled={!e?.eligible} onClick={() => openBlob(`/projects/${id}/certificate/preview`).catch((x) => toast.error(errMsg(x)))}>Preview</button></div>)}
        {e && !e.eligible && !e.issued && <div className="tiny text-muted-x mt-2">{e.problems.join(' · ')}</div>}
      </div></div>
    <ConfirmModal show={confirmH} title="Confirm handover?" message="This confirms the client has received all deliverables and the handover checklist is accurate. It is logged under your name." confirmLabel="Confirm handover" onClose={() => setConfirmH(false)} onConfirm={async () => { try { await post(`/projects/${id}/handover/confirm`); toast.success('Handover confirmed'); reload(); } catch (err) { toast.error(errMsg(err)); throw err; } }} />
    <ConfirmModal show={!!gen} title={gen === 'regenerate' ? 'Regenerate certificate?' : 'Issue completion certificate?'} message={gen === 'regenerate' ? 'The existing certificate number is kept; the file is replaced. This action is audit-logged.' : 'A certificate number will be assigned and the PDF stored against this project.'} requireText={gen === 'regenerate' ? 'Reason for regenerating (min 5 characters)' : undefined} confirmLabel={gen === 'regenerate' ? 'Regenerate' : 'Issue certificate'} onClose={() => setGen(null)}
      onConfirm={async (reason) => { try { await post(`/projects/${id}/certificate`, { confirm: true, regenerate: gen === 'regenerate', reason }); toast.success('Certificate ready'); reload(); elig.reload(); } catch (err) { toast.error(errMsg(err)); throw err; } }} />
  </div>);
}

function PortfolioTab({ id, p, reload, toast }) {
  const pf = p.portfolio || {};
  const [v, setV] = useState({ visible: !!pf.visible, featured: !!pf.featured, title: pf.title || '', summary: pf.summary || '', caseStudy: pf.caseStudy || '', coverImage: pf.coverImage || '', screenshots: (pf.screenshots || []).join('\n'), clientDisplayName: pf.clientDisplayName || '' });
  const [busy, setBusy] = useState(false); const [errors, setErrors] = useState({});
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setErrors({}); try { await put(`/projects/${id}/portfolio`, { ...v, screenshots: v.screenshots.split('\n').map((s) => s.trim()).filter(Boolean) }); toast.success('Portfolio settings saved'); reload(); } catch (err) { toast.error(errMsg(err)); setErrors(Object.fromEntries((err.response?.data?.details || []).map((x) => [x.field, x.message]))); } finally { setBusy(false); } };
  return (
    <form onSubmit={save}>
      <div className="alert alert-light border small"><i className="bi bi-shield-lock me-1" />Only fields on this tab are ever shown publicly. Client details, finances, documents and internal notes are <b>never</b> exposed.</div>
      <div className="form-check form-switch fs-6 mb-3"><input className="form-check-input" type="checkbox" id="pv" checked={v.visible} onChange={(e) => set('visible', e.target.checked)} /><label className="form-check-label fw-semibold" htmlFor="pv">Show in public portfolio</label></div>
      <div className="row g-3">
        <Field className="col-md-8" label="Public title" name="title" value={v.title} onChange={set} hint={`Defaults to “${p.name}”`} />
        <div className="col-md-4 d-flex align-items-end"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" id="pf" checked={v.featured} onChange={(e) => set('featured', e.target.checked)} /><label className="form-check-label" htmlFor="pf">Featured</label></div></div>
        <Field className="col-12" label="Public summary" name="summary" rows={3} value={v.summary} onChange={set} hint="Required to publish. Max 600 characters." maxLength={600} />
        <Field className="col-12" label="Case study" name="caseStudy" rows={6} value={v.caseStudy} onChange={set} />
        <Field className="col-md-6" label="Cover image URL" name="coverImage" value={v.coverImage} onChange={set} error={errors.coverImage} placeholder="https://…" />
        <Field className="col-md-6" label="Client name to display (optional)" name="clientDisplayName" value={v.clientDisplayName} onChange={set} hint="Leave empty to keep the client anonymous" />
        <Field className="col-12" label="Screenshot URLs (one per line)" name="screenshots" rows={3} value={v.screenshots} onChange={set} />
      </div>
      <button className="btn btn-primary mt-3" disabled={busy}>{busy ? 'Saving…' : 'Save portfolio settings'}</button>
    </form>
  );
}

function FeedbackTab({ id, p, reload, toast }) {
  const [cr, setCr] = useState(false); const [fb, setFb] = useState(false); const [decide, setDecide] = useState(null);
  return (<div className="row g-4">
    <div className="col-lg-6"><div className="d-flex justify-content-between mb-2"><h6 className="mb-0">Change requests</h6><button className="btn btn-soft btn-sm" onClick={() => setCr(true)}>Add</button></div>
      {p.changeRequests.length ? p.changeRequests.map((c) => <div key={c._id} className="cr-card"><div className="d-flex justify-content-between gap-2"><b>{c.title}</b><StatusBadge status={c.status} /></div><div className="small text-muted-x">{c.description}</div><div className="tiny text-muted-x mt-1">By {c.requesterName || c.requestedBy} · {fmtDate(c.createdAt)}{c.estimatedCost ? ` · est. ${money(c.estimatedCost)}` : ''}</div>{c.decisionNote && <div className="small mt-1"><i className="bi bi-chat-left-text me-1" />{c.decisionNote}</div>}<button className="btn btn-link btn-sm p-0 mt-1" onClick={() => setDecide(c)}>Update status</button></div>) : <EmptyState icon="bi-arrow-repeat" title="No change requests" />}</div>
    <div className="col-lg-6"><div className="d-flex justify-content-between mb-2"><h6 className="mb-0">Client feedback</h6><button className="btn btn-soft btn-sm" onClick={() => setFb(true)}>Log feedback</button></div>
      {p.feedback.length ? p.feedback.slice().reverse().map((f) => <div key={f._id} className="cr-card"><div className="d-flex justify-content-between"><b>{f.authorName} <span className="badge-soft">{f.from}</span></b>{f.rating && <span className="text-warning">{'★'.repeat(f.rating)}</span>}</div><div className="small">{f.message}</div><div className="tiny text-muted-x">{fmtDateTime(f.createdAt)}</div></div>) : <EmptyState icon="bi-chat-square-text" title="No feedback yet" />}</div>
    <FormModal show={cr} title="Add change request" size="md" initial={{}} validate={(v) => (!v.title?.trim() ? { title: 'Title required' } : {})} onClose={() => setCr(false)} onSubmit={async (v) => { await post(`/projects/${id}/change-requests`, { title: v.title, description: v.description, estimatedCost: Number(v.estimatedCost) || 0 }); toast.success('Added'); reload(); }}>
      {({ values: v, set, errors }) => <div className="row g-3"><Field className="col-12" label="Title" name="title" value={v.title} onChange={set} error={errors.title} required /><Field className="col-12" label="Description" name="description" rows={3} value={v.description} onChange={set} /><Field className="col-12" label="Estimated cost (₹)" name="estimatedCost" type="number" min="0" value={v.estimatedCost} onChange={set} /></div>}</FormModal>
    <FormModal show={!!decide} title={`Update: ${decide?.title}`} size="md" initial={{ status: decide?.status, decisionNote: decide?.decisionNote, estimatedCost: decide?.estimatedCost }} onClose={() => setDecide(null)} onSubmit={async (v) => { await put(`/projects/${id}/change-requests/${decide._id}`, v); toast.success('Updated'); reload(); }}>
      {({ values: v, set }) => <div className="row g-3"><Field className="col-md-6" label="Status" name="status" value={v.status} onChange={set} options={['Pending', 'Approved', 'Rejected', 'Implemented']} /><Field className="col-md-6" label="Estimated cost (₹)" name="estimatedCost" type="number" min="0" value={v.estimatedCost} onChange={set} /><Field className="col-12" label="Decision note" name="decisionNote" rows={2} value={v.decisionNote} onChange={set} /></div>}</FormModal>
    <FormModal show={fb} title="Log client feedback" size="md" initial={{ rating: '' }} validate={(v) => (!v.message?.trim() ? { message: 'Message required' } : {})} onClose={() => setFb(false)} onSubmit={async (v) => { await post(`/projects/${id}/feedback`, { message: v.message, rating: v.rating ? Number(v.rating) : undefined }); toast.success('Logged'); reload(); }}>
      {({ values: v, set, errors }) => <div className="row g-3"><Field className="col-12" label="Feedback" name="message" rows={3} value={v.message} onChange={set} error={errors.message} required /><Field className="col-md-4" label="Rating" name="rating" value={v.rating} onChange={set} options={['', '1', '2', '3', '4', '5']} /></div>}</FormModal>
  </div>);
}

function TeamTab({ id, p, reload, toast, admins }) {
  const [add, setAdd] = useState(false);
  const totals = {}; (p.contributions || []).forEach((c) => { const n = c.admin?.name || '—'; totals[n] = (totals[n] || 0) + (c.hours || 0); });
  return (<>
    <div className="alert alert-light border small"><i className="bi bi-info-circle me-1" />Contribution logs are informational. They do <b>not</b> determine ownership or profit sharing.</div>
    <div className="d-flex justify-content-between mb-2"><h6 className="mb-0">Contribution log</h6><button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}><i className="bi bi-plus-lg me-1" />Log contribution</button></div>
    {p.contributions.length ? <div className="table-responsive"><table className="table-x table-responsive-stack"><thead><tr><th>Admin</th><th>Area</th><th>Hours</th><th>Note</th><th>Date</th></tr></thead><tbody>{p.contributions.slice().reverse().map((c) => <tr key={c._id}><td data-label="Admin">{c.admin?.name}</td><td data-label="Area"><span className="badge-soft">{c.area}</span></td><td data-label="Hours">{c.hours}</td><td data-label="Note">{c.note || '—'}</td><td data-label="Date">{fmtDate(c.at)}</td></tr>)}</tbody></table></div> : <EmptyState icon="bi-people" title="No contributions logged" />}
    <FormModal show={add} title="Log contribution" size="md" initial={{ area: 'Development', hours: '' }} validate={(v) => (!v.admin ? { admin: 'Choose an admin' } : {})} onClose={() => setAdd(false)} onSubmit={async (v) => { await post(`/projects/${id}/contributions`, { admin: v.admin, area: v.area, hours: Number(v.hours) || 0, note: v.note }); toast.success('Logged'); reload(); }}>
      {({ values: v, set, errors }) => <div className="row g-3"><Field className="col-md-6" label="Admin" name="admin" value={v.admin} onChange={set} error={errors.admin} options={[{ value: '', label: '— Select —' }, ...(admins || []).map((a) => ({ value: a._id, label: a.name }))]} /><Field className="col-md-6" label="Area" name="area" value={v.area} onChange={set} options={AREAS} /><Field className="col-md-4" label="Hours" name="hours" type="number" min="0" step="0.5" value={v.hours} onChange={set} /><Field className="col-12" label="Note" name="note" rows={2} value={v.note} onChange={set} /></div>}</FormModal>
  </>);
}

function ActivityTab({ d }) {
  return d.activity.length ? <div className="timeline">{d.activity.map((a) => <div key={a._id} className="tl-item"><span className="tl-dot" /><div><div className="small fw-semibold">{a.description || `${a.action} ${a.module}`}</div><div className="tiny text-muted-x">{a.adminName || 'System'} · {fmtDateTime(a.createdAt)} ({timeAgo(a.createdAt)})</div></div></div>)}</div> : <EmptyState icon="bi-activity" title="No activity recorded" />;
}
