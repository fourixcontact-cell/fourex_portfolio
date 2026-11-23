import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../services/api';
import { Spinner } from '../../components/common/States';
import BrandMark from '../../components/common/BrandMark';

export default function ChangeAdminPassword() {
  const { admin, changeAdminPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!values.currentPassword) nextErrors.currentPassword = 'Enter your current password';
    const newPasswordBytes = new TextEncoder().encode(values.newPassword).length;
    if (values.newPassword.length < 10 || !/[a-z]/.test(values.newPassword) || !/[A-Z]/.test(values.newPassword) || !/\d/.test(values.newPassword)) {
      nextErrors.newPassword = 'At least 10 characters with upper case, lower case and a number';
    } else if (newPasswordBytes > 72) {
      nextErrors.newPassword = 'Password must be 72 bytes or fewer';
    }
    if (values.newPassword !== values.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const result = await changeAdminPassword(values.currentPassword, values.newPassword);
      toast.success(result.message);
      navigate('/crm', { replace: true });
    } catch (error) {
      toast.error(errMsg(error, 'Password could not be updated'));
    } finally {
      setBusy(false);
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
      <div className="login-main">
        <form className="login-card page-enter" onSubmit={submit} noValidate>
          <h3 className="mb-1">Change your password</h3>
          <p className="text-muted-x small mb-4">Set a new password to continue, {admin?.name?.split(' ')[0]}.</p>
          <label className="form-label" htmlFor="admin-current-password">Current password</label>
          <input id="admin-current-password" className={`form-control mb-3${errors.currentPassword ? ' is-invalid' : ''}`} type="password" autoComplete="current-password" value={values.currentPassword} onChange={(event) => set('currentPassword', event.target.value)} aria-invalid={!!errors.currentPassword} />
          {errors.currentPassword && <div className="form-text-error mb-3">{errors.currentPassword}</div>}
          <label className="form-label" htmlFor="admin-new-password">New password</label>
          <input id="admin-new-password" className={`form-control mb-3${errors.newPassword ? ' is-invalid' : ''}`} type="password" autoComplete="new-password" value={values.newPassword} onChange={(event) => set('newPassword', event.target.value)} aria-invalid={!!errors.newPassword} />
          {errors.newPassword && <div className="form-text-error mb-3">{errors.newPassword}</div>}
          <label className="form-label" htmlFor="admin-confirm-password">Confirm new password</label>
          <input id="admin-confirm-password" className={`form-control mb-4${errors.confirmPassword ? ' is-invalid' : ''}`} type="password" autoComplete="new-password" value={values.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} aria-invalid={!!errors.confirmPassword} />
          {errors.confirmPassword && <div className="form-text-error mb-3">{errors.confirmPassword}</div>}
          <button className="btn btn-primary w-100 btn-lg" disabled={busy}>{busy ? <Spinner /> : 'Update password'}</button>
        </form>
      </div>
    </div>
  );
}
