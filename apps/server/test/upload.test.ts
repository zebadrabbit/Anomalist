import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, describe, test } from "node:test";
import { authHeaders, createSession, multipartFile, startTestServer, type TestServer } from "./support.js";

// Set before the app is imported so multer picks up the limit.
process.env.MEDIA_MAX_BYTES = "1024";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let server: TestServer;
let token: string;

before(async () => {
  server = await startTestServer();
  token = createSession(server.db, "editor").token;
});

after(async () => {
  await server.close();
});

async function upload(filename: string, contentType: string, content: Buffer | string) {
  const { body, headers } = multipartFile(filename, contentType, content);
  return fetch(`${server.url}/api/media`, {
    method: "POST",
    body,
    headers: { ...headers, ...authHeaders(token) }
  });
}

describe("upload hardening", () => {
  test("never derives the stored extension from the uploaded filename", async () => {
    const response = await upload("shell.html", "image/png", PNG);
    assert.equal(response.status, 201);

    const item = (await response.json()) as { filename: string };
    assert.ok(!item.filename.endsWith(".html"), `stored as ${item.filename}`);
    assert.ok(item.filename.endsWith(".png"), `stored as ${item.filename}`);
  });

  test("does not serve uploaded content as HTML", async () => {
    const response = await upload("shell.html", "image/png", "<script>alert(1)</script>");
    const item = (await response.json()) as { url: string };

    const served = await fetch(`${server.url}${item.url}`);
    const contentType = served.headers.get("content-type") ?? "";

    assert.ok(!contentType.includes("text/html"), `served as ${contentType}`);
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
  });

  test("rejects a disallowed mimetype without writing to disk", async () => {
    const before = fs.readdirSync(server.mediaDir).length;

    const response = await upload("page.html", "text/html", "<script>alert(1)</script>");

    assert.equal(response.status, 415);
    assert.equal(fs.readdirSync(server.mediaDir).length, before);
  });

  test("rejects a file over the size limit", async () => {
    const response = await upload("big.png", "image/png", Buffer.alloc(4096, 1));

    assert.equal(response.status, 413);
  });
});
