/** Fourix logo mark (the "F" app icon). Decorative: the name next to it is the accessible label. */
export default function BrandMark({ size = 38, className = '' }) {
  return <img className={`brand-mark-img ${className}`} src="/brand/fourix-icon-192.png" width={size} height={size} alt="" aria-hidden="true" decoding="async" />;
}
