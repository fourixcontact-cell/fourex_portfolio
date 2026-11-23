import { useOutletContext } from 'react-router-dom';
import './Legal.css';

export default function Privacy() {
  const { site } = useOutletContext() || {};
  const a = site?.agency || {};
  return (
    <>
      <section className="page-hero"><div className="container"><h1>Privacy Policy</h1><p>Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p></div></section>
      <section className="sec"><div className="container"><div className="prose legal">
        <p>This policy explains what information {a.name || 'we'} collect through this website and the client portal, and how it is used.</p>
        <h3>Information we collect</h3><p>When you submit a contact or quote form we collect your name, company, email, phone, country, requirements and budget range. Clients with portal access also have account and project information stored.</p>
        <h3>How we use it</h3><p>We use your information to respond to enquiries, prepare quotations, deliver and support projects, send invoices and receipts, and improve our services. We do not sell your personal information.</p>
        <h3>Email communication</h3><p>Transactional emails (acknowledgements, quotations, invoices, reminders) are sent through our email provider, Resend.</p>
        <h3>Security &amp; retention</h3><p>Access to client data is restricted to authorised team members and protected with authentication and audit logging. We retain enquiry and project records as long as needed for business and legal purposes.</p>
        <h3>Your rights</h3><p>You can request access, correction or deletion of your personal information by contacting us{a.email ? ` at ${a.email}` : ''}.</p>
        <p className="small text-muted-x">This template is provided for convenience. Please have it reviewed by a legal professional to ensure it meets the requirements that apply to your business.</p>
      </div></div></section>
    </>
  );
}
