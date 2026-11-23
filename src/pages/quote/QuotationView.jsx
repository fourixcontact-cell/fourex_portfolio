import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../../services/public';
import { errMsg } from '../../services/api';
import { money, fmtDate } from '../../utils/format';
import { ErrorState } from '../../components/common/States';
import { Skel } from '../../components/loaders/Skeletons';
import StatusBadge from '../../components/common/StatusBadge';

/** Landing page for the tracked link in the quotation email. Opening it is what marks a quotation "Viewed". */
export default function QuotationView() {
  const { token } = useParams();
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { publicApi.quotationView(token).then((r) => setQ(r.data)).catch((e) => setError(errMsg(e))); }, [token]);
  return (
    <section className="page-hero"><div className="container" style={{ maxWidth: 640 }}>
      {error ? <ErrorState message={error} /> : !q ? <Skel h={180} r={16} /> : (
        <div className="card-x card-body-x text-start p-4">
          <div className="d-flex justify-content-between align-items-start mb-3"><div><div className="small text-muted-x">Quotation</div><h2 className="mb-0">{q.number}</h2></div><StatusBadge status={q.status} /></div>
          <h5>{q.projectName}</h5>
          <div className="row mt-3"><div className="col-6"><div className="small text-muted-x">Total</div><div className="fs-4 fw-bold">{money(q.total, q.currency)}</div></div><div className="col-6"><div className="small text-muted-x">Valid until</div><div className="fw-semibold">{fmtDate(q.expiryDate)}</div></div></div>
          <p className="small text-muted-x mt-4 mb-3">The full quotation PDF was attached to the email we sent you. To accept, ask questions or request changes, reply to that email, or sign in to your client portal.</p>
          <Link to="/login" className="btn btn-primary">Client portal login</Link>
        </div>)}
    </div></section>
  );
}
