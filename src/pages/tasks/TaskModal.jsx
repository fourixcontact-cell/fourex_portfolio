import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { post, put } from '../../services/crm';
import { errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/modals/FormModal';
import Field from '../../components/forms/Field';
import { fmtDateTime } from '../../utils/format';
import { COLUMNS } from './Kanban';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const AREAS = ['Development', 'UI/UX', 'Client Communication', 'Lead Acquisition', 'Deployment', 'Documentation', 'Other'];

export default function TaskModal({ task, projects, admins, fixedProject, onClose, onSaved }) {
  const toast = useToast();
  const initial = task ? { ...task, project: task.project?._id || task.project || fixedProject || '', assignedTo: task.assignedTo?._id || task.assignedTo || '', dueDate: task.dueDate?.slice(0, 10) || '' } : {};
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(task?.comments || []);
  const addComment = async () => {
    if (!comment.trim()) return;
    try { const r = await post(`/tasks/${task._id}/comments`, { text: comment }); setComments(r.data); setComment(''); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <FormModal show={!!task} title={task?._id ? 'Edit task' : 'New task'} initial={initial} onClose={(saved) => { onClose(); if (saved) onSaved(); }}
      validate={(v) => ({ ...(!v.title?.trim() ? { title: 'Title is required' } : {}), ...(!v.project ? { project: 'Choose a project' } : {}) })}
      onSubmit={async (v) => { const body = { title: v.title, description: v.description, project: v.project, assignedTo: v.assignedTo || undefined, priority: v.priority || 'Medium', status: v.status || 'To Do', dueDate: v.dueDate || undefined, area: v.area || 'Development' }; if (v._id) await put(`/tasks/${v._id}`, body); else await post('/tasks', body); toast.success(v._id ? 'Task updated' : 'Task created'); }}>
      {({ values: v, set, errors }) => (
        <div className="row g-3">
          <Field className="col-12" label="Title" name="title" value={v.title} onChange={set} error={errors.title} required />
          <Field className="col-md-6" label="Project" name="project" value={v.project} onChange={set} error={errors.project} required disabled={!!(fixedProject || v._id)} options={[{ value: '', label: '— Select —' }, ...(projects || []).map((p) => ({ value: p._id, label: `${p.projectId} · ${p.name}` }))]} />
          <Field className="col-md-6" label="Assign to" name="assignedTo" value={v.assignedTo} onChange={set} options={[{ value: '', label: 'Unassigned' }, ...(admins || []).map((a) => ({ value: a._id, label: a.name }))]} />
          <Field className="col-md-3" label="Priority" name="priority" value={v.priority || 'Medium'} onChange={set} options={PRIORITIES} />
          <Field className="col-md-3" label="Status" name="status" value={v.status || 'To Do'} onChange={set} options={COLUMNS} />
          <Field className="col-md-3" label="Due date" name="dueDate" type="date" value={v.dueDate} onChange={set} />
          <Field className="col-md-3" label="Work area" name="area" value={v.area || 'Development'} onChange={set} options={AREAS} />
          <Field className="col-12" label="Description" name="description" rows={3} value={v.description} onChange={set} />
          {v._id && (<div className="col-12"><label className="form-label">Comments</label>
            <div className="d-flex gap-2 mb-2"><input className="form-control" value={comment} placeholder="Add a comment…" onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }} /><button type="button" className="btn btn-soft" onClick={addComment}>Post</button></div>
            {comments.map((c) => <div key={c._id} className="small border-bottom py-2"><b>{c.byName}</b> <span className="text-muted-x tiny">{fmtDateTime(c.at)}</span><div>{c.text}</div></div>)}</div>)}
        </div>)}
    </FormModal>
  );
}
export { Modal };
