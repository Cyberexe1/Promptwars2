import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import { BrandMark } from './BrandMark';

/**
 * Global header.
 *
 * Navigation reflects whether anyone is signed in. The dashboard link only
 * appears with a session, because it is the one route that requires one;
 * offering it to a signed-out visitor would promise a page they cannot open.
 *
 * `NavLink` sets `aria-current="page"` on the active route, so the current
 * location is exposed to assistive technology rather than signalled by
 * styling alone.
 *
 * There is no hamburger menu: the widest state is three links plus one
 * action, which fits a narrow viewport, so hiding navigation behind an extra
 * tap would cost more than it saves.
 */
export function SiteHeader() {
  const { status, user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const signedIn = status === 'signed-in';
  const onLoginPage = pathname === '/login';

  async function handleLogout() {
    // Navigate away first. Clearing the session while still on a guarded
    // route lets the route guard redirect to the login page, which is not
    // where someone who just logged out expects to land.
    navigate('/', { replace: true });
    await logout();
  }

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
            {signedIn && (
              <li>
                <NavLink to="/dashboard" className="site-nav-link">
                  Dashboard
                </NavLink>
              </li>
            )}
            <li>
              <NavLink to="/privacy" className="site-nav-link">
                Privacy
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="header-actions">
          {signedIn ? (
            <>
              {user?.email && (
                <span className="header-identity" title={user.email}>
                  <span className="sr-only">Signed in as </span>
                  {user.email}
                </span>
              )}
              <button
                type="button"
                className="button button-secondary"
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            // Hidden on the login page itself, where it would point at the
            // page already open.
            !onLoginPage && (
              <Link to="/login" className="button button-primary header-cta">
                Log in
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
