import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryUserStore, setUserStoreForTesting } from '../src/services/users.js';
import {
  hashPassword,
  TIMING_REFERENCE_HASH,
  verifyPassword,
} from '../src/services/password.js';
import {
  createSessionToken,
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
} from '../src/services/sessions.js';
import { csrfAgent, postEmpty, postJson } from './helpers.js';

/**
 * The rate limit is raised well above the number of cases here, so the limiter
 * does not starve the behavioural tests. A suite at the bottom builds its own
 * app with a limit of 2 to exercise the limit itself.
 *
 * Every POST goes through the helpers in ./helpers.ts, which supply a matching
 * CSRF pair. CSRF itself is covered in csrf.test.ts.
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

function cookiesOf(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

const signup = (email = EMAIL, password = PASSWORD) =>
  postJson(app, '/api/auth/signup', { email, password });

const login = (email = EMAIL, password = PASSWORD) =>
  postJson(app, '/api/auth/login', { email, password });

describe('password hashing', () => {
  it('builds the timing reference from the live cost parameters', async () => {
    // Login verifies against this when an account does not exist, so that a
    // missing account and a wrong password take equally long. If the cost is
    // raised and this does not follow, the unknown-account path becomes
    // cheaper than a real one and the timing leak it closes reopens.
    const real = (await hashPassword(PASSWORD)).split('$').slice(0, 4);
    const reference = TIMING_REFERENCE_HASH.split('$').slice(0, 4);

    expect(reference).toEqual(real);
    expect(await verifyPassword(PASSWORD, TIMING_REFERENCE_HASH)).toBe(false);
  });

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
    expect(readSessionToken(createSessionToken('user-1'))?.sub).toBe('user-1');
  });

  it('rejects a token whose payload was edited', () => {
    const token = createSessionToken('user-1');
    const signature = token.split('.')[1];
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', exp: 9e9, jti: 'x' }),
      'utf8',
    ).toString('base64url');

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
    const response = await signup();

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(EMAIL);
    expect(cookiesOf(response).join(';')).toContain(SESSION_COOKIE);
  });

  it('marks the session cookie HttpOnly and SameSite', async () => {
    const response = await signup();
    const cookie = cookiesOf(response).find((value) =>
      value.startsWith(SESSION_COOKIE),
    )!;

    // HttpOnly keeps the token from script; SameSite limits cross-site use.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('never returns the password or its hash', async () => {
    const response = await signup();
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
    const response = await postJson(app, '/api/auth/signup', body);
    expect(response.status).toBe(400);
  });

  it('treats the email as case-insensitive', async () => {
    await signup();
    const duplicate = await signup('Resident@Example.COM');

    expect(duplicate.status).toBe(409);
  });

  it('is enumerable by status code, which is a known and accepted limit', async () => {
    // This test exists to stop the gap being forgotten, not to approve of it.
    // A taken address answers 409 and a free one 201, so a caller learns
    // whether an account exists. That cannot be closed while signup also
    // signs the user in, because the caller learns the answer from whether
    // they end up with a session whatever the body says. Closing it properly
    // needs a verified email channel, so signup can say "check your inbox"
    // either way. Recorded in docs/limitations.md.
    //
    // If a verified email channel is ever added, delete this test and assert
    // that both cases return the same status and body.
    await signup();
    const duplicate = await signup();

    expect(duplicate.status).toBe(409);

    // What is guaranteed meanwhile: the wording does not volunteer the detail,
    // and the attempt costs the same per-account budget as a failed login, so
    // enumeration is rate-limited rather than free.
    expect(duplicate.body.error.message).toMatch(/cannot be used to register/i);
    expect(duplicate.body.error.message).not.toMatch(/already|taken|exists/i);
  });

  it('spends a throttle slot on a duplicate, so probing is bounded', async () => {
    await signup('probe@example.com');

    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      lastStatus = (await signup('probe@example.com')).status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await signup();
  });

  it('signs in with the right credentials', async () => {
    const response = await login();

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(EMAIL);
  });

  it('accepts a differently cased email', async () => {
    const response = await login('RESIDENT@EXAMPLE.COM');
    expect(response.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const response = await login(EMAIL, 'wrong password here');
    expect(response.status).toBe(401);
  });

  it('gives identical wording for an unknown account and a wrong password', async () => {
    const wrongPassword = await login(EMAIL, 'wrong password here');
    const unknownUser = await login('nobody@example.com', PASSWORD);

    // Any difference here would let an attacker enumerate accounts.
    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('answers a malformed login the same way as a failed one', async () => {
    const response = await postJson(app, '/api/auth/login', {
      email: 'nonsense',
      password: 'x',
    });

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
    const agent = csrfAgent(app);
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
    const agent = csrfAgent(app);
    await agent.post('/api/auth/signup').send({ email: EMAIL, password: PASSWORD });
    await expect(agent.get('/api/auth/me')).resolves.toMatchObject({ status: 200 });

    const response = await agent.post('/api/auth/logout');
    expect(response.status).toBe(200);

    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('succeeds even when no session exists', async () => {
    await expect(postEmpty(app, '/api/auth/logout')).resolves.toMatchObject({
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
    const response = await postJson(app, '/api/recommendations', body);

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

  it('rejects an unauthenticated request before validating it', async () => {
    const response = await postJson(app, '/api/recommendations', { nonsense: true });

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
      postJson(limited, '/api/auth/login', {
        email: EMAIL,
        password: 'guessing a password',
      });

    await attempt();
    await attempt();
    const third = await attempt();

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});
