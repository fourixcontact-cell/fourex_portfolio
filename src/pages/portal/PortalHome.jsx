import { Link } from 'react-router-dom';
import api from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';
import { SkeletonProjectCards } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import { money, fmtDate } from '../../utils/format';

export default function PortalHome() {
  const { client } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get('/portal/overview').then((r) => r.data));
  return (
    <div className="portal-home">
      <div className="portal-page-heading">
        <div><h1 className="mb-1">Hello, {client?.name?.split(' ')[0]}</h1><p className="text-muted-x mb-0">{data?.data?.client?.company || 'Your projects with us'}</p></div>
        <div className="portal-heading-icon" aria-hidden="true"><i className="bi bi-grid-1x2" /></div>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonProjectCards count={3} /> : !data.data.projects.length ? <EmptyState icon="bi-kanban" title="No projects yet" text="Your projects will appear here once they start." /> : (
        <div className="row g-3">{data.data.projects.map((p) => (
          <div className="col-md-6 col-xl-4" key={p._id}><Link to={`/portal/projects/${p._id}`} className="card-x hoverable card-body-x d-block text-reset h-100 portal-project-card">
            <div className="d-flex justify-content-between align-items-center mb-3"><span className="portal-project-id">{p.projectId}</span><StatusBadge status={p.status} /></div><h5>{p.name}</h5>
            <div className="progress-x my-3"><span style={{ width: `${p.progress}%` }} /></div>
            <div className="d-flex justify-content-between small text-muted-x"><span>{p.progress}% complete</span><span>Due {fmtDate(p.expectedDeadline)}</span></div>
            <div className="d-flex justify-content-between small mt-3"><span>Paid <b className="money">{money(p.amountReceived)}</b></span><span>Pending <b className="money">{money(p.pendingBalance)}</b></span></div>
            {p.certificate?.number && <div className="mt-2"><span className="badge-soft s-success"><i className="bi bi-patch-check" />Certificate issued</span></div>}
          </Link></div>))}</div>)}
    </div>
  );
}
