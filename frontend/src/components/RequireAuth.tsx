import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../authContext';

/**
 * Guards a route behind a session.
 *
 * While the session check is in flight the guard renders a waiting state
 * rather than redirecting. Redirecting on `checking` would bounce a signed-in
 * user to the login page on every refresh, because the httpOnly cookie cannot
 * be read without asking the server first.
 *
 * This is a convenience boundary only. The server independently rejects an
 * unauthenticated plan request, so removing this component would not expose
 * anything.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="shell section page-narrow">
        <p className="alert alert-info" role="status">
          Checking your session…
        </p>
      </div>
    );
  }

  if (status === 'signed-out') {
    // `replace` keeps the guarded URL out of history, and `from` sends the
    // user to where they were going once signed in.
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <>{children}</>;
}
