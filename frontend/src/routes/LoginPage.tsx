import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../authContext';

/** Mirrors the server's minimum, so the rule is stated before submitting. */
const MIN_PASSWORD_LENGTH = 12;

interface LocationState {
  from?: string;
}

/**
 * Sign in, or create an account.
 *
 * One page with two modes rather than two routes: the fields are identical and
 * people frequently arrive at the wrong one.
 *
 * The password rule is shown up front. The server enforces it regardless, but
 * telling someone after they have typed is worse than telling them before.
 */
export function LoginPage() {
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Where to land after signing in, set by the route guard.
  const destination = (location.state as LocationState | null)?.from ?? '/dashboard';
  const creating = mode === 'signup';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    // Empty first: telling someone who typed nothing that they need twelve
    // characters answers a question they did not ask.
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (creating && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (creating) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="focus-page">
      <div className="focus-page-inner">
        <p className="eyebrow">{creating ? 'Create an account' : 'Sign in'}</p>
        <h1>{creating ? 'Create your SmogWise account' : 'Sign in to SmogWise'}</h1>
        <p className="lede">
          {creating
            ? 'An account lets you return to your dashboard and build a plan for your household.'
            : 'Sign in to open your dashboard and build today’s plan.'}
        </p>

        <form className="card auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={emailId}>Email address</label>
            <input
              id={emailId}
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={passwordId}>Password</label>
            <input
              id={passwordId}
              type="password"
              value={password}
              // Tells a password manager whether to offer a saved password or
              // generate a new one.
              autoComplete={creating ? 'new-password' : 'current-password'}
              required
              {...(creating ? { minLength: MIN_PASSWORD_LENGTH } : {})}
              onChange={(event) => setPassword(event.target.value)}
            />
            {creating && (
              <span className="hint">
                At least {MIN_PASSWORD_LENGTH} characters. A short phrase of a few
                words is easier to remember and harder to guess than a short
                password with symbols.
              </span>
            )}
          </div>

          {error && (
            <p className="alert alert-error" id={errorId} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="button button-primary"
            disabled={busy}
            {...(error ? { 'aria-describedby': errorId } : {})}
          >
            {busy
              ? creating
                ? 'Creating your account…'
                : 'Signing you in…'
              : creating
                ? 'Create account'
                : 'Sign in'}
          </button>

          <p className="auth-switch">
            {creating ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMode(creating ? 'login' : 'signup');
                setError(null);
              }}
            >
              {creating ? 'Sign in instead' : 'Create one'}
            </button>
          </p>
        </form>

        <p className="hint auth-note">
          We store only your email address and a hashed password. Your
          household answers are sent with the request that builds your plan,
          but are never written to a database or a log. Saved plans stay on
          this device and never reach our server. See{' '}
          <Link to="/privacy">how your data is handled</Link>.
        </p>
      </div>
    </div>
  );
}
