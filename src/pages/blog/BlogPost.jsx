import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../../services/public';
import { errMsg } from '../../services/api';
import { Skel } from '../../components/loaders/Skeletons';
import { ErrorState } from '../../components/common/States';
import { fmtDate } from '../../utils/format';
import CtaBand from '../../components/common/CtaBand';
import { useSeo, trim } from '../../seo/seo';
import './BlogPost.css';

export default function BlogPost() {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setP(null); setError(''); publicApi.post(slug).then((r) => setP(r.data)).catch((e) => setError(errMsg(e))); }, [slug]);
  useSeo({ title: p?.title ? `${p.title} | Fourix Blog` : '', description: trim(p?.excerpt || p?.body || ''), path: `/blog/${slug}`, image: p?.coverImage, type: 'article' });
  if (error) return <div className="container bp-wrap"><ErrorState message={error} /><div className="text-center"><Link to="/blog" className="btn btn-soft">Back to blog</Link></div></div>;
  if (!p) return <div className="container bp-wrap"><Skel w="60%" h={36} /><Skel className="mt-4" h={14} /><Skel className="mt-2" w="90%" h={14} /><Skel className="mt-2" w="80%" h={14} /></div>;
  return (
    <>
      <article className="container bp-wrap page-enter">
        <Link to="/blog" className="small"><i className="bi bi-arrow-left me-1" />All articles</Link>
        <h1 className="mt-3">{p.title}</h1><div className="text-muted-x mb-4">{fmtDate(p.publishedAt)}</div>
        {p.coverImage && <img src={p.coverImage} alt={p.title} className="bp-cover" />}
        {/* Body is rendered as plain text paragraphs: never as raw HTML (prevents XSS). */}
        <div className="prose">{(p.body || '').split(/\n{2,}/).map((para, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{para}</p>)}</div>
      </article>
      <CtaBand />
    </>
  );
}
