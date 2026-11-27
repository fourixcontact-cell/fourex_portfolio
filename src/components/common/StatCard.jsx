import './StatCard.css';
export default function StatCard({ icon, label, value, hint, color = 'primary' }) {
  return (
    <div className="card-x hoverable stat-card">
      <div className={`stat-ico c-${color}`}><i className={`bi ${icon}`} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value money">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
