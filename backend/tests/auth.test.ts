import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryUserStore, setUserStoreForTesting } from '../src/services/users.js';
import { hashPassword, verifyPassword } from '../src/services/password.js';
import {
  createSessionToken,
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
} from '../src/services/sessions.js';

/**
 * The rate limit is raised well above the number of cases in this file, so the
 * limiter does not starve the behavioural tests. A dedicated suite at the
 * bottom builds its own app with a limit of 2 to exercise the limit itself.
 */
const app = createApp(
  loadConfig({
    NODE_ENV: 'test',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    SESSION_SECRET: 'a'.repeat(48),
    AUTH_RATE_LIMIT_MAX: '1000',
  } as NodeJS.ProcessEnv),
);

const EMAIL = 'resident@example.com';
const PASSWORD = 'correct horse battery';

beforeEach(() => {
  setUserStoreForTesting(new MemoryUserStore());
});

/** Pulls the session cookie out of a Set-Cookie header. */
function sessionFrom(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

describe('password hashing', () => {
  it('does not store the password itself', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).not.toContain(PASSWORD);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('produces a different hash each time for the same password', async () => {
    // A shared salt would let one cracked password reveal every reuse of it.
    const [first, second] = await Promise.all([
      hashPassword(PASSWORD),
      hashPassword(PASSWORD),
    ]);
    expect(first).not.toBe(second);
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword('not the password', hash)).resolves.toBe(false);
  });

  it.each([
    ['empty', ''],
    ['not scrypt', 'bcrypt$10$abc'],
    ['truncated', 'scrypt$32768$8$1$abc'],
    ['absurd cost', `scrypt$${2 ** 25}$8$1$YWJj$YWJj`],
  ])('fails closed on a %s hash', async (_label, stored) => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips a user id', () => {
    const token = createSessionToken('user-1');
    expect(readSessionToken(token)?.sub).toBe('user-1');
  });

  it('rejects a token whose payload was edited', () => {
    const token = createSessionToken('user-1');
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', exp: 9e9, jti: 'x' }),
      'utf8',
    ).toString('base64url');

    expect(body).toBeTruthy();
    expect(readSessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects a token with no signature', () => {
    expect(readSessionToken('just-a-body')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createSessionToken('user-1', 0);
    expect(readSessionToken(token, 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('gives every token a distinct id, so revocation has something to key on', () => {
    const first = readSessionToken(createSessionToken('user-1'))!;
    const second = readSessionToken(createSessionToken('user-1'))!;
    expect(first.jti).not.toBe(second.jti);
  });
});

describe('readCookie', () => {
  it('finds a value among several cookies', () => {
    expect(readCookie('a=1; smogwise_session=abc; b=2', SESSION_COOKIE)).toBe('abc');
  });

  it('returns null when absent or when there is no header', () => {
    expect(readCookie('a=1', SESSION_COOKIE)).toBeNull();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
  });
});

describe('POST /api/auth/signup', () => {
  it('creates an account and sets a session cookie', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(EMAIL);

    const cookies = sessionFrom(response);
    expect(cookies.join(';')).toContain(SESSION_COOKIE);
  });

  it('marks the session cookie HttpOnly and SameSite', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    const cookie = sessionFrom(response).find((value) =>
      value.startsWith(SESSION_COOKIE),
    )!;

    // HttpOnly keeps the token away from scripts; SameSite limits cross-site use.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('never returns the password or its hash', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(PASSWORD);
    expect(body).not.toContain('scrypt');
    expect(body).not.toContain('passwordHash');
  });

  it.each([
    ['a missing email', { password: PASSWORD }],
    ['a malformed email', { email: 'not-an-email', password: PASSWORD }],
    ['a short password', { email: EMAIL, password: 'short' }],
    ['a missing password', { email: EMAIL }],
    ['an over-long password', { email: EMAIL, password: 'x'.repeat(500) }],
  ])('rejects %s', async (_label, body) => {
    const response = await request(app).post('/api/auth/signup').send(body);
    expect(response.status).toBe(400);
  });

  it('treats the email as case-insensitive', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    const duplicate = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'Resident@Example.COM', password: PASSWORD });

    expect(duplicate.status).toBe(409);
  });

  it('does not confirm that an address is registered', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    const duplicate = await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });

    // Wording must not single out "this email exists".
    expect(duplicate.body.error.message).toMatch(/cannot be used to register/i);
    expect(duplicate.body.error.message).not.toMatch(/already|taken|exists/i);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: EMAIL, password: PASSWORD });
  });

  it('signs in with the right credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(EMAIL);
  });

  it('accepts a differently cased email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'RESIDENT@EXAMPLE.COM', password: PASSWORD });

    expect(response.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'wrong password here' });

    expect(response.status).toBe(401);
  });

  it('gives identical wording for an unknown account and a wrong password', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'wrong password here' });

    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    // Any difference here would let an attacker enumerate accounts.
    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('answers a malformed login the same way as a failed one', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonsense', password: 'x' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  it('reports no session for an anonymous caller', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('identifies the signed-in user', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send({ email: EMAIL, password: PASSWORD });

    const response = await agent.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBeTruthy();
  });

  it('ignores a forged cookie', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=totally.invalid`);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send({ email: EMAIL, password: PASSWORD });
    await expect(agent.get('/api/auth/me')).resolves.toMatchObject({ status: 200 });

    const response = await agent.post('/api/auth/logout');
    expect(response.status).toBe(200);

    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('succeeds even when no session exists', async () => {
    await expect(request(app).post('/api/auth/logout')).resolves.toMatchObject({
      status: 200,
    });
  });
});

describe('protected endpoints', () => {
  const body = {
    location: { name: 'Delhi', latitude: 28.61, longitude: 77.21 },
    profile: {
      ageGroups: ['adult'],
      sensitive: false,
      commuteMethod: 'car',
      outdoorMinutes: 60,
      cookingFuel: 'gas',
      purifier: false,
      budget: 'medium',
    },
  };

  it('refuses a plan request with no session', async () => {
    const response = await request(app).post('/api/recommendations').send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('keeps published air-quality data public', async () => {
    // The landing page shows a live reading to anonymous visitors, so these
    // endpoints must not require an account.
    const response = await request(app)
      .get('/api/air-quality')
      .query({ latitude: 28.61, longitude: 77.21 });

    expect(response.status).not.toBe(401);
  });

  it('rejects an unauthenticated request before doing any work', async () => {
    const response = await request(app)
      .post('/api/recommendations')
      .send({ nonsense: true });

    // Authentication is checked ahead of validation, so an anonymous caller
    // learns nothing about the request shape.
    expect(response.status).toBe(401);
  });
});

describe('credential rate limiting', () => {
  it('stops repeated attempts once the budget is spent', async () => {
    const limited = createApp(
      loadConfig({
        NODE_ENV: 'test',
        SESSION_SECRET: 'b'.repeat(48),
        AUTH_RATE_LIMIT_MAX: '2',
      } as NodeJS.ProcessEnv),
    );

    const attempt = () =>
      request(limited)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'guessing a password' });

    await attempt();
    await attempt();
    const third = await attempt();

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});
