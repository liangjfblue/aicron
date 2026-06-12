import { v4 as uuid } from 'uuid';
import { RunService } from './run.js';

export class TaskService {
  constructor(db) {
    this.db = db;
  }

  _parseJsonFields(row) {
    if (!row) return null;
    return {
      ...row,
      auto_include_last_result: row.auto_include_last_result === 1,
      feishu_chat_ids: JSON.parse(row.feishu_chat_ids || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      schedule_segments: JSON.parse(row.schedule_segments || '[]'),
    };
  }

  create(data) {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tasks (id, name, description, prompt_template, engine, cron_expression,
        active_start_at, active_end_at, schedule_segments,
        timeout_seconds, chain_parent_id, auto_include_last_result, feishu_mode, feishu_chat_ids,
        notify_on_change, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name || '',
      data.description || '',
      data.prompt_template,
      data.engine,
      data.cron_expression || null,
      data.active_start_at || null,
      data.active_end_at || null,
      data.schedule_segments || '[]',
      data.timeout_seconds ?? null,
      data.chain_parent_id || null,
      data.auto_include_last_result ? 1 : 0,
      data.feishu_mode || 'full',
      data.feishu_chat_ids || '[]',
      data.notify_on_change ? 1 : 0,
      data.tags || '[]',
      now,
      now,
    );
    return this.getById(id);
  }

  list(filters = {}) {
    const clauses = [];
    const params = [];

    if (filters.enabled !== undefined) {
      clauses.push('enabled = ?');
      params.push(filters.enabled ? 1 : 0);
    }

    if (filters.tag) {
      clauses.push("tags LIKE ?");
      params.push(`%"${filters.tag}"%`);
    }

    if (filters.engine) {
      clauses.push('engine = ?');
      params.push(filters.engine);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC`).all(...params);
    const runSvc = new RunService(this.db);
    return rows.map((row) => {
      const task = this._parseJsonFields(row);
      return { ...task, lastRun: runSvc.getLatestByTask(task.id) };
    });
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return this._parseJsonFields(row);
  }

  update(id, data) {
    const allowed = [
      'name', 'description', 'prompt_template', 'engine', 'cron_expression',
      'active_start_at', 'active_end_at', 'schedule_segments',
      'timeout_seconds', 'chain_parent_id', 'auto_include_last_result', 'feishu_mode', 'feishu_chat_ids',
      'notify_on_change', 'tags',
    ];

    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        sets.push(`${key} = ?`);
        if (key === 'notify_on_change' || key === 'auto_include_last_result') {
          params.push(data[key] ? 1 : 0);
        } else {
          params.push(data[key]);
        }
      }
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.getById(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  toggle(id, enabled) {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE tasks SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, now, id);
    return this.getById(id);
  }
}
