import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LoginThrottle } from '../src/middleware/loginThrottle.js';
import { MemoryUserStore, setUserStoreForTesting } from '../src/services/users.js';
import { postJson } from './helpers.js';

const EMAIL = 'target@example.com';
const PASSWORD = 'correct horse battery';

describe('LoginThrottle', () => {
  it('allows attempts below the limit', () => {
    const throttle = new LoginThrottle({
      maxFailures: 3,
      windowMs: 60_000,
      maxTracked: 100,
    });

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);

    expect(throttle.isBlocked(EMAIL)).toBe(false);
  });

  it('blocks once the limit is reached', () => {
    const throttle = new LoginThrottle({
      maxFailures: 3,
      windowMs: 60_000,
      maxTracked: 100,
    });

    for (let i = 0; i < 3; i += 1) throttle.recordFailure(EMAIL);

    expect(throttle.isBlocked(EMAIL)).toBe(true);
  });

  it('treats differently cased addresses as the same account', () => {
    const throttle = new LoginThrottle({
      maxFailures: 2,
      windowMs: 60_000,
      maxTracked: 100,
    });

    throttle.recordFailure('Target@Example.COM');
    throttle.recordFailure('  target@example.com  ');

    expect(throttle.isBlocked(EMAIL)).toBe(true);
  });

  it('does not penalise one account for another account\u2019s failures', () => {
    const throttle = new LoginThrottle({
      maxFailures: 2,
      windowMs: 60_000,
      maxTracked: 100,
    });

    throttle.recordFailure('someone@example.com');
    throttle.recordFailure('someone@example.com');

    expect(throttle.isBlocked('someone@example.com')).toBe(true);
    expect(throttle.isBlocked(EMAIL)).toBe(false);
  });

  it('clears the record on a correct password', () => {
    const throttle = new LoginThrottle({
      maxFailures: 2,
      windowMs: 60_000,
      maxTracked: 100,
    });

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    expect(throttle.isBlocked(EMAIL)).toBe(true);

    throttle.recordSuccess(EMAIL);
    expect(throttle.isBlocked(EMAIL)).toBe(false);
  });

  it('forgets failures once the window passes', () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle(
      { maxFailures: 2, windowMs: 60_000, maxTracked: 100 },
      () => now,
    );

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    expect(throttle.isBlocked(EMAIL)).toBe(true);

    now += 60_001;
    expect(throttle.isBlocked(EMAIL)).toBe(false);
  });

  it('reports how long to wait, and counts down', () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle(
      { maxFailures: 1, windowMs: 60_000, maxTracked: 100 },
      () => now,
    );

    throttle.recordFailure(EMAIL);
    expect(throttle.retryAfterSeconds(EMAIL)).toBe(60);

    now += 30_000;
    expect(throttle.retryAfterSeconds(EMAIL)).toBe(30);
  });

  it('reports zero wait for an account with no failures', () => {
    const throttle = new LoginThrottle();
    expect(throttle.retryAfterSeconds('nobody@example.com')).toBe(0);
  });

  it('stays bounded by evicting the oldest tracked account', () => {
    const throttle = new LoginThrottle({
      maxFailures: 5,
      windowMs: 60_000,
      maxTracked: 3,
    });

    for (const name of ['a', 'b', 'c', 'd']) {
      throttle.recordFailure(`${name}@example.com`);
    }

    expect(throttle.size).toBe(3);
  });
});

describe('login throttling through the API', () => {
  // A fresh app per test: the throttle lives on the router instance, so a
  // shared app would carry failure counts between cases.
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    app = createApp(
      loadConfig({
        NODE_ENV: 'test',
        SESSION_SECRET: 'd'.repeat(48),
        // High, so the per-address limiter does not fire first and mask this.
        AUTH_RATE_LIMIT_MAX: '1000',
      } as NodeJS.ProcessEnv),
    );
    setUserStoreForTesting(new MemoryUserStore());
    await postJson(app, '/api/auth/signup', { email: EMAIL, password: PASSWORD });
  });

  async function failLogin(email = EMAIL) {
    return postJson(app, '/api/auth/login', {
      email,
      password: 'definitely the wrong one',
    });
  }

  it('refuses further attempts on one account after repeated failures', async () => {
    let last = await failLogin();
    for (let i = 0; i < 10 && last.status === 401; i += 1) {
      last = await failLogin();
    }

    // An attacker rotating client addresses defeats the per-address limiter,
    // so the account itself has to be protected.
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(last.headers['retry-after']).toBeDefined();
  });

  it('throttles an address that was never registered, so the two look alike', async () => {
    // If only real accounts were throttled, the difference would reveal which
    // addresses exist.
    let last = await failLogin('ghost@example.com');
    for (let i = 0; i < 10 && last.status === 401; i += 1) {
      last = await failLogin('ghost@example.com');
    }

    expect(last.status).toBe(429);
  });

  it('still lets the real owner in before the budget is spent', async () => {
    await failLogin();
    await failLogin();

    const response = await postJson(app, '/api/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
  });

  it('does not lock an unrelated account', async () => {
    let last = await failLogin();
    for (let i = 0; i < 10 && last.status === 401; i += 1) {
      last = await failLogin();
    }
    expect(last.status).toBe(429);

    await postJson(app, '/api/auth/signup', {
      email: 'other@example.com',
      password: PASSWORD,
    });
    const other = await postJson(app, '/api/auth/login', {
      email: 'other@example.com',
      password: PASSWORD,
    });

    expect(other.status).toBe(200);
  });
});
