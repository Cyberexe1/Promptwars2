/**
 * Minimal structured logger.
 *
 * Privacy rule: this logger must never receive coordinates, email addresses,
 * health preferences, tokens, or credentials. Callers log coarse facts only:
 * route, status, error code, and counts. No call site anywhere needs to name a
 * location, so there is no helper for doing it safely.
 */
type LogLevel = 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: string | number | boolean | undefined;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
