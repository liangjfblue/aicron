export const CRON_PRESETS = [
  { label: '每分钟', cron: '*/1 * * * *' },
  { label: '每小时', cron: '0 * * * *' },
  { label: '每天早9点', cron: '0 9 * * *' },
  { label: '工作日早9点', cron: '0 9 * * 1-5' },
  { label: '每周一', cron: '0 9 * * 1' },
  { label: '每月1号', cron: '0 9 1 * *' },
  { label: '每30分钟', cron: '*/30 * * * *' },
  { label: '每天中午', cron: '0 12 * * *' },
  { label: '每天晚8点', cron: '0 20 * * *' },
];

export function getCronPresetLabel(value) {
  return CRON_PRESETS.find((preset) => preset.cron === value)?.label || '';
}
