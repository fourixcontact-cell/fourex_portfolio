import { useOutletContext } from 'react-router-dom';
import CtaBand from '../../components/common/CtaBand';
import ContentIcon from '../../components/common/ContentIcon';
<<<<<<< HEAD
=======
import useReveal from '../../utils/useReveal';
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
import './Technologies.css';

export default function Technologies() {
  const { site } = useOutletContext() || {};
  const technologies = site?.technologies || [];
<<<<<<< HEAD
=======
  useReveal();
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Technologies</span><h1>The stack we <span className="grad-text">trust in production</span></h1><p>We choose tools for fit and longevity, not hype.</p></div></section>
      <section className="sec"><div className="container"><div className="row g-4">
<<<<<<< HEAD
        {technologies.map((g) => (
          <div className="col-md-6 reveal" key={g.group}>
            <article className="technology-category-card h-100">
              <header className="technology-card-heading">
                <span className="technology-card-icon"><ContentIcon icon={g.icon} /></span>
                <div className="technology-card-title-wrap">
                  <span className="technology-card-label">Technology area</span>
                  <h2 className="technology-category-title">{g.group}</h2>
                </div>
                <span className="technology-count">{g.items.length} {g.items.length === 1 ? 'tool' : 'tools'}</span>
              </header>
              <ul className="technology-list">
                {g.items.map((entry, i) => {
                  const technology = typeof entry === 'string' ? { name: entry } : entry;
                  return <li key={`${technology.name}-${i}`} className="technology-item">{technology.icon && <ContentIcon icon={technology.icon} />}<span>{technology.name}</span></li>;
                })}
              </ul>
            </article>
          </div>
        ))}
=======
        {technologies.map((g) => (<div className="col-md-6 reveal" key={g.group}><div className="card-x hoverable card-body-x technology-category-card h-100"><h5 className="mb-3 tech-group-title"><ContentIcon icon={g.icon} /><span>{g.group}</span></h5><div className="tech-grid">{g.items.map((entry, i) => { const technology = typeof entry === 'string' ? { name: entry } : entry; return <div key={`${technology.name}-${i}`} className="tech-pill"><ContentIcon icon={technology.icon} />{technology.name}</div>; })}</div></div></div>))}
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
      </div></div></section>
      <CtaBand />
    </>
  );
}
