import { Link, useOutletContext } from 'react-router-dom';
import { Skel } from '../../components/loaders/Skeletons';
import { EmptyState } from '../../components/common/States';
import { fmtDate } from '../../utils/format';
import './Blog.css';

export default function Blog() {
  const { site } = useOutletContext() || {};
  const posts = site?.posts;
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Blog &amp; case studies</span><h1>Ideas, lessons and <span className="grad-text">project stories</span></h1></div></section>
      <section className="sec"><div className="container">
        {!site ? <div className="row g-4">{[0, 1, 2].map((i) => <div className="col-md-4" key={i}><div className="card-x"><Skel h={160} r={14} /><div className="card-body-x"><Skel w="80%" h={18} /><Skel className="mt-3" /></div></div></div>)}</div>
          : posts.length ? <div className="row g-4">{posts.map((p) => (
            <div className="col-md-6 col-lg-4" key={p.slug}><Link to={`/blog/${p.slug}`} className="card-x hoverable blog-card">
              <div className="blog-img" style={p.coverImage ? { backgroundImage: `url(${p.coverImage})` } : undefined}>{!p.coverImage && <i className="bi bi-journal-text" />}</div>
              <div className="card-body-x"><div className="small text-muted-x mb-1">{fmtDate(p.publishedAt)}</div><h5>{p.title}</h5><p className="small text-muted-x mb-2">{p.excerpt}</p>{(p.tags || []).map((t) => <span className="tag" key={t}>{t}</span>)}</div></Link></div>))}</div>
          : <EmptyState icon="bi-journal-text" title="No articles published yet" text="Case studies and articles will appear here." />}
      </div></section>
    </>
  );
}
