import { useState } from 'react';
import { get, put, del } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import Kanban from './Kanban';
import TaskModal from './TaskModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { Skel } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import './Tasks.css';

export default function Tasks() {
  const toast = useToast();
  const [project, setProject] = useState(''); const [assignee, setAssignee] = useState(''); const [overdue, setOverdue] = useState(false);
  const { data, loading, error, reload, setData } = useFetch(() => get('/tasks', { board: 'true', project: project || undefined, assignedTo: assignee || undefined, overdue: overdue ? 'true' : undefined }), [project, assignee, overdue]);
  const projects = useFetch(() => get('/projects', { limit: 100 })); const admins = useFetch(() => get('/admins'));
  const [edit, setEdit] = useState(null); const [remove, setRemove] = useState(null);

  const move = async (t, status) => {
    const prev = data;
    setData({ ...data, data: data.data.map((x) => (x._id === t._id ? { ...x, status } : x)) }); // optimistic
    try { await put(`/tasks/${t._id}`, { status }); } catch (e) { setData(prev); toast.error(errMsg(e)); }
  };
  return (
    <>
      <PageHeader title="Tasks" subtitle="Kanban board across projects" crumbs={[{ label: 'Tasks' }]} actions={<button className="btn btn-primary" onClick={() => setEdit({})}><i className="bi bi-plus-lg me-1" />New task</button>} />
      <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
        <select className="form-select" style={{ width: 240 }} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project"><option value="">All projects</option>{projects.data?.data.map((p) => <option key={p._id} value={p._id}>{p.projectId} · {p.name}</option>)}</select>
        <select className="form-select" style={{ width: 190 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee"><option value="">All admins</option>{admins.data?.data.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select>
        <div className="form-check form-switch ms-2"><input className="form-check-input" type="checkbox" id="od" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /><label htmlFor="od" className="form-check-label small">Overdue only</label></div>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="kanban">{[0, 1, 2, 3].map((i) => <div className="kcol" key={i}><Skel h={16} w="50%" className="mb-3" /><Skel h={80} r={11} className="mb-2" /><Skel h={80} r={11} /></div>)}</div>
        : !data.data.length && !project && !assignee && !overdue ? <EmptyState icon="bi-check2-square" title="No tasks yet" text="Create a task to start planning delivery." />
        : <Kanban tasks={data.data} showProject={!project} onMove={move} onOpen={setEdit} onDelete={setRemove} />}
      {edit && <TaskModal task={edit} projects={projects.data?.data} admins={admins.data?.data} fixedProject={project || undefined} onClose={() => setEdit(null)} onSaved={reload} />}
      <ConfirmModal show={!!remove} danger title="Delete task?" message={remove?.title} confirmLabel="Delete" onClose={() => setRemove(null)} onConfirm={async () => { try { await del(`/tasks/${remove._id}`); toast.success('Task deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
