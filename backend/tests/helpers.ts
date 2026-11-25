import request from 'supertest';
import type { Express } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/middleware/csrf.js';

/**
 * Shared test helpers.
 *
 * Every state-changing request needs a matching CSRF cookie and header. These
 * wrappers supply them so each test can stay about the behaviour it is
 * checking, rather than repeating the plumbing.
 */

/** Any value works: the check is that cookie and header agree. */
export const TEST_CSRF = 'test-csrf-token';

/** POSTs JSON with a valid CSRF pair, plus any extra cookies. */
export function postJson(
  app: Express,
  path: string,
  body: unknown,
  extraCookies: string[] = [],
) {
  return request(app)
    .post(path)
    .set('Cookie', [`${CSRF_COOKIE}=${TEST_CSRF}`, ...extraCookies])
    .set(CSRF_HEADER, TEST_CSRF)
    .send(body as object);
}

/** POSTs with no body, for endpoints like logout. */
export function postEmpty(app: Express, path: string, extraCookies: string[] = []) {
  return request(app)
    .post(path)
    .set('Cookie', [`${CSRF_COOKIE}=${TEST_CSRF}`, ...extraCookies])
    .set(CSRF_HEADER, TEST_CSRF);
}

/**
 * An agent that carries cookies across requests and always sends the CSRF
 * header, for flows that depend on a session.
 */
export function csrfAgent(app: Express) {
  const agent = request.agent(app);
  agent.set('Cookie', `${CSRF_COOKIE}=${TEST_CSRF}`);
  agent.set(CSRF_HEADER, TEST_CSRF);
  return agent;
}
