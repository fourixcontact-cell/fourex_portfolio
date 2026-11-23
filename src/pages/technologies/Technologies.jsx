import { useOutletContext } from 'react-router-dom';
import CtaBand from '../../components/common/CtaBand';
import ContentIcon from '../../components/common/ContentIcon';
import useReveal from '../../utils/useReveal';
import './Technologies.css';

export default function Technologies() {
  const { site } = useOutletContext() || {};
  const technologies = site?.technologies || [];
  useReveal();
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Technologies</span><h1>The stack we <span className="grad-text">trust in production</span></h1><p>We choose tools for fit and longevity, not hype.</p></div></section>
      <section className="sec"><div className="container"><div className="row g-4">
        {technologies.map((g) => (<div className="col-md-6 reveal" key={g.group}><div className="card-x hoverable card-body-x technology-category-card h-100"><h5 className="mb-3 tech-group-title"><ContentIcon icon={g.icon} /><span>{g.group}</span></h5><div className="tech-grid">{g.items.map((entry, i) => { const technology = typeof entry === 'string' ? { name: entry } : entry; return <div key={`${technology.name}-${i}`} className="tech-pill"><ContentIcon icon={technology.icon} />{technology.name}</div>; })}</div></div></div>))}
      </div></div></section>
      <CtaBand />
    </>
  );
}
