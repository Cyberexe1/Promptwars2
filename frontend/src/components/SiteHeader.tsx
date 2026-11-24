import { Link, NavLink, useLocation } from 'react-router-dom';
import { BrandMark } from './BrandMark';

/**
 * Global header.
 *
 * `NavLink` sets `aria-current="page"` on the active route, so the current
 * location is exposed to assistive technology rather than signalled by
 * styling alone.
 *
 * There is no mobile menu by design: two destinations and one action fit a
 * narrow viewport, so a hamburger would hide the navigation behind an extra
 * tap for no gain. There is also no account menu, because the app has no
 * accounts.
 */
export function SiteHeader() {
  const { pathname } = useLocation();
  const onDashboard = pathname.startsWith('/dashboard');

  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link to="/" className="brand" aria-label="SmogWise home">
          <BrandMark />
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
            <li>
              <NavLink to="/privacy" className="site-nav-link">
                Privacy
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* The call to action is redundant once the user is on the dashboard,
            so it gives its space back instead of repeating itself. */}
        {!onDashboard && (
          <Link to="/dashboard" className="button button-primary header-cta">
            Check my air
          </Link>
        )}
      </div>
    </header>
  );
}
