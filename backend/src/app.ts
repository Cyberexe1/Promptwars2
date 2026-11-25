import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config as defaultConfig, type AppConfig } from './config.js';
import { apiRouter } from './routes/index.js';
import { createAuthRouter } from './routes/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachUser } from './middleware/requireAuth.js';
import { issueCsrfToken, requireCsrfToken } from './middleware/csrf.js';
import { AppError } from './utils/errors.js';

/**
 * Builds the Express app without starting a listener, so tests can drive it
 * directly through Supertest.
 *
 * Configuration is a parameter rather than a module-level read, so a test can
 * pin values such as the CORS allowlist instead of inheriting whatever the
 * surrounding environment happens to set.
 */
export function createApp(config: AppConfig = defaultConfig): express.Express {
  const app = express();

  // App Runner terminates TLS upstream, so trust its forwarding headers for
  // correct client IPs in rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  // Plan and outlook responses are several kilobytes of repetitive JSON, which
  // compresses to roughly a quarter of its size. That matters most on the
  // mobile connections this app is likely to be used on.
  app.use(compression());

  app.use(
    cors({
      // Session cookies are only sent cross-origin when credentials are
      // allowed, which in turn forbids a wildcard origin. The explicit
      // allowlist below is therefore a requirement, not just good practice.
      credentials: true,
      // The CSRF token travels in a custom header, which must be allowed
      // through the preflight or the browser will not send it.
      allowedHeaders: ['content-type', 'accept', 'x-csrf-token'],
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin.
        if (!origin || config.corsAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // A disallowed origin is a client policy failure, not a server fault.
        // Reporting it as 403 keeps it out of the unhandled-error logs that
        // CloudWatch alarms watch.
        callback(
          new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'),
        );
      },
      methods: ['GET', 'POST'],
      maxAge: 600,
    }),
  );

  // Small ceiling: the largest legitimate body is a short household profile.
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  // Reads the session cookie when one is present. Non-blocking: public
  // endpoints keep working for signed-out visitors.
  app.use(attachUser);

  // Hands API callers a CSRF token, then requires it on state-changing
  // requests. Scoped to /api so the health probe, which App Runner polls
  // every ten seconds, does not collect a cookie it will never use.
  app.use('/api', issueCsrfToken);
  app.use('/api', requireCsrfToken);

  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment and try again.',
        },
      },
    }),
  );

  // Mounted before the general router so the stricter auth rate limit applies.
  app.use('/api/auth', createAuthRouter(config));
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
