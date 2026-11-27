import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Skel } from '../components/loaders/Skeletons';
import { ErrorState } from '../components/common/States';

const Boot = () => (<div className="p-5"><Skel w="30%" h={24} /><Skel h={160} className="mt-4" /></div>);

/** UX guard only. The real protection is server-side middleware on every API route. */
export function AdminGuard({ children, passwordChange = false }) {
  const { admin, ready, ensure, unreachable, retry } = useAuth(); const loc = useLocation();
  useEffect(() => { ensure('admin'); }, [ensure]);
  if (!ready.admin) return <Boot />;
  if (unreachable.admin) return <div className="p-4"><ErrorState message="Can’t reach the server right now. You have not been signed out." onRetry={() => retry('admin')} /></div>;
  if (!admin) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  if (!admin.isPasswordChanged && !passwordChange) return <Navigate to="/admin/change-password" replace />;
  if (admin.isPasswordChanged && passwordChange) return <Navigate to="/crm" replace />;
  return children;
}
export function ClientGuard({ children }) {
  const { client, ready, ensure, unreachable, retry } = useAuth(); const loc = useLocation();
  useEffect(() => { ensure('client'); }, [ensure]);
  if (!ready.client) return <Boot />;
  if (unreachable.client) return <div className="p-4"><ErrorState message="Can’t reach the server right now. You have not been signed out." onRetry={() => retry('client')} /></div>;
  return client ? children : <Navigate to="/login" state={{ from: loc.pathname, portal: true }} replace />;
}
