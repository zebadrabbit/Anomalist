import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import { SocketEvents, type Widget } from "@anomalist/types";
import { authHeaders, createSession, startTestServer, type TestServer } from "./support.js";

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

function open(): Socket {
  const socket = connect(server.url, { transports: ["websocket"], forceNew: true });
  openSockets.push(socket);
  return socket;
}

/** Connects and authenticates, leaving the socket open for later assertions. */
async function joined(token: string): Promise<Socket> {
  const socket = open();
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once(SocketEvents.AUTH_SUCCESS, () => resolve());
    socket.once(SocketEvents.AUTH_ERROR, (m: string) => reject(new Error(String(m))));
    socket.emit("JOIN", { token });
  });
  return socket;
}

function widget(type = "text"): Widget {
  return {
    id: randomUUID(),
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    visible: true,
    layerId: "layer-1",
    props: {}
  };
}

/** Emits WIDGET_ADD on an already-joined socket and reports the verdict. */
function tryAdd(socket: Socket, type = "text"): Promise<"allowed" | "denied"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("denied"), 2000);
    socket.once(SocketEvents.PERMISSION_DENIED, () => {
      clearTimeout(timer);
      resolve("denied");
    });
    socket.once(SocketEvents.CANVAS_UPDATE, () => {
      clearTimeout(timer);
      resolve("allowed");
    });
    socket.emit(SocketEvents.WIDGET_ADD, widget(type));
  });
}

/** Resolves with the next event payload, or null if none arrives in time. */
function nextEvent(socket: Socket, event: string, ms = 2000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("revoking an account cuts off its live socket", () => {
  /**
   * Permission checks stop a revoked user acting, but broadcasts are gated on
   * room membership, so without this they keep watching the canvas and chat for
   * as long as they leave the tab open — which is the half of "revoked" that
   * matters if they were removed for cause.
   */
  test("a deleted account stops receiving broadcasts, not just acting", async () => {
    const owner = createSession(server.db, "owner");
    const victim = createSession(server.db, "editor");
    const victimSocket = await joined(victim.token);
    const ownerSocket = await joined(owner.token);
    await settle();

    const before = nextEvent(victimSocket, SocketEvents.CANVAS_UPDATE);
    ownerSocket.emit(SocketEvents.WIDGET_ADD, widget());
    assert.ok(await before, "precondition: the victim receives canvas updates");

    const response = await fetch(`${server.url}/api/users/${victim.userId}`, {
      method: "DELETE",
      headers: authHeaders(owner.token)
    });
    assert.equal(response.status, 200, "the owner may delete an editor");
    await settle();

    const after = nextEvent(victimSocket, SocketEvents.CANVAS_UPDATE);
    ownerSocket.emit(SocketEvents.WIDGET_ADD, widget());

    assert.equal(await after, null, "a deleted account must stop receiving broadcasts");
  });

  test("signing out cuts off that account's socket", async () => {
    const owner = createSession(server.db, "owner");
    const victim = createSession(server.db, "editor");
    const victimSocket = await joined(victim.token);
    const ownerSocket = await joined(owner.token);
    await settle();

    const before = nextEvent(victimSocket, SocketEvents.CANVAS_UPDATE);
    ownerSocket.emit(SocketEvents.WIDGET_ADD, widget());
    assert.ok(await before, "precondition: the victim receives canvas updates");

    const response = await fetch(`${server.url}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(victim.token)
    });
    assert.equal(response.status, 200);
    await settle();

    const after = nextEvent(victimSocket, SocketEvents.CANVAS_UPDATE);
    ownerSocket.emit(SocketEvents.WIDGET_ADD, widget());

    assert.equal(await after, null, "a signed-out session must stop receiving broadcasts");
  });
});

describe("socket permissions follow the database, not the JOIN snapshot", () => {
  /**
   * Permissions were read from socket.data captured at JOIN, so demoting someone
   * or revoking a permission did nothing until their browser happened to
   * reconnect — and an OBS or dashboard tab can stay open for a whole stream.
   */
  test("a role demotion takes effect without reconnecting", async () => {
    const { token, userId } = createSession(server.db, "editor");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket), "allowed", "an editor may add widgets");

    server.db.updateUserRole(userId, "moderator");

    assert.equal(await tryAdd(socket), "denied", "the demotion must apply to the live socket");
  });

  test("a promotion takes effect without reconnecting", async () => {
    const { token, userId } = createSession(server.db, "moderator");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket), "denied", "a moderator may not add widgets");

    server.db.updateUserRole(userId, "editor");

    assert.equal(await tryAdd(socket), "allowed", "the promotion must apply to the live socket");
  });

  test("revoking a single permission takes effect without reconnecting", async () => {
    const { token, userId } = createSession(server.db, "editor");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket), "allowed");

    server.db.setUserPermissionOverride(userId, "widget.add", false);

    assert.equal(await tryAdd(socket), "denied", "the override must apply to the live socket");
  });

  /**
   * custom-html is the widget type that renders operator-supplied markup in the
   * overlay, so this check is guarding the sandboxed iframe surface. It read the
   * snapshot role, meaning a demoted editor kept the privilege.
   */
  test("the custom-html restriction uses the current role", async () => {
    const { token, userId } = createSession(server.db, "editor");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket, "custom-html"), "allowed", "an editor may add custom html");

    server.db.updateUserRole(userId, "moderator");

    assert.equal(await tryAdd(socket, "custom-html"), "denied", "a moderator may not");
  });

  test("clearing the session revokes a live socket", async () => {
    const { token, userId } = createSession(server.db, "editor");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket), "allowed");

    server.db.clearSessionToken(userId);

    assert.equal(await tryAdd(socket), "denied", "a signed-out session must not keep acting");
  });

  test("deleting the account revokes a live socket", async () => {
    const { token, userId } = createSession(server.db, "editor");
    const socket = await joined(token);

    assert.equal(await tryAdd(socket), "allowed");

    server.db.deleteUser(userId);

    assert.equal(await tryAdd(socket), "denied", "a deleted account must not keep acting");
  });

  /**
   * The overlay identity is synthesised at JOIN and has no row to re-read, so a
   * naive "look the user up again" would silently break every OBS source.
   */
  test("the overlay identity still works and still has no rights", async () => {
    const overlayToken = randomUUID();
    server.db.setSetting("overlay_token", overlayToken);

    const socket = await joined(overlayToken);

    assert.equal(await tryAdd(socket), "denied", "the overlay may not edit");
    assert.equal(socket.connected, true, "but it must stay connected to receive broadcasts");
  });
});
