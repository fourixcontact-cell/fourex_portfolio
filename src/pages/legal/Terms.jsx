import { useOutletContext } from 'react-router-dom';
import './Legal.css';

export default function Terms() {
  const { site } = useOutletContext() || {};
  const a = site?.agency || {};
  return (
    <>
      <section className="page-hero"><div className="container"><h1>Terms &amp; Conditions</h1><p>Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p></div></section>
      <section className="sec"><div className="container"><div className="prose legal">
        <p>These terms govern use of this website and engagements with {a.name || 'the agency'}. Specific project terms are set out in each written quotation and agreement.</p>
        <h3>Quotations</h3><p>Quotations are valid until the expiry date shown. Prices exclude changes in scope, which are handled through a written change request.</p>
        <h3>Payments</h3><p>Work begins after the agreed advance is received. Invoices are payable by the due date shown. Payments are recorded only once received and confirmed.</p>
        <h3>Intellectual property</h3><p>Unless agreed otherwise, ownership of the final deliverables transfers to the client upon full payment. Third-party and open-source components remain under their own licences.</p>
        <h3>Delivery &amp; handover</h3><p>Projects are formally handed over using a checklist. A completion certificate may be issued once handover is confirmed.</p>
        <h3>Liability</h3><p>To the extent permitted by law, our liability is limited to the fees paid for the relevant project.</p>
        <h3>Contact</h3><p>Questions about these terms: {a.email || 'please use the contact page'}.</p>
        <p className="small text-muted-x">This template is provided for convenience. Please have it reviewed by a legal professional before relying on it.</p>
      </div></div></section>
    </>
  );
}
