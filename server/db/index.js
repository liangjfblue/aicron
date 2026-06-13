import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { config } from '../config.js';

let db = null;

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function runMigrations(database) {
  ensureColumn(database, 'tasks', 'active_start_at', 'TEXT DEFAULT NULL');
  ensureColumn(database, 'tasks', 'active_end_at', 'TEXT DEFAULT NULL');
  ensureColumn(database, 'tasks', 'schedule_segments', "TEXT DEFAULT '[]'");
  ensureColumn(database, 'tasks', 'chain_trigger_mode', "TEXT NOT NULL DEFAULT 'both'");
  ensureColumn(database, 'tasks', 'auto_include_last_result', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'runs', 'failure_reason', 'TEXT DEFAULT NULL');
  ensureColumn(database, 'runs', 'failure_hint', 'TEXT DEFAULT NULL');
}

export function getDb() {
  if (db) return db;
  mkdirSync(config.DATA_DIR, { recursive: true });
  db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8');
  db.exec(schema);
  runMigrations(db);
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}
