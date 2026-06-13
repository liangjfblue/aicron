CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  prompt_template TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('claude', 'codex')),
  cron_expression TEXT DEFAULT NULL,
  active_start_at TEXT DEFAULT NULL,
  active_end_at TEXT DEFAULT NULL,
  schedule_segments TEXT DEFAULT '[]',
  timeout_seconds INTEGER DEFAULT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  chain_parent_id TEXT DEFAULT NULL,
  chain_trigger_mode TEXT NOT NULL DEFAULT 'cron_only' CHECK (chain_trigger_mode IN ('cron_only','chain_only','both')),
  auto_include_last_result INTEGER NOT NULL DEFAULT 0,
  feishu_mode TEXT NOT NULL DEFAULT 'full' CHECK (feishu_mode IN ('full', 'summary')),
  feishu_chat_ids TEXT DEFAULT '[]',
  notify_on_change INTEGER NOT NULL DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chain_parent_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','timeout','canceled')),
  engine TEXT NOT NULL,
  resolved_prompt TEXT DEFAULT '',
  result_path TEXT DEFAULT NULL,
  result_hash TEXT DEFAULT NULL,
  summary TEXT DEFAULT NULL,
  failure_reason TEXT DEFAULT NULL,
  failure_hint TEXT DEFAULT NULL,
  stdout TEXT DEFAULT '',
  stderr TEXT DEFAULT '',
  exit_code INTEGER DEFAULT NULL,
  started_at TEXT DEFAULT NULL,
  finished_at TEXT DEFAULT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('cron','manual','chain','test')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_created
  ON run_events(run_id, created_at, id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
