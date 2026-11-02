import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import path from 'node:path';
const p = process.env.DB_PATH || './data/rifted.db';
fs.mkdirSync(path.dirname(p), { recursive: true });
export const db = new DatabaseSync(p);
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_seen TEXT);
CREATE TABLE IF NOT EXISTS lfd_posts(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT, rank TEXT, text TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, from_id INTEGER NOT NULL REFERENCES users(id), to_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reps(
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (1, -1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_id, to_id)
);
`);
try { db.exec('ALTER TABLE lfd_posts ADD COLUMN extra TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT'); } catch {}
