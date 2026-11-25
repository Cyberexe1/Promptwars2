import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// The suite never touches the network: both upstream services are mocked.
vi.mock('../src/services/airQuality.js', () => ({
  getCurrentAirQuality: vi.fn(),
  AIR_QUALITY_SOURCE_NAME: 'Open-Meteo Air Quality API',
  AIR_QUALITY_SOURCE_URL: 'https://open-meteo.com/en/docs/air-quality-api',
}));

vi.mock('../src/services/geocoding.js', () => ({
  searchLocations: vi.fn(),
}));

const { createApp } = await import('../src/app.js');
const { loadConfig } = await import('../src/config.js');
const { getCurrentAirQuality } = await import('../src/services/airQuality.js');
const { searchLocations } = await import('../src/services/geocoding.js');
const { upstreamUnavailable } = await import('../src/utils/errors.js');
const { postJson, TEST_CSRF } = await import('./helpers.js');
const { CSRF_COOKIE, CSRF_HEADER } = await import('../src/middleware/csrf.js');
const { createSessionToken, SESSION_COOKIE } = await import(
  '../src/services/sessions.js'
);

const ALLOWED_ORIGIN = 'http://localhost:5173';

// Config is pinned rather than inherited, so the suite behaves the same on any
// machine regardless of local environment variables.
const app = createApp(
  loadConfig({
    NODE_ENV: 'test',
    CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
  } as NodeJS.ProcessEnv),
);

const READING = {
  current: {
    usAqi: 168,
    europeanAqi: 82,
    pm25: 71.2,
    pm10: 140.5,
    nitrogenDioxide: 48.3,
    ozone: 12.1,
    observedAt: new Date().toISOString(),
  },
  source: {
    name: 'Open-Meteo Air Quality API',
    url: 'https://open-meteo.com/en/docs/air-quality-api',
    retrievedAt: new Date().toISOString(),
  },
  stale: false,
};

const VALID_PROFILE = {
  ageGroups: ['adult'],
  sensitive: false,
  commuteMethod: 'car',
  outdoorMinutes: 60,
  cookingFuel: 'gas',
  purifier: false,
  budget: 'medium',
};

const VALID_BODY = {
  location: { name: 'Delhi', latitude: 28.61, longitude: 77.21 },
  profile: VALID_PROFILE,
};

/**
 * A valid session for the plan endpoint, which sits behind the account
 * boundary. Authentication itself is covered in `auth.test.ts`; these cases
 * are about validation and error handling.
 */
const SESSION = `${SESSION_COOKIE}=${createSessionToken('test-user')}`;

/** POSTs a plan request as a signed-in user, with a valid CSRF pair. */
function postPlan(body: unknown) {
  return postJson(app, '/api/recommendations', body, [SESSION]);
}

beforeEach(() => {
  vi.mocked(getCurrentAirQuality).mockResolvedValue(READING);
  vi.mocked(searchLocations).mockResolvedValue([
    {
      id: 1261481,
      name: 'Delhi',
      country: 'India',
      admin1: 'Delhi',
      latitude: 28.65195,
      longitude: 77.23149,
    },
  ]);
});

describe('GET /health', () => {
  it('reports service health without requiring any upstream call', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(getCurrentAirQuality).not.toHaveBeenCalled();
  });
});

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('cross-origin policy', () => {
  it('allows the configured frontend origin', async () => {
    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 })
      .set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('rejects an unlisted origin as a client error, not a server fault', async () => {
    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 })
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /api/locations', () => {
  it('returns matching cities', async () => {
    const response = await request(app).get('/api/locations').query({ query: 'Delhi' });

    expect(response.status).toBe(200);
    expect(response.body.locations[0]).toMatchObject({
      name: 'Delhi',
      country: 'India',
    });
  });

  it('returns an empty list rather than an error when nothing matches', async () => {
    vi.mocked(searchLocations).mockResolvedValue([]);

    const response = await request(app).get('/api/locations').query({ query: 'zzzzz' });

    expect(response.status).toBe(200);
    expect(response.body.locations).toEqual([]);
  });

  it.each([
    ['a missing query', {}],
    ['an empty query', { query: '   ' }],
    ['an over-long query', { query: 'x'.repeat(81) }],
    ['a query containing control characters', { query: 'Delhi\u0007' }],
  ])('rejects %s', async (_label, query) => {
    const response = await request(app).get('/api/locations').query(query);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /api/air-quality', () => {
  it('returns the reading, band, and source provenance', async () => {
    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21, name: 'Delhi' });

    expect(response.status).toBe(200);
    expect(response.body.current.usAqi).toBe(168);
    expect(response.body.risk.level).toBe('unhealthy');
    expect(response.body.risk.label).toBe('Unhealthy');
    expect(response.body.source.url).toContain('open-meteo.com');
    expect(response.body.stale).toBe(false);
    expect(response.body.location.name).toBe('Delhi');
  });

  it('does not escalate the band on this endpoint, which has no profile', async () => {
    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 });

    expect(response.body.risk.escalatedForSensitivity).toBe(false);
    expect(response.body.risk.effectiveLevel).toBe(response.body.risk.level);
  });

  it.each([
    ['missing coordinates', {}],
    ['a latitude beyond the pole', { latitude: 91, longitude: 0 }],
    ['a longitude beyond the meridian range', { latitude: 0, longitude: 181 }],
    ['a non-numeric latitude', { latitude: 'north', longitude: 0 }],
  ])('rejects %s', async (_label, query) => {
    const response = await request(app).get('/api/air-quality').query(query);

    expect(response.status).toBe(400);
  });

  it('surfaces an upstream outage as a 503 with a safe message', async () => {
    vi.mocked(getCurrentAirQuality).mockRejectedValue(
      upstreamUnavailable('The air-quality service timed out. Please try again.'),
    );

    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.body.error.message).toMatch(/try again/i);
  });

  it('does not leak internal detail when something unexpected throws', async () => {
    vi.mocked(getCurrentAirQuality).mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.5:443'),
    );

    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });
});

describe('POST /api/recommendations', () => {
  it('returns a complete, attributed plan', async () => {
    const response = await postPlan(VALID_BODY);

    expect(response.status).toBe(200);
    expect(response.body.recommendations.length).toBeGreaterThanOrEqual(4);
    expect(response.body.recommendations.length).toBeLessThanOrEqual(6);
    expect(response.body.generatedBy).toBe('rules');
    expect(response.body.disclaimer).toMatch(/not medical advice/i);
    expect(response.body.airQuality.source.name).toContain('Open-Meteo');
    expect(response.body.airQuality.current.observedAt).toBe(
      READING.current.observedAt,
    );
  });

  it('gives every recommendation the fields the UI needs', async () => {
    const response = await postPlan(VALID_BODY);

    for (const recommendation of response.body.recommendations) {
      expect(recommendation).toMatchObject({
        id: expect.any(String),
        category: expect.stringMatching(/^(routine|indoor|transport|health)$/),
        title: expect.any(String),
        action: expect.any(String),
        why: expect.any(String),
        personalImpact: expect.any(String),
        communityImpact: expect.any(String),
        cost: expect.stringMatching(/^(free|low|medium|high)$/),
        effort: expect.stringMatching(/^(easy|moderate|hard)$/),
        confidence: expect.stringMatching(/^(high|medium|low)$/),
      });
    }
  });

  it('raises precautions for a sensitive household at the same reading', async () => {
    const response = await postPlan({
      ...VALID_BODY,
      profile: { ...VALID_PROFILE, sensitive: true },
    });

    expect(response.body.risk.level).toBe('unhealthy');
    expect(response.body.risk.effectiveLevel).toBe('very-unhealthy');
    expect(response.body.risk.escalatedForSensitivity).toBe(true);
  });

  it.each([
    ['an empty body', {}],
    ['a missing profile', { location: VALID_BODY.location }],
    [
      'an empty age group list',
      { ...VALID_BODY, profile: { ...VALID_PROFILE, ageGroups: [] } },
    ],
    [
      'an unknown commute method',
      { ...VALID_BODY, profile: { ...VALID_PROFILE, commuteMethod: 'teleport' } },
    ],
    [
      'negative outdoor minutes',
      { ...VALID_BODY, profile: { ...VALID_PROFILE, outdoorMinutes: -5 } },
    ],
    [
      'implausible outdoor minutes',
      { ...VALID_BODY, profile: { ...VALID_PROFILE, outdoorMinutes: 5000 } },
    ],
    [
      'a non-boolean sensitivity flag',
      { ...VALID_BODY, profile: { ...VALID_PROFILE, sensitive: 'yes' } },
    ],
    [
      'an out-of-range latitude',
      { ...VALID_BODY, location: { ...VALID_BODY.location, latitude: 120 } },
    ],
  ])('rejects %s', async (_label, body) => {
    const response = await postPlan(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('ignores unexpected extra fields instead of trusting them', async () => {
    const response = await postPlan({
      ...VALID_BODY,
      profile: { ...VALID_PROFILE, isAdmin: true, injected: '<script>' },
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('<script>');
  });

  it('rejects a malformed JSON body', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .set('Cookie', [`${CSRF_COOKIE}=${TEST_CSRF}`, SESSION])
      .set(CSRF_HEADER, TEST_CSRF)
      .set('content-type', 'application/json')
      .send('{"location":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects a body beyond the size ceiling', async () => {
    const response = await postPlan({
      ...VALID_BODY,
      padding: 'x'.repeat(32 * 1024),
    });

    expect(response.status).toBe(413);
  });
});
