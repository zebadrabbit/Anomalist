import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH ?? "./anomalist.db";
const db = new Database(dbPath);

export const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(process.cwd(), "media");

fs.mkdirSync(MEDIA_DIR, { recursive: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploadedAt TEXT NOT NULL
  );
`);

export interface MediaItem {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt: string;
  url: string;
}

const insertMediaItemStmt = db.prepare(`
  INSERT INTO media_items (id, filename, originalName, mimetype, size, uploadedAt)
  VALUES (@id, @filename, @originalName, @mimetype, @size, @uploadedAt)
`);

const listMediaItemsStmt = db.prepare(`
  SELECT id, filename, originalName, mimetype, size, uploadedAt
  FROM media_items
  ORDER BY uploadedAt DESC
`);

const selectMediaItemStmt = db.prepare(`
  SELECT id, filename, originalName, mimetype, size, uploadedAt
  FROM media_items
  WHERE id = ?
`);

const deleteMediaItemStmt = db.prepare("DELETE FROM media_items WHERE id = ?");

function withUrl(row: Omit<MediaItem, "url">): MediaItem {
  return {
    ...row,
    url: `/media/${row.filename}`
  };
}

export function saveMediaItem(item: Omit<MediaItem, "url">): void {
  insertMediaItemStmt.run(item);
}

export function listMediaItems(): MediaItem[] {
  const rows = listMediaItemsStmt.all() as Array<Omit<MediaItem, "url">>;
  return rows.map(withUrl);
}

export function deleteMediaItem(id: string): void {
  const row = selectMediaItemStmt.get(id) as Omit<MediaItem, "url"> | undefined;
  if (!row) {
    return;
  }

  deleteMediaItemStmt.run(id);

  const filePath = path.join(MEDIA_DIR, row.filename);
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}
