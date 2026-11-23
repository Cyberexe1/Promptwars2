/**
 * Error carrying an HTTP status and a message that is safe to show a user.
 * Anything that is not an AppError is reported to the client as a generic
 * failure so that internal details never leak.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, 'BAD_REQUEST', message);
}

export function notFound(message: string): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function upstreamUnavailable(message: string): AppError {
  return new AppError(503, 'UPSTREAM_UNAVAILABLE', message);
}
