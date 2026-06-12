import { getAppToken, sendFileMessage, sendMessage, sendRichTextMessage, uploadFile } from '../utils/feishu.js';
import { readFileSync } from 'node:fs';
import { RunService } from './run.js';

const INLINE_LIMIT = 2000;
const PREVIEW_LIMIT = 900;

export class NotifyService {
  constructor(db) {
    this.db = db;
    this.runSvc = new RunService(db);
    this.tokenCache = { token: null, expires: 0 };
  }

  async notify(task, run, settings) {
    const raw = task.feishu_chat_ids;
    const taskChatIds = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    const chatIds = taskChatIds.length > 0
      ? taskChatIds
      : (settings.defaultChatId ? [settings.defaultChatId] : []);
    if (chatIds.length === 0) {
      return { skipped: true, reason: '无通知目标' };
    }

    // Change detection
    if (task.notify_on_change) {
      const runs = this.runSvc.listByTask(task.id, 2);
      const prevRun = runs.find((r) => r.id !== run.id && r.status === 'succeeded');
      if (prevRun && prevRun.result_hash === run.result_hash) {
        return { skipped: true, reason: '结果未变更' };
      }
    }

    const token = await this._getToken(settings);
    const content = run.stdout || '';
    const level = this._getMessageLevel(run, content);

    for (const chatId of chatIds) {
      if (level === 'failure') {
        await this._sendNotificationMessage(token, chatId, this._buildFailureMessage(task, run, content));
      } else if (task.feishu_mode === 'full') {
        if (content.length <= INLINE_LIMIT) {
          await this._sendNotificationMessage(token, chatId, `【${task.name}】执行完成\n\n${content}`);
        } else {
          const preview = this._buildPreview(content);
          await this._sendNotificationMessage(
            token,
            chatId,
            `【${task.name}】执行完成\n\n${preview}\n\n完整结果已作为 Markdown 附件发送。`,
          );
          await this._sendResultFile(token, chatId, task, run, content);
        }
      } else {
        const summary = run.summary || this._buildPreview(content, 220);
        await this._sendNotificationMessage(token, chatId, `【${task.name}】执行完成\n\n摘要：${summary}`);
        await this._sendResultFile(token, chatId, task, run, content);
      }
    }
    return { skipped: false, level };
  }

  async _getToken(settings) {
    if (this.tokenCache.token && Date.now() < this.tokenCache.expires) {
      return this.tokenCache.token;
    }
    const token = await getAppToken(settings.feishuAppId, settings.feishuAppSecret);
    this.tokenCache = { token, expires: Date.now() + 7000 * 1000 }; // cache ~2h
    return token;
  }

  _buildPreview(content, limit = PREVIEW_LIMIT) {
    const conclusion = this._extractConclusion(content);
    if (conclusion) return conclusion.length <= limit
      ? conclusion
      : `${conclusion.slice(0, limit).trimEnd()}\n\n...(预览已截断)`;

    if (content.length <= limit) return content;
    return `${content.slice(0, limit).trimEnd()}\n\n...(预览已截断)`;
  }

  _getMessageLevel(run, content) {
    if (['failed', 'timeout', 'canceled'].includes(run.status)) return 'failure';
    if (String(content || '').length <= INLINE_LIMIT) return 'inline';
    return 'long';
  }

  _buildFailureMessage(task, run, content) {
    const reason = run.failure_reason || (run.status === 'timeout' ? '执行超时' : '执行失败');
    const hint = run.failure_hint || '请打开执行详情查看日志。';
    const logs = this._buildPreview(run.stderr || content || '', 500);
    return [
      `【${task.name}】执行失败`,
      '',
      `状态：${run.status}`,
      `原因：${reason}`,
      `建议：${hint}`,
      logs ? `\n日志摘要：\n${logs}` : '',
    ].filter(Boolean).join('\n');
  }

  _extractConclusion(content) {
    const lines = content.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => /一句话结论|结论/.test(line));
    if (startIndex === -1) return '';

    const picked = [];
    for (const line of lines.slice(startIndex + 1)) {
      const trimmed = line.trim();
      if (!trimmed || /^[-_*#]+$/.test(trimmed)) continue;
      if (/^#{1,6}\s+/.test(trimmed) && picked.length > 0) break;
      picked.push(trimmed.replace(/^\*\*(.*)\*\*$/, '$1'));
      if (picked.join('\n').length > PREVIEW_LIMIT) break;
    }
    return picked.join('\n').trim();
  }

  async _sendNotificationMessage(token, chatId, text) {
    try {
      await sendRichTextMessage(token, chatId, this._buildFeishuPost(text));
    } catch {
      await sendMessage(token, chatId, this._stripMarkdown(text));
    }
  }

  _buildFeishuPost(text) {
    const lines = String(text || '').split(/\r?\n/);
    const titleIndex = lines.findIndex((line) => line.trim());
    const title = titleIndex >= 0 ? lines[titleIndex].trim() : 'AICron 通知';
    const content = [];
    let paragraph = [];

    const flushParagraph = () => {
      const joined = paragraph.join(' ').trim();
      if (joined) content.push(this._buildRichTextLine(joined));
      paragraph = [];
    };

    for (const line of lines.slice(titleIndex + 1)) {
      const trimmed = line.trim();
      if (!trimmed || /^[-_*#]+$/.test(trimmed)) {
        flushParagraph();
        continue;
      }
      if (/^#{1,6}\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed)) {
        flushParagraph();
        content.push(this._buildRichTextLine(trimmed.replace(/^#{1,6}\s+/, '')));
        continue;
      }
      paragraph.push(trimmed);
    }
    flushParagraph();

    return {
      title: this._stripMarkdown(title),
      content: content.length > 0 ? content.slice(0, 12) : [[{ tag: 'text', text: '执行完成' }]],
    };
  }

  _buildRichTextLine(line) {
    const normalized = line.replace(/^[-*]\s+/, '• ');
    const parts = [];
    const pattern = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ tag: 'text', text: this._stripMarkdown(normalized.slice(lastIndex, match.index)) });
      }
      parts.push({ tag: 'text', text: match[1], style: ['bold'] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < normalized.length) {
      parts.push({ tag: 'text', text: this._stripMarkdown(normalized.slice(lastIndex)) });
    }
    return parts.filter((part) => part.text);
  }

  _stripMarkdown(text) {
    return String(text || '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  }

  async _sendResultFile(token, chatId, task, run, fallbackContent) {
    try {
      const fileContent = run.result_path ? readFileSync(run.result_path, 'utf-8') : fallbackContent;
      if (!fileContent) return;
      const fileKey = await uploadFile(token, `${task.name}-${run.id}.md`, fileContent);
      await sendFileMessage(token, chatId, fileKey);
    } catch {
      // File delivery failure should not block the main text notification.
    }
  }
}
