import "dotenv/config";
import express from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import multer from "multer";
import type { CanvasState, SoundPlay, Widget, WidgetTransform, WidgetUpdate } from "@anomalist/types";
import { SocketEvents } from "@anomalist/types";
import {
  clearTwitchConfig,
  clearSessionToken,
  countOwners,
  countUsers,
  createUser,
  deletePreset,
  deleteUser,
  getSetting,
  getUserById,
  getTwitchConfig,
  getUserBySessionToken,
  getUserByUsername,
  getUserPermissionOverrides,
  setSetting,
  listPresets,
  listUsers,
  loadPreset,
  loadState,
  savePreset,
  removeUserPermissionOverride,
  saveState,
  setSessionToken,
  setUserPermissionOverride,
  updateUserPassword,
  updateUserRole,
  type UserPermissionOverrideRow,
  type UserRow
} from "./db.js";
import { MEDIA_DIR, deleteMediaItem, getMediaType, listMediaItems, saveMediaItem } from "./media.js";
import {
  Permissions,
  listAllPermissions,
  resolvePermission,
  type Permission
} from "./permissions.js";
import { buildOAuthUrl, exchangeCode, getTwitchToken } from "./twitch.js";
import { isChatbotConnected, startChatbot, stopChatbot } from "./chatbot.js";
import {
  getAlertConfig,
  saveAlertConfig,
  startEventSub,
  stopEventSub,
  type AlertConfig
} from "./eventsub.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const JOIN_EVENT = "JOIN";
const OWNER_TOKEN_FALLBACK_USER_ID = "owner-token-fallback";

const configuredOwnerToken = process.env.OWNER_TOKEN;
const hasConfiguredOwnerToken = !!configuredOwnerToken && configuredOwnerToken !== "change-me";
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);
const isProduction = process.env.NODE_ENV === "production";
const failedLoginAttemptsByIp = new Map<string, number[]>();
const SESSION_COOKIE_NAME = "sessionToken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initialUserCount = countUsers();
if (hasConfiguredOwnerToken) {
  if (initialUserCount === 0) {
    console.log(
      "No users found. Use OWNER_TOKEN temporarily or visit the dashboard to complete first-run setup."
    );
  } else {
    console.log(
      "OWNER_TOKEN is set but user accounts exist. OWNER_TOKEN is ignored — please log in with your account."
    );
  }
}

function createDefaultState(): CanvasState {
  return {
    scenes: [
      {
        id: "default",
        name: "Default Scene",
        widgets: []
      }
    ],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        visible: true
      }
    ],
    activeSceneId: "default"
  };
}

const allowedMimetypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/mpeg",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac"
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, MEDIA_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    }
  })
});

app.use(express.json());

function isRole(value: string): value is "owner" | "editor" | "moderator" {
  return value === "owner" || value === "editor" || value === "moderator";
}

function isValidUsername(username: string): boolean {
  return /^[A-Za-z0-9_]{3,32}$/.test(username);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

function getRequesterIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneFailedAttempts(ip: string): number[] {
  const now = Date.now();
  const windowStart = now - 15 * 60 * 1000;
  const attempts = (failedLoginAttemptsByIp.get(ip) ?? []).filter((timestamp) => timestamp >= windowStart);
  failedLoginAttemptsByIp.set(ip, attempts);
  return attempts;
}

function pushFailedAttempt(ip: string): void {
  const attempts = pruneFailedAttempts(ip);
  attempts.push(Date.now());
  failedLoginAttemptsByIp.set(ip, attempts);
}

function clearFailedAttempts(ip: string): void {
  failedLoginAttemptsByIp.delete(ip);
}

function buildUserResponse(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function toPermissionOverrides(overrides: UserPermissionOverrideRow[]) {
  return overrides.map((override) => ({
    permission: override.permission,
    granted: override.granted
  }));
}

function getEffectivePermissions(role: string, overrides: UserPermissionOverrideRow[]): Permission[] {
  return listAllPermissions().filter((permission) =>
    resolvePermission(role, permission, toPermissionOverrides(overrides))
  );
}

function getAuthTokenFromHeader(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function getAuthTokenFromCookie(req: express.Request): string | null {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) {
    return null;
  }

  const pairs = rawCookie.split(";");
  for (const pair of pairs) {
    const [rawName, ...rawValueParts] = pair.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function getAuthToken(req: express.Request): string | null {
  return getAuthTokenFromHeader(req) ?? getAuthTokenFromCookie(req);
}

function extractAuthUser(req: express.Request): UserRow | null {
  const token = getAuthToken(req);
  if (!token) {
    return null;
  }

  const user = getUserBySessionToken(token);
  if (!user) {
    return null;
  }

  if (!user.sessionExpiresAt) {
    clearSessionToken(user.id);
    return null;
  }

  const expiresAtMs = Date.parse(user.sessionExpiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    clearSessionToken(user.id);
    return null;
  }

  return user;
}

function requirePermission(
  req: express.Request,
  res: express.Response,
  permission: Permission
): { user: UserRow; overrides: UserPermissionOverrideRow[] } | null {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const overrides = getUserPermissionOverrides(user.id);
  if (!resolvePermission(user.role, permission, toPermissionOverrides(overrides))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return { user, overrides };
}

function requireOwner(req: express.Request, res: express.Response): UserRow | null {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (user.role !== "owner") {
    res.status(401).json({ error: "Owner role required" });
    return null;
  }

  return user;
}

function requireStreamManage(
  req: express.Request,
  res: express.Response
): { user: UserRow; overrides: UserPermissionOverrideRow[] } | null {
  return requirePermission(req, res, Permissions.STREAM_MANAGE);
}

app.use("/media", express.static(MEDIA_DIR));

app.get("/api/auth/status", (_req, res) => {
  res.json({ setup: countUsers() === 0 });
});

app.post("/api/auth/setup", async (req, res) => {
  if (countUsers() > 0) {
    res.status(403).json({ error: "Setup already completed" });
    return;
  }

  const { username, password } = req.body as { username?: unknown; password?: unknown };
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!isValidUsername(normalizedUsername)) {
    res.status(400).json({ error: "Username must be 3-32 characters (letters, numbers, underscore)" });
    return;
  }

  if (!isValidPassword(normalizedPassword)) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  if (getUserByUsername(normalizedUsername)) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 12);
  createUser(randomUUID(), normalizedUsername, passwordHash, "owner");

  res.json({ message: "Owner account created" });
});

app.post("/api/auth/login", async (req, res) => {
  const ip = getRequesterIp(req);
  const attempts = pruneFailedAttempts(ip);
  if (attempts.length >= 10) {
    res.status(429).json({ error: "Too many failed login attempts. Try again later." });
    return;
  }

  const { username, password } = req.body as { username?: unknown; password?: unknown };
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";

  const user = getUserByUsername(normalizedUsername);
  const validPassword = user ? await bcrypt.compare(normalizedPassword, user.passwordHash) : false;
  if (!user || !validPassword) {
    pushFailedAttempt(ip);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  clearFailedAttempts(ip);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  setSessionToken(user.id, token, expiresAt);

  const expiresAtDate = new Date(expiresAt);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    expires: Number.isNaN(expiresAtDate.getTime()) ? undefined : expiresAtDate,
    path: "/"
  });

  res.json({ token, user: buildUserResponse(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  clearSessionToken(user.id);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.status(200).json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const overrides = getUserPermissionOverrides(user.id);
  const permissions = getEffectivePermissions(user.role, overrides);

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    permissions
  });
});

app.get("/api/users", (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const users = listUsers().map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    overrides: toPermissionOverrides(getUserPermissionOverrides(user.id))
  }));

  res.json(users);
});

app.post("/api/users", async (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const { username, password, role } = req.body as {
    username?: unknown;
    password?: unknown;
    role?: unknown;
  };

  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";
  const normalizedRole = typeof role === "string" ? role : "";

  if (!isValidUsername(normalizedUsername)) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }

  if (!isValidPassword(normalizedPassword)) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  if (!isRole(normalizedRole)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  if (getUserByUsername(normalizedUsername)) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(normalizedPassword, 12);
  createUser(userId, normalizedUsername, passwordHash, normalizedRole);

  const user = getUserById(userId);
  res.status(201).json({
    id: userId,
    username: normalizedUsername,
    role: normalizedRole,
    createdAt: user?.createdAt ?? new Date().toISOString(),
    overrides: []
  });
});

app.patch("/api/users/:id", async (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const user = getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { role, password } = req.body as { role?: unknown; password?: unknown };
  const nextRole = typeof role === "string" ? role : null;
  const nextPassword = typeof password === "string" ? password : null;

  if (!nextRole && !nextPassword) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  if (nextRole) {
    if (!isRole(nextRole)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    if (user.role === "owner" && nextRole !== "owner" && countOwners() <= 1) {
      res.status(400).json({ error: "Cannot demote the only owner account" });
      return;
    }

    updateUserRole(user.id, nextRole);
  }

  if (nextPassword) {
    if (!isValidPassword(nextPassword)) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    updateUserPassword(user.id, passwordHash);
  }

  const updatedUser = getUserById(user.id);
  res.json({
    id: updatedUser?.id ?? user.id,
    username: updatedUser?.username ?? user.username,
    role: updatedUser?.role ?? user.role,
    createdAt: updatedUser?.createdAt ?? user.createdAt,
    overrides: toPermissionOverrides(getUserPermissionOverrides(user.id))
  });
});

app.delete("/api/users/:id", (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const user = getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "owner" && countOwners() <= 1) {
    res.status(400).json({ error: "Cannot delete the only owner account" });
    return;
  }

  deleteUser(user.id);
  res.status(200).json({ ok: true });
});

app.get("/api/users/:id/permissions", (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const user = getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const overrides = getUserPermissionOverrides(user.id);
  const overrideMap = new Map(overrides.map((entry) => [entry.permission, entry.granted]));
  const items = listAllPermissions().map((permission) => ({
    permission,
    granted: resolvePermission(user.role, permission, toPermissionOverrides(overrides)),
    overridden: overrideMap.has(permission)
  }));

  res.json(items);
});

app.put("/api/users/:id/permissions/:permission", (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const user = getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const permission = req.params.permission as Permission;
  if (!listAllPermissions().includes(permission)) {
    res.status(400).json({ error: "Unknown permission" });
    return;
  }

  const { granted } = req.body as { granted?: unknown };
  if (typeof granted !== "boolean") {
    res.status(400).json({ error: "granted must be a boolean" });
    return;
  }

  if (user.role === "owner" && permission === Permissions.USER_MANAGE && granted === false) {
    res.status(400).json({ error: "owner user.manage cannot be disabled" });
    return;
  }

  setUserPermissionOverride(user.id, permission, granted);
  res.status(200).json({ ok: true });
});

app.delete("/api/users/:id/permissions/:permission", (req, res) => {
  const guard = requirePermission(req, res, Permissions.USER_MANAGE);
  if (!guard) {
    return;
  }

  const user = getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const permission = req.params.permission as Permission;
  if (!listAllPermissions().includes(permission)) {
    res.status(400).json({ error: "Unknown permission" });
    return;
  }

  removeUserPermissionOverride(user.id, permission);
  res.status(200).json({ ok: true });
});

app.get("/api/twitch/status", (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  const config = getTwitchConfig();
  if (!config) {
    res.json({ connected: false });
    return;
  }

  res.json({
    connected: true,
    login: config.twitch_login,
    display_name: config.twitch_display_name,
    chatbot: {
      enabled: getSetting("chatbot_enabled") !== "false",
      connected: isChatbotConnected()
    }
  });
});

app.post("/api/twitch/chatbot", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  setSetting("chatbot_enabled", enabled ? "true" : "false");
  if (!enabled) {
    await stopChatbot();
  } else {
    await startChatbot(io, getCanvasState, setWidgetProps);
  }

  res.json({ ok: true, enabled });
});

app.get("/api/twitch/alerts/config", (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  res.json(getAlertConfig());
});

app.get("/api/twitch/stream", async (req, res) => {
  const guard = requireStreamManage(req, res);
  if (!guard) {
    return;
  }

  const config = getTwitchConfig();
  const clientId = getSetting("twitch_client_id");
  if (!config || !clientId) {
    res.status(503).json({ error: "Twitch not connected" });
    return;
  }

  try {
    const token = await getTwitchToken();
    const response = await fetch(
      `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(config.twitch_user_id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId
        }
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      res.status(503).json({ error: `Failed to fetch stream info: ${details || response.status}` });
      return;
    }

    const payload = (await response.json()) as {
      data?: Array<{ title?: string; game_id?: string; game_name?: string }>;
    };
    const channel = payload.data?.[0] ?? {};

    res.json({
      title: typeof channel.title === "string" ? channel.title : "",
      game_id: typeof channel.game_id === "string" ? channel.game_id : "",
      game_name: typeof channel.game_name === "string" ? channel.game_name : ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ error: message || "Failed to fetch stream info" });
  }
});

app.patch("/api/twitch/stream", async (req, res) => {
  const guard = requireStreamManage(req, res);
  if (!guard) {
    return;
  }

  const config = getTwitchConfig();
  const clientId = getSetting("twitch_client_id");
  if (!config || !clientId) {
    res.status(503).json({ error: "Twitch not connected" });
    return;
  }

  const { title, game_id } = req.body as { title?: unknown; game_id?: unknown };
  const updateBody: Record<string, string> = {};

  if (typeof title === "string") {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length > 140) {
      res.status(400).json({ error: "title must be 140 characters or fewer" });
      return;
    }
    updateBody.title = normalizedTitle;
  }

  if (typeof game_id === "string") {
    const normalizedGameId = game_id.trim();
    if (!normalizedGameId) {
      res.status(400).json({ error: "game_id must be a non-empty string" });
      return;
    }
    updateBody.game_id = normalizedGameId;
  }

  if (Object.keys(updateBody).length === 0) {
    res.status(400).json({ error: "At least one of title or game_id is required" });
    return;
  }

  try {
    const token = await getTwitchToken();
    const response = await fetch(
      `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(config.twitch_user_id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateBody)
      }
    );

    if (response.status === 204) {
      res.json({ ok: true });
      return;
    }

    const details = await response.text().catch(() => "");
    res.status(502).json({ error: "Twitch API error", details: details || String(response.status) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: "Twitch API error", details: message });
  }
});

app.get("/api/twitch/stream/search-games", async (req, res) => {
  const guard = requireStreamManage(req, res);
  if (!guard) {
    return;
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2) {
    res.status(400).json({ error: "q must be at least 2 characters" });
    return;
  }

  const clientId = getSetting("twitch_client_id");
  if (!clientId || !getTwitchConfig()) {
    res.status(503).json({ error: "Twitch not connected" });
    return;
  }

  try {
    const token = await getTwitchToken();
    const response = await fetch(
      `https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}&first=8`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId
        }
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      res.status(503).json({ error: `Failed to search games: ${details || response.status}` });
      return;
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string; box_art_url?: string }>;
    };

    const items = (payload.data ?? [])
      .slice(0, 8)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        name: typeof item.name === "string" ? item.name : "",
        box_art_url: typeof item.box_art_url === "string" ? item.box_art_url : ""
      }))
      .filter((item) => item.id && item.name);

    res.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ error: message || "Failed to search games" });
  }
});

app.put("/api/twitch/alerts/config", (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  const current = getAlertConfig();
  const patch = (req.body ?? {}) as Partial<AlertConfig>;
  const mergeAction = (
    base: AlertConfig["sub"],
    incoming: Partial<AlertConfig["sub"]> | undefined
  ): AlertConfig["sub"] => ({
    soundUrl: typeof incoming?.soundUrl === "string" ? incoming.soundUrl : base.soundUrl,
    widgetId: typeof incoming?.widgetId === "string" ? incoming.widgetId : base.widgetId,
    duration:
      typeof incoming?.duration === "number" && Number.isFinite(incoming.duration)
        ? Math.max(1, incoming.duration)
        : base.duration
  });

  const nextConfig: AlertConfig = {
    sub: mergeAction(current.sub, patch.sub),
    follow: mergeAction(current.follow, patch.follow),
    raid: mergeAction(current.raid, patch.raid)
  };

  saveAlertConfig(nextConfig);
  res.json({ ok: true, config: nextConfig });
});

app.post("/api/twitch/credentials", (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  const { client_id, client_secret } = req.body as {
    client_id?: unknown;
    client_secret?: unknown;
  };

  const normalizedClientId = typeof client_id === "string" ? client_id.trim() : "";
  const normalizedClientSecret = typeof client_secret === "string" ? client_secret.trim() : "";

  if (!normalizedClientId || !normalizedClientSecret) {
    res.status(400).json({ error: "client_id and client_secret are required" });
    return;
  }

  setSetting("twitch_client_id", normalizedClientId);
  setSetting("twitch_client_secret", normalizedClientSecret);

  res.json({ ok: true });
});

app.get("/auth/twitch/connect", (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  try {
    const url = buildOAuthUrl();
    res.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Twitch OAuth";
    res.status(400).json({ error: message });
  }
});

app.get("/auth/twitch/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code || !state) {
    res.redirect("/?twitch=error");
    return;
  }

  try {
    await exchangeCode(code, state);
    await startChatbot(io, getCanvasState, setWidgetProps);
    await startEventSub(io, getCanvasState);
    res.redirect("/?twitch=connected");
  } catch {
    res.redirect("/?twitch=error");
  }
});

app.delete("/api/twitch/disconnect", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) {
    return;
  }

  clearTwitchConfig();
  await stopChatbot();
  stopEventSub();
  res.json({ ok: true });
});

app.get("/api/media", (_req, res) => {
  res.json(listMediaItems());
});

app.post("/api/media", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  if (!allowedMimetypes.has(file.mimetype)) {
    fs.unlink(file.path, () => undefined);
    res.status(415).json({ error: "Unsupported media type" });
    return;
  }

  const item = {
    id: randomUUID(),
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    mediaType: getMediaType(file.mimetype),
    size: file.size,
    uploadedAt: new Date().toISOString()
  };

  saveMediaItem(item);
  res.status(201).json({
    ...item,
    url: `/media/${item.filename}`
  });
});

app.delete("/api/media/:id", (req, res) => {
  deleteMediaItem(req.params.id);
  res.status(200).json({ ok: true });
});

const persistedCanvasState = loadState("canvas");

let canvasState: CanvasState = persistedCanvasState ?? createDefaultState();

if (!persistedCanvasState) {
  saveState("canvas", canvasState);
}

function getActiveScene(state: CanvasState) {
  return state.scenes.find((scene) => scene.id === state.activeSceneId);
}

function getCanvasState(): CanvasState {
  return canvasState;
}

function setWidgetProps(widgetId: string, props: Record<string, unknown>): void {
  let targetWidget: Widget | null = null;
  for (const scene of canvasState.scenes) {
    const widget = scene.widgets.find((candidate) => candidate.id === widgetId);
    if (widget) {
      targetWidget = widget;
      break;
    }
  }

  if (!targetWidget) {
    return;
  }

  targetWidget.props = {
    ...targetWidget.props,
    ...props
  };
  saveState("canvas", canvasState);
  io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
}

if (isProduction) {
  const dashboardBuildPath = path.join(__dirname, "../../dashboard/build");
  const overlayBuildPath = path.join(__dirname, "../../overlay/build");

  app.use("/overlay", express.static(overlayBuildPath));
  app.use(express.static(dashboardBuildPath));

  app.get("/overlay/*rest", (_req, res) => {
    res.sendFile(path.join(overlayBuildPath, "index.html"));
  });

  app.get("/*rest", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/overlay")) {
      next();
      return;
    }

    res.sendFile(path.join(dashboardBuildPath, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

function can(socket: any, permission: Permission): boolean {
  const user = socket.data?.user as UserRow | undefined;
  const overrides = (socket.data?.overrides as UserPermissionOverrideRow[] | undefined) ?? [];
  if (!user) {
    return false;
  }

  return resolvePermission(user.role, permission, toPermissionOverrides(overrides));
}

function denyPermission(socket: any, eventName: string, permission: Permission): void {
  socket.emit(SocketEvents.PERMISSION_DENIED, {
    event: eventName,
    permission
  });
}

function isVisibilityOnlyUpdate(incomingWidget: Widget | WidgetUpdate): boolean {
  const keys = Object.keys(incomingWidget).filter((key) => key !== "id");
  return (
    keys.length === 1
    && keys[0] === "visible"
    && typeof (incomingWidget as { visible?: unknown }).visible === "boolean"
  );
}

function emitPresetListToDashboards(): void {
  const payload = listPresets();
  for (const client of io.sockets.sockets.values()) {
    if (client.data?.clientType === "dashboard") {
      client.emit(SocketEvents.PRESET_LIST, payload);
    }
  }
}

io.on("connection", (socket) => {
  console.log("client connected");

  socket.on(JOIN_EVENT, (payload: { token?: string }) => {
    const token = payload?.token;
    if (!token) {
      socket.emit(SocketEvents.AUTH_ERROR, "Invalid token");
      socket.disconnect(true);
      return;
    }

    const totalUsers = countUsers();
    let user: UserRow | null = null;
    let overrides: UserPermissionOverrideRow[] = [];

    if (totalUsers === 0 && hasConfiguredOwnerToken && token === configuredOwnerToken) {
      user = {
        id: OWNER_TOKEN_FALLBACK_USER_ID,
        username: "owner-token",
        passwordHash: "",
        role: "owner",
        sessionToken: token,
        sessionExpiresAt: null,
        createdAt: new Date().toISOString()
      };
    } else {
      user = getUserBySessionToken(token);
      if (!user || !user.sessionExpiresAt || Date.parse(user.sessionExpiresAt) <= Date.now()) {
        if (user) {
          clearSessionToken(user.id);
        }
        socket.emit(SocketEvents.AUTH_ERROR, "Invalid token");
        socket.disconnect(true);
        return;
      }

      overrides = getUserPermissionOverrides(user.id);
    }

    socket.data.user = user;
    socket.data.overrides = overrides;
    socket.emit(SocketEvents.AUTH_SUCCESS, {
      user: buildUserResponse(user)
    });
    socket.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.USER_JOIN, () => {
    socket.data.clientType = "dashboard";
  });

  socket.on(SocketEvents.WIDGET_ADD, (widget: Widget) => {
    if (!can(socket, Permissions.WIDGET_ADD)) {
      denyPermission(socket, SocketEvents.WIDGET_ADD, Permissions.WIDGET_ADD);
      return;
    }

    const role = (socket.data?.user as UserRow | undefined)?.role;
    if (widget.type === "custom-html" && role === "moderator") {
      denyPermission(socket, SocketEvents.WIDGET_ADD, Permissions.WIDGET_ADD);
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets.push(widget);
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.WIDGET_UPDATE, (incomingWidget: Widget | WidgetUpdate) => {
    const requiredPermission = isVisibilityOnlyUpdate(incomingWidget)
      ? Permissions.WIDGET_VISIBILITY
      : Permissions.WIDGET_EDIT;
    if (!can(socket, requiredPermission)) {
      denyPermission(socket, SocketEvents.WIDGET_UPDATE, requiredPermission);
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    const widgetIndex = activeScene.widgets.findIndex((widget) => widget.id === incomingWidget.id);
    if (widgetIndex === -1) {
      return;
    }

    const existingWidget = activeScene.widgets[widgetIndex];
    const { id: _id, props, ...topLevelUpdates } = incomingWidget;

    Object.assign(existingWidget, topLevelUpdates);
    if (props && typeof props === "object") {
      existingWidget.props = {
        ...existingWidget.props,
        ...props
      };
    }

    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.WIDGET_TRANSFORM, (data: WidgetTransform) => {
    if (!can(socket, Permissions.WIDGET_TRANSFORM)) {
      denyPermission(socket, SocketEvents.WIDGET_TRANSFORM, Permissions.WIDGET_TRANSFORM);
      return;
    }

    socket.broadcast.emit(SocketEvents.WIDGET_TRANSFORM, data);
  });

  socket.on(SocketEvents.WIDGET_REMOVE, (payload: { id: string }) => {
    if (!can(socket, Permissions.WIDGET_REMOVE)) {
      denyPermission(socket, SocketEvents.WIDGET_REMOVE, Permissions.WIDGET_REMOVE);
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets = activeScene.widgets.filter((widget) => widget.id !== payload.id);
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.SCENE_CHANGE, (payload: { sceneId: string }) => {
    if (!can(socket, Permissions.SCENE_MANAGE)) {
      denyPermission(socket, SocketEvents.SCENE_CHANGE, Permissions.SCENE_MANAGE);
      return;
    }

    const sceneExists = canvasState.scenes.some((scene) => scene.id === payload.sceneId);
    if (!sceneExists) {
      return;
    }

    canvasState.activeSceneId = payload.sceneId;
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.PLAY_SOUND, (data: SoundPlay) => {
    if (!can(socket, Permissions.SOUNDBOARD_PLAY)) {
      denyPermission(socket, SocketEvents.PLAY_SOUND, Permissions.SOUNDBOARD_PLAY);
      return;
    }

    if (!data || typeof data.url !== "string" || !data.url.startsWith("/media/")) {
      socket.emit(SocketEvents.AUTH_ERROR, { message: "Sound URL must be a server-hosted media file." });
      return;
    }

    const volume = Math.min(1, Math.max(0, Number.isFinite(data.volume) ? data.volume : 1));
    io.emit(SocketEvents.PLAY_SOUND, { url: data.url, volume });
  });

  socket.on(SocketEvents.PRESET_SAVE, (payload: { name?: string }) => {
    if (!can(socket, Permissions.SCENE_MANAGE)) {
      denyPermission(socket, SocketEvents.PRESET_SAVE, Permissions.SCENE_MANAGE);
      return;
    }

    const activeScene = getActiveScene(canvasState);
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    if (!activeScene || !name) {
      return;
    }

    savePreset(randomUUID(), name, activeScene);
    emitPresetListToDashboards();
  });

  socket.on(SocketEvents.PRESET_LOAD, (payload: { id?: string }) => {
    if (!can(socket, Permissions.SCENE_MANAGE)) {
      denyPermission(socket, SocketEvents.PRESET_LOAD, Permissions.SCENE_MANAGE);
      return;
    }

    const presetId = typeof payload?.id === "string" ? payload.id : "";
    if (!presetId) {
      return;
    }

    const preset = loadPreset(presetId);
    const activeScene = getActiveScene(canvasState);
    if (!preset || !activeScene) {
      return;
    }

    activeScene.widgets = JSON.parse(JSON.stringify(preset.widgets)) as Widget[];
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
    emitPresetListToDashboards();
  });

  socket.on(SocketEvents.PRESET_DELETE, (payload: { id?: string }) => {
    if (!can(socket, Permissions.SCENE_MANAGE)) {
      denyPermission(socket, SocketEvents.PRESET_DELETE, Permissions.SCENE_MANAGE);
      return;
    }

    const presetId = typeof payload?.id === "string" ? payload.id : "";
    if (!presetId) {
      return;
    }

    deletePreset(presetId);
    emitPresetListToDashboards();
  });

  socket.on(SocketEvents.PRESET_LIST, () => {
    socket.emit(SocketEvents.PRESET_LIST, listPresets());
  });
});

httpServer.listen(port, () => {
  console.log(`server listening on port ${port}`);
  void startChatbot(io, getCanvasState, setWidgetProps).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chatbot] Auto-start failed: ${message}`);
  });
  void startEventSub(io, getCanvasState).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[eventsub] Auto-start failed: ${message}`);
  });
});

export { app };
