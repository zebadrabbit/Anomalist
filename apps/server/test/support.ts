import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

export interface TestServer {
  url: string;
  mediaDir: string;
  close: () => Promise<void>;
  db: typeof import("../src/db.js");
}

/**
 * Boots the real server on an ephemeral port against a throwaway SQLite file
 * and media directory. Env must be set before importing the app, because db.ts
 * and media.ts open their handles at module load.
 */
export async function startTestServer(): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anomalist-test-"));
  const mediaDir = path.join(dir, "media");

  process.env.DB_PATH = path.join(dir, "test.db");
  process.env.MEDIA_DIR = mediaDir;
  // Respect a test that has already opted into production mode.
  process.env.NODE_ENV ??= "test";

  const app = await import("../src/index.js");
  const db = await import("../src/db.js");

  const server = app.httpServer.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    mediaDir,
    db,
    close: async () => {
      app.io.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** Creates a user with an active session and returns its bearer token. */
export function createSession(
  db: typeof import("../src/db.js"),
  role: "owner" | "editor" | "moderator"
): { token: string; userId: string } {
  const userId = randomUUID();
  const token = randomUUID();
  db.createUser(userId, `user-${userId.slice(0, 8)}`, "unused-hash", role);
  db.setSessionToken(userId, token, new Date(Date.now() + 3_600_000).toISOString());
  return { token, userId };
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Builds a multipart body without pulling in a form-data dependency. */
export function multipartFile(
  filename: string,
  contentType: string,
  content: Buffer | string
): { body: Uint8Array<ArrayBuffer>; headers: Record<string, string> } {
  const boundary = `----anomalist${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`
      + `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const buffer = Buffer.concat([head, Buffer.from(content), tail]);

  return {
    // The parameter matters: bare `Uint8Array` means `Uint8Array<ArrayBufferLike>`,
    // and fetch's BodyInit only accepts a non-shared buffer. Buffer.concat returns
    // Buffer<ArrayBufferLike>, so it needs narrowing rather than a cast — which is
    // what the old `Buffer` return annotation was quietly getting wrong.
    body: new Uint8Array(buffer),
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` }
  };
}
