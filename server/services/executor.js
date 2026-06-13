import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { v4 as uuid } from 'uuid';
import { RunService } from './run.js';
import { resolveVariables } from './variable.js';
import { writeResult } from '../utils/result-store.js';
import { sha256 } from '../utils/hash.js';
import { config } from '../config.js';
import { buildCliSpawnEnv, resolveCommandPath } from '../utils/cli-path.js';

const LAST_RESULT_LIMIT = 5000;

export class Executor {
  constructor(db) {
    this.db = db;
    this.runSvc = new RunService(db);
    this.activeProcesses = new Map();
    this.onRunComplete = null;
  }

  async execute(task, options = {}) {
    const { run, promise } = this.executeAsync(task, options);
    return promise;
  }

  executeAsync(task, options = {}) {
    const runId = uuid();
    const engineCli = options.engineCli || this._getCliPath(task.engine);
    const timeoutSeconds = options.timeoutSeconds ?? task.timeout_seconds;
    const triggerType = options.triggerType || 'manual';
    const startedAt = new Date().toISOString();
    const chainDepth = options.chainDepth || 0;

    // Resolve variables
    const lastRun = this.runSvc.getLatestSuccess(task.id);
    const parentRun = options.parentRun || null;
    const template = task.prompt_template || task.prompt || '';
    const lastResult = lastRun ? this._readResultFile(lastRun.result_path) : '';
    const lastSummary = lastRun?.summary || '';
    const parentResult = parentRun ? this._readResultFile(parentRun.result_path) : '';
    const parentSummary = parentRun?.summary || '';
    const resolvedPrompt = resolveVariables(template, task, {
      now: new Date(),
      runId,
      lastResult,
      lastSummary,
      parentResult,
      parentSummary,
      prevOutput: parentResult,
    });
    const finalPrompt = this._withLastRunContext(resolvedPrompt, task, lastRun, lastResult, lastSummary);

    // Create run record
    this.runSvc.create({
      id: runId, task_id: task.id, status: 'running',
      engine: task.engine, resolved_prompt: finalPrompt,
      trigger_type: triggerType, started_at: startedAt,
    });
    this.runSvc.addEvent(runId, 'preparing', '已准备执行', '变量替换完成，正在启动执行引擎', {
      stage: 'prepare',
      progress: 10,
      severity: 'info',
      trigger_type: triggerType,
      engine: task.engine,
      auto_include_last_result: this._shouldIncludeLastResult(task),
      has_last_result: Boolean(lastResult),
      parent_run_id: parentRun?.id || null,
      has_parent_result: Boolean(parentResult),
    });

    const promise = new Promise((resolve) => {
      const args = options.engineArgs || this._getCliArgs(task.engine, finalPrompt);
      this.runSvc.addEvent(runId, 'started', '已启动执行引擎', `${task.engine} 进程已启动`, {
        stage: 'launch',
        progress: 25,
        severity: 'info',
        command: engineCli,
      });
      const cliEnv = buildCliSpawnEnv();
      const child = spawn(resolveCommandPath(engineCli, cliEnv.PATH), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cliEnv,
      });
      this.activeProcesses.set(runId, { process: child });

      let stdout = '';
      let stderr = '';
      let receivedStdout = false;
      let receivedStderr = false;
      child.stdout.on('data', (d) => {
        stdout += d.toString();
        if (!receivedStdout) {
          receivedStdout = true;
          this.runSvc.addEvent(runId, 'streaming', '开始收到输出', '执行引擎正在生成结果', {
            stage: 'generate',
            progress: 55,
            severity: 'info',
          });
        }
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
        if (!receivedStderr) {
          receivedStderr = true;
          this.runSvc.addEvent(runId, 'stderr', '收到运行日志', '执行引擎输出了运行日志', {
            stage: 'generate',
            progress: 60,
            severity: 'debug',
          });
        }
      });

      let finished = false;
      let timedOut = false;
      const finish = (status, exitCode) => {
        if (finished) return;
        finished = true;
        this.activeProcesses.delete(runId);
        const content = stdout || stderr || '';
        const resultPath = content ? writeResult(task.id, runId, content) : null;
        const resultHash = content ? sha256(content) : null;
        const failure = this._explainFailure(status, exitCode, stderr, stdout, timeoutSeconds);
        this.runSvc.update(runId, {
          status, exit_code: exitCode,
          summary: content ? this._buildSummary(content) : null,
          stdout: stdout.slice(0, 50000), stderr: stderr.slice(0, 10000),
          result_path: resultPath, result_hash: resultHash,
          failure_reason: failure.reason,
          failure_hint: failure.hint,
          finished_at: new Date().toISOString(),
        });
        this.runSvc.addEvent(runId, status, this._getStatusEventTitle(status), this._getStatusEventMessage(status, exitCode), {
          stage: status === 'succeeded' ? 'finish' : 'failure',
          progress: 100,
          severity: status === 'succeeded' ? 'success' : 'error',
          exit_code: exitCode,
          has_result: Boolean(resultPath),
          failure_reason: failure.reason,
          failure_hint: failure.hint,
          chain_depth: chainDepth,
        });
        const finalRun = this.runSvc.getById(runId);
        finalRun.chain_depth = chainDepth;
        finalRun.parent_run_id = parentRun?.id || null;
        resolve(finalRun);

        // Fire-and-forget notification
        if (this.onRunComplete) {
          const completedRun = finalRun;
          const completedTask = task;
          setImmediate(() => {
            this.onRunComplete(completedTask, completedRun).catch(() => {});
          });
        }
      };

      let timer = null;
      if (timeoutSeconds) {
        timer = setTimeout(() => {
          timedOut = true;
          this.runSvc.addEvent(runId, 'timeout_pending', '执行超时', `超过 ${timeoutSeconds}s，正在终止进程`, {
            stage: 'failure',
            progress: 95,
            severity: 'error',
          });
          child.kill('SIGTERM');
          setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 5000);
          finish('timeout', null);
        }, timeoutSeconds * 1000);
      }

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (timedOut) return;
        const entry = this.activeProcesses.get(runId);
        if (entry?.canceled) {
          finish('canceled', code);
          return;
        }
        finish(code === 0 ? 'succeeded' : 'failed', code);
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        stderr += err.message;
        this.runSvc.addEvent(runId, 'error', '执行引擎启动失败', err.message, {
          stage: 'failure',
          progress: 100,
          severity: 'error',
        });
        finish('failed', 1);
      });
    });

    return { run: this.runSvc.getById(runId), promise };
  }

  cancel(runId) {
    const entry = this.activeProcesses.get(runId);
    if (!entry) throw new Error('Run not active');
    entry.canceled = true;
    this.runSvc.addEvent(runId, 'canceling', '正在取消执行', '已发送终止信号，等待进程退出', {
      stage: 'failure',
      progress: 90,
      severity: 'warn',
    });
    entry.process.kill('SIGTERM');
  }

  _getCliPath(engine) {
    const envPath = engine === 'codex' ? process.env.CODEX_CLI_PATH : process.env.CLAUDE_CLI_PATH;
    if (envPath) return envPath;

    const settingsKey = engine === 'codex' ? 'codexPath' : 'claudePath';
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(settingsKey);
    const settingsPath = row?.value?.trim();
    if (settingsPath) return settingsPath;

    return engine === 'codex' ? config.DEFAULT_CODEX_CLI : config.DEFAULT_CLAUDE_CLI;
  }

  _resolveCommandPath(command, pathEnv) {
    return resolveCommandPath(command, pathEnv);
  }

  _getCliArgs(engine, prompt) {
    return engine === 'codex'
      ? ['exec', '--skip-git-repo-check', prompt]
      : ['--permission-mode', 'bypassPermissions', '-p', prompt];
  }

  _getStatusEventTitle(status) {
    const titles = {
      succeeded: '执行完成',
      failed: '执行失败',
      timeout: '执行超时',
      canceled: '执行已取消',
    };
    return titles[status] || '执行结束';
  }

  _getStatusEventMessage(status, exitCode) {
    if (status === 'succeeded') return '结果已生成，准备进入后续通知流程';
    if (status === 'timeout') return '任务超过超时时间，进程已被终止';
    if (status === 'canceled') return '任务已取消';
    if (status === 'failed') return `进程退出异常${exitCode !== null && exitCode !== undefined ? `，退出码 ${exitCode}` : ''}`;
    return '任务已结束';
  }

  _shouldIncludeLastResult(task) {
    return task.auto_include_last_result !== false && task.auto_include_last_result !== 0;
  }

  _withLastRunContext(prompt, task, lastRun, lastResult, lastSummary) {
    if (!this._shouldIncludeLastResult(task) || !lastRun || (!lastResult && !lastSummary)) return prompt;
    if (/\{\{last_result\}\}|\{\{last_summary\}\}/.test(task.prompt_template || task.prompt || '')) return prompt;
    const parts = [
      prompt,
      '',
      '【AICron 自动注入：上次成功执行摘要】',
      `上次执行时间：${lastRun.started_at || lastRun.finished_at || '未知'}`,
    ];
    if (lastSummary) parts.push(`上次摘要：${lastSummary}`);
    if (lastResult) {
      const trimmed = lastResult.length > LAST_RESULT_LIMIT
        ? `${lastResult.slice(0, LAST_RESULT_LIMIT).trimEnd()}\n...(上次结果过长，已截断)`
        : lastResult;
      parts.push('上次结果：', trimmed);
    }
    return parts.join('\n');
  }

  _explainFailure(status, exitCode, stderr = '', stdout = '', timeoutSeconds = null) {
    if (status === 'succeeded') return { reason: null, hint: null };
    if (status === 'timeout') {
      return {
        reason: `执行超过${timeoutSeconds ? ` ${timeoutSeconds} 秒` : '超时时间'}后被终止`,
        hint: '可以调大任务超时、缩短任务范围，或把任务拆成更小的步骤。',
      };
    }
    if (status === 'canceled') {
      return { reason: '用户或系统取消了本次执行', hint: '需要结果时可以重新执行。' };
    }
    const text = `${stderr}\n${stdout}`.toLowerCase();
    if (/enoent|not found|command not found|no such file/.test(text)) {
      return {
        reason: '执行引擎或任务依赖的命令不存在',
        hint: '检查设置页里的 Claude/Codex 路径，或确认任务要求的项目脚本已安装。',
      };
    }
    if (/permission|eacces|denied|unauthorized/.test(text)) {
      return {
        reason: '执行过程中遇到权限或授权问题',
        hint: '检查 CLI 权限、目标目录权限、登录状态，或为任务配置可访问的工作目录。',
      };
    }
    if (/rate limit|quota|too many requests/.test(text)) {
      return {
        reason: '执行引擎可能触发了限流或额度限制',
        hint: '稍后重试，或检查模型/API 额度。',
      };
    }
    return {
      reason: `执行进程异常退出${exitCode !== null && exitCode !== undefined ? `，退出码 ${exitCode}` : ''}`,
      hint: '打开执行详情查看运行日志；如果是任务内容问题，调整 Agent 任务模板后重试。',
    };
  }

  _buildSummary(content, limit = 420) {
    const text = String(content || '').trim();
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const conclusionIndex = lines.findIndex((line) => /一句话结论|结论|总结/.test(line));
    if (conclusionIndex >= 0) {
      const picked = [];
      for (const line of lines.slice(conclusionIndex + 1)) {
        const trimmed = line.trim();
        if (!trimmed || /^[-_*#]+$/.test(trimmed)) continue;
        if (/^#{1,6}\s+/.test(trimmed) && picked.length > 0) break;
        picked.push(trimmed.replace(/^\*\*(.*)\*\*$/, '$1'));
        if (picked.join('\n').length >= limit) break;
      }
      const conclusion = picked.join('\n').trim();
      if (conclusion) return conclusion.slice(0, limit).trimEnd();
    }
    return text.replace(/\s+/g, ' ').slice(0, limit).trimEnd();
  }

  _readResultFile(path) {
    if (!path) return '';
    try { return readFileSync(path, 'utf-8'); }
    catch { return ''; }
  }
}
