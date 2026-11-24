import { Link, NavLink } from 'react-router-dom';

/**
 * Site header with the primary navigation.
 *
 * `NavLink` sets `aria-current="page"` on the active route, so the current
 * location is exposed to assistive technology and not signalled by styling
 * alone.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link to="/" className="brand" aria-label="SmogWise home">
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
          <span className="brand-word">SmogWise</span>
        </Link>

        <nav aria-label="Main">
          <ul className="site-nav">
            <li>
              <NavLink to="/" end className="site-nav-link">
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/dashboard" className="site-nav-link">
                Dashboard
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
