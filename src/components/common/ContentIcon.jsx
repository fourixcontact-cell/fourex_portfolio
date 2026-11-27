export function contentIconClass(icon) {
  const value = typeof icon === 'string' ? icon.trim() : '';
  return value.startsWith('fa-') ? value : `bi ${value || 'bi-check2-circle'}`;
}

export default function ContentIcon({ icon, className = '' }) {
  return <i className={`${contentIconClass(icon)} ${className}`.trim()} aria-hidden="true" />;
}
