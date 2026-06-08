import Database from "better-sqlite3";
import type { CanvasState } from "@anomalist/types";
import type { Permission } from "./permissions.js";

const dbPath = process.env.DB_PATH ?? "./anomalist.db";
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS canvas_state (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'moderator',
    sessionToken TEXT,
    sessionExpiresAt TEXT,
    createdAt TEXT NOT NULL
  );
`);

const userTableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (userTableInfo.length > 0) {
  const existingColumns = new Set(userTableInfo.map((column) => column.name));
  if (!existingColumns.has("passwordHash")) {
    db.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.has("sessionToken")) {
    db.exec("ALTER TABLE users ADD COLUMN sessionToken TEXT");
  }
  if (!existingColumns.has("sessionExpiresAt")) {
    db.exec("ALTER TABLE users ADD COLUMN sessionExpiresAt TEXT");
  }
  if (!existingColumns.has("createdAt")) {
    db.exec("ALTER TABLE users ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''");
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS user_permissions (
    userId TEXT NOT NULL,
    permission TEXT NOT NULL,
    granted INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (userId, permission),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const selectStateStmt = db.prepare("SELECT data FROM canvas_state WHERE id = ?");
const upsertStateStmt = db.prepare(`
  INSERT INTO canvas_state (id, data)
  VALUES (?, ?)
  ON CONFLICT(id) DO UPDATE SET data = excluded.data
`);

export interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  sessionToken: string | null;
  sessionExpiresAt: string | null;
  createdAt: string;
}

export interface UserPermissionOverrideRow {
  userId: string;
  permission: Permission;
  granted: boolean;
}

const createUserStmt = db.prepare(`
  INSERT INTO users (id, username, passwordHash, role, sessionToken, sessionExpiresAt, createdAt)
  VALUES (?, ?, ?, ?, NULL, NULL, ?)
`);
const selectUserByUsernameStmt = db.prepare(`
  SELECT id, username, passwordHash, role, sessionToken, sessionExpiresAt, createdAt
  FROM users
  WHERE username = ?
`);
const selectUserBySessionTokenStmt = db.prepare(`
  SELECT id, username, passwordHash, role, sessionToken, sessionExpiresAt, createdAt
  FROM users
  WHERE sessionToken = ?
`);
const selectUserByIdStmt = db.prepare(`
  SELECT id, username, passwordHash, role, sessionToken, sessionExpiresAt, createdAt
  FROM users
  WHERE id = ?
`);
const setSessionTokenStmt = db.prepare(`
  UPDATE users
  SET sessionToken = ?, sessionExpiresAt = ?
  WHERE id = ?
`);
const clearSessionTokenStmt = db.prepare(`
  UPDATE users
  SET sessionToken = NULL, sessionExpiresAt = NULL
  WHERE id = ?
`);
const listUsersStmt = db.prepare(`
  SELECT id, username, passwordHash, role, sessionToken, sessionExpiresAt, createdAt
  FROM users
  ORDER BY createdAt ASC
`);
const countUsersStmt = db.prepare("SELECT COUNT(*) as total FROM users");
const countOwnersStmt = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'owner'");
const updateUserRoleStmt = db.prepare("UPDATE users SET role = ? WHERE id = ?");
const updateUserPasswordStmt = db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?");
const deleteUserStmt = db.prepare("DELETE FROM users WHERE id = ?");

const listUserPermissionOverridesStmt = db.prepare(`
  SELECT userId, permission, granted
  FROM user_permissions
  WHERE userId = ?
  ORDER BY permission ASC
`);
const upsertUserPermissionOverrideStmt = db.prepare(`
  INSERT INTO user_permissions (userId, permission, granted)
  VALUES (?, ?, ?)
  ON CONFLICT(userId, permission) DO UPDATE SET granted = excluded.granted
`);
const deleteUserPermissionOverrideStmt = db.prepare(`
  DELETE FROM user_permissions
  WHERE userId = ? AND permission = ?
`);
const clearUserPermissionOverridesStmt = db.prepare(`
  DELETE FROM user_permissions
  WHERE userId = ?
`);

export function loadState(id: string): CanvasState | null {
  const row = selectStateStmt.get(id) as { data: string } | undefined;
  if (!row) {
    return null;
  }

  return JSON.parse(row.data) as CanvasState;
}

export function saveState(id: string, state: CanvasState): void {
  upsertStateStmt.run(id, JSON.stringify(state));
}

export function createUser(
  id: string,
  username: string,
  passwordHash: string,
  role: string
): void {
  createUserStmt.run(id, username, passwordHash, role, new Date().toISOString());
}

export function getUserByUsername(username: string): UserRow | null {
  const row = selectUserByUsernameStmt.get(username) as UserRow | undefined;
  return row ?? null;
}

export function getUserBySessionToken(token: string): UserRow | null {
  const row = selectUserBySessionTokenStmt.get(token) as UserRow | undefined;
  return row ?? null;
}

export function getUserById(id: string): UserRow | null {
  const row = selectUserByIdStmt.get(id) as UserRow | undefined;
  return row ?? null;
}

export function setSessionToken(userId: string, token: string, expiresAt: string): void {
  setSessionTokenStmt.run(token, expiresAt, userId);
}

export function clearSessionToken(userId: string): void {
  clearSessionTokenStmt.run(userId);
}

export function listUsers(): UserRow[] {
  return listUsersStmt.all() as UserRow[];
}

export function countUsers(): number {
  const row = countUsersStmt.get() as { total: number };
  return row.total;
}

export function countOwners(): number {
  const row = countOwnersStmt.get() as { total: number };
  return row.total;
}

export function updateUserRole(userId: string, role: string): void {
  updateUserRoleStmt.run(role, userId);
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  updateUserPasswordStmt.run(passwordHash, userId);
}

export function deleteUser(userId: string): void {
  deleteUserStmt.run(userId);
}

export function getUserPermissionOverrides(userId: string): UserPermissionOverrideRow[] {
  const rows = listUserPermissionOverridesStmt.all(userId) as Array<{
    userId: string;
    permission: Permission;
    granted: number;
  }>;
  return rows.map((row) => ({
    userId: row.userId,
    permission: row.permission,
    granted: row.granted === 1
  }));
}

export function setUserPermissionOverride(
  userId: string,
  permission: Permission,
  granted: boolean
): void {
  upsertUserPermissionOverrideStmt.run(userId, permission, granted ? 1 : 0);
}

export function removeUserPermissionOverride(userId: string, permission: Permission): void {
  deleteUserPermissionOverrideStmt.run(userId, permission);
}

export function clearUserPermissionOverrides(userId: string): void {
  clearUserPermissionOverridesStmt.run(userId);
}
