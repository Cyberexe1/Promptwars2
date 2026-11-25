import { createContext, useContext } from 'react';
import type { AuthUser } from './auth';

/**
 * The auth context and its hook, kept apart from the provider component.
 *
 * A file that exports both a component and a hook breaks React Fast Refresh,
 * so the provider lives in `AuthProvider.tsx` and the shared values live here.
 */

/**
 * `checking` is the initial state because the session cookie is httpOnly: the
 * app cannot know whether it is signed in until the server answers. Treating
 * that as signed out would bounce a signed-in user on every page refresh.
 */
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
