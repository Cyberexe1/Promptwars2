import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards rejected promises to the error handler.
 *
 * Express 5 does this for async handlers already; keeping it explicit means the
 * behaviour does not depend on that version detail.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
