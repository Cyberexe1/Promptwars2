import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'This endpoint does not exist.' },
  });
};

/**
 * Converts anything thrown in a route into a JSON error.
 *
 * Only AppError messages reach the client. Unexpected errors are logged by name
 * and returned as a generic failure so internal details never leak.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    logger.warn('request_failed', {
      method: req.method,
      path: req.path,
      status: error.statusCode,
      code: error.code,
    });
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // body-parser rejections: oversized or unparseable request bodies. These
  // carry their own status, which must survive instead of becoming a 500.
  const parserError = error as { type?: unknown; status?: unknown };
  if (typeof parserError.type === 'string' && parserError.type.startsWith('entity.')) {
    const tooLarge = parserError.type === 'entity.too.large';
    const status = typeof parserError.status === 'number' ? parserError.status : 400;

    logger.warn('request_rejected', {
      method: req.method,
      path: req.path,
      status,
      type: parserError.type,
    });

    res.status(status).json({
      error: {
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: tooLarge
          ? 'Request body is too large.'
          : 'Request body is not valid JSON.',
      },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON.' },
    });
    return;
  }

  logger.error('unhandled_error', {
    method: req.method,
    path: req.path,
    name: error instanceof Error ? error.name : 'unknown',
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    },
  });
};
