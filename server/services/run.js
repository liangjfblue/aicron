export class RunService {
  constructor(db) { this.db = db; }

  _withTiming(row) {
    if (!row) return null;
    const started = row.started_at ? Date.parse(row.started_at) : null;
    const finished = row.finished_at ? Date.parse(row.finished_at) : null;
    const now = Date.now();
    const duration = started && finished ? Math.max(0, finished - started) : null;
    const elapsed = started && !finished ? Math.max(0, now - started) : duration;
    return {
      ...row,
      duration_ms: duration,
      elapsed_ms: elapsed,
      latest_event: row.id ? this.getLatestEvent(row.id) : null,
    };
  }

  _parseEvent(row) {
    if (!row) return null;
    let metadata = {};
    try {
      metadata = JSON.parse(row.metadata || '{}');
    } catch {
      metadata = {};
    }
    return { ...row, metadata };
  }

  create(data) {
    this.db.prepare(`
      INSERT INTO runs (id, task_id, status, engine, resolved_prompt, trigger_type, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.task_id,
      data.status,
      data.engine,
      data.resolved_prompt || '',
      data.trigger_type,
      data.started_at || null,
    );
    return this.getById(data.id);
  }

  update(id, data) {
    const fields = [];
    const params = [];
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
    params.push(id);
    this.db.prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getById(id);
  }

  addEvent(runId, type, title, message = '', metadata = {}) {
    this.db.prepare(`
      INSERT INTO run_events (run_id, type, title, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      type,
      title,
      message || '',
      JSON.stringify(metadata || {}),
      new Date().toISOString(),
    );
    return this.getLatestEvent(runId);
  }

  listEvents(runId) {
    return this.db
      .prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at ASC, id ASC')
      .all(runId)
      .map((row) => this._parseEvent(row));
  }

  getLatestEvent(runId) {
    return this._parseEvent(
      this.db
        .prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
        .get(runId),
    );
  }

  getById(id) {
    const run = this._withTiming(this.db.prepare(`
      SELECT runs.*, tasks.name AS task_name
      FROM runs
      LEFT JOIN tasks ON tasks.id = runs.task_id
      WHERE runs.id = ?
    `).get(id));
    return run ? { ...run, events: this.listEvents(id) } : null;
  }

  delete(id) {
    const run = this.getById(id);
    if (!run) return null;
    const remove = this.db.transaction((runId) => {
      this.db.prepare('DELETE FROM run_events WHERE run_id = ?').run(runId);
      this.db.prepare('DELETE FROM runs WHERE id = ?').run(runId);
    });
    remove(id);
    return run;
  }

  listByTask(taskId, limit = 50) {
    return this.db
      .prepare(`
        SELECT runs.*, tasks.name AS task_name
        FROM runs
        LEFT JOIN tasks ON tasks.id = runs.task_id
        WHERE runs.task_id = ?
        ORDER BY COALESCE(runs.started_at, runs.finished_at) DESC
        LIMIT ?
      `)
      .all(taskId, limit)
      .map((row) => this._withTiming(row));
  }

  listAll(limit = 100) {
    return this.db.prepare(`
      SELECT runs.*, tasks.name AS task_name
      FROM runs
      LEFT JOIN tasks ON tasks.id = runs.task_id
      ORDER BY COALESCE(runs.started_at, runs.finished_at) DESC
      LIMIT ?
    `).all(limit).map((row) => this._withTiming(row));
  }

  getLatestSuccess(taskId) {
    return this._withTiming(
      this.db.prepare("SELECT * FROM runs WHERE task_id = ? AND status = 'succeeded' ORDER BY COALESCE(started_at, finished_at) DESC LIMIT 1").get(taskId),
    );
  }

  getLatestByTask(taskId) {
    return this._withTiming(
      this.db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY COALESCE(started_at, finished_at) DESC LIMIT 1').get(taskId),
    );
  }
}
