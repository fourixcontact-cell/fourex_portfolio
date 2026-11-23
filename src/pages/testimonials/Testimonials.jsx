import { Link, useOutletContext } from 'react-router-dom';
import { Skel } from '../../components/loaders/Skeletons';
import { EmptyState } from '../../components/common/States';
import CtaBand from '../../components/common/CtaBand';
import './Testimonials.css';

export default function Testimonials() {
  const { site } = useOutletContext() || {};
  const list = site?.testimonials;
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Testimonials</span><h1>Kind words from <span className="grad-text">our clients</span></h1></div></section>
      <section className="sec"><div className="container">
        {!site ? <div className="row g-4">{[0, 1, 2].map((i) => <div className="col-md-4" key={i}><div className="card-x card-body-x"><Skel h={90} /><Skel w="50%" className="mt-3" /></div></div>)}</div>
          : list.length ? <div className="row g-4">{list.map((t, i) => (
            <div className="col-md-6 col-lg-4" key={i}><figure className="card-x hoverable card-body-x h-100 tcard m-0"><div className="text-warning mb-2" aria-label={`${t.rating || 5} out of 5 stars`}>{'★'.repeat(t.rating || 5)}</div><blockquote>“{t.quote}”</blockquote><figcaption><b>{t.name}</b><div className="small text-muted-x">{[t.role, t.company].filter(Boolean).join(', ')}</div></figcaption></figure></div>))}</div>
          : <EmptyState icon="bi-chat-quote" title="Client reviews will appear here" text="We only publish reviews from real clients." action={<Link to="/contact" className="btn btn-soft btn-sm">Work with us</Link>} />}
      </div></section>
      <CtaBand />
    </>
  );
}
