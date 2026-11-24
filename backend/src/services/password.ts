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

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Upper bound on password length.
 *
 * Without one, a very long password becomes a cheap way to make the server do
 * expensive work on every request.
 */
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    ...COST,
    maxmem: MAX_MEMORY,
  });

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

    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });

    // Constant-time comparison, so response timing does not leak how much of
    // the hash matched.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
