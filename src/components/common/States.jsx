export const EmptyState = ({ icon = 'bi-inbox', title = 'Nothing here yet', text, action }) => (
  <div className="state-box"><i className={`bi ${icon}`} /><h6>{title}</h6>{text && <p className="mb-2 small">{text}</p>}{action}</div>
);
export const ErrorState = ({ message, onRetry }) => (
  <div className="state-box error" role="alert"><i className="bi bi-exclamation-triangle" /><h6>Couldn’t load this</h6><p className="small mb-2">{message}</p>{onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}><i className="bi bi-arrow-clockwise me-1" />Try again</button>}</div>
);
export const Spinner = ({ dark }) => <span className={`spinner-x ${dark ? 'dark' : ''}`} role="status" aria-label="Loading" />;
