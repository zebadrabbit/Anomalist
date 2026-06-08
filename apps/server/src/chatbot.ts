import tmi from "tmi.js";
import type { CanvasState, Widget } from "@anomalist/types";
import { SocketEvents } from "@anomalist/types";
import type { Server } from "socket.io";
import { getSetting, getTwitchConfig } from "./db.js";
import { getTwitchToken } from "./twitch.js";

let client: tmi.Client | null = null;

function getAllWidgets(state: CanvasState): Widget[] {
  return state.scenes.flatMap((scene) => scene.widgets);
}

function normalizeValue(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function handleChatMessage(
  io: Server,
  getCanvas: () => CanvasState,
  setWidget: (widgetId: string, props: Record<string, unknown>) => void,
  userstate: tmi.ChatUserstate,
  message: string,
  self: boolean
): Promise<void> {
  if (self) {
    return;
  }

  io.emit(SocketEvents.CHAT_MESSAGE, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: userstate["display-name"] ?? userstate.username ?? "unknown",
    color: userstate.color ?? "#9146FF",
    message,
    badges: userstate.badges ?? {},
    timestamp: Date.now()
  });

  const text = message.trim();
  if (!text) {
    return;
  }

  const prefix = getSetting("chatbot_prefix") ?? "!";
  if (!text.startsWith(prefix)) {
    return;
  }

  const soundPrefix = `${prefix}sound `;
  if (text.toLowerCase().startsWith(soundPrefix.toLowerCase())) {
    const soundName = text.slice(soundPrefix.length).trim();
    if (!soundName) {
      return;
    }

    const widgets = getAllWidgets(getCanvas());
    const soundboard = widgets.find((widget) => widget.type === "soundboard");
    if (!soundboard) {
      return;
    }

    const sounds = Array.isArray(soundboard.props.sounds) ? soundboard.props.sounds : [];
    const matchedSound = sounds
      .filter((item): item is { name?: unknown; url?: unknown } => !!item && typeof item === "object")
      .find((sound) => normalizeValue(sound.name) === soundName.toLowerCase());

    if (!matchedSound || typeof matchedSound.url !== "string" || !matchedSound.url) {
      return;
    }

    const widgetVolume = typeof soundboard.props.volume === "number" ? soundboard.props.volume : 1;
    const clampedVolume = Math.min(1, Math.max(0, widgetVolume));
    io.emit("sound:play", { url: matchedSound.url, volume: clampedVolume });
    return;
  }

  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const counterPattern = new RegExp(`^${escapedPrefix}counter\\s+(.+)\\s+([+-])$`, "i");
  const counterMatch = text.match(counterPattern);
  if (!counterMatch) {
    return;
  }

  const isModerator =
    userstate.mod === true
    || userstate["user-type"] === "mod"
    || userstate.badges?.broadcaster === "1";
  if (!isModerator) {
    return;
  }

  const label = counterMatch[1].trim().toLowerCase();
  const operator = counterMatch[2];
  if (!label || (operator !== "+" && operator !== "-")) {
    return;
  }

  const widgets = getAllWidgets(getCanvas());
  const counter = widgets.find(
    (widget) => widget.type === "counter" && normalizeValue(widget.props.label) === label
  );
  if (!counter) {
    return;
  }

  const currentValue =
    typeof counter.props.value === "number" && Number.isFinite(counter.props.value)
      ? counter.props.value
      : 0;
  let nextValue = operator === "+" ? currentValue + 1 : currentValue - 1;

  if (typeof counter.props.min === "number" && Number.isFinite(counter.props.min)) {
    nextValue = Math.max(counter.props.min, nextValue);
  }

  if (typeof counter.props.max === "number" && Number.isFinite(counter.props.max)) {
    nextValue = Math.min(counter.props.max, nextValue);
  }

  setWidget(counter.id, { value: nextValue });
}

export async function startChatbot(
  io: Server,
  getCanvas: () => CanvasState,
  setWidget: (widgetId: string, props: Record<string, unknown>) => void
): Promise<void> {
  if (client) {
    return;
  }

  const config = getTwitchConfig();
  if (!config) {
    return;
  }

  if (getSetting("chatbot_enabled") === "false") {
    return;
  }

  try {
    const token = await getTwitchToken();
    const nextClient = new tmi.Client({
      identity: {
        username: config.twitch_login,
        password: `oauth:${token}`
      },
      channels: [config.twitch_login]
    });

    await nextClient.connect();

    nextClient.on("message", async (_channel, userstate, message, self) => {
      await handleChatMessage(io, getCanvas, setWidget, userstate, message, self);
    });

    nextClient.on("disconnected", (reason: string) => {
      console.log(`[chatbot] Disconnected: ${reason}`);
      client = null;
    });

    client = nextClient;
    console.log(`[chatbot] Connected to #${config.twitch_login}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chatbot] Failed to connect: ${message}`);
    client = null;
  }
}

export async function stopChatbot(): Promise<void> {
  if (!client) {
    return;
  }

  await client.disconnect();
  client = null;
  console.log("[chatbot] Disconnected");
}

export function isChatbotConnected(): boolean {
  return client !== null;
}
