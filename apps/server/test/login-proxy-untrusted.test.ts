import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_LOGINS } from "../src/login-rate-limit.js";

// No TRUST_PROXY set: this is the default, direct-to-internet deployment.
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

describe("login rate limit without a trusted proxy", () => {
  /**
   * Trusting X-Forwarded-For unconditionally would be worse than ignoring it:
   * anyone reaching the server directly could mint a fresh bucket per request
   * and never be limited at all. Default deployment must ignore the header.
   */
  test("ignores a spoofed X-Forwarded-For and still rate limits", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      const response = await login(`203.0.113.${i}`);
      assert.equal(response.status, 401, `attempt ${i} should be a normal rejection`);
    }

    const blocked = await login("203.0.113.250");

    assert.equal(blocked.status, 429);
  });
});
