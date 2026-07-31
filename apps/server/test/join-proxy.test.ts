import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { SocketEvents } from "@anomalist/types";
import { startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_JOINS } from "../src/login-rate-limit.js";

// Must be set before support.ts imports the app.
process.env.TRUST_PROXY = "1";

let server: TestServer;
const openSockets: Socket[] = [];

before(async () => {
  server = await startTestServer();
});

after(async () => {
  for (const socket of openSockets) {
    socket.io.reconnection(false);
    socket.disconnect();
  }
  await server.close();
});

/** Polling transport, because that is what carries the forwarded header here. */
function join(token: string, forwardedFor: string): Promise<"ok" | "denied" | "throttled"> {
  return new Promise((resolve) => {
    const socket = connect(server.url, {
      transports: ["polling"],
      forceNew: true,
      extraHeaders: { "X-Forwarded-For": forwardedFor }
    });
    openSockets.push(socket);
    socket.once("connect", () => socket.emit("JOIN", { token }));
    socket.once(SocketEvents.AUTH_SUCCESS, () => resolve("ok"));
    socket.once(SocketEvents.AUTH_ERROR, (message: string) =>
      resolve(String(message).startsWith("Too many") ? "throttled" : "denied")
    );
  });
}

describe("socket JOIN rate limit behind a trusted proxy", () => {
  /**
   * socket.io does not run Express's middleware, so without reusing the app's
   * compiled trust function every handshake would count against the proxy's
   * address — one guesser would throttle every overlay and dashboard behind it.
   */
  test("counts each forwarded client separately", async () => {
    for (let i = 0; i < MAX_FAILED_JOINS; i += 1) {
      assert.equal(await join(`guess-${i}`, "203.0.113.5"), "denied", `attempt ${i}`);
    }

    assert.equal(await join("another", "203.0.113.5"), "throttled", "the offending client is throttled");
    assert.equal(await join("another", "198.51.100.9"), "denied", "a different client is unaffected");
  });
});
