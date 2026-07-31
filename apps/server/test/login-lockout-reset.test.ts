import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import bcrypt from "bcrypt";
import { startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_LOGINS } from "../src/login-rate-limit.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
  server.db.createUser("atk", "attacker", await bcrypt.hash("attackerpass", 4), "moderator");
  server.db.createUser("own", "theowner", await bcrypt.hash("ownersecret", 4), "owner");
});

after(async () => {
  await server.close();
});

function login(username: string, password: string): Promise<Response> {
  return fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

describe("login lockout cannot be reset by a second account", () => {
  /**
   * Buckets were keyed on address alone and cleared on any successful login, so
   * an attacker holding one valid low-privilege account could guess the owner
   * password, sign into their own account to wipe the shared counter, and keep
   * going. Measured at 45 guesses with no lockout before the fix — a moderator
   * to owner escalation path.
   */
  test("signing into another account does not restore guesses against the owner", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      const attempt = await login("theowner", `guess-${i}`);
      assert.equal(attempt.status, 401, `guess ${i} should be a normal rejection`);
    }

    assert.equal((await login("theowner", "another-guess")).status, 429, "owner should be locked");

    const ownAccount = await login("attacker", "attackerpass");
    assert.equal(ownAccount.status, 200, "the attacker's own login still works");

    const afterReset = await login("theowner", "yet-another-guess");
    assert.equal(afterReset.status, 429, "owner must stay locked after the attacker signs in");
  });

  test("a locked account does not lock out unrelated accounts", async () => {
    const other = await login("attacker", "wrong-password");

    assert.equal(other.status, 401, "should be a normal rejection, not the owner's 429");
  });
});
