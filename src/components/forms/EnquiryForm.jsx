import './EnquiryForm.css';
import { useEffect, useRef, useState } from 'react';
import { publicApi } from '../../services/public';
import { errMsg, fieldErrors } from '../../services/api';
import Field from './Field';
import { Spinner } from '../common/States';

const empty = { name: '', company: '', email: '', phone: '', country: '', service: '', budget: '', preferredContact: 'email', description: '', website: '' };
const BUDGETS = ['', 'Under ₹25,000', '₹25,000 – ₹75,000', '₹75,000 – ₹2,00,000', '₹2,00,000 – ₹5,00,000', 'Above ₹5,00,000', 'Not sure yet'];

export function validateEnquiry(v) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email address';
  if (!/^[+()\-\s\d]{7,20}$/.test(v.phone)) e.phone = 'Enter a valid phone number (digits, +, spaces)';
  if (!v.country.trim()) e.country = 'Country is required';
  if (!v.service) e.service = 'Choose the service you need';
  if (v.description.trim().length < 20) e.description = 'Please describe your project (at least 20 characters)';
  return e;
}

export default function EnquiryForm({ mode = 'contact' }) {
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [formError, setFormError] = useState('');
  const [services, setServices] = useState(['']);
  const submitted = useRef(false);

  useEffect(() => { publicApi.options().then((r) => setServices(['', ...r.services])).catch(() => {}); }, []);
  const set = (k, val) => { setV((s) => ({ ...s, [k]: val })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    if (submitted.current) return; // double-click guard
    const local = validateEnquiry(v);
    setErrors(local); setFormError('');
    if (Object.keys(local).length) { document.getElementById(`f-${Object.keys(local)[0]}`)?.focus(); return; }
    submitted.current = true; setBusy(true);
    try {
      const r = await (mode === 'quote' ? publicApi.quote(v) : publicApi.contact(v));
      setDone(r.message);
    } catch (err) {
      submitted.current = false;
      setErrors(fieldErrors(err));
      setFormError(errMsg(err));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="enq-success" role="status">
        <div className="enq-check"><i className="bi bi-check-lg" /></div>
        <h3>Thank you, we’ve got your message!</h3>
        <p className="text-muted-x mb-4">{done}</p>
        <button className="btn btn-ghost" onClick={() => { setDone(null); setV(empty); submitted.current = false; }}>Send another enquiry</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="enq-form">
      {/* Honeypot: hidden from people, tempting to bots */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}><label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set('website', e.target.value)} /></label></div>
      {formError && <div className="alert alert-danger py-2 small" role="alert">{formError}</div>}
      <div className="row g-3">
        <Field className="col-md-6" label="Full name" name="name" value={v.name} onChange={set} error={errors.name} required autoComplete="name" />
        <Field className="col-md-6" label="Company name" name="company" value={v.company} onChange={set} error={errors.company} autoComplete="organization" />
        <Field className="col-md-6" label="Email" name="email" type="email" value={v.email} onChange={set} error={errors.email} required autoComplete="email" />
        <Field className="col-md-6" label="Phone" name="phone" type="tel" value={v.phone} onChange={set} error={errors.phone} required autoComplete="tel" placeholder="+91 98765 43210" />
        <Field className="col-md-6" label="Country" name="country" value={v.country} onChange={set} error={errors.country} required autoComplete="country-name" />
        <Field className="col-md-6" label="Service required" name="service" value={v.service} onChange={set} error={errors.service} options={services} required />
        <Field className="col-md-6" label="Budget range" name="budget" value={v.budget} onChange={set} error={errors.budget} options={BUDGETS} />
        <Field className="col-md-6" label="Preferred contact method" name="preferredContact" value={v.preferredContact} onChange={set} options={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone call' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'any', label: 'Any' }]} />
        <Field className="col-12" label="Project description" name="description" rows={5} value={v.description} onChange={set} error={errors.description} required placeholder="What would you like to build? Who is it for? Any deadlines or references?" hint={`${v.description.trim().length} characters (min 20)`} />
      </div>
      <button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy}>{busy ? <><Spinner /> Sending…</> : mode === 'quote' ? 'Request my free quote' : 'Send message'}</button>
      <p className="small text-muted-x text-center mt-3 mb-0"><i className="bi bi-lock me-1" />Your details are used only to respond to your enquiry.</p>
    </form>
  );
}
