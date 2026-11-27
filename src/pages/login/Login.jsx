import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../services/api';
import { Spinner } from '../../components/common/States';
import './Login.css';
import BrandMark from '../../components/common/BrandMark';
import { authApi } from '../../services/firebase';

export default function Login({ mode = 'client' }) {
  const { loginAdmin, loginClient, admin, client, ensure } = useAuth();
  useEffect(() => { ensure('both'); }, [ensure]);
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const tab = mode === 'admin' ? 'admin' : 'client';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const emailInput = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter your email and password'); return; }
    setBusy(true);
    try {
      if (tab === 'admin') { const u = await loginAdmin(email, password); toast.success(`Welcome back, ${u.name.split(' ')[0]}`); nav(!u.isPasswordChanged ? '/admin/change-password' : loc.state?.from?.startsWith('/crm') ? loc.state.from : '/crm', { replace: true }); }
      else { await loginClient(email, password); nav(loc.state?.from?.startsWith('/portal') ? loc.state.from : '/portal', { replace: true }); }
    } catch (err) { toast.error(errMsg(err, 'Sign in failed')); } finally { setBusy(false); }
  };

  const requestPasswordReset = async () => {
    const resetEmail = email.trim();
    if (!resetEmail) {
      toast.error('Enter your email address to reset your password');
      emailInput.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      toast.error('Enter a valid email address');
      emailInput.current?.focus();
      return;
    }

    setResetBusy(true);
    try {
      await authApi.sendPasswordReset(resetEmail);
      toast.success('If an account matches that email, password reset instructions will be sent shortly.');
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        toast.success('If an account matches that email, password reset instructions will be sent shortly.');
      } else {
        toast.error(errMsg(err, 'Could not send password reset email'));
      }
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-side d-none d-lg-flex">
        <Link to="/" className="pub-brand text-white"><BrandMark />Back to Fourix</Link>
        <div><h2>Run your agency from one place.</h2><p>Leads, clients, projects, quotations, invoices, finance and a full audit trail, in a single secure workspace.</p></div>
        <div className="login-art" aria-hidden="true"><img src="/brand/fourix-mark.png" alt="" /></div>
        <div className="small opacity-75">Authorised users only. Activity on this system is logged.</div>
      </div>
      <section className="login-mobile-hero" aria-labelledby="login-welcome-title">
        <Link to="/" className="login-mobile-brand"><BrandMark size={36} /><span>Fourix</span></Link>
        <div className="login-mobile-intro">
          <div>
            <h1 id="login-welcome-title">Welcome back</h1>
            <p>Sign in to your secure Fourix workspace.</p>
          </div>
          <div className="login-mobile-art" aria-hidden="true"><img src="/brand/fourix-mark.png" alt="" /></div>
        </div>
      </section>
      <div className="login-main">
        <form className="login-card login-form-enter" onSubmit={submit} noValidate>
          <h3 className="mb-1">{tab === 'admin' ? 'Sign in to the CRM' : 'Sign in to your portal'}</h3>
          <p className="text-muted-x small mb-4">{tab === 'admin' ? 'For the agency’s admin accounts.' : 'Use the credentials we sent you.'}</p>
          {(admin || client) && <div className="alert alert-info py-2 small">You are already signed in{admin ? ' to the CRM' : ''}{client ? ' to the portal' : ''}. <Link to={admin && tab === 'admin' ? (admin.isPasswordChanged ? '/crm' : '/admin/change-password') : '/portal'}>Continue</Link></div>}
          <label className="form-label" htmlFor="l-email">Email</label>
          <input ref={emailInput} id="l-email" className="form-control mb-3" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="login-password-heading">
            <label className="form-label" htmlFor="l-pw">Password</label>
            <button type="button" className="login-forgot-link" onClick={requestPasswordReset} disabled={resetBusy} aria-label={resetBusy ? 'Sending password reset email' : 'Forgot password?'}>
              {resetBusy ? <><Spinner /> Sending…</> : 'Forgot password?'}
            </button>
          </div>
          <div className="input-group mb-4"><input id="l-pw" className="form-control" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="btn btn-ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`} /></button></div>
          <button className="btn btn-primary w-100 btn-lg" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
