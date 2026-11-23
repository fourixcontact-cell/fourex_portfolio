import { useEffect, useState } from 'react';
import { publicApi } from '../../services/public';
import { errMsg } from '../../services/api';
import ProjectCard from '../../components/common/ProjectCard';
import { SkeletonProjectCards } from '../../components/loaders/Skeletons';
import { EmptyState, ErrorState } from '../../components/common/States';
import CtaBand from '../../components/common/CtaBand';
import useReveal from '../../utils/useReveal';
import './Portfolio.css';

export default function Portfolio() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('');
  const [tech, setTech] = useState('');
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState({ categories: [], technologies: [] });

  const load = async () => {
    setLoading(true); setError('');
    try { const r = await publicApi.portfolio({ category: cat || undefined, tech: tech || undefined }); setData(r.data); if (!cat && !tech) setFacets({ categories: r.categories, technologies: r.technologies }); }
    catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cat, tech]);
  useReveal(data?.length);

  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Portfolio</span><h1>Work we’re <span className="grad-text">proud of</span></h1><p>Filter by category or technology to see projects relevant to you.</p></div></section>
      <section className="sec pt-4"><div className="container">
        <div className="pf-filters">
          <div className="pf-chips">
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>All</button>
            {facets.categories.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          {facets.technologies.length > 0 && (
            <select className="form-select pf-tech" value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Filter by technology"><option value="">All technologies</option>{facets.technologies.map((t) => <option key={t}>{t}</option>)}</select>
          )}
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : loading ? <SkeletonProjectCards /> : data.length ? (
          <div className="row g-4">{data.map((p) => <div className="col-md-6 col-lg-4 reveal" key={p.id}><ProjectCard p={p} /></div>)}</div>
        ) : <EmptyState icon="bi-collection" title="No projects to show" text={cat || tech ? 'Try clearing the filters.' : 'Our portfolio is being updated, please check back soon.'} />}
      </div></section>
      <CtaBand />
    </>
  );
}
