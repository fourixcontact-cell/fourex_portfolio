import { useState } from 'react';
import { Link } from 'react-router-dom';
import './ProjectCard.css';

export default function ProjectCard({ p }) {
  const [loadedImage, setLoadedImage] = useState('');
  const [failedImage, setFailedImage] = useState('');
  const hasCover = p.coverImage && failedImage !== p.coverImage;

  return (
    <Link to={`/portfolio/${p.id}`} className="card-x hoverable pcard">
      <div className="pcard-img">
        {hasCover
          ? <img className={`pcard-bg ${loadedImage === p.coverImage ? 'is-loaded' : ''}`} src={p.coverImage} alt={p.title} loading="lazy" decoding="async" onLoad={() => setLoadedImage(p.coverImage)} onError={() => setFailedImage(p.coverImage)} />
          : <i className="bi bi-window-stack" />}
        {p.featured && <span className="pcard-feat"><i className="bi bi-star-fill me-1" />Featured</span>}
      </div>
      <div className="card-body-x pcard-body">
        <div className="small text-muted-x fw-semibold mb-1">{p.category}</div>
        <h5 className="mb-2">{p.title}</h5>
        <p className="small text-muted-x pcard-sum">{p.summary}</p>
        <div>{p.techStack.slice(0, 5).map((t) => <span key={t} className="tag">{t}</span>)}</div>
        <span className="pcard-go" aria-hidden="true"><i className="bi bi-arrow-right" /></span>
      </div>
    </Link>
  );
}
