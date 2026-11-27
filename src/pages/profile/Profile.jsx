import { useState } from 'react';
import api, { errMsg } from '../../services/api';
import { get } from '../../services/crm';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import ConfirmModal from '../../components/modals/ConfirmModal';
import Field from '../../components/forms/Field';
import { SkeletonProfile, SkeletonTable } from '../../components/loaders/Skeletons';
import { Spinner } from '../../components/common/States';
import { fmtDateTime, initials } from '../../utils/format';
import './Profile.css';

export default function Profile() {
  const { admin } = useAuth(); const toast = useToast();
  const sessions = useFetch(() => api.get('/auth/sessions').then((r) => r.data));
  const history = useFetch(() => api.get('/auth/login-history', { params: { limit: 25 } }).then((r) => r.data));
  const team = useFetch(() => api.get('/auth/admins').then((r) => r.data));
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState({});
  const [kill, setKill] = useState(null);
  const set = (k, v) => { setPw((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: undefined })); };

  const change = async (e) => {
    e.preventDefault();
    const x = {};
    if (!pw.currentPassword) x.currentPassword = 'Enter your current password';
    if (pw.newPassword.length < 10 || !/[a-z]/.test(pw.newPassword) || !/[A-Z]/.test(pw.newPassword) || !/\d/.test(pw.newPassword)) x.newPassword = 'At least 10 characters with upper case, lower case and a number';
    else if (new TextEncoder().encode(pw.newPassword).length > 72) x.newPassword = 'Password must be 72 bytes or fewer';
    if (pw.newPassword !== pw.confirm) x.confirm = 'Passwords do not match';
    setErr(x); if (Object.keys(x).length) return;
    setBusy(true);
    try { const r = await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }); toast.success(r.data.message); setPw({ currentPassword: '', newPassword: '', confirm: '' }); sessions.reload(); } catch (e2) { toast.error(errMsg(e2)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="My account" crumbs={[{ label: 'My account' }]} />
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card-x card-body-x mb-3"><div className="d-flex align-items-center gap-3"><span className="avatar prof-av" style={{ background: admin.avatarColor }}>{initials(admin.name)}</span><div><h5 className="mb-0">{admin.name}</h5><div className="small text-muted-x">{admin.email}</div><span className="badge-soft s-primary mt-1">Admin · full access</span></div></div>
            <div className="row g-3 mt-2">{[['Last login', fmtDateTime(admin.lastLoginAt)], ['Last device', admin.lastLoginDevice], ['Last IP', admin.lastLoginIp], ['Password changed', admin.passwordChangedAt ? fmtDateTime(admin.passwordChangedAt) : 'Never (initial)']].map(([k, v]) => <div className="col-6" key={k}><div className="tiny text-muted-x">{k}</div><div className="small fw-semibold text-break">{v || '—'}</div></div>)}</div></div>
          <form className="card-x" onSubmit={change} noValidate><div className="card-head"><h5>Change password</h5></div><div className="card-body-x row g-3">
            <Field className="col-12" label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={set} error={err.currentPassword} />
            <Field className="col-12" label="New password" name="newPassword" type="password" autoComplete="new-password" value={pw.newPassword} onChange={set} error={err.newPassword} />
            <Field className="col-12" label="Confirm new password" name="confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={set} error={err.confirm} />
            <div className="col-12"><button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Update password'}</button><div className="tiny text-muted-x mt-2">Your other active sessions are signed out when you change it.</div></div></div></form>
        </div>
        <div className="col-lg-7">
          <div className="card-x mb-3"><div className="card-head"><h5>Active sessions (all admins)</h5></div>
            {sessions.loading ? <SkeletonTable cols={4} rows={3} /> : <div className="table-responsive"><table className="table-x table-responsive-stack"><thead><tr><th>Admin</th><th>Device</th><th>IP</th><th>Last seen</th><th /></tr></thead><tbody>{sessions.data?.data.map((s) => (
              <tr key={s._id}><td data-label="Admin">{s.user?.name} {s.current && <span className="badge-soft s-success">This session</span>}</td><td data-label="Device">{s.device || '—'}</td><td data-label="IP">{s.ip || '—'}</td><td data-label="Last seen">{fmtDateTime(s.lastSeenAt)}</td><td className="actions-cell text-end">{!s.current && <button className="btn btn-ghost btn-sm text-danger" onClick={() => setKill(s)}>Force logout</button>}</td></tr>))}</tbody></table></div>}</div>
          <div className="card-x mb-3"><div className="card-head"><h5>Admin accounts</h5><span className="badge-soft">Exactly 4 · fixed</span></div>
            {team.loading ? <div className="p-3"><SkeletonProfile /></div> : team.data?.data.map((a) => <div key={a._id} className="dl-row px-3"><div className="d-flex gap-2 align-items-center"><span className="avatar sm" style={{ background: a.avatarColor }}>{a.name[0]}</span><div><div className="small fw-semibold">{a.name}</div><div className="tiny text-muted-x">Last login {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'never'}</div></div></div><div className="d-flex gap-2"><span className={`badge-soft ${a.online ? 's-success' : ''}`}>{a.online ? 'Online' : 'Offline'}</span>{a.failedAttempts7d > 0 && <span className="badge-soft s-danger">{a.failedAttempts7d} failed</span>}</div></div>)}</div>
          <div className="card-x"><div className="card-head"><h5>Recent login history</h5></div>
            {history.loading ? <SkeletonTable cols={4} rows={4} /> : <div className="table-responsive"><table className="table-x table-responsive-stack"><thead><tr><th>Admin</th><th>Signed in</th><th>Device</th><th>IP</th><th>Ended</th></tr></thead><tbody>{history.data?.data.map((s) => <tr key={s._id}><td data-label="Admin">{s.user?.name}</td><td data-label="Signed in">{fmtDateTime(s.createdAt)}</td><td data-label="Device">{s.device || '—'}</td><td data-label="IP">{s.ip || '—'}</td><td data-label="Ended">{s.revokedAt ? `${s.endReason || 'ended'}` : <span className="badge-soft s-success">Active</span>}</td></tr>)}</tbody></table></div>}</div>
        </div>
      </div>
      <ConfirmModal show={!!kill} danger title="Force logout this session?" message={`${kill?.user?.name} on ${kill?.device} will be signed out immediately.`} confirmLabel="Force logout" onClose={() => setKill(null)}
        onConfirm={async () => { try { await api.post(`/auth/sessions/${kill._id}/revoke`); toast.success('Session ended'); sessions.reload(); history.reload(); team.reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}
export { get };
