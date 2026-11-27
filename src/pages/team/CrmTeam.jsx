import { get } from '../../services/crm';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/common/PageHeader';
import { SkeletonProfile } from '../../components/loaders/Skeletons';
import { ErrorState } from '../../components/common/States';
import { Link } from 'react-router-dom';
import './CrmTeam.css';

export default function CrmTeam() {
  const { data, loading, error, reload } = useFetch(() => get('/team'));
  return (
    <>
      <PageHeader title="Team" subtitle="The four admin accounts and their workload" crumbs={[{ label: 'Team' }]} actions={<Link to="/crm/reports" className="btn btn-ghost"><i className="bi bi-bar-chart-line me-1" />Contribution report</Link>} />
      {data?.notice && <div className="alert alert-light border small"><i className="bi bi-info-circle me-1" />{data.notice}</div>}
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="row g-3">{[0, 1, 2, 3].map((i) => <div className="col-md-6 col-xl-3" key={i}><SkeletonProfile /></div>)}</div> : (
        <div className="row g-3">{data.data.map((a) => (
          <div className="col-md-6 col-xl-3" key={a._id}><div className="card-x hoverable card-body-x text-center">
            <span className="avatar team-av" style={{ background: a.avatarColor }}>{a.name[0]}</span><h5 className="mt-3 mb-0">{a.name}</h5><div className="small text-muted-x mb-3">{a.email}</div>
            <div className="row g-2 text-center">{[['Projects', a.projects], ['Open tasks', a.openTasks], ['Done', a.tasksCompleted], ['Overdue', a.overdueTasks]].map(([k, v]) => <div className="col-6" key={k}><div className="team-stat"><div className={`fs-4 fw-bold ${k === 'Overdue' && v > 0 ? 'text-danger' : ''}`}>{v}</div><div className="tiny text-muted-x">{k}</div></div></div>)}</div>
          </div></div>))}</div>)}
    </>
  );
}
