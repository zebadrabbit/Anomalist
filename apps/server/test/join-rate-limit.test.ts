import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { SocketEvents } from "@anomalist/types";
import { createSession, startTestServer, type TestServer } from "./support.js";
import { MAX_FAILED_JOINS, resetLoginRateLimitForTests } from "../src/login-rate-limit.js";

// startTestServer sets this too, but not until before() runs — beforeEach must
// not depend on that ordering.
process.env.NODE_ENV ??= "test";

let server: TestServer;
const openSockets: Socket[] = [];

before(async () => {
  server = await startTestServer();
});

// Every socket in this file connects from the same loopback address, so the
// tests would otherwise inherit each other's exhausted budget.
beforeEach(() => {
  resetLoginRateLimitForTests();
});

after(async () => {
  for (const socket of openSockets) {
    socket.io.reconnection(false);
    socket.disconnect();
  }
  await server.close();
});

function open(): Socket {
  const socket = connect(server.url, { transports: ["websocket"], forceNew: true });
  openSockets.push(socket);
  return socket;
}

async function join(token: string): Promise<"ok" | "denied"> {
  const socket = open();
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return new Promise((resolve) => {
    socket.once(SocketEvents.AUTH_SUCCESS, () => resolve("ok"));
    socket.once(SocketEvents.AUTH_ERROR, () => resolve("denied"));
    socket.emit("JOIN", { token });
  });
}

describe("socket JOIN rate limit", () => {
  /**
   * JOIN is the app's other credential check and had no limit at all — measured
   * at 163 guesses/sec, every one evaluated. Session and overlay tokens are
   * randomUUID and not realistically guessable, but OWNER_TOKEN is chosen by the
   * operator and is accepted here while no accounts exist, which is exactly when
   * a freshly deployed box is most exposed.
   */
  test("stops evaluating tokens once an address has burned its attempts", async () => {
    for (let i = 0; i < MAX_FAILED_JOINS; i += 1) {
      assert.equal(await join(`guess-${i}`), "denied", `attempt ${i} should be a normal denial`);
    }

    // A valid session token is refused too. That is inherent: continuing to
    // evaluate tokens is exactly what the attacker needs, so the limit has to
    // apply before the token is looked at.
    const valid = createSession(server.db, "owner").token;

    assert.equal(await join(valid), "denied", "must refuse to evaluate while limited");
  });

  test("a successful join clears the address's attempts", async () => {
    const valid = createSession(server.db, "owner").token;

    for (let i = 0; i < MAX_FAILED_JOINS - 1; i += 1) {
      assert.equal(await join(`guess-${i}`), "denied");
    }

    assert.equal(await join(valid), "ok", "one attempt left, so this is still evaluated");
    assert.equal(await join(valid), "ok", "and the count is reset, so it keeps working");
  });
});
