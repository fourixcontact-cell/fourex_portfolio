import { Navigate, useOutletContext } from 'react-router-dom';
import { Skel } from '../../components/loaders/Skeletons';
import CtaBand from '../../components/common/CtaBand';
import './Team.css';

export default function Team() {
  const { site } = useOutletContext() || {};
  const team = site?.team || [];
  if (site && team.length === 0) return <Navigate to="/" replace />;
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Our team</span><h1>The people <span className="grad-text">behind your product</span></h1><p>Engineers and designers who care about getting the details right.</p></div></section>
      <section className="sec"><div className="container">
        {!site ? <div className="row g-4">{[0, 1, 2, 3].map((i) => <div className="col-sm-6 col-lg-3" key={i}><div className="card-x card-body-x text-center"><Skel w={96} h={96} r={999} className="mx-auto" /><Skel w="60%" h={16} className="mx-auto mt-3" /><Skel w="40%" h={12} className="mx-auto mt-2" /></div></div>)}</div>
          : <div className="row g-4 justify-content-center">{team.map((m, i) => (
            <div className="col-sm-6 col-lg-3" key={i}><div className="card-x hoverable card-body-x text-center team-card">
              {m.photoUrl ? <img src={m.photoUrl} alt={m.name} className="team-photo" loading="lazy" /> : <div className="team-photo ph">{m.name?.[0]}</div>}
              <h5 className="mt-3 mb-0">{m.name}</h5><div className="text-primary small fw-semibold mb-2">{m.title}</div><p className="small text-muted-x">{m.bio}</p>
              <div className="d-flex gap-2 justify-content-center">{m.github && <a href={m.github} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on GitHub`}><i className="bi bi-github" /></a>}{m.linkedin && <a href={m.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on LinkedIn`}><i className="bi bi-linkedin" /></a>}</div>
            </div></div>))}</div>}
      </div></section>
      <CtaBand />
    </>
  );
}
