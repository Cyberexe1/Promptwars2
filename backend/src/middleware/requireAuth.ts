import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
} from '../services/sessions.js';
import { AppError } from '../utils/errors.js';

/**
 * Session reading and route protection.
 *
 * `attachUser` runs on every request and is non-blocking: it records who the
 * caller is when a valid session exists and otherwise does nothing.
 * `requireAuth` rejects a request that has no session.
 */

export interface AuthenticatedUser {
  id: string;
}

/** Request augmentation, so handlers can read the caller without a cast. */
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export const attachUser: RequestHandler = (req, _res, next) => {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (token) {
    const payload = readSessionToken(token);
    if (payload) {
      req.user = { id: payload.sub };
    }
  }
  next();
};

export function requireUser(req: Request): AuthenticatedUser | null {
  return req.user ?? null;
}

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(
      new AppError(401, 'UNAUTHENTICATED', 'Sign in to use this part of SmogWise.'),
    );
    return;
  }
  next();
};
