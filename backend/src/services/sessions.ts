import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Stateless session tokens, signed with HMAC-SHA256.
 *
 * A token carries the user id, an expiry, and a random id, then a signature
 * over all of it. Nothing is stored server-side, so there is no session table
 * to scale or clean up.
 *
 * The trade-off, stated plainly: logging out clears the cookie but cannot
 * invalidate a token that has already been copied elsewhere. Tokens are
 * therefore short-lived. A deployment that needs immediate revocation would
 * add a denylist keyed by the token id, which is why `jti` is included.
 */

export const SESSION_COOKIE = 'smogwise_session';

/** Seven days. Long enough to be convenient, short enough to bound misuse. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  /** User id. */
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Token id, so a future revocation list has something to key on. */
  jti: string;
}

function sign(body: string): string {
  return createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
}

export function createSessionToken(
  userId: string,
  nowMs: number = Date.now(),
): string {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS,
    jti: randomUUID(),
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Returns the payload, or null when the token is invalid or expired. */
export function readSessionToken(
  token: string,
  nowMs: number = Date.now(),
): SessionPayload | null {
  try {
    const separator = token.lastIndexOf('.');
    if (separator <= 0) {
      return null;
    }

    const body = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = sign(body);

    // Compare in constant time, and only after a length check, since
    // timingSafeEqual throws on mismatched lengths.
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      return null;
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const payload = parsed as Partial<SessionPayload>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.jti !== 'string'
    ) {
      return null;
    }

    if (payload.exp * 1000 <= nowMs) {
      return null;
    }

    return { sub: payload.sub, exp: payload.exp, jti: payload.jti };
  } catch {
    return null;
  }
}

/**
 * Minimal cookie header parser.
 *
 * Express does not parse cookies, and this needs exactly one value, so a
 * dedicated middleware dependency would not pay for itself.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

/** Cookie attributes. Shared by login and logout so they cannot drift apart. */
export function sessionCookieOptions(maxAgeMs: number) {
  return {
    // Blocks script access, so a cross-site scripting bug cannot read the
    // token. It does not stop such a bug from making requests with it.
    httpOnly: true,
    // Limits the cookie to same-site requests, which blunts cross-site request
    // forgery.
    //
    // KNOWN ISSUE: in the current deployment the frontend is on CloudFront and
    // the API on App Runner, which are different sites, so a browser will not
    // attach this cookie to the frontend's cross-site fetch at all. The fix is
    // to serve the API through a CloudFront /api behaviour so the two share an
    // origin, not to weaken this to 'none'. Note that the curl-based live
    // smoke tests cannot catch this, because curl ignores SameSite.
    sameSite: 'lax' as const,
    // Requires HTTPS. Off in development so local http works.
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}
