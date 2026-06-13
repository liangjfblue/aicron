import { describe, it, expect } from 'vitest';
import { resolveVariables } from '../../services/variable.js';

describe('resolveVariables', () => {
  const baseTask = { name: '财报追踪', description: '追踪AI芯片' };
  const today = '2026-06-06'; // Friday

  it('resolves {{date}} and {{today}}', () => {
    const result = resolveVariables('今天是 {{date}}', baseTask, { now: new Date(today) });
    expect(result).toBe('今天是 2026-06-06');
  });

  it('resolves time, datetime, and weekday variables', () => {
    const result = resolveVariables('{{time}} {{datetime}} {{weekday}}', baseTask, {
      now: new Date('2026-06-06T09:08:07'),
    });
    expect(result).toBe('09:08:07 2026-06-06 09:08:07 星期六');
  });

  it('resolves {{yesterday}}', () => {
    const result = resolveVariables('昨天 {{yesterday}}', baseTask, { now: new Date(today) });
    expect(result).toBe('昨天 2026-06-05');
  });

  it('resolves {{task_name}} and {{task_description}}', () => {
    const result = resolveVariables('{{task_name}} - {{task_description}}', baseTask, {});
    expect(result).toBe('财报追踪 - 追踪AI芯片');
  });

  it('resolves {{week_start}} and {{week_end}}', () => {
    const result = resolveVariables('{{week_start}}~{{week_end}}', baseTask, { now: new Date(today) });
    expect(result).toBe('2026-06-01~2026-06-07');
  });

  it('resolves {{last_result}} from context', () => {
    const result = resolveVariables('上次: {{last_result}}', baseTask, { lastResult: '台积电涨了' });
    expect(result).toBe('上次: 台积电涨了');
  });

  it('resolves {{prev_output}} from context', () => {
    const result = resolveVariables('前序: {{prev_output}}', baseTask, { prevOutput: '父任务输出' });
    expect(result).toBe('前序: 父任务输出');
  });

  it('resolves {{last_summary}} from context', () => {
    const result = resolveVariables('摘要: {{last_summary}}', baseTask, { lastSummary: '无新财报' });
    expect(result).toBe('摘要: 无新财报');
  });

  it('resolves parent task result variables from context', () => {
    const result = resolveVariables(
      '父任务摘要: {{parent_summary}}\n父任务结果: {{parent_result}}\n前序: {{prev_output}}',
      baseTask,
      {
        parentSummary: '父任务一句话结论',
        parentResult: '父任务完整报告',
      },
    );

    expect(result).toBe('父任务摘要: 父任务一句话结论\n父任务结果: 父任务完整报告\n前序: 父任务完整报告');
  });

  it('resolves {{run_id}} from context', () => {
    const result = resolveVariables('ID: {{run_id}}', baseTask, { runId: 'run_abc123' });
    expect(result).toBe('ID: run_abc123');
  });

  it('leaves unknown variables as-is', () => {
    const result = resolveVariables('{{unknown_var}}', baseTask, {});
    expect(result).toBe('{{unknown_var}}');
  });

  it('resolves multiple variables in one template', () => {
    const template = '{{task_name}} {{date}} {{yesterday}} done';
    const result = resolveVariables(template, baseTask, { now: new Date(today) });
    expect(result).toBe('财报追踪 2026-06-06 2026-06-05 done');
  });
});
