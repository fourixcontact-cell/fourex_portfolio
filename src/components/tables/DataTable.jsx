import { SkeletonTable } from '../loaders/Skeletons';
import { EmptyState, ErrorState } from '../common/States';
import Pager from '../common/Pager';

/**
 * columns: [{ key, label, render?(row), className? }]
 * On phones the table turns into stacked cards (data-label on each cell).
 */
export default function DataTable({ columns, rows, loading, error, onRetry, meta, onPage, empty, onRowClick, actions }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !rows?.length) return <SkeletonTable cols={Math.min(columns.length + (actions ? 1 : 0), 6)} />;
  if (!rows?.length) return empty || <EmptyState />;
  return (
    <>
      <div className="table-responsive" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
        <table className="table-x table-responsive-stack">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}{actions && <th />}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id || r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => <td key={c.key} data-label={c.label} className={c.className}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                {actions && <td className="actions-cell text-end" onClick={(e) => e.stopPropagation()}><div className="d-inline-flex gap-1">{actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager meta={meta} onPage={onPage} />
    </>
  );
}
