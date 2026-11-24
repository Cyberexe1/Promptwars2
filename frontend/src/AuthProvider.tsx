import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
  type AuthUser,
} from './auth';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './authContext';

/**
 * Provides authentication state to the app.
 *
 * On mount it asks the server who the caller is, because the session cookie is
 * httpOnly and cannot be read from script.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchCurrentUser(controller.signal).then((current) => {
      if (controller.signal.aborted) return;
      setUser(current);
      setStatus(current ? 'signed-in' : 'signed-out');
    });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    setUser(next);
    setStatus('signed-in');
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const next = await signupRequest(email, password);
    setUser(next);
    setStatus('signed-in');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Clear local state even if the request failed, so the interface never
      // shows someone as signed in after they asked to leave.
      setUser(null);
      setStatus('signed-out');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout }),
    [status, user, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
