/**
 * The SmogWise mark: a clear disc above settling haze layers.
 *
 * Decorative, so it is hidden from assistive technology. Every place it
 * appears also carries the wordmark or an accessible label.
 */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
        <circle cx="12" cy="8.5" r="4.5" fill="currentColor" />
        <path
          d="M4 15.5h16M6 19.5h12"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}
