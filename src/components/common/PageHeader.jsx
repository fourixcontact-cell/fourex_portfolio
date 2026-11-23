import './PageHeader.css';
import { Link } from 'react-router-dom';

export default function PageHeader({ title, subtitle, crumbs = [], actions }) {
  return (
    <div className="page-header">
      <div>
        <nav aria-label="breadcrumb" className="crumbs">
          <Link to="/crm"><i className="bi bi-house-door" /></Link>
          {crumbs.map((c) => (<span key={c.label}><i className="bi bi-chevron-right" />{c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}</span>))}
        </nav>
        <h1>{title}</h1>
        {subtitle && <p className="text-muted-x mb-0">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
