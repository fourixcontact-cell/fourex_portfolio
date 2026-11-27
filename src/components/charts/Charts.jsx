import { useState } from 'react';
import { moneyShort } from '../../utils/format';
import './Charts.css';

/** Dependency-free SVG bar chart (monthly series). */
export function BarChart({ data, color = '#6A20E7', height = 220, format = moneyShort }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 600; const H = height; const pad = { t: 16, r: 8, b: 28, l: 8 };
  const bw = (W - pad.l - pad.r) / data.length;
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <div className="chart-wrap" role="img" aria-label={`Bar chart, total ${format(total)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - g)} y2={pad.t + (H - pad.t - pad.b) * (1 - g)} stroke="#eeeaf9" />)}
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.total) / max;
          const x = pad.l + i * bw + bw * 0.18;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect className="bar" x={x} y={H - pad.b - h} width={bw * 0.64} height={Math.max(h, d.total ? 2 : 0)} rx="4" fill={color} opacity={hover === null || hover === i ? 1 : 0.45} style={{ animationDelay: `${i * 35}ms` }} />
              <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#8b90a7">{d.label.split(' ')[0]}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && <div className="chart-tip">{data[hover].label}: <b>{format(data[hover].total)}</b></div>}
    </div>
  );
}

/** Donut chart for status distributions. */
export function Donut({ data, colors, size = 170 }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = 62; const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`Status chart, ${total} total`}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="#f0edf8" strokeWidth="20" />
        {total > 0 && data.map((d, i) => {
          const len = (d.count / total) * c;
          const el = <circle key={d.status} cx="80" cy="80" r={r} fill="none" stroke={colors[i % colors.length]} strokeWidth="20" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
          offset += len;
          return el;
        })}
        <text x="80" y="78" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1b1038">{total}</text>
        <text x="80" y="96" textAnchor="middle" fontSize="10" fill="#8b90a7">PROJECTS</text>
      </svg>
      <ul className="donut-legend">
        {data.map((d, i) => <li key={d.status}><span style={{ background: colors[i % colors.length] }} />{d.status}<b>{d.count}</b></li>)}
        {!data.length && <li className="text-muted-x">No projects yet</li>}
      </ul>
    </div>
  );
}
