import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { hasSession } from '../services/firebase';
const resetAfterSignOut = () => import('../services/coreHost').then((m) => m.resetAfterSignOut()).catch(() => {});

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

/**
 * Who is signed in: an admin (CRM) or a client (portal). Both use the same Firebase sign-in, so
 * signing into one signs the other out in this browser.
 */
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [client, setClient] = useState(null);
  const [ready, setReady] = useState({ admin: false, client: false });
  const [unreachable, setUnreachable] = useState({ admin: false, client: false });
  const probes = useRef({});

  /** Checks one session ONCE, and only when a page that needs it mounts (public visitors never call /auth/me). */
  const ensure = useCallback((kind) => {
    const kinds = kind === 'both' ? ['admin', 'client'] : [kind];
    kinds.forEach((k) => {
      if (probes.current[k]) return;
      probes.current[k] = hasSession()
        .then((signedIn) => (signedIn ? api.get(k === 'admin' ? '/auth/me' : '/portal/auth/me') : null)) // no saved Firebase sign-in = signed out, nothing to check
        .then((r) => { if (r) (k === 'admin' ? setAdmin(r.data.user) : setClient(r.data.user)); })
        .catch((e) => {
          // 401/403 = signed in as the other kind of account (or session ended): just "not signed in" here.
          if (!e.response || e.response.status >= 500) setUnreachable((x) => ({ ...x, [k]: true })); // database unreachable, NOT signed out
        })
        .finally(() => setReady((x) => ({ ...x, [k]: true })));
    });
  }, []);

  const retry = useCallback((kind) => { delete probes.current[kind]; setUnreachable((x) => ({ ...x, [kind]: false })); setReady((x) => ({ ...x, [kind]: false })); ensure(kind); }, [ensure]);

  useEffect(() => {
    const onExpired = (e) => (e.detail === 'portal' ? setClient(null) : setAdmin(null));
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const loginAdmin = useCallback(async (email, password) => { probes.current.admin = probes.current.admin || Promise.resolve(); setReady((x) => ({ ...x, admin: true })); const { data } = await api.post('/auth/login', { email, password }); setClient(null); delete probes.current.client; setAdmin(data.user); return data.user; }, []);
  const loginClient = useCallback(async (email, password) => { probes.current.client = probes.current.client || Promise.resolve(); setReady((x) => ({ ...x, client: true })); const { data } = await api.post('/portal/auth/login', { email, password }); setAdmin(null); delete probes.current.admin; setClient(data.user); return data.user; }, []);
  const changeAdminPassword = useCallback(async (currentPassword, newPassword) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    if (data.user) setAdmin(data.user);
    return data;
  }, []);
  const logoutAdmin = useCallback(async () => { try { await api.post('/auth/logout'); } catch { /* signed out anyway */ } finally { await resetAfterSignOut(); setAdmin(null); } }, []);
  const logoutClient = useCallback(async () => { try { await api.post('/portal/auth/logout'); } catch { /* signed out anyway */ } finally { await resetAfterSignOut(); setClient(null); } }, []);

  const value = useMemo(() => ({ admin, client, ready, unreachable, retry, ensure, loginAdmin, loginClient, changeAdminPassword, logoutAdmin, logoutClient }), [admin, client, ready, unreachable, retry, ensure, loginAdmin, loginClient, changeAdminPassword, logoutAdmin, logoutClient]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
