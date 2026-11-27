import { Link, useOutletContext } from 'react-router-dom';
import CtaBand from '../../components/common/CtaBand';
import ContentIcon from '../../components/common/ContentIcon';
<<<<<<< HEAD
=======
import useReveal from '../../utils/useReveal';
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
import './Services.css';

export default function Services() {
  const { site } = useOutletContext() || {};
  const services = site?.services || [];
  const workflow = site?.workflow || [];
<<<<<<< HEAD
=======
  useReveal();
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Our services</span><h1>Everything you need to <span className="grad-text">design, build and run</span> your product</h1><p>Pick a single service or bring us in end to end.</p></div></section>
      <section className="sec"><div className="container"><div className="row g-4">
        {services.map((s, i) => (
          <div className="col-lg-6 reveal" key={s.title} style={{ transitionDelay: `${(i % 2) * 80}ms` }}>
            <div className="card-x hoverable svc-card"><div className="feature-ico"><ContentIcon icon={s.icon} /></div>
              <div className="flex-grow-1"><h4>{s.title}</h4><p className="text-muted-x">{s.text}</p><ul className="svc-points">{s.points.map((p) => <li key={p}><i className="bi bi-check-circle-fill" />{p}</li>)}</ul>
                <Link to="/quote" className="btn btn-soft btn-sm">Get a quote <i className="bi bi-arrow-right ms-1" /></Link></div></div>
          </div>))}
      </div></div></section>
      <section className="sec alt"><div className="container"><div className="sec-head reveal"><span className="eyebrow">Process</span><h2>How every project runs</h2></div>
        <div className="row g-3 justify-content-center">{workflow.map((s, i) => (<div className="col-md-6 col-lg reveal" key={s.title}><div className="card-x card-body-x h-100 text-center proc-card"><div className="fw-bold text-primary mb-1">0{i + 1}</div><h6>{s.title}</h6><p className="small text-muted-x mb-0">{s.text}</p></div></div>))}</div></div></section>
      <CtaBand />
    </>
  );
}
