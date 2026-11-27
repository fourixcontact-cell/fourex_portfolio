import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../../services/public';
import { errMsg } from '../../services/api';
import { Skel } from '../../components/loaders/Skeletons';
import { ErrorState } from '../../components/common/States';
import CtaBand from '../../components/common/CtaBand';
import { useSeo, trim } from '../../seo/seo';
import './PortfolioDetail.css';

export default function PortfolioDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setP(null); publicApi.portfolioItem(id).then((r) => setP(r.data)).catch((e) => setError(errMsg(e))); }, [id]);

  useSeo({ title: p?.title ? `${p.title} – ${p.category || 'Project'} | Fourix Portfolio` : '', description: trim(p?.summary || ''), path: `/portfolio/${id}`, image: p?.coverImage });
  if (error) return <div className="container pd-wrap"><ErrorState message={error} /><div className="text-center"><Link to="/portfolio" className="btn btn-soft">Back to portfolio</Link></div></div>;
  if (!p) return <div className="container pd-wrap"><Skel w="40%" h={34} /><Skel h={320} className="mt-4" r={16} /><Skel w="80%" className="mt-4" /><Skel w="70%" className="mt-2" /></div>;
  return (
    <>
      <div className="container pd-wrap page-enter">
        <Link to="/portfolio" className="small"><i className="bi bi-arrow-left me-1" />All projects</Link>
        <div className="small text-muted-x fw-semibold mt-3">{p.category}</div>
        <h1 className="mb-3">{p.title}</h1>
        <div className="d-flex gap-2 flex-wrap mb-4">
          {p.liveUrl && <a className="btn btn-primary btn-sm" href={p.liveUrl} target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right me-1" />Live site</a>}
          {p.githubUrl && <a className="btn btn-ghost btn-sm" href={p.githubUrl} target="_blank" rel="noopener noreferrer"><i className="bi bi-github me-1" />GitHub</a>}
        </div>
        {p.coverImage && <img className="pd-cover" src={p.coverImage} alt={`${p.title} cover`} loading="lazy" />}
        <div className="row gy-5 gx-lg-5 mt-1">
          <div className="col-lg-8"><h4>Overview</h4><p className="text-muted-x">{p.summary}</p>
            {p.caseStudy && (<><h4 className="mt-4">Case study</h4><div className="pd-case">{p.caseStudy}</div></>)}
            {p.screenshots.length > 0 && (<><h4 className="mt-4">Screenshots</h4><div className="row g-3">{p.screenshots.map((s, i) => <div className="col-md-6" key={i}><img className="pd-shot" src={s} alt={`${p.title} screenshot ${i + 1}`} loading="lazy" /></div>)}</div></>)}
          </div>
          <div className="col-lg-4"><div className="card-x card-body-x"><h6>Technology stack</h6>{p.techStack.map((t) => <span key={t} className="tag">{t}</span>)}{p.clientName && <><h6 className="mt-3">Client</h6><p className="mb-0">{p.clientName}</p></>}</div></div>
        </div>
      </div>
      <CtaBand />
    </>
  );
}
