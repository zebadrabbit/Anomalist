import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * better-sqlite3 throws "Cannot open database because the directory does not
 * exist" instead of creating the parent, which killed the container on boot:
 * the compose file sets DB_PATH=/app/data/anomalist.db and nothing had created
 * /app/data. The other tests never caught it because support.ts mkdtemps its
 * directory before booting the server.
 *
 * This file gets its own process (node --test runs one per file), so setting
 * DB_PATH before the first import of db.ts is what makes the assertion honest.
 */
const root = path.join(os.tmpdir(), `anomalist-dbpath-${randomUUID()}`);
const target = path.join(root, "nested", "anomalist.db");

test("creates the DB_PATH parent directory instead of crashing", async () => {
  assert.equal(fs.existsSync(path.dirname(target)), false, "precondition: parent must be missing");
  process.env.DB_PATH = target;

  await import("../src/db.js");
  assert.ok(fs.existsSync(target), "database file should exist after import");
});

test("rejects a data directory it cannot write", { skip: process.getuid?.() === 0 && "root ignores mode bits" }, async () => {
  const { ensureWritable } = await import("../src/db.js");
  const readOnly = path.join(root, "read-only");
  fs.mkdirSync(readOnly, { recursive: true });
  fs.chmodSync(readOnly, 0o500);

  // The failure this guards against is a root-owned Docker volume: SQLite opens
  // fine and only throws once something writes, so the container looks healthy.
  assert.throws(() => { ensureWritable(readOnly); }, /not writable by uid/);
  assert.doesNotThrow(() => { ensureWritable(path.dirname(target)); });

  fs.chmodSync(readOnly, 0o700);
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
