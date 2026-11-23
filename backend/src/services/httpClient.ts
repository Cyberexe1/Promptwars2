import { upstreamUnavailable } from '../utils/errors.js';

/**
 * JSON fetch with a hard timeout and a response-size ceiling.
 *
 * External responses are treated purely as data: callers parse them through a
 * schema and never act on instructions contained in them.
 */
const MAX_RESPONSE_BYTES = 512 * 1024;

export interface FetchJsonOptions {
  timeoutMs: number;
  /** Shown to the user if the call fails. Must not contain internal detail. */
  label: string;
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      redirect: 'error',
    });

    if (!response.ok) {
      throw upstreamUnavailable(
        `${options.label} is not responding correctly right now. Please try again shortly.`,
      );
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw upstreamUnavailable(
        `${options.label} returned an unexpectedly large response.`,
      );
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw upstreamUnavailable(
        `${options.label} returned an unexpectedly large response.`,
      );
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw upstreamUnavailable(`${options.label} timed out. Please try again.`);
    }
    if (error instanceof SyntaxError) {
      throw upstreamUnavailable(`${options.label} returned an unreadable response.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
