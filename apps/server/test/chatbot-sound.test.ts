import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import type { CanvasState } from "@anomalist/types";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anomalist-chatbot-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.MEDIA_DIR = path.join(dir, "media");
process.env.NODE_ENV ??= "test";

let handleChatMessage: typeof import("../src/chatbot.js").handleChatMessage;
let SOUND_COOLDOWN_MS: number;

before(async () => {
  const chatbot = await import("../src/chatbot.js");
  handleChatMessage = chatbot.handleChatMessage;
  SOUND_COOLDOWN_MS = chatbot.SOUND_COOLDOWN_MS;
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function canvasWithSound(): CanvasState {
  return {
    scenes: [
      {
        id: "s1",
        name: "Scene",
        widgets: [
          {
            id: randomUUID(),
            type: "soundboard",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            visible: true,
            layerId: "layer-1",
            props: { sounds: [{ label: "airhorn", url: "/media/airhorn.mp3", volume: 1 }] }
          }
        ]
      }
    ],
    layers: [{ id: "layer-1", name: "Layer 1", visible: true }],
    activeSceneId: "s1"
  };
}

/** Records what the chatbot broadcasts without standing up a real socket server. */
function recordingIo(): { io: Server; plays: unknown[] } {
  const plays: unknown[] = [];
  const io = {
    to: () => ({
      emit: (event: string, payload: unknown) => {
        if (event === "sound:play") {
          plays.push(payload);
        }
      }
    })
  } as unknown as Server;
  return { io, plays };
}

async function say(io: Server, message: string, now?: number): Promise<void> {
  await handleChatMessage(io, canvasWithSound, () => {}, { username: "viewer" }, message, false, now);
}

describe("!sound cooldown", () => {
  /**
   * Anyone in chat can fire this, and every trigger plays audio over the live
   * stream. Without a cooldown a single viewer can hold the airhorn down for the
   * whole broadcast. A cooldown rather than a moderator gate on purpose —
   * viewer-triggered sounds are the point of the feature.
   */
  test("plays the first request", async () => {
    const { io, plays } = recordingIo();

    await say(io, "!sound airhorn", 1_000_000);

    assert.equal(plays.length, 1);
  });

  test("ignores a second request inside the cooldown", async () => {
    const { io, plays } = recordingIo();

    await say(io, "!sound airhorn", 2_000_000);
    await say(io, "!sound airhorn", 2_000_000 + SOUND_COOLDOWN_MS - 1);

    assert.equal(plays.length, 1, "the second request must be dropped");
  });

  test("allows the next request once the cooldown expires", async () => {
    const { io, plays } = recordingIo();

    await say(io, "!sound airhorn", 3_000_000);
    await say(io, "!sound airhorn", 3_000_000 + SOUND_COOLDOWN_MS);

    assert.equal(plays.length, 2);
  });

  test("an unknown sound does not start the cooldown", async () => {
    const { io, plays } = recordingIo();

    await say(io, "!sound nonexistent", 4_000_000);
    await say(io, "!sound airhorn", 4_000_000 + 1);

    assert.equal(plays.length, 1, "a request that played nothing must not block a real one");
  });
});
