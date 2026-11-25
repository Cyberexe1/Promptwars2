import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config.js';
import { readCookie } from '../services/sessions.js';
import { AppError } from '../utils/errors.js';

/**
 * Cross-site request forgery protection.
 *
 * `SameSite=Lax` on the session cookie already blocks the common case, but it
 * is one browser setting away from being the only thing standing in the way,
 * and it does not cover every legacy or embedded browser. This adds two
 * independent checks on top.
 *
 * 1. Origin check. A state-changing request must come from an allowed origin.
 *    Cross-site form posts cannot forge the `Origin` header, so this alone
 *    stops the classic attack.
 * 2. Double-submit token. A readable cookie must match a header the page
 *    sends. Another site can cause a request to be sent with our cookies, but
 *    cannot read them to copy the value into a header.
 *
 * The token cookie is deliberately *not* `HttpOnly`: the page has to read it.
 * That is safe because the token is not a credential. It proves only that the
 * request came from a page able to read our own cookies.
 */

export const CSRF_COOKIE = 'smogwise_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Safe methods do not change state, so they are exempt. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Issues the token cookie when the client does not have one.
 *
 * Runs on every request so a page always has a token available before it
 * needs to make its first state-changing call.
 */
export const issueCsrfToken: RequestHandler = (req, res, next) => {
  if (!readCookie(req.headers.cookie, CSRF_COOKIE)) {
    res.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
      // Readable by script on purpose: the page must echo it in a header.
      httpOnly: false,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/',
    });
  }
  next();
};

export const requireCsrfToken = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const reject = () =>
    next(
      new AppError(
        403,
        'CSRF_FAILED',
        'This request could not be verified. Reload the page and try again.',
      ),
    );

  // 1. Origin must be one we serve, when the browser sends one.
  const origin = req.headers.origin;
  if (origin && !config.corsAllowedOrigins.includes(origin)) {
    reject();
    return;
  }

  // 2. Cookie and header must agree.
  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE);
  const headerValue = req.headers[CSRF_HEADER];
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    reject();
    return;
  }

  next();
};
