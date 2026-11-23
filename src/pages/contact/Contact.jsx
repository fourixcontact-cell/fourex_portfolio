import { useOutletContext } from 'react-router-dom';
import EnquiryForm from '../../components/forms/EnquiryForm';
import { Skel } from '../../components/loaders/Skeletons';
import './Contact.css';

export default function Contact() {
  const { site } = useOutletContext() || {};
  const a = site?.agency || {};
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Contact us</span><h1>Let’s talk about <span className="grad-text">your project</span></h1><p>Share a few details and we’ll reply within one business day.</p></div></section>
      <section className="sec pt-4"><div className="container"><div className="row g-4">
        <div className="col-lg-4">
          <div className="card-x card-body-x contact-info">
            <h5 className="mb-3">Get in touch</h5>
            {!site && [0, 1, 2].map((i) => <div className="ci" key={i} aria-busy="true"><Skel w={44} h={44} r={14} /><div className="flex-grow-1"><Skel w="30%" h={10} /><Skel w="70%" h={14} className="mt-2" /></div></div>)}
            {a.email && <div className="ci"><i className="bi bi-envelope" /><div><div className="small text-muted-x">Email</div><a href={`mailto:${a.email}`}>{a.email}</a></div></div>}
            {a.phone && <div className="ci"><i className="bi bi-telephone" /><div><div className="small text-muted-x">Phone</div><a href={`tel:${a.phone.replace(/\s/g, '')}`}>{a.phone}</a></div></div>}
            {a.address && <div className="ci"><i className="bi bi-geo-alt" /><div><div className="small text-muted-x">Location</div>{a.address}</div></div>}
            <div className="ci"><i className="bi bi-clock" /><div><div className="small text-muted-x">Response time</div>Within one business day</div></div>
          </div>
        </div>
        <div className="col-lg-8"><div className="card-x card-body-x p-md-4"><EnquiryForm mode="contact" /></div></div>
      </div></div></section>
    </>
  );
}
