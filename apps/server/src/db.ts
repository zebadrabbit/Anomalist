import Database from "better-sqlite3";
import type { CanvasState } from "@anomalist/types";

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
    token TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'moderator'
  );
`);

const selectStateStmt = db.prepare("SELECT data FROM canvas_state WHERE id = ?");
const upsertStateStmt = db.prepare(`
  INSERT INTO canvas_state (id, data)
  VALUES (?, ?)
  ON CONFLICT(id) DO UPDATE SET data = excluded.data
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
