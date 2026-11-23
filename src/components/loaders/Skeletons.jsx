import './Skeletons.css';

export const Skel = ({ w = '100%', h = 14, r, className = '', style }) => (
  <div className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);

export const SkeletonStatCards = ({ count = 4 }) => (
  <div className="row g-3" aria-busy="true" aria-label="Loading statistics">
    {Array.from({ length: count }).map((_, i) => (
      <div className="col-6 col-lg-3" key={i}>
        <div className="card-x card-body-x"><Skel w={38} h={38} r={10} /><Skel w="55%" h={12} className="mt-3" /><Skel w="40%" h={24} className="mt-2" /></div>
      </div>
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
  <div aria-busy="true" aria-label="Loading table">
    <div className="skel-table-head">{Array.from({ length: cols }).map((_, i) => <Skel key={i} w="60%" h={10} />)}</div>
    {Array.from({ length: rows }).map((_, r) => (
      <div className="skel-table-row" key={r} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((__, c) => <Skel key={c} w={c === 0 ? '80%' : `${50 + ((r * 7 + c * 13) % 40)}%`} h={12} />)}
      </div>
    ))}
  </div>
);

export const SkeletonProjectCards = ({ count = 6 }) => (
  <div className="row g-4" aria-busy="true" aria-label="Loading projects">
    {Array.from({ length: count }).map((_, i) => (
      <div className="col-md-6 col-lg-4" key={i}>
        <div className="card-x overflow-hidden"><Skel h={210} r={0} /><div className="card-body-x"><Skel w="40%" h={12} /><Skel w="70%" h={20} className="mt-2" /><Skel w="100%" h={10} className="mt-3" /><Skel w="85%" h={10} className="mt-2" /><div className="d-flex gap-2 mt-3"><Skel w={60} h={22} r={999} /><Skel w={60} h={22} r={999} /></div></div></div>
      </div>
    ))}
  </div>
);

export const SkeletonProfile = () => (
  <div className="card-x card-body-x" aria-busy="true" aria-label="Loading profile">
    <div className="d-flex gap-3 align-items-center"><Skel w={64} h={64} r={999} /><div className="flex-grow-1"><Skel w="40%" h={18} /><Skel w="25%" h={12} className="mt-2" /></div></div>
    <div className="row g-3 mt-3">{Array.from({ length: 6 }).map((_, i) => <div className="col-md-4" key={i}><Skel w="40%" h={10} /><Skel w="80%" h={14} className="mt-2" /></div>)}</div>
  </div>
);

export const SkeletonBlock = ({ lines = 4 }) => (
  <div aria-busy="true">{Array.from({ length: lines }).map((_, i) => <Skel key={i} w={`${95 - i * 12}%`} h={12} className="mb-2" />)}</div>
);
