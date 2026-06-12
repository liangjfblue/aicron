import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

export function resolveVariables(template, task, context = {}) {
  const now = context.now || new Date();
  const dateStr = format(now, 'yyyy-MM-dd');
  const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  const vars = {
    '{{task_name}}': task.name || '',
    '{{task_description}}': task.description || '',
    '{{date}}': dateStr,
    '{{today}}': dateStr,
    '{{time}}': format(now, 'HH:mm:ss'),
    '{{datetime}}': format(now, 'yyyy-MM-dd HH:mm:ss'),
    '{{weekday}}': weekdayNames[now.getDay()],
    '{{yesterday}}': format(subDays(now, 1), 'yyyy-MM-dd'),
    '{{week_start}}': format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    '{{week_end}}': format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    '{{last_result}}': context.lastResult || '',
    '{{last_summary}}': context.lastSummary || '',
    '{{prev_output}}': context.prevOutput || context.lastResult || '',
    '{{run_id}}': context.runId || '',
  };

  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(key, val);
  }
  return result;
}
