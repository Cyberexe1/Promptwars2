import request from 'supertest';
import type { Express } from 'express';
import { createCsrfToken, CSRF_COOKIE, CSRF_HEADER } from '../src/middleware/csrf.js';

/**
 * Shared test helpers.
 *
 * Every state-changing request needs a matching CSRF cookie and header. These
 * wrappers supply them so each test can stay about the behaviour it is
 * checking, rather than repeating the plumbing.
 */

/**
 * A token the server would actually have issued.
 *
 * This used to be the literal string 'test-csrf-token', on the reasoning that
 * any value works because the check is only that cookie and header agree.
 * That was true, and it was the weakness: two attacker-set values agree with
 * each other too. Tokens are now signed, so the tests have to use a real one,
 * which is the point. `csrf.test.ts` covers rejection of forged values.
 */
export const TEST_CSRF = createCsrfToken();

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
