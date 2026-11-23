import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { publicApi } from '../../services/public';
import ProjectCard from '../../components/common/ProjectCard';
import ContentIcon from '../../components/common/ContentIcon';
import { SkeletonProjectCards, Skel } from '../../components/loaders/Skeletons';
import CtaBand from '../../components/common/CtaBand';
import useReveal from '../../utils/useReveal';
import './Home.css';

export default function Home() {
  const { site } = useOutletContext() || {};
  const [projects, setProjects] = useState(null);
  useEffect(() => { publicApi.portfolio().then((r) => setProjects(r.data.slice(0, 3))).catch(() => setProjects([])); }, []);
  useReveal(projects?.length);
  const services = site?.services || [];
  const technologies = site?.technologies || [];
  const workflow = site?.workflow || [];
  const why = site?.why || [];
  const testimonials = site?.testimonials || [];

  return (
    <>
      <section className="hero">
        <div className="hero-blob b1" /><div className="hero-blob b2" />
        <div className="container position-relative">
          <div className="row align-items-center gy-4 gx-lg-4">
            <div className="col-lg-6">
              <span className="eyebrow hero-eyebrow"><i className="bi bi-rocket-takeoff" />Freelance software development agency<span className="eyebrow-dot" aria-hidden="true" /></span>
              <h1 className="hero-title">We build <span className="grad-text">reliable software</span> that grows your business.</h1>
              <p className="hero-sub">From MERN-stack web apps and mobile apps to design and cloud deployment, we take your idea from first sketch to a secure, production-ready product, with clear milestones and honest pricing.</p>
              <div className="d-flex gap-3 flex-wrap align-items-center"><Link to="/quote" className="btn btn-primary btn-lg">Get a free quote <i className="bi bi-arrow-right ms-1" /></Link><Link to="/portfolio" className="hero-secondary"><span className="hero-secondary-ico"><i className="bi bi-arrow-up-right" /></span>See our work</Link></div>
              <ul className="hero-points"><li><i className="bi bi-rocket-takeoff" />Milestone-based delivery</li><li><i className="bi bi-shield-check" />Client portal with live progress</li><li><i className="bi bi-headset" />Formal handover &amp; support</li></ul>
            </div>
            <div className="col-lg-6">
              <div className="hero-art"><img className="hero-robot" src="/hero-robot.jpg" alt="" width="826" height="630" decoding="async" /></div>
            </div>
          </div>
          <a href="#what-we-do" className="hero-explore"><span className="hero-explore-ico"><i className="bi bi-arrow-down" /></span>Explore more</a>
        </div>
        <svg className="hero-wave" viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hw" x1="0" x2="1"><stop offset="0" stopColor="#742FE8" /><stop offset=".3" stopColor="#DAC7FA" stopOpacity=".35" /><stop offset=".7" stopColor="#DAC7FA" stopOpacity=".35" /><stop offset="1" stopColor="#6A20E7" /></linearGradient></defs><path fill="url(#hw)" d="M0 70 C240 10 420 40 640 78 C860 116 1060 96 1230 40 C1330 8 1400 14 1440 24 L1440 140 L0 140 Z" /></svg>
      </section>

      <section className="sec" id="what-we-do">
        <div className="container">
          <div className="sec-head reveal"><span className="eyebrow">What we do</span><h2>Services built around your goals</h2><p>{services.length} focused disciplines, one accountable team.</p></div>
          <div className="row g-4">
            {services.map((s, i) => (
              <div className="col-md-6 col-lg-3 reveal" key={s.title} style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
                <div className="card-x hoverable feature-card"><div className="feature-ico"><ContentIcon icon={s.icon} /></div><h5>{s.title}</h5><p>{s.text.split('.')[0]}.</p></div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4"><Link to="/services" className="btn btn-soft">Explore all services</Link></div>
        </div>
      </section>

      <section className="sec alt">
        <div className="container">
          <div className="sec-head reveal"><span className="eyebrow">Featured work</span><h2>Recent projects</h2><p>A selection of products we’ve designed, built and delivered.</p></div>
          {projects === null ? <SkeletonProjectCards count={3} /> : projects.length ? (
            <div className="row g-4">{projects.map((p) => <div className="col-md-6 col-lg-4 reveal" key={p.id}><ProjectCard p={p} /></div>)}</div>
          ) : (<p className="text-center text-muted-x">Our portfolio is being updated. <Link to="/contact">Contact us</Link> to see relevant examples.</p>)}
          {projects?.length > 0 && <div className="text-center mt-4"><Link to="/portfolio" className="btn btn-primary">View full portfolio</Link></div>}
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sec-head reveal"><span className="eyebrow">Technologies</span><h2>Modern tools, proven in production</h2></div>
          <div className="row g-4">{technologies.map((g) => (
            <div className="col-md-6 col-lg-4 reveal" key={g.group}><div className="card-x card-body-x technology-category-card h-100"><h6 className="mb-3 technology-category-title"><ContentIcon icon={g.icon} />{g.group}</h6>{g.items.map((entry, i) => { const t = typeof entry === 'string' ? { name: entry } : entry; return <span key={`${t.name}-${i}`} className="tag technology-tag">{t.icon && <ContentIcon icon={t.icon} />}{t.name}</span>; })}</div></div>
          ))}</div>
        </div>
      </section>

      <section className="sec alt">
        <div className="container">
          <div className="sec-head reveal"><span className="eyebrow">Why choose us</span><h2>A partner, not just a vendor</h2></div>
          <div className="row g-4">{why.map((w) => (
            <div className="col-md-6 col-lg-4 reveal" key={w.title}><div className="d-flex gap-3"><div className="feature-ico flex-none"><i className={`bi ${w.icon}`} /></div><div><h6>{w.title}</h6><p className="text-muted-x small mb-0">{w.text}</p></div></div></div>
          ))}</div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sec-head reveal"><span className="eyebrow">Our workflow</span><h2>How we deliver</h2><p>A predictable process with a checkpoint at every stage.</p></div>
          <div className="steps">{workflow.map((s, i) => (
            <div className="step reveal" key={s.title} style={{ transitionDelay: `${i * 80}ms` }}><div className="step-n">{i + 1}</div><i className={`bi ${s.icon} step-i`} /><h6>{s.title}</h6><p>{s.text}</p></div>
          ))}</div>
        </div>
      </section>

      {!site && (
        <section className="sec alt" aria-busy="true" aria-label="Loading testimonials"><div className="container"><div className="row g-4">{[0, 1, 2].map((i) => (
          <div className="col-md-4" key={i}><div className="card-x card-body-x"><Skel w={90} h={14} /><Skel h={12} className="mt-3" /><Skel w="90%" h={12} className="mt-2" /><Skel w="60%" h={12} className="mt-2" /><Skel w="40%" h={14} className="mt-3" /></div></div>))}</div></div></section>
      )}
      {testimonials.length > 0 && (
        <section className="sec alt">
          <div className="container">
            <div className="sec-head reveal"><span className="eyebrow">Testimonials</span><h2>What clients say</h2></div>
            <div className="row g-4">{testimonials.slice(0, 3).map((t, i) => (
              <div className="col-md-4 reveal" key={i}><div className="card-x hoverable card-body-x h-100 quote-card"><div className="text-warning mb-2">{'★'.repeat(t.rating || 5)}</div><p>“{t.quote}”</p><div className="fw-bold">{t.name}</div><div className="small text-muted-x">{[t.role, t.company].filter(Boolean).join(', ')}</div></div></div>
            ))}</div>
            <div className="text-center mt-4"><Link to="/testimonials" className="btn btn-soft">Read more</Link></div>
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}