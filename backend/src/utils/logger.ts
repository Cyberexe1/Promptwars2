/**
 * Minimal structured logger.
 *
 * Privacy rule: this logger must never receive precise coordinates, health
 * preferences, or credentials. Callers log coarse facts only (route, status,
 * duration, error code). `redact` is provided for the few places that need to
 * reference a location at all.
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

/**
 * Reduces a coordinate to roughly city-block precision so that logs can show
 * an approximate area for debugging without recording a home address.
 */
export function redactCoordinate(value: number): string {
  return value.toFixed(1);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
