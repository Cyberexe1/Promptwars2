import { normaliseEmail } from '../services/users.js';

/**
 * Per-account login throttling.
 *
 * The rate limiter on the credential routes counts requests per client
 * address. That stops one machine hammering the API, but an attacker with a
 * pool of addresses can still grind away at a single account, because each
 * address gets its own budget. This counts failures per account instead, so
 * the target is protected regardless of where attempts come from.
 *
 * Deliberate detail: attempts are counted against the address as submitted,
 * whether or not an account exists. If only real accounts were throttled, the
 * difference in behaviour would itself reveal which addresses are registered,
 * undoing the enumeration resistance in the login handler.
 *
 * Known limit: state is per instance. With more than one instance an attacker
 * gets one budget per instance. Moving this to DynamoDB would make it global,
 * at the cost of a write on every failed attempt. The per-address limiter
 * remains the backstop.
 */

export interface ThrottleOptions {
  /** Failures allowed inside the window before attempts are refused. */
  maxFailures: number;
  windowMs: number;
  /** Bound on tracked accounts, so this cannot grow without limit. */
  maxTracked: number;
}

export const DEFAULT_THROTTLE: ThrottleOptions = {
  maxFailures: 8,
  windowMs: 15 * 60 * 1000,
  maxTracked: 10_000,
};

interface Attempts {
  count: number;
  firstAtMs: number;
}

export class LoginThrottle {
  private readonly entries = new Map<string, Attempts>();

  constructor(
    private readonly options: ThrottleOptions = DEFAULT_THROTTLE,
    private readonly now: () => number = Date.now,
  ) {}

  private key(email: string): string {
    return normaliseEmail(email);
  }

  /** True when this account has spent its budget and should be refused. */
  isBlocked(email: string): boolean {
    const entry = this.entries.get(this.key(email));
    if (!entry) {
      return false;
    }
    if (this.now() - entry.firstAtMs > this.options.windowMs) {
      // Window has rolled over; the slate is clean.
      this.entries.delete(this.key(email));
      return false;
    }
    return entry.count >= this.options.maxFailures;
  }

  recordFailure(email: string): void {
    const key = this.key(email);
    const existing = this.entries.get(key);
    const nowMs = this.now();

    if (!existing || nowMs - existing.firstAtMs > this.options.windowMs) {
      this.evictIfFull(key);
      this.entries.set(key, { count: 1, firstAtMs: nowMs });
      return;
    }

    existing.count += 1;
  }

  /** A correct password clears the record, so normal use is never penalised. */
  recordSuccess(email: string): void {
    this.entries.delete(this.key(email));
  }

  /** Seconds until this account may try again, for the Retry-After header. */
  retryAfterSeconds(email: string): number {
    const entry = this.entries.get(this.key(email));
    if (!entry) {
      return 0;
    }
    const elapsed = this.now() - entry.firstAtMs;
    return Math.max(0, Math.ceil((this.options.windowMs - elapsed) / 1000));
  }

  private evictIfFull(incoming: string): void {
    if (this.entries.size < this.options.maxTracked || this.entries.has(incoming)) {
      return;
    }
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = this.entries.keys().next();
    if (!oldest.done) {
      this.entries.delete(oldest.value);
    }
  }

  /** Test and diagnostic helper. */
  get size(): number {
    return this.entries.size;
  }
}
