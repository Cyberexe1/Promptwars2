import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { formatIssues } from '../schemas.js';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  TIMING_REFERENCE_HASH,
  verifyPassword,
} from '../services/password.js';
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from '../services/sessions.js';
import { getUserStore, normaliseEmail } from '../services/users.js';
import { AppError, badRequest } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { requireUser } from '../middleware/requireAuth.js';
import { LoginThrottle } from '../middleware/loginThrottle.js';
import type { AppConfig } from '../config.js';

/**
 * Authentication endpoints.
 *
 * Two rules shape the responses here:
 *
 *   1. Login does not reveal whether an address is registered. Every failure
 *      returns the same status, code, and wording, and a dummy hash is
 *      verified when no account exists so the timing matches too.
 *   2. Nothing sensitive is logged. Email addresses and passwords never reach
 *      the logger; only the outcome does.
 *
 * Signup is a deliberate exception, and this used to claim otherwise.
 * Registering a taken address returns 409 while a free one returns 201, which
 * tells the caller whether an account exists. That cannot be closed while
 * signup also signs the user in: whatever the response body says, the caller
 * learns the answer from whether they end up with a session. Returning a
 * uniform 202 and making everyone log in afterwards only moves the oracle to
 * the login attempt, at the cost of friction for every real user.
 *
 * Closing it properly needs a verified email channel, so signup can answer
 * "check your inbox" either way. That is recorded in docs/limitations.md
 * alongside the absence of password reset, which needs the same channel.
 *
 * What is done instead: a taken address costs an attacker one slot in the
 * per-account throttle, the same budget a failed login spends. Enumeration is
 * therefore bounded at the same rate as password guessing rather than being
 * free and unlimited. A real user still gets a clear message, because someone
 * who cannot register and is not told why has no way forward.
 */
const INVALID_CREDENTIALS = 'That email and password combination is not recognised.';

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  // Deliberately permissive: the only reliable test of an address is sending
  // to it, and over-strict patterns reject valid addresses.
  .refine((value) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value), {
    message: 'Enter a valid email address',
  });

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, 'That password is too long');

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Builds the auth router.
 *
 * The rate limit comes from configuration rather than a module constant, so a
 * test can exercise both the normal path and the limit itself without one
 * starving the other.
 */
export function createAuthRouter(config: AppConfig): Router {
  const authRouter = Router();

  // Scoped to this router instance so each app in a test suite gets its own,
  // rather than sharing counters through a module-level singleton.
  const throttle = new LoginThrottle();

  /**
   * Tight limit on credential endpoints, independent of the general API
   * budget. Password hashing is deliberately expensive, which makes these the
   * most attractive endpoints for both brute force and resource exhaustion.
   */
  const authLimiter = rateLimit({
    windowMs: config.authRateLimitWindowMs,
    limit: config.authRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait a few minutes and try again.',
      },
    },
  });

  authRouter.post(
    '/signup',
    authLimiter,
    asyncHandler(async (req, res) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(formatIssues(parsed.error));
      }

      const { email, password } = parsed.data;
      const store = getUserStore();

      // Signup spends the same per-account budget as a failed login, so probing
      // addresses for existing accounts is rate-limited rather than free. Also
      // stops repeated expensive hashing against one address.
      if (throttle.isBlocked(email)) {
        logger.info('signup_throttled');
        res.setHeader('Retry-After', String(throttle.retryAfterSeconds(email)));
        throw new AppError(
          429,
          'TOO_MANY_ATTEMPTS',
          'Too many attempts for this account. Please wait a few minutes and try again.',
        );
      }

      // Hash before the uniqueness check so a taken address and a free one cost
      // the same amount of time to answer.
      const passwordHash = await hashPassword(password);
      const user = await store.create(email, passwordHash);

      if (!user) {
        throttle.recordFailure(email);
        logger.info('signup_rejected', { reason: 'email_in_use' });
        throw new AppError(
          409,
          'EMAIL_IN_USE',
          'That email cannot be used to register. Try signing in instead.',
        );
      }

      res.cookie(
        SESSION_COOKIE,
        createSessionToken(user.id),
        sessionCookieOptions(SESSION_TTL_SECONDS * 1000),
      );

      logger.info('signup_succeeded');
      res.status(201).json({ user: { id: user.id, email: user.email } });
    }),
  );

  authRouter.post(
    '/login',
    authLimiter,
    asyncHandler(async (req, res) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        // Same message as a wrong password: a validation hint here would reveal
        // which addresses are well-formed enough to exist.
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }

      const { email, password } = parsed.data;

      // Per-account throttle, checked before any work is done. Applies whether
      // or not the account exists, so the response cannot be used to tell.
      if (throttle.isBlocked(email)) {
        logger.info('login_throttled');
        res.setHeader('Retry-After', String(throttle.retryAfterSeconds(email)));
        throw new AppError(
          429,
          'TOO_MANY_ATTEMPTS',
          'Too many sign-in attempts for this account. Please wait a few minutes and try again.',
        );
      }

      const user = await getUserStore().findByEmail(normaliseEmail(email));

      // Verify against a dummy hash when no user exists, so a missing account
      // and a wrong password take the same time to reject.
      const reference =
        user?.passwordHash ??
        TIMING_REFERENCE_HASH;
      const ok = await verifyPassword(password, reference);

      if (!user || !ok) {
        throttle.recordFailure(email);
        logger.info('login_failed');
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }

      // A correct password clears the record, so normal use is never penalised.
      throttle.recordSuccess(email);

      res.cookie(
        SESSION_COOKIE,
        createSessionToken(user.id),
        sessionCookieOptions(SESSION_TTL_SECONDS * 1000),
      );

      logger.info('login_succeeded');
      res.json({ user: { id: user.id, email: user.email } });
    }),
  );

  authRouter.post('/logout', (_req, res) => {
    // Overwrite with an immediately expiring cookie rather than relying on the
    // client to discard it.
    res.cookie(SESSION_COOKIE, '', sessionCookieOptions(0));
    res.json({ ok: true });
  });

  authRouter.get('/me', (req, res) => {
    const user = requireUser(req);
    if (!user) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Not signed in.' },
      });
      return;
    }
    res.json({ user });
  });

  return authRouter;
}
