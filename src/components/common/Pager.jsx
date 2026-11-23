export default function Pager({ meta, onPage }) {
  if (!meta) return null;
  const { page, pages, total, limit } = meta;
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  return (
    <div className="pager">
      <span>{total ? `Showing ${from}–${to} of ${total}` : 'No results'}</span>
      <div className="d-flex gap-1 align-items-center">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><i className="bi bi-chevron-left" /></button>
        <span className="px-2">Page {page} / {pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><i className="bi bi-chevron-right" /></button>
      </div>
    </div>
  );
}
