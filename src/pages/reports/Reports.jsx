import { useState } from 'react';
import { get, download } from '../../services/crm';
import { errMsg } from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import { SkeletonTable } from '../../components/loaders/Skeletons';
import { ErrorState, EmptyState } from '../../components/common/States';
import { money } from '../../utils/format';
import './Reports.css';

const REPORTS = [
  ['monthly-revenue', 'Monthly revenue', 'bi-cash-coin', true], ['monthly-expenses', 'Monthly expenses', 'bi-wallet2', true], ['profit-loss', 'Profit & loss', 'bi-graph-up-arrow', true],
  ['project-profitability', 'Project profitability', 'bi-kanban', false], ['client-revenue', 'Client-wise revenue', 'bi-people', true], ['pending-payments', 'Pending payments', 'bi-clock-history', false],
  ['lead-conversion', 'Lead conversion', 'bi-bullseye', true], ['quotation-acceptance', 'Quotation acceptance', 'bi-file-earmark-check', true], ['project-completion', 'Project completion rate', 'bi-patch-check', false],
  ['project-delays', 'Project delays', 'bi-calendar-x', false], ['admin-contribution', 'Admin contribution', 'bi-person-badge', true], ['expense-categories', 'Expense categories', 'bi-pie-chart', true]
];

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState('monthly-revenue'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const cur = REPORTS.find((r) => r[0] === type);
  const { data, loading, error, reload } = useFetch(() => get(`/reports/${type}`, { from: from || undefined, to: to || undefined }), [type, from, to]);
  const rep = data?.data;
  const exp = (format) => download(`/reports/${type}?format=${format}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, `${type}.${format}`).then(() => toast.success(`${format.toUpperCase()} exported`)).catch((e) => toast.error(errMsg(e)));

  return (
    <>
      <PageHeader title="Reports" subtitle="Generated from live database records" crumbs={[{ label: 'Reports' }]} actions={<><button className="btn btn-ghost" onClick={() => exp('csv')}><i className="bi bi-filetype-csv me-1" />CSV</button><button className="btn btn-primary" onClick={() => exp('pdf')}><i className="bi bi-file-earmark-pdf me-1" />PDF</button></>} />
      <div className="row g-3">
        <div className="col-lg-3"><div className="card-x rep-list">{REPORTS.map(([k, l, i]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}><i className={`bi ${i}`} />{l}</button>)}</div></div>
        <div className="col-lg-9"><div className="card-x">
          <div className="card-head flex-wrap"><h5>{rep?.title || cur[1]}</h5>
            {cur[3] && <div className="d-flex gap-2 align-items-center"><input type="date" className="form-control form-control-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><span className="small text-muted-x">to</span><input type="date" className="form-control form-control-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />{(from || to) && <button className="btn btn-link btn-sm" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>}</div>}</div>
          {error ? <ErrorState message={error} onRetry={reload} /> : loading && !rep ? <SkeletonTable cols={5} /> : !rep?.rows.length ? <EmptyState icon="bi-bar-chart" title="No data for this report" text={from || to ? 'Try a wider date range.' : 'Records will appear as you use the CRM.'} /> : (
            <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}><table className="table-x table-responsive-stack"><thead><tr>{rep.columns.map((c) => <th key={c.key} className={c.money ? 'text-end' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>{rep.rows.map((r, i) => { const tot = /^(TOTAL|ALL )/.test(String(Object.values(r)[0])); return <tr key={i} className={tot ? 'fw-bold bg-light' : ''}>{rep.columns.map((c) => <td key={c.key} data-label={c.label} className={c.money ? 'text-end money' : ''}>{c.money ? money(r[c.key]) : r[c.key] ?? '—'}</td>)}</tr>; })}</tbody></table></div>)}
        </div></div>
      </div>
    </>
  );
}
