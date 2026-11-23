import { vi } from 'vitest';
import { AIR_QUALITY, DELHI_SUGGESTION, PLAN } from './fixtures';

/**
 * A stand-in for the API.
 *
 * Tests never reach the network: `fetch` is stubbed and every route returns a
 * fixture, so the suite is deterministic and offline-safe.
 */

export interface RouteOverrides {
  locations?: () => Response | Promise<Response>;
  airQuality?: () => Response | Promise<Response>;
  recommendations?: () => Response | Promise<Response>;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: { code: 'TEST_ERROR', message } }, status);
}

/** Installs the fetch stub and returns the mock for assertions. */
export function stubApi(overrides: RouteOverrides = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.includes('/api/locations')) {
      return (
        overrides.locations?.() ??
        jsonResponse({ locations: [DELHI_SUGGESTION] })
      );
    }
    if (url.includes('/api/air-quality')) {
      return overrides.airQuality?.() ?? jsonResponse(AIR_QUALITY);
    }
    if (url.includes('/api/recommendations')) {
      return overrides.recommendations?.() ?? jsonResponse(PLAN);
    }

    throw new Error(`Unexpected request in test: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
