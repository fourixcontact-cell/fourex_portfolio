import { tone } from '../../utils/format';
export default function StatusBadge({ status, children }) {
  if (!status) return null;
  const t = tone(status);
  return <span className={`badge-soft ${t ? `s-${t}` : ''}`}>{children || status}</span>;
}
