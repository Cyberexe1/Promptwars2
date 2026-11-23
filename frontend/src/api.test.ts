import { describe, expect, it, vi } from 'vitest';
import { ApiError, fetchAirQuality, fetchRecommendations, searchLocations } from './api';
import { AIR_QUALITY, DELHI_SUGGESTION, PLAN } from './test/fixtures';
import { errorResponse, jsonResponse, stubApi } from './test/server';
import { DEFAULT_PROFILE } from './defaults';

const LOCATION = { name: 'Delhi', latitude: 28.65, longitude: 77.23 };

describe('searchLocations', () => {
  it('returns the suggestion list', async () => {
    stubApi();
    await expect(searchLocations('Delhi')).resolves.toEqual([DELHI_SUGGESTION]);
  });

  it('encodes the query rather than interpolating it into the URL', async () => {
    const fetchMock = stubApi();
    await searchLocations('São Paulo & co');

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      'query=S%C3%A3o+Paulo+%26+co',
    );
  });
});

describe('fetchAirQuality', () => {
  it('passes the coordinates and name as query parameters', async () => {
    const fetchMock = stubApi();
    await fetchAirQuality(LOCATION);

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('latitude=28.65');
    expect(url).toContain('longitude=77.23');
    expect(url).toContain('name=Delhi');
  });

  it('resolves to the parsed reading', async () => {
    stubApi();
    await expect(fetchAirQuality(LOCATION)).resolves.toEqual(AIR_QUALITY);
  });
});

describe('fetchRecommendations', () => {
  it('posts the location and profile as JSON', async () => {
    const fetchMock = stubApi();
    await fetchRecommendations(LOCATION, DEFAULT_PROFILE);

    const request = fetchMock.mock.calls[0]![1]!;

    expect(request.method).toBe('POST');
    expect(
      (request.headers as Record<string, string>)['content-type'],
    ).toBe('application/json');
    expect(JSON.parse(String(request.body))).toEqual({
      location: LOCATION,
      profile: DEFAULT_PROFILE,
    });
  });

  it('resolves to the parsed plan', async () => {
    stubApi();
    await expect(fetchRecommendations(LOCATION, DEFAULT_PROFILE)).resolves.toEqual(
      PLAN,
    );
  });
});

describe('error handling', () => {
  it('surfaces the server message for a handled failure', async () => {
    stubApi({ airQuality: () => errorResponse(503, 'Upstream is unavailable.') });

    await expect(fetchAirQuality(LOCATION)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'Upstream is unavailable.',
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubApi({
      airQuality: () => new Response('<html>gateway timeout</html>', { status: 504 }),
    });

    await expect(fetchAirQuality(LOCATION)).rejects.toMatchObject({
      status: 504,
      message: 'Something went wrong. Please try again.',
    });
  });

  it('reports a network failure as an offline condition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const error = await fetchAirQuality(LOCATION).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/offline/i);
  });

  it('never attaches credentials or an API key to a request', async () => {
    const fetchMock = stubApi();
    await fetchAirQuality(LOCATION);

    const headers = (fetchMock.mock.calls[0]![1]?.headers ?? {}) as Record<
      string,
      string
    >;

    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain(
      'authorization',
    );
    expect(JSON.stringify(headers)).not.toMatch(/api[-_]?key/i);
  });
});

describe('response contract', () => {
  it('reads a plan that reports Bedrock as the generator', async () => {
    stubApi({
      recommendations: () => jsonResponse({ ...PLAN, generatedBy: 'bedrock' }),
    });

    const plan = await fetchRecommendations(LOCATION, DEFAULT_PROFILE);
    expect(plan.generatedBy).toBe('bedrock');
  });
});
