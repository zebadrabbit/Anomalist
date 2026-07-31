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

describe("GET /api/settings", () => {
  /**
   * The endpoint returned the whole settings table, which holds the Twitch
   * client secret and the overlay token. Owner-only is not enough on its own:
   * the dashboard never asks for either, so handing them to the browser only
   * widens where a credential can leak from — devtools, an extension, a crash
   * report, or any future XSS on the dashboard.
   */
  test("omits credentials while still returning ordinary settings", async () => {
    server.db.setSetting("twitch_client_secret", "super-secret-value");
    server.db.setSetting("chatbot_prefix", "?");
    const owner = createSession(server.db, "owner");

    const response = await fetch(`${server.url}/api/settings`, { headers: authHeaders(owner.token) });
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.chatbot_prefix, "?", "ordinary settings still come back");
    assert.equal(payload.twitch_client_secret, undefined, "the secret must not be present");
    assert.ok(
      !JSON.stringify(payload).includes("super-secret-value"),
      "the secret value must not appear anywhere in the response"
    );
  });

  test("omits the overlay token", async () => {
    const owner = createSession(server.db, "owner");

    const issued = await fetch(`${server.url}/api/overlay/token`, { headers: authHeaders(owner.token) });
    const { token } = (await issued.json()) as { token: string };
    assert.ok(token, "precondition: an overlay token exists");

    const response = await fetch(`${server.url}/api/settings`, { headers: authHeaders(owner.token) });
    const body = await response.text();

    assert.ok(!body.includes(token), "the overlay token is a credential and must not be listed");
  });

  /**
   * requirePermission already answered 403 for a valid session without the right
   * role; requireOwner answered 401. 401 means "we do not know who you are" and
   * invites the client to re-authenticate, which is misleading for someone who
   * is signed in and simply is not the owner.
   */
  test("answers 403 for a signed-in non-owner", async () => {
    const editor = createSession(server.db, "editor");

    const response = await fetch(`${server.url}/api/settings`, { headers: authHeaders(editor.token) });

    assert.equal(response.status, 403);
  });

  test("still answers 401 when nobody is signed in", async () => {
    const response = await fetch(`${server.url}/api/settings`);

    assert.equal(response.status, 401);
  });
});
