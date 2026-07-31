import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import bcrypt from "bcrypt";
import { startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_LOGINS } from "../src/login-rate-limit.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
  // Cost 4 keeps the suite fast. The bug this guards is not cost-dependent —
  // it only needs the limiter's read and its increment to straddle an await.
  server.db.createUser("own", "theowner", await bcrypt.hash("ownersecret", 4), "owner");
});

after(async () => {
  await server.close();
});

function guess(password: string): Promise<number> {
  return fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "theowner", password })
  }).then((response) => response.status).catch(() => 0);
}

describe("login rate limit under concurrency", () => {
  /**
   * The limiter checked the bucket, awaited bcrypt.compare, and only then
   * recorded the failure. Every request arriving inside that window saw a bucket
   * nobody had incremented yet, so all of them passed the gate: measured at 300
   * concurrent guesses all evaluated against a limit of 10, at the production
   * cost factor of 12. Counting the attempt before the await closes it.
   */
  test("never evaluates more guesses than the limit allows", async () => {
    const statuses = await Promise.all(
      Array.from({ length: 100 }, (_, i) => guess(`guess-${i}`))
    );

    const evaluated = statuses.filter((status) => status === 401).length;
    const blocked = statuses.filter((status) => status === 429).length;

    assert.equal(evaluated, MAX_FAILED_LOGINS, `expected exactly ${MAX_FAILED_LOGINS} guesses to be evaluated`);
    assert.equal(evaluated + blocked, 100, "every request should be either evaluated or blocked");
  });
});
