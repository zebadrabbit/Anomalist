import type { CanvasState } from "@anomalist/types";
import type { Server } from "socket.io";
import WebSocket from "ws";
import { getSetting, getTwitchConfig, setSetting } from "./db.js";
import { getTwitchToken } from "./twitch.js";

export interface AlertAction {
  soundUrl: string;
  widgetId: string;
  duration: number;
}

export interface AlertConfig {
  sub: AlertAction;
  follow: AlertAction;
  raid: AlertAction;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  sub: { soundUrl: "", widgetId: "", duration: 5 },
  follow: { soundUrl: "", widgetId: "", duration: 3 },
  raid: { soundUrl: "", widgetId: "", duration: 8 }
};

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let keepaliveTimer: NodeJS.Timeout | null = null;
let keepaliveTimeoutSeconds = 10;
let reconnectUrl: string | null = null;

let currentIo: Server | null = null;
let currentGetCanvas: (() => CanvasState) | null = null;

function toAction(input: unknown, fallback: AlertAction): AlertAction {
  if (!input || typeof input !== "object") {
    return { ...fallback };
  }

  const candidate = input as Partial<AlertAction>;
  return {
    soundUrl: typeof candidate.soundUrl === "string" ? candidate.soundUrl : fallback.soundUrl,
    widgetId: typeof candidate.widgetId === "string" ? candidate.widgetId : fallback.widgetId,
    duration:
      typeof candidate.duration === "number" && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : fallback.duration
  };
}

export function getAlertConfig(): AlertConfig {
  const raw = getSetting("alert_config");
  if (!raw) {
    return {
      sub: { ...DEFAULT_ALERT_CONFIG.sub },
      follow: { ...DEFAULT_ALERT_CONFIG.follow },
      raid: { ...DEFAULT_ALERT_CONFIG.raid }
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AlertConfig>;
    return {
      sub: toAction(parsed.sub, DEFAULT_ALERT_CONFIG.sub),
      follow: toAction(parsed.follow, DEFAULT_ALERT_CONFIG.follow),
      raid: toAction(parsed.raid, DEFAULT_ALERT_CONFIG.raid)
    };
  } catch {
    return {
      sub: { ...DEFAULT_ALERT_CONFIG.sub },
      follow: { ...DEFAULT_ALERT_CONFIG.follow },
      raid: { ...DEFAULT_ALERT_CONFIG.raid }
    };
  }
}

export function saveAlertConfig(config: AlertConfig): void {
  setSetting("alert_config", JSON.stringify(config));
}

function clearKeepaliveTimer(): void {
  if (keepaliveTimer) {
    clearTimeout(keepaliveTimer);
    keepaliveTimer = null;
  }
}

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;

function resetKeepalive(): void {
  clearKeepaliveTimer();
  keepaliveTimer = setTimeout(() => {
    console.log("[eventsub] Keepalive timeout, reconnecting...");
    void reconnect();
  }, (keepaliveTimeoutSeconds + 15) * 1000);
}

async function subscribeType(
  token: string,
  clientId: string,
  body: Record<string, unknown>,
  type: string
): Promise<void> {
  try {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[eventsub] Failed to subscribe ${type}: ${response.status} ${errorBody}`);
      return;
    }

    console.log(`[eventsub] Subscribed to ${type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[eventsub] Failed to subscribe ${type}: ${message}`);
  }
}

async function subscribeToEvents(sessionId: string, token: string, broadcasterId: string): Promise<void> {
  const clientId = getSetting("twitch_client_id");
  if (!clientId) {
    console.error("[eventsub] Missing twitch_client_id setting");
    return;
  }

  const transport = {
    method: "websocket",
    session_id: sessionId
  };

  await subscribeType(
    token,
    clientId,
    {
      type: "channel.subscribe",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport
    },
    "channel.subscribe"
  );

  await subscribeType(
    token,
    clientId,
    {
      type: "channel.follow",
      version: "2",
      condition: {
        broadcaster_user_id: broadcasterId,
        moderator_user_id: broadcasterId
      },
      transport
    },
    "channel.follow"
  );

  await subscribeType(
    token,
    clientId,
    {
      type: "channel.raid",
      version: "1",
      condition: { to_broadcaster_user_id: broadcasterId },
      transport
    },
    "channel.raid"
  );
}

export async function handleEvent(
  event: Record<string, unknown>,
  subscriptionType: string,
  io: Server,
  _getCanvas: () => CanvasState
): Promise<void> {
  const mappedType =
    subscriptionType === "channel.subscribe"
      ? "sub"
      : subscriptionType === "channel.follow"
        ? "follow"
        : subscriptionType === "channel.raid"
          ? "raid"
          : null;

  if (!mappedType) {
    return;
  }

  const alertConfig = getAlertConfig();
  const action = alertConfig[mappedType];
  const userRaw = event.user_name ?? event.from_broadcaster_user_name;
  const user = typeof userRaw === "string" && userRaw.trim().length > 0 ? userRaw : "Someone";
  const viewers = typeof event.viewers === "number" ? event.viewers : undefined;

  io.emit("twitch:alert", {
    type: mappedType,
    user,
    viewers,
    soundUrl: action.soundUrl,
    widgetId: action.widgetId,
    duration: action.duration
  });

  console.log(`[eventsub] Alert: ${mappedType} from ${user}`);
}

function attachSocketHandlers(
  socket: WebSocket,
  token: string,
  broadcasterId: string,
  io: Server,
  getCanvas: () => CanvasState
): void {
  socket.on("open", () => {
    console.log("[eventsub] WebSocket connected");
  });

  socket.on("message", async (rawData: WebSocket.RawData) => {
    resetKeepalive();

    try {
      const payload = JSON.parse(rawData.toString()) as {
        metadata?: { message_type?: string };
        payload?: {
          session?: {
            id?: string;
            keepalive_timeout_seconds?: number;
            reconnect_url?: string;
          };
          event?: Record<string, unknown>;
          subscription?: { type?: string };
        };
      };

      const messageType = payload.metadata?.message_type;
      if (messageType === "session_welcome") {
        const sessionId = payload.payload?.session?.id;
        const timeoutSeconds = payload.payload?.session?.keepalive_timeout_seconds;

        if (typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
          keepaliveTimeoutSeconds = timeoutSeconds;
        }

        resetKeepalive();
        if (sessionId) {
          await subscribeToEvents(sessionId, token, broadcasterId);
        }
        return;
      }

      if (messageType === "session_keepalive") {
        resetKeepalive();
        return;
      }

      if (messageType === "notification") {
        const event = payload.payload?.event;
        const subscriptionType = payload.payload?.subscription?.type;
        if (event && subscriptionType) {
          await handleEvent(event, subscriptionType, io, getCanvas);
        }
        return;
      }

      if (messageType === "session_reconnect") {
        const url = payload.payload?.session?.reconnect_url;
        if (typeof url === "string" && url) {
          reconnectUrl = url;
        }

        if (ws && ws.readyState === WS_READY_STATE_OPEN) {
          ws.close(1000);
        }

        if (ws === socket) {
          ws = null;
        }

        if (currentIo && currentGetCanvas) {
          await startEventSub(currentIo, currentGetCanvas);
        }
        return;
      }

      if (messageType === "revocation") {
        const revokedType = payload.payload?.subscription?.type ?? "unknown";
        console.log(`[eventsub] Subscription revoked: ${revokedType}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eventsub] Error: ${message}`);
    }
  });

  socket.on("close", (code: number) => {
    clearKeepaliveTimer();
    if (ws === socket) {
      ws = null;
    }
    console.log(`[eventsub] Disconnected (${code})`);
    if (code !== 1000) {
      void reconnect();
    }
  });

  socket.on("error", (err: Error) => {
    const message = err.message ?? "Unknown EventSub socket error";
    console.error(`[eventsub] Error: ${message}`);
  });
}

async function reconnect(): Promise<void> {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!currentIo || !currentGetCanvas) {
      return;
    }

    await startEventSub(currentIo, currentGetCanvas);
  }, 30000);
}

export async function startEventSub(
  io: Server,
  getCanvas: () => CanvasState
): Promise<void> {
  currentIo = io;
  currentGetCanvas = getCanvas;

  if (ws && (ws.readyState === WS_READY_STATE_OPEN || ws.readyState === WS_READY_STATE_CONNECTING)) {
    return;
  }

  const config = getTwitchConfig();
  if (!config) {
    return;
  }

  const token = await getTwitchToken();
  const wsUrl = reconnectUrl ?? "wss://eventsub.woozy.twitch.tv/ws";
  reconnectUrl = null;

  const socket = new WebSocket(wsUrl);
  ws = socket;
  attachSocketHandlers(socket, token, config.twitch_user_id, io, getCanvas);
}

export function stopEventSub(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  clearKeepaliveTimer();

  if (ws && ws.readyState === WS_READY_STATE_OPEN) {
    ws.close(1000);
  }

  ws = null;
  reconnectUrl = null;
  console.log("[eventsub] Stopped");
}
