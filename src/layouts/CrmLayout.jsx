import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { get, put } from '../services/crm';
import { initials, timeAgo } from '../utils/format';
import './CrmLayout.css';
import BrandMark from '../components/common/BrandMark';

const NAV = [
  ['Overview', [['/crm', 'bi-speedometer2', 'Dashboard', true], ['/crm/leads', 'bi-bullseye', 'Leads'], ['/crm/clients', 'bi-people', 'Clients']]],
  ['Delivery', [['/crm/projects', 'bi-kanban', 'Projects'], ['/crm/tasks', 'bi-check2-square', 'Tasks'], ['/crm/documents', 'bi-folder2-open', 'Documents'], ['/crm/tickets', 'bi-life-preserver', 'Support tickets']]],
  ['Money', [['/crm/quotations', 'bi-file-earmark-text', 'Quotations'], ['/crm/invoices', 'bi-receipt', 'Invoices'], ['/crm/finance', 'bi-cash-coin', 'Finance'], ['/crm/expenses', 'bi-wallet2', 'Expenses']]],
  ['Insights', [['/crm/reports', 'bi-bar-chart-line', 'Reports'], ['/crm/team', 'bi-person-badge', 'Team'], ['/crm/audit-logs', 'bi-shield-check', 'Audit logs']]],
  ['Account', [['/crm/settings', 'bi-gear', 'Settings'], ['/crm/profile', 'bi-person-circle', 'My account']]]
];

export default function CrmLayout() {
  const { admin, logoutAdmin } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('crm.collapsed') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const timer = useRef();

  useEffect(() => {
    document.documentElement.classList.add('crm-scrollbar');
    return () => document.documentElement.classList.remove('crm-scrollbar');
  }, []);
  const loadNotifs = async () => { try { const r = await get('/notifications', { limit: 8 }); setNotif({ items: r.data, unread: r.unread }); } catch { /* ignore transient errors */ } };
  useEffect(() => { loadNotifs(); timer.current = setInterval(loadNotifs, 60000); return () => clearInterval(timer.current); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  const toggle = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('crm.collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });

  const readAll = async () => { await put('/notifications/read-all'); loadNotifs(); };
  const openNotif = async (n) => { if (!n.read) { await put(`/notifications/${n._id}/read`); loadNotifs(); } if (n.link) nav(n.link); };
  const logout = async () => { await logoutAdmin(); toast.info('Signed out'); nav('/admin/login'); };

  return (
    <div className={`crm ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="crm-scrim" onClick={() => setMobileOpen(false)} />
      <aside className="crm-side" aria-label="Main navigation">
        <div className="side-brand"><BrandMark size={36} className="brand-mark" /><span className="side-label">Fourix <span className="side-sub">CRM</span></span></div>
        <nav>
          {NAV.map(([group, items]) => (
            <div key={group} className="side-group">
              <div className="side-title side-label">{group}</div>
              {items.map(([to, icon, label, end]) => (
                <NavLink key={to} to={to} end={end} className="side-link" title={collapsed ? label : undefined}><i className={`bi ${icon}`} /><span className="side-label">{label}</span></NavLink>
              ))}
            </div>
          ))}
        </nav>
        <a className="side-link side-site" href="/" target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right" /><span className="side-label">View website</span></a>
      </aside>

      <div className="crm-body">
        <header className="crm-top">
          <button className="btn btn-ghost btn-icon d-lg-none" onClick={() => setMobileOpen(true)} aria-label="Open menu"><i className="bi bi-list" /></button>
          <button className="btn btn-ghost btn-icon d-none d-lg-inline-grid" onClick={toggle} aria-label="Collapse sidebar"><i className={`bi ${collapsed ? 'bi-layout-sidebar' : 'bi-layout-sidebar-inset'}`} /></button>
          <div className="flex-grow-1" />
          <Dropdown align="end" onToggle={(o) => o && loadNotifs()}>
            <Dropdown.Toggle as="button" className="btn btn-ghost btn-icon position-relative notif-btn" aria-label="Notifications">
              <i className="bi bi-bell" />{notif.unread > 0 && <span className="notif-dot">{notif.unread > 9 ? '9+' : notif.unread}</span>}
            </Dropdown.Toggle>
            <Dropdown.Menu className="notif-menu">
              <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom"><b>Notifications</b>{notif.unread > 0 && <button className="btn btn-link btn-sm p-0" onClick={readAll}>Mark all read</button>}</div>
              <div className="notif-list">
                {notif.items.length === 0 && <div className="state-box py-4"><i className="bi bi-bell-slash" />You’re all caught up</div>}
                {notif.items.map((n) => (
                  <button key={n._id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => openNotif(n)}>
                    <div className="fw-semibold small">{n.title}</div>{n.message && <div className="small text-muted-x">{n.message}</div>}<div className="tiny text-muted-x">{timeAgo(n.createdAt)}</div>
                  </button>
                ))}
              </div>
            </Dropdown.Menu>
          </Dropdown>
          <Dropdown align="end">
            <Dropdown.Toggle as="button" className="user-btn">
              <span className="avatar" style={{ background: admin?.avatarColor }}>{initials(admin?.name)}</span>
              <span className="d-none d-md-block text-start"><div className="fw-semibold small lh-1">{admin?.name}</div><div className="tiny text-muted-x">Admin</div></span>
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => nav('/crm/profile')}><i className="bi bi-person me-2" />My account</Dropdown.Item>
              <Dropdown.Item onClick={() => nav('/crm/settings')}><i className="bi bi-gear me-2" />Settings</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={logout} className="text-danger"><i className="bi bi-box-arrow-right me-2" />Sign out</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </header>
        <main className="crm-main"><Outlet /></main>
      </div>
    </div>
  );
}
