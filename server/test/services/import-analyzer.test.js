import { describe, expect, it } from 'vitest';
import {
  ImportAnalyzer,
  normalizeImportDraft,
  parseAicronTaskPackage,
  parseImportDraftOutput,
} from '../../services/import-analyzer.js';
import { closeDb, getDb } from '../../db/index.js';

describe('normalizeImportDraft', () => {
  it('normalizes AI import draft fields', () => {
    const draft = normalizeImportDraft(
      {
        name: '  产品发布周报  ',
        description: '跟踪产品发布信息',
        prompt_template: 'AI 改写后的 prompt',
        engine: 'unknown',
        cron_expression: '',
        timeout_seconds: 1800,
        tags: ['产品', '周报', '', 123, '竞品', '发布', '多余标签', '忽略'],
        feishu_mode: 'summary',
        confidence: { name: 'high', description: 'medium', cron_expression: 'nope' },
        notes: ['一次性日期，不生成 cron', 42],
      },
      '/research-skill 原始文本'
    );

    expect(draft).toMatchObject({
      name: '产品发布周报',
      description: '跟踪产品发布信息',
      prompt_template: '/research-skill 原始文本',
      engine: 'claude',
      cron_expression: null,
      timeout_seconds: 1800,
      tags: ['产品', '周报', '竞品', '发布', '多余标签'],
      feishu_mode: 'summary',
      confidence: {
        name: 'high',
        description: 'medium',
        cron_expression: 'low',
        tags: 'low',
      },
      notes: ['一次性日期，不生成 cron'],
    });
  });

  it('always preserves original text as prompt template', () => {
    const draft = normalizeImportDraft({ prompt_template: '被 AI 改写' }, '/research-skill 原始 prompt');
    expect(draft.prompt_template).toBe('/research-skill 原始 prompt');
    expect(draft.timeout_seconds).toBe(900);
  });
});

describe('parseImportDraftOutput', () => {
  it('recovers useful fields from malformed JSON and preserves original prompt', () => {
    const originalText = '/research-skill 分析下周产品发布前的市场状态';
    const output = `{
      "name":"产品发布前市场状态分析",
      "description":"追踪核心假说：新功能发布后是否会提升活跃度，并分析发布前的市场状态。",
      "prompt_template":"被 AI 改坏的模板",
      "engine":"claude",
      "timeout_seconds":1800,
      "tags":["产品","发布","市场"],
      "feishu_mode":"full"
    `;

    const draft = parseImportDraftOutput(output, originalText);

    expect(draft).toMatchObject({
      name: '产品发布前市场状态分析',
      description: '追踪核心假说：新功能发布后是否会提升活跃度，并分析发布前的市场状态。',
      prompt_template: originalText,
      engine: 'claude',
      timeout_seconds: 1800,
      tags: ['产品', '发布', '市场'],
      feishu_mode: 'full',
    });
    expect(draft.notes).toContain('AI 返回 JSON 格式不完整，已按字段名尽量提取草稿');
  });
});

describe('parseAicronTaskPackage', () => {
  it('extracts form fields and prompt template from a packaged AICron task', () => {
    const draft = parseAicronTaskPackage(`# 产品发布观察计划 — AICron 任务模板

## 建议任务信息

| 字段 | 建议 |
|---|---|
| 任务名称 | 产品发布效果与用户反馈跟踪 |
| 执行频率 | 2026 年 7 月起每周一次；12 月 3 日发布日前后提高频率 |
| 执行引擎 | claude |
| 超时 | 300 秒 |
| 飞书通知 | summary |
| 标签 | 产品、用户反馈、竞品、发布 |

## Agent 任务模板

\`\`\`
/research-skill 产品发布效果与用户反馈跟踪

【持久上下文】
正在跟踪：一款新产品功能的发布效果。

【本次任务】
请搜索并核验最新公告、用户反馈和竞品动态。
\`\`\`

## 执行节奏建议

| 时间段 | 频率 |
|---|---|
| 2026 年 7-8 月 | 每周一次 |
| 2027 年 Q3-Q4 | 每两周一次 |
`);

    expect(draft).toMatchObject({
      name: '产品发布效果与用户反馈跟踪',
      description: '2026 年 7 月起每周一次；12 月 3 日发布日前后提高频率',
      prompt_template: '/research-skill 产品发布效果与用户反馈跟踪\n\n【持久上下文】\n正在跟踪：一款新产品功能的发布效果。\n\n【本次任务】\n请搜索并核验最新公告、用户反馈和竞品动态。',
      engine: 'claude',
      timeout_seconds: 300,
      tags: ['产品', '用户反馈', '竞品', '发布'],
      feishu_mode: 'summary',
    });
    expect(draft.schedule_segments).toEqual([
      {
        label: '2026 年 7-8 月',
        cron_expression: '0 9 * * 1',
        active_start_at: '2026-07-01T00:00',
        active_end_at: '2026-08-31T23:59',
        notes: '',
      },
      {
        label: '2027 年 Q3-Q4',
        cron_expression: '',
        active_start_at: '2027-07-01T00:00',
        active_end_at: '2027-12-31T23:59',
        notes: '频率"每两周一次"不能稳定转换为标准 Cron，请手动设置',
      },
    ]);
    expect(draft.notes).toContain('建议执行频率：2026 年 7 月起每周一次；12 月 3 日发布日前后提高频率');
    expect(draft.notes).toContain('2027 年 Q3-Q4：频率"每两周一次"不能稳定转换为标准 Cron，请手动设置');
  });
});

describe('ImportAnalyzer cron parsing', () => {
  it('parses common natural language schedules locally', async () => {
    const analyzer = new ImportAnalyzer(getDb());

    await expect(analyzer.analyzeCron('每周一早上 9 点')).resolves.toMatchObject({
      cron_expression: '0 9 * * 1',
      confidence: 'high',
    });
    await expect(analyzer.analyzeCron('每个工作日 18:30')).resolves.toMatchObject({
      cron_expression: '30 18 * * 1-5',
      confidence: 'high',
    });
    await expect(analyzer.analyzeCron('每两周一次')).resolves.toMatchObject({
      cron_expression: '',
      confidence: 'low',
    });

    closeDb();
  });
});
