import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb, closeDb } from '../../db/index.js';
import { NotifyService } from '../../services/notify.js';
import { TaskService } from '../../services/task.js';
import { RunService } from '../../services/run.js';

// Mock feishu API calls
vi.mock('../../utils/feishu.js', () => ({
  getAppToken: vi.fn().mockResolvedValue('mock-token'),
  sendMessage: vi.fn().mockResolvedValue({ code: 0 }),
  sendRichTextMessage: vi.fn().mockResolvedValue({ code: 0 }),
  sendFileMessage: vi.fn().mockResolvedValue({ code: 0 }),
  uploadFile: vi.fn().mockResolvedValue('mock-file-key'),
}));

describe('NotifyService', () => {
  let db, notifySvc, taskSvc, runSvc;

  const flattenPostText = (post) => post.content
    .flat()
    .map((item) => item.text || '')
    .join('');

  beforeEach(() => {
    db = getDb();
    db.prepare('DELETE FROM runs').run();
    db.prepare('DELETE FROM tasks').run();
    notifySvc = new NotifyService(db);
    taskSvc = new TaskService(db);
    runSvc = new RunService(db);
  });

  afterEach(() => {
    vi.clearAllMocks();
    closeDb();
  });

  it('should skip when no chat IDs configured', async () => {
    const task = {
      id: 't1',
      name: 'test',
      feishu_chat_ids: '[]',
      feishu_mode: 'full',
      notify_on_change: 0,
    };
    const run = { id: 'r1', task_id: 't1', stdout: 'hello', result_hash: 'abc' };
    const result = await notifySvc.notify(task, run, {});
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('无通知目标');
  });

  it('should use default chat ID when task has no chat IDs', async () => {
    const { sendRichTextMessage } = await import('../../utils/feishu.js');
    const task = {
      id: 't1',
      name: 'test',
      feishu_chat_ids: '[]',
      feishu_mode: 'full',
      notify_on_change: 0,
    };
    const run = { id: 'r1', task_id: 't1', stdout: 'hello', result_hash: 'abc' };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
      defaultChatId: 'oc_default',
    });

    expect(result.skipped).toBe(false);
    expect(sendRichTextMessage).toHaveBeenCalledWith(
      'mock-token',
      'oc_default',
      expect.objectContaining({ content: expect.any(Array) }),
    );
    expect(flattenPostText(sendRichTextMessage.mock.calls[0][2])).toContain('hello');
  });

  it('should detect no change when hashes match', async () => {
    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_test"]',
      notify_on_change: 1,
    });

    // Create two runs with same hash
    runSvc.create({
      id: 'r1',
      task_id: task.id,
      status: 'succeeded',
      engine: 'claude',
      trigger_type: 'manual',
    });
    runSvc.update('r1', {
      result_hash: 'abc123',
      finished_at: new Date().toISOString(),
    });

    const currentRun = {
      id: 'r2',
      task_id: task.id,
      result_hash: 'abc123',
      stdout: 'same',
    };

    const result = await notifySvc.notify(task, currentRun, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('结果未变更');
  });

  it('should send notification when hashes differ', async () => {
    const { sendRichTextMessage } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_test"]',
      feishu_mode: 'full',
      notify_on_change: 1,
    });

    runSvc.create({
      id: 'r1',
      task_id: task.id,
      status: 'succeeded',
      engine: 'claude',
      trigger_type: 'manual',
    });
    runSvc.update('r1', {
      result_hash: 'old_hash',
      finished_at: new Date().toISOString(),
    });

    const currentRun = {
      id: 'r2',
      task_id: task.id,
      result_hash: 'new_hash',
      stdout: 'new content',
    };

    const result = await notifySvc.notify(task, currentRun, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });
    expect(result.skipped).toBe(false);
    expect(sendRichTextMessage).toHaveBeenCalledTimes(1);
  });

  it('should send full content in full mode', async () => {
    const { sendRichTextMessage } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_chat1"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });

    const run = {
      id: 'r1',
      task_id: task.id,
      result_hash: 'abc',
      stdout: 'Hello world output',
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });
    expect(result.skipped).toBe(false);
    expect(sendRichTextMessage).toHaveBeenCalledWith(
      'mock-token',
      'oc_chat1',
      expect.objectContaining({ content: expect.any(Array) }),
    );
    expect(flattenPostText(sendRichTextMessage.mock.calls[0][2])).toContain('Hello world output');
  });

  it('should send summary in summary mode', async () => {
    const { sendFileMessage, sendRichTextMessage, uploadFile } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_chat2"]',
      feishu_mode: 'summary',
      notify_on_change: 0,
    });

    const run = {
      id: 'r1',
      task_id: task.id,
      result_hash: 'abc',
      stdout: 'Short output',
      summary: 'Custom summary text',
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });
    expect(result.skipped).toBe(false);
    expect(sendRichTextMessage).toHaveBeenCalledWith(
      'mock-token',
      'oc_chat2',
      expect.objectContaining({ content: expect.any(Array) }),
    );
    expect(flattenPostText(sendRichTextMessage.mock.calls[0][2])).toContain('Custom summary text');
    expect(uploadFile).toHaveBeenCalledWith(
      'mock-token',
      `${task.name}-${run.id}.md`,
      'Short output',
    );
    expect(sendFileMessage).toHaveBeenCalledWith('mock-token', 'oc_chat2', 'mock-file-key');
  });

  it('should send long full content as preview plus file attachment', async () => {
    const { sendFileMessage, sendRichTextMessage, uploadFile } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_chat3"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });

    const longContent = 'x'.repeat(5000);
    const run = {
      id: 'r1',
      task_id: task.id,
      result_hash: 'abc',
      stdout: longContent,
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });
    expect(result.skipped).toBe(false);
    const sentText = flattenPostText(sendRichTextMessage.mock.calls[0][2]);
    expect(sentText).toContain('...(预览已截断)');
    expect(sentText).toContain('完整结果已作为 Markdown 附件发送');
    expect(uploadFile).toHaveBeenCalledWith(
      'mock-token',
      `${task.name}-${run.id}.md`,
      longContent,
    );
    expect(sendFileMessage).toHaveBeenCalledWith('mock-token', 'oc_chat3', 'mock-file-key');
  });

  it('should send failure explanation for failed runs', async () => {
    const { sendRichTextMessage, uploadFile } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'failing task',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_fail"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });
    const run = {
      id: 'r-fail',
      task_id: task.id,
      status: 'failed',
      result_hash: 'abc',
      stdout: '',
      stderr: 'command not found',
      failure_reason: '执行引擎或任务依赖的命令不存在',
      failure_hint: '检查设置页里的 Claude/Codex 路径。',
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });

    expect(result.level).toBe('failure');
    expect(sendRichTextMessage).toHaveBeenCalledWith(
      'mock-token',
      'oc_fail',
      expect.objectContaining({ title: expect.stringContaining('执行失败') }),
    );
    expect(flattenPostText(sendRichTextMessage.mock.calls[0][2])).toContain('执行引擎或任务依赖的命令不存在');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('should prefer conclusion section for long report preview', async () => {
    const { sendRichTextMessage } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'weekly report',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_report"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });
    const run = {
      id: 'r1',
      task_id: task.id,
      result_hash: 'abc',
      stdout: `# 周报\n\n## 一句话结论\n\n**这是最重要的判断。**\n\n## 数据表\n\n${'x'.repeat(5000)}`,
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });

    expect(result.skipped).toBe(false);
    const sentText = flattenPostText(sendRichTextMessage.mock.calls[0][2]);
    expect(sentText).toContain('这是最重要的判断。');
    expect(sentText).not.toContain('数据表');
  });

  it('should fallback to plain text without markdown markers when rich text fails', async () => {
    const { sendMessage, sendRichTextMessage } = await import('../../utils/feishu.js');
    sendRichTextMessage.mockRejectedValueOnce(new Error('post failed'));

    const task = taskSvc.create({
      name: 'markdown report',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_markdown"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });
    const run = {
      id: 'r-md',
      task_id: task.id,
      result_hash: 'abc',
      stdout: '这里有 **重点判断** 和 `代码`',
    };

    const result = await notifySvc.notify(task, run, {
      feishuAppId: 'id',
      feishuAppSecret: 'secret',
    });

    expect(result.skipped).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(
      'mock-token',
      'oc_markdown',
      expect.stringContaining('重点判断'),
    );
    expect(sendMessage.mock.calls[0][2]).not.toContain('**');
    expect(sendMessage.mock.calls[0][2]).not.toContain('`');
  });

  it('should cache token and reuse it', async () => {
    const { getAppToken } = await import('../../utils/feishu.js');

    const task = taskSvc.create({
      name: 'test',
      prompt_template: 'p',
      engine: 'claude',
      feishu_chat_ids: '["oc_chat"]',
      feishu_mode: 'full',
      notify_on_change: 0,
    });

    const run1 = { id: 'r1', task_id: task.id, result_hash: 'a', stdout: 'run1' };
    const run2 = { id: 'r2', task_id: task.id, result_hash: 'b', stdout: 'run2' };

    const settings = { feishuAppId: 'id', feishuAppSecret: 'secret' };
    await notifySvc.notify(task, run1, settings);
    await notifySvc.notify(task, run2, settings);

    // Token should be cached after first call
    expect(getAppToken).toHaveBeenCalledTimes(1);
  });
});
