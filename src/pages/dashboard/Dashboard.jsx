import { Link } from 'react-router-dom';
import { get } from '../../services/crm';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import { SkeletonStatCards, Skel, SkeletonBlock } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import StatusBadge from '../../components/common/StatusBadge';
import { BarChart, Donut } from '../../components/charts/Charts';
import { money, fmtDate, fmtDateTime, timeAgo, clientName } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

const COLORS = ['#6A20E7', '#0891b2', '#16a34a', '#d97706', '#db2777', '#6A20E7', '#64748b', '#dc2626'];

function Panel({ title, action, children, loading, lines = 4 }) {
  return (<div className="card-x h-100"><div className="card-head"><h5>{title}</h5>{action}</div><div className="card-body-x">{loading ? <SkeletonBlock lines={lines} /> : children}</div></div>);
}

export default function Dashboard() {
  const { admin } = useAuth();
  const { data, loading, error, reload } = useFetch(() => get('/dashboard'));
  const team = useFetch(() => import('../../services/api').then(({ default: api }) => api.get('/auth/admins').then((r) => r.data)));
  const d = data?.data; const s = d?.stats;

  if (error) return (<><PageHeader title="Dashboard" /><ErrorState message={error} onRetry={reload} /></>);
  return (
    <>
      <PageHeader title={`Welcome back, ${admin?.name?.split(' ')[0] || ''}`} subtitle="Live figures from your database" actions={<><Link to="/crm/leads" className="btn btn-ghost">Leads</Link><Link to="/crm/projects" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />New project</Link></>} />

      {loading || !s ? <SkeletonStatCards count={8} /> : (
        <div className="row g-3 stagger">
          {[
            ['bi-bullseye', 'Total leads', s.totalLeads, 'primary'], ['bi-people', 'Total clients', s.totalClients, 'info'], ['bi-kanban', 'Total projects', s.totalProjects, 'purple'],
            ['bi-lightning-charge', 'Active projects', s.activeProjects, 'primary'], ['bi-patch-check', 'Completed', s.completedProjects, 'success'], ['bi-hourglass-split', 'Pending projects', s.pendingProjects, 'warn'],
            ['bi-file-earmark-text', 'Quotation value', money(s.totalQuotationValue), 'info', 'All non-archived quotations'], ['bi-check2-circle', 'Accepted quotation value', money(s.acceptedQuotationValue), 'success'],
            ['bi-cash-coin', 'Amount received', money(s.totalReceived), 'success', 'Confirmed payments only'], ['bi-clock-history', 'Outstanding', money(s.outstandingPayments), 'warn', 'Accepted − received'],
            ['bi-wallet2', 'Total expenses', money(s.totalExpenses), 'danger'], ['bi-graph-up-arrow', 'Net profit', money(s.netProfit), s.netProfit >= 0 ? 'success' : 'danger', 'Received − expenses'],
            ['bi-calendar-month', 'Revenue this month', money(s.monthlyRevenue), 'primary'], ['bi-calendar2-minus', 'Expenses this month', money(s.monthlyExpenses), 'danger'],
            ['bi-percent', 'Lead conversion', `${s.leadConversionRate}%`, 'purple', 'Won ÷ total leads']
          ].map(([i, l, v, c, h]) => <div className="col-6 col-md-4 col-xl-3" key={l}><StatCard icon={i} label={l} value={v} color={c} hint={h} /></div>)}
        </div>
      )}

      <div className="row g-3 mt-1">
        <div className="col-lg-8"><Panel title="Revenue (last 12 months)" loading={loading} lines={6}>{d && <BarChart data={d.revenueSeries} color="#6A20E7" />}</Panel></div>
        <div className="col-lg-4"><Panel title="Project status" loading={loading} lines={6}>{d && <Donut data={d.projectStatus} colors={COLORS} />}</Panel></div>
        <div className="col-lg-8"><Panel title="Expenses (last 12 months)" loading={loading} lines={6}>{d && <BarChart data={d.expenseSeries} color="#dc2626" />}</Panel></div>
        <div className="col-lg-4"><Panel title="Upcoming deadlines" loading={loading} action={<Link to="/crm/projects" className="small">All</Link>}>
          {d?.deadlines.length ? d.deadlines.map((p) => (<Link to={`/crm/projects/${p._id}`} key={p._id} className="dl-row"><div><div className="fw-semibold small">{p.name}</div><div className="tiny text-muted-x">{p.projectId}</div></div><div className="text-end"><div className={`small fw-semibold ${new Date(p.expectedDeadline) < new Date() ? 'text-danger' : ''}`}>{fmtDate(p.expectedDeadline)}</div><StatusBadge status={p.status} /></div></Link>)) : <EmptyState icon="bi-calendar-check" title="No upcoming deadlines" />}
        </Panel></div>

        <div className="col-lg-6"><Panel title="Project progress" loading={loading}>
          {d?.progress.length ? d.progress.map((p) => (<Link to={`/crm/projects/${p._id}`} key={p._id} className="d-block mb-3 text-reset"><div className="d-flex justify-content-between small mb-1"><b>{p.name}</b><span>{p.progress}%</span></div><div className="progress-x"><span style={{ width: `${p.progress}%` }} /></div></Link>)) : <EmptyState icon="bi-kanban" title="No active projects" />}
        </Panel></div>
        <div className="col-lg-6"><Panel title="Pending payments" loading={loading} action={<Link to="/crm/invoices" className="small">Invoices</Link>}>
          {d?.pendingInvoices.length ? d.pendingInvoices.map((i) => (<div key={i._id} className="dl-row"><div><div className="fw-semibold small">{i.number}</div><div className="tiny text-muted-x">{clientName(i.client)}</div></div><div className="text-end"><div className="fw-bold small money">{money(i.balance)}</div><div className={`tiny ${i.status === 'Overdue' ? 'text-danger' : 'text-muted-x'}`}>Due {fmtDate(i.dueDate)}</div></div></div>)) : <EmptyState icon="bi-check2-all" title="No pending payments" />}
        </Panel></div>

        <div className="col-lg-6"><Panel title="Recent leads" loading={loading} action={<Link to="/crm/leads" className="small">All</Link>}>
          {d?.recentLeads.length ? d.recentLeads.map((l) => (<div key={l._id} className="dl-row"><div><div className="fw-semibold small">{l.name}{l.company ? ` · ${l.company}` : ''}</div><div className="tiny text-muted-x">{l.service || 'General'} · {timeAgo(l.createdAt)}</div></div><StatusBadge status={l.status} /></div>)) : <EmptyState icon="bi-bullseye" title="No leads yet" text="Website enquiries appear here automatically." />}
        </Panel></div>
        <div className="col-lg-6"><Panel title="Recent activity" loading={loading} action={<Link to="/crm/audit-logs" className="small">Audit log</Link>}>
          {d?.activity.length ? d.activity.map((a) => (<div key={a._id} className="act-row"><span className="act-dot" /><div><div className="small">{a.description || `${a.action} ${a.module}`}</div><div className="tiny text-muted-x">{a.adminName || 'Public visitor'} · {timeAgo(a.createdAt)}</div></div></div>)) : <EmptyState icon="bi-activity" title="No activity yet" />}
        </Panel></div>

        <div className="col-12"><Panel title="Admin team & login activity" loading={team.loading} lines={5}>
          <div className="row g-3">
            {team.data?.data.map((a) => (
              <div className="col-md-6 col-xl-3" key={a._id}><div className="admin-card">
                <div className="d-flex align-items-center gap-2 mb-2"><span className="avatar" style={{ background: a.avatarColor }}>{a.name[0]}</span><div className="flex-grow-1 min-w-0"><div className="fw-semibold small text-truncate">{a.name}</div><div className="tiny text-muted-x text-truncate">{a.email}</div></div><span className={`dot ${a.online ? 'on' : ''}`} title={a.online ? 'Online' : 'Offline'} /></div>
                <div className="tiny text-muted-x">Last login</div><div className="small fw-semibold mb-1">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</div>
                <div className="d-flex gap-2 flex-wrap"><span className="badge-soft">{a.activeSessionCount} session{a.activeSessionCount === 1 ? '' : 's'}</span>{a.failedAttempts7d > 0 && <span className="badge-soft s-danger">{a.failedAttempts7d} failed (7d)</span>}</div>
                {a.lastLoginDevice && <div className="tiny text-muted-x mt-1 text-truncate"><i className="bi bi-display me-1" />{a.lastLoginDevice}{a.lastLoginIp ? ` · ${a.lastLoginIp}` : ''}</div>}
              </div></div>))}
          </div>
          {d && <><h6 className="mt-4 mb-2">Recent sign-ins</h6><div className="table-responsive"><table className="table-x table-responsive-stack"><thead><tr><th>Admin</th><th>When</th><th>Device</th><th>IP</th><th>Status</th></tr></thead><tbody>
            {d.logins.map((l) => <tr key={l._id}><td data-label="Admin">{l.name}</td><td data-label="When">{fmtDateTime(l.at)}</td><td data-label="Device">{l.device || '—'}</td><td data-label="IP">{l.ip || '—'}</td><td data-label="Status">{l.active ? <span className="badge-soft s-success">Active</span> : <span className="badge-soft">Ended</span>}</td></tr>)}
          </tbody></table></div></>}
        </Panel></div>
      </div>
    </>
  );
}
