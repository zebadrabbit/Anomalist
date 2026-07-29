import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { SocketEvents } from "@anomalist/types";
import { authHeaders, createSession, startTestServer, type TestServer } from "./support.js";

let server: TestServer;
let ownerToken: string;
const openSockets: Socket[] = [];

before(async () => {
  server = await startTestServer();
  ownerToken = createSession(server.db, "owner").token;
});

after(async () => {
  for (const socket of openSockets) {
    socket.disconnect();
  }
  await server.close();
});

function open(): Socket {
  const socket = connect(server.url, { transports: ["websocket"], forceNew: true });
  openSockets.push(socket);
  return socket;
}

async function connected(socket: Socket): Promise<Socket> {
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

/** Joins and waits for the server's verdict. */
async function join(socket: Socket, token: string): Promise<"ok" | "denied"> {
  await connected(socket);
  return new Promise((resolve) => {
    socket.once(SocketEvents.AUTH_SUCCESS, () => resolve("ok"));
    socket.once(SocketEvents.AUTH_ERROR, () => resolve("denied"));
    socket.emit("JOIN", { token });
  });
}

/** Resolves with the next canvas update, or null if none arrives in time. */
function nextCanvasUpdate(socket: Socket, ms = 3000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(SocketEvents.CANVAS_UPDATE, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function makeWidget() {
  return {
    id: `w-${Math.random().toString(36).slice(2, 9)}`,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    visible: true,
    props: { text: "hi" }
  };
}

describe("socket broadcast gating", () => {
  test("an unauthenticated socket receives no canvas broadcasts", async () => {
    const eavesdropper = await connected(open());
    const author = open();
    assert.equal(await join(author, ownerToken), "ok");

    // An authenticated witness makes this deterministic instead of a race: once
    // the witness has the broadcast, the server has already fanned out, so an
    // empty eavesdropper inbox means gated — not merely slow.
    const witness = open();
    assert.equal(await join(witness, ownerToken), "ok");

    let leaked: unknown = null;
    eavesdropper.once(SocketEvents.CANVAS_UPDATE, (payload: unknown) => {
      leaked = payload;
    });

    const delivered = nextCanvasUpdate(witness);
    author.emit(SocketEvents.WIDGET_ADD, makeWidget());

    assert.notEqual(await delivered, null, "witness never saw the broadcast");
    assert.equal(leaked, null, "unauthenticated socket received canvas state");
  });

  test("an authenticated socket receives canvas broadcasts", async () => {
    const listener = open();
    assert.equal(await join(listener, ownerToken), "ok");

    const author = open();
    assert.equal(await join(author, ownerToken), "ok");

    const received = nextCanvasUpdate(listener);
    author.emit(SocketEvents.WIDGET_ADD, makeWidget());

    assert.notEqual(await received, null, "authenticated socket missed the broadcast");
  });
});

describe("reconnect", () => {
  // The overlay page re-emits JOIN on every connect; this pins the server side
  // of that contract — a fresh socket re-joining is restored to the room.
  test("re-joining after a disconnect restores broadcasts", async () => {
    const listener = open();
    assert.equal(await join(listener, ownerToken), "ok");

    listener.disconnect();
    listener.connect();
    assert.equal(await join(listener, ownerToken), "ok");

    const author = open();
    assert.equal(await join(author, ownerToken), "ok");

    const received = nextCanvasUpdate(listener);
    author.emit(SocketEvents.WIDGET_ADD, makeWidget());

    assert.notEqual(await received, null, "reconnected socket missed the broadcast");
  });
});

describe("overlay token", () => {
  async function fetchOverlayToken(method: "GET" | "POST", token = ownerToken) {
    return fetch(`${server.url}/api/overlay/token`, { method, headers: authHeaders(token) });
  }

  test("requires owner to read", async () => {
    const editor = createSession(server.db, "editor");
    const response = await fetchOverlayToken("GET", editor.token);

    assert.equal(response.status, 401);
  });

  test("returns a token an overlay can join with", async () => {
    const response = await fetchOverlayToken("GET");
    assert.equal(response.status, 200);

    const { token } = (await response.json()) as { token: string };
    assert.ok(token, "expected a token");

    const overlay = open();
    assert.equal(await join(overlay, token), "ok");
  });

  test("an overlay receives broadcasts", async () => {
    const { token } = (await (await fetchOverlayToken("GET")).json()) as { token: string };
    const overlay = open();
    assert.equal(await join(overlay, token), "ok");

    const author = open();
    assert.equal(await join(author, ownerToken), "ok");

    const received = nextCanvasUpdate(overlay);
    author.emit(SocketEvents.WIDGET_ADD, makeWidget());

    assert.notEqual(await received, null, "overlay missed the broadcast");
  });

  test("an overlay cannot modify the canvas", async () => {
    const { token } = (await (await fetchOverlayToken("GET")).json()) as { token: string };
    const overlay = open();
    assert.equal(await join(overlay, token), "ok");

    const denied = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      overlay.once(SocketEvents.PERMISSION_DENIED, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    overlay.emit(SocketEvents.WIDGET_ADD, makeWidget());

    assert.equal(await denied, true, "overlay was allowed to add a widget");
  });

  test("rotating invalidates the previous token", async () => {
    const { token: oldToken } = (await (await fetchOverlayToken("GET")).json()) as { token: string };
    const { token: newToken } = (await (await fetchOverlayToken("POST")).json()) as { token: string };

    assert.notEqual(oldToken, newToken);
    assert.equal(await join(open(), oldToken), "denied");
    assert.equal(await join(open(), newToken), "ok");
  });
});
