import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { authHeaders, createSession, startTestServer, type TestServer } from "./support.js";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

describe("changing a password", () => {
  /**
   * Changing someone's password is the standard response to their account being
   * compromised, so it has to end the session whoever took it is holding.
   * Updating only the hash left that session working until it expired on its own
   * — up to SESSION_HOURS later.
   */
  test("invalidates the session that account was holding", async () => {
    const owner = createSession(server.db, "owner");
    const victim = createSession(server.db, "editor");

    const before = await fetch(`${server.url}/api/auth/me`, { headers: authHeaders(victim.token) });
    assert.equal(before.status, 200, "precondition: the session works");

    const response = await fetch(`${server.url}/api/users/${victim.userId}`, {
      method: "PATCH",
      headers: { ...authHeaders(owner.token), "Content-Type": "application/json" },
      body: JSON.stringify({ password: "a-brand-new-password" })
    });
    assert.equal(response.status, 200);

    const after = await fetch(`${server.url}/api/auth/me`, { headers: authHeaders(victim.token) });

    assert.equal(after.status, 401, "the old session token must stop working");
  });

  test("a role-only change leaves the session alone", async () => {
    const owner = createSession(server.db, "owner");
    const other = createSession(server.db, "moderator");

    const response = await fetch(`${server.url}/api/users/${other.userId}`, {
      method: "PATCH",
      headers: { ...authHeaders(owner.token), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "editor" })
    });
    assert.equal(response.status, 200);

    const after = await fetch(`${server.url}/api/auth/me`, { headers: authHeaders(other.token) });

    // Role changes already apply live, so there is no reason to sign them out.
    assert.equal(after.status, 200, "a promotion should not log someone out");
  });
});
