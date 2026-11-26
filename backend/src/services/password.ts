import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt.
 *
 * scrypt ships with Node, so this adds no dependency, and it is memory-hard,
 * which makes large-scale offline cracking expensive rather than merely slow.
 *
 * Parameters are stored inside each hash. That means the cost can be raised
 * later without invalidating existing passwords: an old hash still verifies
 * against its own recorded parameters.
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Cost ~100 ms on a typical server. */
const COST = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt needs roughly 128 * N * r bytes; allow headroom. */
const MAX_MEMORY = 64 * 1024 * 1024;

/**
 * How many hashes may run at once.
 *
 * The parameters above need about 32 MB each, and the service runs on a
 * 0.5 GB App Runner instance that accepts up to 50 concurrent requests. Around
 * sixteen simultaneous hashes exhaust the memory budget, and every signup and
 * every login pays one, including logins for addresses that do not exist. The
 * per-IP limiter does not help, because the attempts can come from anywhere.
 *
 * Queueing rather than weakening: requests above this bound wait a few hundred
 * milliseconds instead of the process running out of memory. The alternative
 * fixes were to cut the cost parameters, which makes stolen hashes cheaper to
 * crack, or to pay for a larger instance. Deliberately bounded well below the
 * point of exhaustion, because the request handling around each hash needs
 * memory too.
 */
const MAX_CONCURRENT_HASHES = 4;

let activeHashes = 0;
const waiting: (() => void)[] = [];

async function withHashSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeHashes >= MAX_CONCURRENT_HASHES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeHashes += 1;
  try {
    return await work();
  } finally {
    activeHashes -= 1;
    // Hand the slot to the next waiter rather than letting everyone wake and
    // race for it.
    waiting.shift()?.();
  }
}

/** Test hook: asserts the gate is not leaking slots between cases. */
export function hashSlotsInUse(): number {
  return activeHashes;
}

export const MIN_PASSWORD_LENGTH = 12;

/**
 * A well-formed hash that no password will ever match.
 *
 * Login verifies against this when the account does not exist, so a missing
 * account and a wrong password take the same time to reject. It used to be a
 * string literal in the route handler with the cost parameters written out by
 * hand. That was correct on the day it was written and would have stopped being
 * correct the moment `COST` was raised, silently making the unknown-account
 * path cheaper than a real one and reopening the timing leak it exists to
 * close. Built from `COST` so the two cannot drift apart.
 */
export const TIMING_REFERENCE_HASH = [
  'scrypt',
  COST.N,
  COST.r,
  COST.p,
  Buffer.alloc(SALT_LENGTH).toString('base64'),
  Buffer.alloc(KEY_LENGTH).toString('base64'),
].join('$');

/**
 * Upper bound on password length.
 *
 * Without one, a very long password becomes a cheap way to make the server do
 * expensive work on every request.
 */
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await withHashSlot(() =>
    scryptAsync(password, salt, KEY_LENGTH, {
      ...COST,
      maxmem: MAX_MEMORY,
    }),
  );

  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a damaged record
 * fails closed instead of surfacing a 500 that reveals the record exists.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }

    const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    // Refuse absurd stored parameters: a tampered record must not be able to
    // make this call allocate unbounded memory.
    if (N > 2 ** 20 || r > 32 || p > 16) {
      return false;
    }

    const salt = Buffer.from(rawSalt!, 'base64');
    const expected = Buffer.from(rawHash!, 'base64');

    const derived = await withHashSlot(() =>
      scryptAsync(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: MAX_MEMORY,
      }),
    );

    // Constant-time comparison, so response timing does not leak how much of
    // the hash matched.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
