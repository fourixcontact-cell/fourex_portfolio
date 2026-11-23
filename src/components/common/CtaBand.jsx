import { Link } from 'react-router-dom';
export default function CtaBand({ title = 'Have a project in mind?', text = 'Tell us what you want to build and we’ll reply within one business day with next steps.' }) {
  return (
    <section className="sec pt-0"><div className="container"><div className="cta-band reveal">
      <h2>{title}</h2><p className="mb-4">{text}</p>
      <div className="d-flex gap-2 justify-content-center flex-wrap position-relative"><Link to="/quote" className="btn btn-light btn-lg">Get a free quote</Link><Link to="/contact" className="btn btn-outline-light btn-lg">Contact us</Link></div>
    </div></div></section>
  );
}
