import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dbPath, ensureWritable } from "./db.js";

const db = new Database(dbPath);

export const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(process.cwd(), "media");

fs.mkdirSync(MEDIA_DIR, { recursive: true });
// Same upgrade trap as the database directory: a root-owned media volume would
// otherwise let the server start and fail only when someone uploads.
ensureWritable(MEDIA_DIR);

db.exec(`
  CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    mediaType TEXT NOT NULL DEFAULT 'image',
    size INTEGER NOT NULL,
    uploadedAt TEXT NOT NULL,
    uploadedBy TEXT NOT NULL DEFAULT ''
  );
`);

const mediaColumns = db.prepare("PRAGMA table_info(media_items)").all() as Array<{ name: string }>;
if (!mediaColumns.some((column) => column.name === "mediaType")) {
  db.exec("ALTER TABLE media_items ADD COLUMN mediaType TEXT NOT NULL DEFAULT 'image';");
}
// Pre-existing rows have no known uploader, so they fall back to '' — which
// matches no user id and therefore requires media.delete.any to remove.
if (!mediaColumns.some((column) => column.name === "uploadedBy")) {
  db.exec("ALTER TABLE media_items ADD COLUMN uploadedBy TEXT NOT NULL DEFAULT '';");
}

export function getMediaType(mimetype: string): "image" | "video" | "audio" {
  if (mimetype.startsWith("video/")) {
    return "video";
  }

  if (mimetype.startsWith("audio/")) {
    return "audio";
  }

  return "image";
}

export interface MediaItem {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  mediaType: "image" | "video" | "audio";
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
}

const insertMediaItemStmt = db.prepare(`
  INSERT INTO media_items (id, filename, originalName, mimetype, mediaType, size, uploadedAt, uploadedBy)
  VALUES (@id, @filename, @originalName, @mimetype, @mediaType, @size, @uploadedAt, @uploadedBy)
`);

const listMediaItemsStmt = db.prepare(`
  SELECT id, filename, originalName, mimetype, mediaType, size, uploadedAt, uploadedBy
  FROM media_items
  ORDER BY uploadedAt DESC
`);

const selectMediaItemStmt = db.prepare(`
  SELECT id, filename, originalName, mimetype, mediaType, size, uploadedAt, uploadedBy
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

export function getMediaItem(id: string): MediaItem | null {
  const row = selectMediaItemStmt.get(id) as Omit<MediaItem, "url"> | undefined;
  return row ? withUrl(row) : null;
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
