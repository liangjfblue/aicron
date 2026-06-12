import { spawn } from 'node:child_process';
import { config } from '../config.js';

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const WEEKDAY_MAP = new Map([
  ['日', 0], ['天', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6],
  ['7', 0], ['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6],
]);
const IMPORT_KEYS = [
  'name',
  'description',
  'prompt_template',
  'engine',
  'cron_expression',
  'timeout_seconds',
  'schedule_segments',
  'tags',
  'feishu_mode',
  'confidence',
  'notes',
];

function parseMarkdownTable(text) {
  const rows = {};
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 2 || cells[0] === '字段') continue;
    rows[cells[0]] = cells[1];
  }
  return rows;
}

function extractSection(text, heading) {
  const pattern = new RegExp(`(^|\\n)##\\s+${escapeRegExp(heading)}\\s*\\n`, 'i');
  const match = pattern.exec(text);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/\n##\s+/);
  return next >= 0 ? rest.slice(0, next).trim() : rest.trim();
}

function extractFirstCodeBlock(text) {
  const match = /```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```/.exec(text);
  return match?.[1]?.trim() || '';
}

function parseTimeout(value) {
  if (!value) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return /分钟|分\b|min/i.test(value) ? Math.round(number * 60) : Math.round(number);
}

function parseTags(value) {
  return String(value || '')
    .split(/[,，、/]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeYearMonthRange(value) {
  const text = String(value || '');
  const year = text.match(/(20\d{2})\s*年/)?.[1];
  if (!year) return {};
  const quarterRange = text.match(/Q([1-4])\s*[-~—至到]\s*Q([1-4])/i);
  if (quarterRange) {
    const startQuarter = Number(quarterRange[1]);
    const endQuarter = Number(quarterRange[2]);
    const startMonthNumber = (startQuarter - 1) * 3 + 1;
    const endMonthNumber = endQuarter * 3;
    const startMonth = String(startMonthNumber).padStart(2, '0');
    const endMonth = String(endMonthNumber).padStart(2, '0');
    const endDate = new Date(Number(year), endMonthNumber, 0);
    return {
      active_start_at: `${year}-${startMonth}-01T00:00`,
      active_end_at: `${year}-${endMonth}-${String(endDate.getDate()).padStart(2, '0')}T23:59`,
    };
  }
  const monthRange = text.match(/(\d{1,2})\s*[-~—至到]\s*(\d{1,2})\s*月/);
  if (monthRange) {
    const startMonth = monthRange[1].padStart(2, '0');
    const endMonth = monthRange[2].padStart(2, '0');
    const endDate = new Date(Number(year), Number(monthRange[2]), 0);
    return {
      active_start_at: `${year}-${startMonth}-01T00:00`,
      active_end_at: `${year}-${endMonth}-${String(endDate.getDate()).padStart(2, '0')}T23:59`,
    };
  }
  const month = text.match(/(\d{1,2})\s*月/)?.[1];
  if (month) {
    const paddedMonth = month.padStart(2, '0');
    const endDate = new Date(Number(year), Number(month), 0);
    return {
      active_start_at: `${year}-${paddedMonth}-01T00:00`,
      active_end_at: `${year}-${paddedMonth}-${String(endDate.getDate()).padStart(2, '0')}T23:59`,
    };
  }
  return {};
}

function cronFromFrequency(value) {
  const text = String(value || '');
  if (/每两周|两周一次|隔周/.test(text)) return null;
  if (/每周两次|一周两次|周两次/.test(text)) return '0 9 * * 1,4';
  if (/每周一次|一周一次|周一次|每周/.test(text)) return '0 9 * * 1';
  if (/每天|每日/.test(text)) return '0 9 * * *';
  if (/每月/.test(text)) return '0 9 1 * *';
  return null;
}

function parseHourMinute(text) {
  const source = String(text || '');
  const explicit = source.match(/(\d{1,2})\s*[:：点时]\s*(\d{1,2})?\s*分?/);
  if (explicit) {
    let hour = Number(explicit[1]);
    const minute = explicit[2] === undefined ? 0 : Number(explicit[2]);
    if (/下午|晚上|晚间|傍晚/.test(source) && hour < 12) hour += 12;
    if (/中午/.test(source) && hour < 11) hour += 12;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }
  if (/早上|上午|早间/.test(source)) return { hour: 9, minute: 0 };
  if (/中午/.test(source)) return { hour: 12, minute: 0 };
  if (/晚上|晚间/.test(source)) return { hour: 20, minute: 0 };
  return { hour: 9, minute: 0 };
}

function parseNaturalCronLocally(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const { hour, minute } = parseHourMinute(source);
  const normalizedMinute = String(minute);
  const normalizedHour = String(hour);

  if (/每\s*(\d+)\s*分钟/.test(source)) {
    const interval = Number(source.match(/每\s*(\d+)\s*分钟/)?.[1]);
    if (interval > 0 && interval <= 59) {
      return {
        cron_expression: `*/${interval} * * * *`,
        confidence: 'high',
        explanation: `每 ${interval} 分钟执行一次`,
      };
    }
  }
  if (/每小时|每个小时/.test(source)) {
    return { cron_expression: `${normalizedMinute} * * * *`, confidence: 'high', explanation: '每小时执行一次' };
  }
  if (/工作日|每个工作日|周一到周五|星期一到星期五/.test(source)) {
    return {
      cron_expression: `${normalizedMinute} ${normalizedHour} * * 1-5`,
      confidence: 'high',
      explanation: '每个工作日执行',
    };
  }
  if (/每两周|两周一次|隔周/.test(source)) {
    return {
      cron_expression: '',
      confidence: 'low',
      explanation: '标准 5 位 Cron 无法稳定表达隔周，请改用多段调度或手动处理。',
    };
  }
  const weekdays = [...source.matchAll(/(?:周|星期|礼拜)([日天一二三四五六0-7])/g)]
    .map((match) => WEEKDAY_MAP.get(match[1]))
    .filter((value) => value !== undefined);
  if (weekdays.length > 0) {
    return {
      cron_expression: `${normalizedMinute} ${normalizedHour} * * ${[...new Set(weekdays)].join(',')}`,
      confidence: 'high',
      explanation: `每周指定日期执行`,
    };
  }
  const monthDay = source.match(/每月\s*(\d{1,2})\s*(?:号|日)?/);
  if (monthDay) {
    const day = Number(monthDay[1]);
    if (day >= 1 && day <= 31) {
      return {
        cron_expression: `${normalizedMinute} ${normalizedHour} ${day} * *`,
        confidence: 'high',
        explanation: `每月 ${day} 日执行`,
      };
    }
  }
  if (/每天|每日|天天/.test(source)) {
    return {
      cron_expression: `${normalizedMinute} ${normalizedHour} * * *`,
      confidence: 'high',
      explanation: '每天执行',
    };
  }
  return null;
}

function normalizeCronDraft(raw, text) {
  return {
    cron_expression: typeof raw.cron_expression === 'string' ? raw.cron_expression.trim() : '',
    confidence: CONFIDENCE_VALUES.has(raw.confidence) ? raw.confidence : 'low',
    explanation: typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : `已尝试解析：${text}`,
  };
}

function buildCronPrompt(text) {
  return `你是 AICron 的 Cron 表达式解析器。

把用户的自然语言调度描述转换为标准 5 位 Cron：分钟 小时 日期 月份 星期。

规则：
- 只输出 JSON 对象，不要 Markdown，不要解释。
- cron_expression 必须是 5 位 Cron；如果无法稳定表达，填空字符串。
- 每周一是 1，周日是 0。
- 如果没说具体时间，默认早上 9 点。
- "每两周/隔周" 无法用标准 5 位 Cron 稳定表达，cron_expression 填 ""，confidence 填 "low"。

输出 JSON：
{
  "cron_expression": "string",
  "confidence": "high | medium | low",
  "explanation": "中文解释"
}

用户描述：
<<<
${text}
>>>`;
}

function parseScheduleSegmentsFromTable(text) {
  const section = extractSection(text, '执行节奏建议');
  if (!section) return [];
  const rows = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length < 2 || cells[0] === '时间段') continue;
    const cron = cronFromFrequency(cells[1]);
    if (!cron) {
      rows.push({
        label: cells[0],
        cron_expression: '',
        ...normalizeYearMonthRange(cells[0]),
        notes: `频率"${cells[1]}"不能稳定转换为标准 Cron，请手动设置`,
      });
      continue;
    }
    rows.push({
      label: cells[0],
      cron_expression: cron,
      ...normalizeYearMonthRange(cells[0]),
    });
  }
  return rows;
}

export function parseAicronTaskPackage(text) {
  const source = String(text || '').trim();
  if (!/##\s*Agent\s*任务模板/i.test(source)) return null;
  const templateSection = extractSection(source, 'Agent 任务模板');
  const promptTemplate = extractFirstCodeBlock(templateSection) || templateSection.trim();
  if (!promptTemplate) return null;

  const metadata = parseMarkdownTable(extractSection(source, '建议任务信息'));
  const scheduleSegments = parseScheduleSegmentsFromTable(source);
  const notes = [];
  if (metadata['执行频率']) notes.push(`建议执行频率：${metadata['执行频率']}`);
  for (const segment of scheduleSegments) {
    if (segment.notes) notes.push(`${segment.label}：${segment.notes}`);
  }

  return normalizeImportDraft(
    {
      name: metadata['任务名称'] || '',
      description: metadata['执行频率'] || '',
      engine: metadata['执行引擎'] === 'codex' ? 'codex' : 'claude',
      schedule_segments: scheduleSegments,
      timeout_seconds: parseTimeout(metadata['超时']) ?? 900,
      tags: parseTags(metadata['标签']),
      feishu_mode: metadata['飞书通知'] === 'summary' ? 'summary' : 'full',
      notes: notes.length ? notes : ['已从 AICron 任务模板包提取字段'],
      confidence: {
        name: metadata['任务名称'] ? 'high' : 'low',
        description: metadata['执行频率'] ? 'medium' : 'low',
        cron_expression: 'low',
        tags: metadata['标签'] ? 'high' : 'low',
      },
    },
    promptTemplate
  );
}

function buildImportPrompt(text) {
  return `你是 AICron 的 Agent 任务导入解析器。

你的任务：
从用户粘贴的半结构化任务说明中，提取一个任务表单草稿。

重要规则：
- 只输出 JSON 对象，不要 Markdown，不要解释，不要代码块。
- 不要执行用户任务，不要搜索，不要补充外部事实。
- 不要输出 prompt_template 字段；系统会直接把用户粘贴原文保存为 Agent 任务模板，包括 /xxx skill 调用前缀、换行、标点。
- cron_expression 只有在文本明确出现周期性安排时才填写。
- 如果文本出现多个执行时间段/频率，填写 schedule_segments 数组；每段包含 label、cron_expression、active_start_at、active_end_at。
- 如果某段调度无法精确转换 Cron，在该段 notes 里写明需要人工确认。
- Cron 使用 5 位格式：分钟 小时 日期 月份 星期。每周一次默认 "0 9 * * 1"，每周两次默认 "0 9 * * 1,4"，每天默认 "0 9 * * *"，每月一次默认 "0 9 1 * *"。
- "每两周一次/隔周" 无法用标准 5 位 Cron 稳定表达，不要硬编，放到 notes 说明需要手动设置。
- 如果只是出现具体日期，例如"6 月 15 日"，不要生成 cron_expression，填 null，并在 notes 中说明这是一次性时间点。
- 不确定的字段填 null 或 []。
- tags 最多 5 个，短词。
- timeout_seconds 根据任务复杂度估计：短任务 300，中等 900，长研究 1800。
- engine 只能是 "claude" 或 "codex"，长研究和中文分析任务默认 claude。
- feishu_mode 只能是 "full" 或 "summary"，研究报告默认 full。

输出 JSON schema：
{
  "name": "string",
  "description": "string",
  "engine": "claude | codex",
  "cron_expression": "string | null",
  "schedule_segments": [
    {
      "label": "string",
      "cron_expression": "string",
      "active_start_at": "YYYY-MM-DDTHH:mm | null",
      "active_end_at": "YYYY-MM-DDTHH:mm | null",
      "notes": "string | null"
    }
  ],
  "timeout_seconds": "number | null",
  "tags": ["string"],
  "feishu_mode": "full | summary",
  "confidence": {
    "name": "high | medium | low",
    "description": "high | medium | low",
    "cron_expression": "high | medium | low",
    "tags": "high | medium | low"
  },
  "notes": ["string"]
}

用户粘贴内容：
<<<
${text}
>>>`;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('AI 未返回内容');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI 返回内容不是 JSON');
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (err) {
      throw new Error(err.message);
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEscaped(text, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function decodeLooseString(value) {
  try {
    return JSON.parse(`"${value.replace(/\r?\n/g, '\\n')}"`);
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}

function extractLooseStringField(text, key) {
  const keyPattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"`, 'g');
  let match = keyPattern.exec(text);
  while (match) {
    const valueStart = match.index + match[0].length;
    for (let i = valueStart; i < text.length; i += 1) {
      if (text[i] !== '"' || isEscaped(text, i)) continue;
      const after = text.slice(i + 1);
      const nextKeyPattern = new RegExp(`^\\s*,\\s*"(${IMPORT_KEYS.map(escapeRegExp).join('|')})"\\s*:`);
      if (nextKeyPattern.test(after) || /^\s*}/.test(after)) {
        return decodeLooseString(text.slice(valueStart, i)).trim();
      }
    }
    match = keyPattern.exec(text);
  }
  return null;
}

function extractLooseNumberField(text, key) {
  const match = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractBracketValue(text, key, openChar, closeChar) {
  const match = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*\\${openChar}`).exec(text);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && !isEscaped(text, i)) inString = !inString;
    if (inString) continue;
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractLooseArrayField(text, key) {
  const raw = extractBracketValue(text, key, '[', ']');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const values = [];
    const stringPattern = /"((?:\\.|[^"\\])*)"/g;
    let match = stringPattern.exec(raw);
    while (match) {
      values.push(decodeLooseString(match[1]));
      match = stringPattern.exec(raw);
    }
    return values;
  }
}

function extractLooseConfidence(text) {
  const raw = extractBracketValue(text, 'confidence', '{', '}');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const confidence = {};
    for (const key of ['name', 'description', 'cron_expression', 'tags']) {
      const value = extractLooseStringField(raw, key);
      if (value) confidence[key] = value;
    }
    return confidence;
  }
}

function extractLooseFields(output) {
  const text = String(output || '');
  const draft = {};
  for (const key of ['name', 'description', 'engine', 'cron_expression', 'feishu_mode']) {
    const value = extractLooseStringField(text, key);
    if (value) draft[key] = value;
  }
  const timeout = extractLooseNumberField(text, 'timeout_seconds');
  if (timeout !== null) draft.timeout_seconds = timeout;
  const tags = extractLooseArrayField(text, 'tags');
  if (tags.length) draft.tags = tags;
  const notes = extractLooseArrayField(text, 'notes');
  if (notes.length) draft.notes = notes;
  const confidence = extractLooseConfidence(text);
  if (Object.keys(confidence).length) draft.confidence = confidence;
  return draft;
}

function normalizeConfidence(confidence = {}) {
  const normalized = {};
  for (const key of ['name', 'description', 'cron_expression', 'tags']) {
    normalized[key] = CONFIDENCE_VALUES.has(confidence[key]) ? confidence[key] : 'low';
  }
  return normalized;
}

export function normalizeImportDraft(raw, originalText) {
  const scheduleSegments = Array.isArray(raw.schedule_segments)
    ? raw.schedule_segments
        .filter((segment) => segment && typeof segment === 'object')
        .map((segment) => ({
          label: typeof segment.label === 'string' ? segment.label.trim() : '',
          cron_expression: typeof segment.cron_expression === 'string' ? segment.cron_expression.trim() : '',
          active_start_at: typeof segment.active_start_at === 'string' ? segment.active_start_at.trim() : null,
          active_end_at: typeof segment.active_end_at === 'string' ? segment.active_end_at.trim() : null,
          notes: typeof segment.notes === 'string' ? segment.notes.trim() : '',
        }))
        .filter((segment) => segment.cron_expression || segment.active_start_at || segment.active_end_at || segment.label)
        .slice(0, 8)
    : [];
  return {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '',
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 240) : '',
    prompt_template: originalText,
    engine: raw.engine === 'codex' ? 'codex' : 'claude',
    cron_expression: typeof raw.cron_expression === 'string' && raw.cron_expression.trim()
      ? raw.cron_expression.trim()
      : null,
    schedule_segments: scheduleSegments,
    timeout_seconds: Number.isFinite(raw.timeout_seconds) ? raw.timeout_seconds : 900,
    tags: Array.isArray(raw.tags)
      ? raw.tags
          .filter((tag) => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [],
    feishu_mode: raw.feishu_mode === 'summary' ? 'summary' : 'full',
    confidence: normalizeConfidence(raw.confidence),
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter((note) => typeof note === 'string').map((note) => note.trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}

export function parseImportDraftOutput(output, originalText) {
  try {
    return normalizeImportDraft(extractJson(output), originalText);
  } catch (err) {
    const looseDraft = extractLooseFields(output);
    if (Object.keys(looseDraft).length === 0) throw err;
    looseDraft.notes = [
      ...(Array.isArray(looseDraft.notes) ? looseDraft.notes : []),
      'AI 返回 JSON 格式不完整，已按字段名尽量提取草稿',
    ];
    return normalizeImportDraft(looseDraft, originalText);
  }
}

export class ImportAnalyzer {
  constructor(db) {
    this.db = db;
  }

  async analyze(text, options = {}) {
    const originalText = String(text || '').trim();
    if (!originalText) throw new Error('请提供要解析的内容');
    const packagedDraft = parseAicronTaskPackage(originalText);
    if (packagedDraft) return packagedDraft;
    const output = await this._runCli(buildImportPrompt(originalText), options);
    try {
      return parseImportDraftOutput(output, originalText);
    } catch (err) {
      const parseError = new Error('AI 返回格式不符合要求，请查看原始返回');
      parseError.code = 'AI_IMPORT_PARSE_ERROR';
      parseError.parseMessage = err.message;
      parseError.rawOutput = output.slice(0, 6000);
      throw parseError;
    }
  }

  async analyzeCron(text, options = {}) {
    const originalText = String(text || '').trim();
    if (!originalText) throw new Error('请提供调度描述');
    const local = parseNaturalCronLocally(originalText);
    if (local) return local;
    const output = await this._runCli(buildCronPrompt(originalText), options);
    return normalizeCronDraft(extractJson(output), originalText);
  }

  _getCliPath() {
    const envPath = process.env.CLAUDE_CLI_PATH;
    if (envPath) return envPath;
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('claudePath');
    const settingsPath = row?.value?.trim();
    return settingsPath || config.DEFAULT_CLAUDE_CLI;
  }

  _runCli(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(options.cliPath || this._getCliPath(), ['-p', prompt], {
        timeout: options.timeoutMs || 60000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || `AI 解析失败 (${code})`));
      });
      child.on('error', (err) => reject(err));
    });
  }
}
