import type {
  AirQualityResponse,
  HouseholdProfile,
  LocationInput,
  LocationSuggestion,
  RecommendationsResponse,
} from './types';

/**
 * Thin API client.
 *
 * The base URL is injected at build time. There are no credentials or API keys
 * in the browser: every upstream key stays on the server.
 *
 * An empty `VITE_API_URL` is meaningful, not missing: it makes every call
 * same-origin, which is what the deployed build uses now that CloudFront
 * proxies /api/* to App Runner. That matters because the session cookie is
 * `SameSite=Lax`, and a browser will not attach it to a cross-site fetch, so
 * calling the App Runner host directly left a signed-in user looking signed
 * out. `??` rather than `||` for exactly that reason.
 */
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

/** Error carrying a message that is safe to render to the user. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

const OFFLINE_MESSAGE =
  'You appear to be offline. Reconnect and try again to get a live reading.';

async function toApiError(response: Response): Promise<ApiError> {
  let message = 'Something went wrong. Please try again.';
  try {
    const body = (await response.json()) as ErrorBody;
    if (body.error?.message) {
      message = body.error.message;
    }
  } catch {
    // Non-JSON error response; keep the generic message.
  }
  return new ApiError(response.status, message);
}

const CSRF_COOKIE = 'smogwise_csrf';
const CSRF_HEADER = 'x-csrf-token';

/** Safe methods are exempt from the CSRF check, so they need no token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', undefined]);

/**
 * Reads the CSRF token the server set.
 *
 * This cookie is deliberately readable: the token is not a credential, it only
 * proves the request came from a page that can read our own cookies. The
 * session cookie remains httpOnly and is never touched here.
 */
function readCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CSRF_COOKIE) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  const csrfToken = SAFE_METHODS.has(init?.method) ? null : readCsrfToken();

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      // The session lives in an httpOnly cookie, which is only sent
      // cross-origin when credentials are included.
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Network-level failure: DNS, offline, CORS rejection, or abort.
    throw new ApiError(0, OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const params = new URLSearchParams({ query });
  const data = await requestJson<{ locations: LocationSuggestion[] }>(
    `/api/locations?${params.toString()}`,
    signal ? { signal } : undefined,
  );
  return data.locations;
}

export async function fetchAirQuality(
  location: LocationInput,
  signal?: AbortSignal,
): Promise<AirQualityResponse> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    name: location.name,
  });
  return requestJson<AirQualityResponse>(
    `/api/air-quality?${params.toString()}`,
    signal ? { signal } : undefined,
  );
}

export async function fetchRecommendations(
  location: LocationInput,
  profile: HouseholdProfile,
  signal?: AbortSignal,
): Promise<RecommendationsResponse> {
  return requestJson<RecommendationsResponse>('/api/recommendations', {
    method: 'POST',
    body: JSON.stringify({ location, profile }),
    ...(signal ? { signal } : {}),
  });
}
