import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS,
  MAX_TRACKED_BUCKETS,
  MAX_FAILED_LOGINS_PER_ADDRESS,
  clearFailedLogins,
  isLoginRateLimited,
  recordFailedLogin,
  trackedBucketCount,
  resetLoginRateLimit
} from "../src/login-rate-limit.js";

beforeEach(() => {
  resetLoginRateLimit();
});

describe("login rate limit", () => {
  test("allows attempts up to the limit, then blocks", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      assert.equal(isLoginRateLimited("10.0.0.1", "alice"), false, `attempt ${i} should be allowed`);
      recordFailedLogin("10.0.0.1", "alice");
    }

    assert.equal(isLoginRateLimited("10.0.0.1", "alice"), true);
  });

  test("tracks each address separately", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      recordFailedLogin("10.0.0.1", "alice");
    }

    assert.equal(isLoginRateLimited("10.0.0.1", "alice"), true);
    assert.equal(isLoginRateLimited("10.0.0.2", "alice"), false);
  });

  test("forgets attempts once they age out of the window", () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      recordFailedLogin("10.0.0.1", "alice", start);
    }

    assert.equal(isLoginRateLimited("10.0.0.1", "alice", start), true);
    assert.equal(isLoginRateLimited("10.0.0.1", "alice", start + LOGIN_WINDOW_MS + 1), false);
  });

  test("drops the account's bucket when a login succeeds", () => {
    // Each failure records two buckets: the account's and the address budget.
    recordFailedLogin("10.0.0.1", "alice");
    assert.equal(trackedBucketCount(), 2);

    clearFailedLogins("10.0.0.1", "alice");

    assert.equal(trackedBucketCount(), 1, "the per-address budget survives");
  });

  /**
   * The bypass: buckets were keyed on address alone and cleared on any success,
   * so an attacker holding one valid low-privilege account could guess the owner
   * password nine times, log into their own account to reset the shared bucket,
   * and repeat forever. Measured at 45 guesses with no lockout before this.
   */
  test("a success on one account does not clear another account's failures", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      recordFailedLogin("10.0.0.1", "theowner");
    }
    assert.equal(isLoginRateLimited("10.0.0.1", "theowner"), true);

    clearFailedLogins("10.0.0.1", "attacker");

    assert.equal(isLoginRateLimited("10.0.0.1", "theowner"), true);
  });

  test("separates accounts guessed from the same address", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      recordFailedLogin("10.0.0.1", "theowner");
    }

    assert.equal(isLoginRateLimited("10.0.0.1", "theowner"), true);
    assert.equal(isLoginRateLimited("10.0.0.1", "someone-else"), false);
  });

  /**
   * The bug: every address that ever failed a login kept a Map entry forever,
   * because the stale timestamps were only pruned when that same address came
   * back. A spray across many addresses grew the map without bound and nothing
   * ever reclaimed it.
   */
  test("stays bounded when failures come from more addresses than it can track", () => {
    for (let i = 0; i < MAX_TRACKED_BUCKETS + 500; i += 1) {
      recordFailedLogin(`10.1.${Math.floor(i / 256)}.${i % 256}`, "alice");
    }

    assert.ok(
      trackedBucketCount() <= MAX_TRACKED_BUCKETS,
      `expected at most ${MAX_TRACKED_BUCKETS} tracked buckets, got ${trackedBucketCount()}`
    );
  });

  /**
   * Keying per account restored fairness but removed the old ceiling on how many
   * accounts one address could probe. Login answers identically for a missing
   * account and a wrong password, but only the real account pays for bcrypt, so
   * unlimited probes are a username oracle. A second, looser per-address bucket
   * puts the ceiling back — and incidentally caps how many buckets one address
   * can mint.
   */
  test("caps total failures from one address across every account", () => {
    const perAccount = MAX_FAILED_LOGINS;
    const accounts = Math.ceil(MAX_FAILED_LOGINS_PER_ADDRESS / perAccount);

    for (let a = 0; a < accounts; a += 1) {
      for (let i = 0; i < perAccount; i += 1) {
        recordFailedLogin("10.9.9.9", `account-${a}`);
      }
    }

    assert.equal(
      isLoginRateLimited("10.9.9.9", "never-tried-before"),
      true,
      "a fresh account from an address that has burned its budget must still be blocked"
    );
    assert.equal(isLoginRateLimited("10.9.9.8", "never-tried-before"), false, "other addresses unaffected");
  });

  test("signing in successfully does not clear the per-address budget", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_ADDRESS; i += 1) {
      recordFailedLogin("10.9.9.9", `account-${Math.floor(i / MAX_FAILED_LOGINS)}`);
    }
    assert.equal(isLoginRateLimited("10.9.9.9", "fresh"), true);

    clearFailedLogins("10.9.9.9", "account-0");

    assert.equal(
      isLoginRateLimited("10.9.9.9", "fresh"),
      true,
      "one successful login must not wipe the evidence of probing across accounts"
    );
  });

  /**
   * Eviction must not become the bypass. The account half of the key is
   * attacker-chosen, so one address can mint unlimited buckets; if that spray
   * evicted in plain insertion order it would push out the very lockout the
   * limiter exists to hold.
   */
  test("a spray of new buckets cannot evict a bucket that is at the limit", () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      recordFailedLogin("10.0.0.1", "victim");
    }
    assert.equal(isLoginRateLimited("10.0.0.1", "victim"), true);

    for (let i = 0; i < MAX_TRACKED_BUCKETS + 500; i += 1) {
      recordFailedLogin("10.0.0.2", `spray-${i}`);
    }

    assert.equal(isLoginRateLimited("10.0.0.1", "victim"), true, "the lockout must survive the spray");
    assert.ok(trackedBucketCount() <= MAX_TRACKED_BUCKETS);
  });

  /**
   * Declining to record an attempt is the same as allowing an unlimited number
   * of them: a bucket the limiter refuses to create never accumulates, so it
   * answers "not limited" for that pair forever. An attacker who locks the head
   * of the iteration order and then fills the table used to switch the limiter
   * off for every address and account that did not already have a bucket —
   * measured at 500 unimpeded guesses against a fresh pair.
   */
  test("stays enforced after the table saturates with locked buckets", () => {
    // More than the eviction scan window, so the scan finds nothing droppable.
    for (let a = 0; a < 60; a += 1) {
      for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
        recordFailedLogin(`10.0.${a}.1`, `locked${a}`);
      }
    }
    for (let n = 0; trackedBucketCount() < MAX_TRACKED_BUCKETS && n < 40_000; n += 1) {
      recordFailedLogin(`10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`, `fill${n % 40}`);
    }
    assert.equal(trackedBucketCount(), MAX_TRACKED_BUCKETS, "precondition: table is full");

    let guesses = 0;
    while (guesses < 500 && !isLoginRateLimited("203.0.113.99", "theowner")) {
      recordFailedLogin("203.0.113.99", "theowner");
      guesses += 1;
    }

    assert.equal(guesses, MAX_FAILED_LOGINS, "a saturated table must not disable the limiter");
  });

  /**
   * lastSweep is a wall-clock stamp. A backward step (NTP correction, VM
   * snapshot restore) used to park it in the future, and every later comparison
   * went negative, so the sweep never ran again and stale buckets accumulated.
   */
  test("keeps sweeping after the clock steps backwards", () => {
    const W = LOGIN_WINDOW_MS;
    recordFailedLogin("10.0.0.1", "stale", 0);
    recordFailedLogin("10.0.0.2", "future", W * 100);
    recordFailedLogin("10.0.0.3", "corrected", W * 2);
    recordFailedLogin("10.0.0.4", "later", W * 4);

    // "corrected" has aged out by W*4 and must have been reclaimed; only the
    // future-stamped pair and the newest pair should remain.
    assert.equal(trackedBucketCount(), 4);
  });

  test("reclaims addresses whose attempts have all expired", () => {
    const start = 1_000_000;
    for (let i = 0; i < 50; i += 1) {
      recordFailedLogin(`10.2.0.${i}`, "alice", start);
    }
    assert.equal(trackedBucketCount(), 100, "an account bucket and an address budget each");

    // One live address arriving after the window should not have to wait for
    // each stale address to return before its entries are released.
    recordFailedLogin("10.3.0.1", "alice", start + LOGIN_WINDOW_MS + 1);

    assert.equal(trackedBucketCount(), 2);
  });
});
