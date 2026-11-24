import { requestJson } from './api';

/**
 * Authentication calls.
 *
 * The session lives in an httpOnly cookie, which means JavaScript cannot read
 * it. That is the point: a cross-site scripting bug cannot steal the token.
 * The consequence is that "am I signed in?" is answered by asking the server,
 * never by inspecting local state.
 */

export interface AuthUser {
  id: string;
  email?: string;
}

export async function signup(email: string, password: string): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

/** Resolves to null when there is no valid session. */
export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  try {
    const data = await requestJson<{ user: AuthUser }>(
      '/api/auth/me',
      signal ? { signal } : undefined,
    );
    return data.user;
  } catch {
    // A 401 is the normal answer for a signed-out visitor, not an error.
    return null;
  }
}
