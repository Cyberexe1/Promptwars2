import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/middleware/csrf.js';
import { MemoryUserStore, setUserStoreForTesting } from '../src/services/users.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';

const app = createApp(
  loadConfig({
    NODE_ENV: 'test',
    CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    SESSION_SECRET: 'c'.repeat(48),
    AUTH_RATE_LIMIT_MAX: '1000',
  } as NodeJS.ProcessEnv),
);

const TOKEN = 'test-csrf-token-value';

beforeEach(() => {
  setUserStoreForTesting(new MemoryUserStore());
});

function credentials() {
  return { email: `user${Math.random()}@example.com`, password: 'correct horse battery' };
}

describe('token issuing', () => {
  it('hands a readable token to an API caller', async () => {
    // /api/auth/me needs no upstream call and is where the app first learns
    // whether it has a session, so it is the natural place to pick a token up.
    const response = await request(app).get('/api/auth/me');

    const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];
    const csrf = cookies.find((value) => value.startsWith(CSRF_COOKIE));

    expect(csrf).toBeDefined();
    // The page must read this to echo it back, so it cannot be HttpOnly.
    expect(csrf).not.toContain('HttpOnly');
    expect(csrf).toContain('SameSite=Lax');
  });

  it('does not reissue a token to a caller that already has one', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`);

    const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.filter((value) => value.startsWith(CSRF_COOKIE))).toHaveLength(0);
  });

  it('leaves the health probe alone', async () => {
    // App Runner polls this every ten seconds and never reads a cookie.
    const response = await request(app).get('/health');

    const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.filter((value) => value.startsWith(CSRF_COOKIE))).toHaveLength(0);
    expect(response.status).toBe(200);
  });
});

describe('safe methods', () => {
  it.each([
    ['health', '/health'],
    ['session check', '/api/auth/me'],
    ['air quality', '/api/air-quality?latitude=1&longitude=1'],
  ])('allows a GET to %s without a token', async (_label, path) => {
    const response = await request(app).get(path);
    expect(response.status).not.toBe(403);
  });
});

describe('state-changing requests', () => {
  it('rejects a POST with no token at all', async () => {
    const response = await request(app).post('/api/auth/login').send(credentials());

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects a POST carrying only the cookie', async () => {
    // This is the forged case: another site can cause our cookies to be sent
    // but cannot read them to populate the header.
    const response = await request(app)
      .post('/api/auth/login')
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`)
      .send(credentials());

    expect(response.status).toBe(403);
  });

  it('rejects a POST carrying only the header', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER, TOKEN)
      .send(credentials());

    expect(response.status).toBe(403);
  });

  it('rejects a POST where cookie and header disagree', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, 'a-different-value')
      .send(credentials());

    expect(response.status).toBe(403);
  });

  it('accepts a POST where cookie and header match', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, TOKEN)
      .send(credentials());

    expect(response.status).toBe(201);
  });

  it('rejects a matching pair sent from an unlisted origin', async () => {
    // Defence in depth: even with a stolen token, the origin must be ours.
    const response = await request(app)
      .post('/api/auth/signup')
      .set('Origin', 'https://evil.example')
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, TOKEN)
      .send(credentials());

    expect(response.status).toBe(403);
  });

  it('accepts a matching pair from the allowed origin', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', `${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, TOKEN)
      .send(credentials());

    expect(response.status).toBe(201);
  });

  it('protects the plan endpoint, not only the auth endpoints', async () => {
    const response = await request(app).post('/api/recommendations').send({});

    // CSRF is checked before authentication, so this is 403 rather than 401.
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('protects logout, so a third party cannot sign a user out', async () => {
    const response = await request(app).post('/api/auth/logout');
    expect(response.status).toBe(403);
  });
});
