import { useState } from 'react';
import { initials, fmtDate, tone } from '../../utils/format';
import './Tasks.css';

export const COLUMNS = ['To Do', 'In Progress', 'Review', 'Completed'];
const ICON = { 'To Do': 'bi-circle', 'In Progress': 'bi-arrow-repeat', Review: 'bi-eye', Completed: 'bi-check-circle-fill' };

/** Drag-and-drop Kanban (native HTML5 DnD) with accessible move buttons for touch devices. */
export default function Kanban({ tasks, onMove, onOpen, onDelete, showProject }) {
  const [over, setOver] = useState(null);
  const [dragId, setDragId] = useState(null);
  return (
    <div className="kanban">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className={`kcol ${over === col ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(col); }} onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain') || dragId; const t = tasks.find((x) => x._id === id); if (t && t.status !== col) onMove(t, col); setDragId(null); }}>
            <div className="kcol-head"><i className={`bi ${ICON[col]}`} />{col}<span>{items.length}</span></div>
            <div className="kcol-body">
              {items.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'Completed';
                const idx = COLUMNS.indexOf(t.status);
                return (
                  <div key={t._id} className={`ktask ${dragId === t._id ? 'dragging' : ''}`} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t._id); setDragId(t._id); }} onDragEnd={() => setDragId(null)}>
                    <div className="d-flex justify-content-between align-items-start gap-2"><button className="ktask-title" onClick={() => onOpen(t)}>{t.title}</button><span className={`badge-soft s-${tone(t.priority) || 'x'}`}>{t.priority}</span></div>
                    {showProject && t.project && <div className="tiny text-muted-x mt-1">{t.project.name}</div>}
                    <div className="d-flex justify-content-between align-items-center mt-2">
                      <div className={`tiny ${overdue ? 'text-danger fw-semibold' : 'text-muted-x'}`}>{t.dueDate ? <><i className="bi bi-calendar-event me-1" />{fmtDate(t.dueDate)}</> : 'No due date'}</div>
                      {t.assignedTo ? <span className="avatar sm" style={{ background: t.assignedTo.avatarColor }} title={t.assignedTo.name}>{initials(t.assignedTo.name)}</span> : <span className="tiny text-muted-x">Unassigned</span>}
                    </div>
                    {onDelete && <button className="ktask-del" onClick={() => onDelete(t)} aria-label="Delete task"><i className="bi bi-trash" /></button>}
                    <div className="kmove"><button disabled={idx === 0} onClick={() => onMove(t, COLUMNS[idx - 1])} aria-label="Move left"><i className="bi bi-chevron-left" /></button><button disabled={idx === COLUMNS.length - 1} onClick={() => onMove(t, COLUMNS[idx + 1])} aria-label="Move right"><i className="bi bi-chevron-right" /></button></div>
                  </div>);
              })}
              {!items.length && <div className="kempty">Drop tasks here</div>}
            </div>
          </div>);
      })}
    </div>
  );
}
