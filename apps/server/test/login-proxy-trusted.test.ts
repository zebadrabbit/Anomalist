import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_LOGINS } from "../src/login-rate-limit.js";

// Must be set before support.ts imports the app — express reads trust proxy at
// startup, and node --test gives this file its own process.
process.env.TRUST_PROXY = "1";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

function login(forwardedFor: string): Promise<Response> {
  return fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": forwardedFor },
    body: JSON.stringify({ username: "nobody", password: "wrong-password" })
  });
}

describe("login rate limit behind a trusted proxy", () => {
  /**
   * The bug: with trust proxy off, req.ip is the proxy's address, so every user
   * behind the reverse proxy shared one bucket and ten failures from anybody
   * locked out everybody.
   */
  test("gives each forwarded client its own bucket", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      const response = await login("203.0.113.1");
      assert.equal(response.status, 401, `attempt ${i} should be a normal rejection`);
    }

    const sameClient = await login("203.0.113.1");
    assert.equal(sameClient.status, 429, "the offending client should be limited");

    const otherClient = await login("198.51.100.7");
    assert.equal(otherClient.status, 401, "a different client must not be locked out");
  });
});
