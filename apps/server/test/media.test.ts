import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { authHeaders, createSession, multipartFile, startTestServer, type TestServer } from "./support.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

describe("media API authorization", () => {
  test("rejects an unauthenticated upload", async () => {
    const { body, headers } = multipartFile("shell.html", "image/png", "<script>alert(1)</script>");
    const response = await fetch(`${server.url}/api/media`, { method: "POST", body, headers });

    assert.equal(response.status, 401);
  });

  test("rejects an unauthenticated media listing", async () => {
    const response = await fetch(`${server.url}/api/media`);

    assert.equal(response.status, 401);
  });

  test("rejects an unauthenticated delete", async () => {
    const response = await fetch(`${server.url}/api/media/some-id`, { method: "DELETE" });

    assert.equal(response.status, 401);
  });

  test("rejects an upload from a role without media.upload", async () => {
    const { token, userId } = createSession(server.db, "moderator");
    server.db.setUserPermissionOverride(userId, "media.upload", false);

    const { body, headers } = multipartFile("cat.png", "image/png", PNG);
    const response = await fetch(`${server.url}/api/media`, {
      method: "POST",
      body,
      headers: { ...headers, ...authHeaders(token) }
    });

    assert.equal(response.status, 403);
  });

  test("accepts an upload from a role with media.upload", async () => {
    const { token } = createSession(server.db, "editor");

    const { body, headers } = multipartFile("cat.png", "image/png", PNG);
    const response = await fetch(`${server.url}/api/media`, {
      method: "POST",
      body,
      headers: { ...headers, ...authHeaders(token) }
    });

    assert.equal(response.status, 201);
  });
});

describe("media delete ownership", () => {
  async function upload(token: string): Promise<string> {
    const { body, headers } = multipartFile("cat.png", "image/png", PNG);
    const response = await fetch(`${server.url}/api/media`, {
      method: "POST",
      body,
      headers: { ...headers, ...authHeaders(token) }
    });
    const item = (await response.json()) as { id: string };
    return item.id;
  }

  test("media.delete.own lets a user delete their own upload", async () => {
    const uploader = createSession(server.db, "moderator");
    const id = await upload(uploader.token);

    const response = await fetch(`${server.url}/api/media/${id}`, {
      method: "DELETE",
      headers: authHeaders(uploader.token)
    });

    assert.equal(response.status, 200);
  });

  test("media.delete.own does not let a user delete someone else's upload", async () => {
    const owner = createSession(server.db, "owner");
    const otherUser = createSession(server.db, "moderator");
    const id = await upload(owner.token);

    const response = await fetch(`${server.url}/api/media/${id}`, {
      method: "DELETE",
      headers: authHeaders(otherUser.token)
    });

    assert.equal(response.status, 403);
  });

  test("media.delete.any lets an owner delete someone else's upload", async () => {
    const uploader = createSession(server.db, "moderator");
    const owner = createSession(server.db, "owner");
    const id = await upload(uploader.token);

    const response = await fetch(`${server.url}/api/media/${id}`, {
      method: "DELETE",
      headers: authHeaders(owner.token)
    });

    assert.equal(response.status, 200);
  });
});
