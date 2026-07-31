export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;

/**
 * A second, looser budget counted per address across every account it touches.
 * Keying per account is what makes the limiter fair, but on its own it lets one
 * address probe unlimited account names ten at a time. Login answers identically
 * whether an account exists or not, yet only a real one pays for bcrypt, so
 * unlimited probing is a username oracle. This also caps how many buckets a
 * single address can mint, which is what keeps the eviction scan below honest.
 */
export const MAX_FAILED_LOGINS_PER_ADDRESS = 50;

/**
 * Accounts are validated to [A-Za-z0-9_]{3,32} before they reach the limiter,
 * so this sentinel cannot collide with a real account name.
 */
const ADDRESS_BUDGET = "*";

/**
 * ponytail: a flat cap with an expiry sweep, not an LRU. Entries are tiny and
 * expire on their own; the cap exists only so a spray cannot grow the map
 * without bound. Reaching it costs limiter accuracy — the oldest bucket is
 * dropped — but an attacker able to fill it is already making tens of thousands
 * of requests, which wants request-rate limiting rather than a bigger table.
 * Swap in an LRU keyed on last-seen if that trade stops holding.
 */
export const MAX_TRACKED_BUCKETS = 10_000;

/**
 * Keyed on address *and* account. Keying on address alone meant a successful
 * login cleared the one shared bucket, so an attacker holding any valid
 * low-privilege account could guess the owner password nine times, log into
 * their own account to reset the counter, and repeat without ever being locked
 * out. Splitting per account also stops one person behind a shared address from
 * locking out everyone else who uses it.
 *
 * NUL cannot appear in an address, so it is a safe separator. The account is not
 * case-folded on purpose: the users table is case-sensitive, so "Owner" really
 * is a different (nonexistent) account than "owner" and gets its own bucket.
 */
function bucketKey(ip: string, username: string): string {
  return `${ip}\u0000${username}`;
}

const attemptsByBucket = new Map<string, number[]>();
let lastSweep = 0;

function live(attempts: number[], now: number): number[] {
  const windowStart = now - LOGIN_WINDOW_MS;
  return attempts.filter((timestamp) => timestamp >= windowStart);
}

/**
 * Stale entries used to sit in the map forever, because attempts were only
 * pruned when that same address came back. Sweeping at most once per window
 * keeps this off the hot path while still reclaiming buckets that never return.
 */
function sweepExpired(now: number): void {
  // A backward clock step (NTP correction, VM snapshot restore) would otherwise
  // leave lastSweep in the future, making every later comparison negative and
  // disabling sweeping until real time caught up.
  if (now < lastSweep) {
    lastSweep = now;
    return;
  }
  if (now - lastSweep < LOGIN_WINDOW_MS) {
    return;
  }
  lastSweep = now;
  for (const [key, attempts] of attemptsByBucket) {
    if (live(attempts, now).length === 0) {
      attemptsByBucket.delete(key);
    }
  }
}

/**
 * Drops the oldest bucket that is not currently at the limit, so a spray of
 * fresh buckets cannot push out the lockouts the limiter exists to hold — the
 * account half of the key is attacker-chosen, so plain insertion-order eviction
 * would have been a bypass. The scan is bounded so a full table cannot turn each
 * request into a walk of the whole map.
 */
const EVICTION_SCAN = 50;

function evictOne(now: number): boolean {
  let scanned = 0;
  for (const [candidate, attempts] of attemptsByBucket) {
    if (scanned >= EVICTION_SCAN) {
      break;
    }
    scanned += 1;
    if (live(attempts, now).length < MAX_FAILED_LOGINS) {
      attemptsByBucket.delete(candidate);
      return true;
    }
  }

  // Nothing droppable in the scan window. Give up one lockout's remaining
  // minutes rather than decline to count, because an uncounted attempt is an
  // unlimited one: a bucket never created never accumulates, so the limiter
  // answers "not limited" for that pair forever. An attacker who locked the head
  // of the iteration order and filled the table could otherwise switch the
  // limiter off for every address and account without an existing bucket.
  //
  // Failing closed here instead — treating a full table as "limited" — would be
  // worse still: it locks out every user who does not already hold a bucket.
  for (const [oldest] of attemptsByBucket) {
    attemptsByBucket.delete(oldest);
    return true;
  }

  return false;
}

/**
 * Socket JOIN is the app's other credential check. It gets its own budget rather
 * than sharing the login one, because OBS usually runs on the same machine as
 * the dashboard: a rotated overlay token must not be able to burn the operator's
 * own ability to sign in. Generous on purpose — the dashboard signs out on a
 * rejected token and the overlay stops after one attempt (socket.io does not
 * auto-reconnect once the server disconnects it), so a healthy deployment never
 * approaches this.
 */
export const MAX_FAILED_JOINS = 20;

/**
 * "join" cannot collide with the account-keyed buckets: those are
 * `address\0account`, and no address is the literal string "join".
 */
function joinKey(ip: string): string {
  return `join\u0000${ip}`;
}

export function isJoinRateLimited(ip: string, now: number = Date.now()): boolean {
  return atLimit(joinKey(ip), MAX_FAILED_JOINS, now);
}

export function recordFailedJoin(ip: string, now: number = Date.now()): void {
  sweepExpired(now);
  bump(joinKey(ip), now);
}

export function clearFailedJoins(ip: string): void {
  attemptsByBucket.delete(joinKey(ip));
}

function atLimit(key: string, limit: number, now: number): boolean {
  const attempts = live(attemptsByBucket.get(key) ?? [], now);
  if (attempts.length === 0) {
    attemptsByBucket.delete(key);
    return false;
  }

  attemptsByBucket.set(key, attempts);
  return attempts.length >= limit;
}

export function isLoginRateLimited(ip: string, username: string, now: number = Date.now()): boolean {
  return atLimit(bucketKey(ip, username), MAX_FAILED_LOGINS, now)
    || atLimit(bucketKey(ip, ADDRESS_BUDGET), MAX_FAILED_LOGINS_PER_ADDRESS, now);
}

function bump(key: string, now: number): void {
  // evictOne only fails on an empty map, which cannot happen at the cap — so in
  // practice this never declines to count. See the comment there for why that
  // matters more than preserving any single lockout.
  if (attemptsByBucket.size >= MAX_TRACKED_BUCKETS && !attemptsByBucket.has(key) && !evictOne(now)) {
    return;
  }

  const attempts = live(attemptsByBucket.get(key) ?? [], now);
  attempts.push(now);
  attemptsByBucket.set(key, attempts);
}

export function recordFailedLogin(ip: string, username: string, now: number = Date.now()): void {
  sweepExpired(now);
  bump(bucketKey(ip, username), now);
  bump(bucketKey(ip, ADDRESS_BUDGET), now);
}

export function clearFailedLogins(ip: string, username: string): void {
  // Only the account's own bucket. The per-address budget deliberately survives:
  // signing into one account must not wipe the record of probing many others.
  attemptsByBucket.delete(bucketKey(ip, username));
}

/** Exposed so the bound above is actually assertable. */
export function trackedBucketCount(): number {
  return attemptsByBucket.size;
}

export function resetLoginRateLimit(): void {
  attemptsByBucket.clear();
  lastSweep = 0;
}
