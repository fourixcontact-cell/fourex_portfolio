/** Labelled input/select/textarea with inline error. `options` renders a <select>. */
export default function Field({ label, name, value, onChange, error, type = 'text', options, rows, required, placeholder, hint, className = '', ...rest }) {
  const id = `f-${name}`;
  const common = { id, name, value: value ?? '', onChange: (e) => onChange(name, e.target.value), className: `form-control ${error ? 'is-invalid' : ''}`, placeholder, required, 'aria-invalid': !!error, ...rest };
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="form-label">{label}{required && <span className="text-danger"> *</span>}</label>}
      {options ? (
        <select {...common} className={`form-select ${error ? 'is-invalid' : ''}`}>
          {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o || '— Select —'}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      ) : rows ? <textarea {...common} rows={rows} /> : <input {...common} type={type} />}
      {hint && !error && <div className="small text-muted-x mt-1">{hint}</div>}
      {error && <div className="form-text-error">{error}</div>}
    </div>
  );
}
