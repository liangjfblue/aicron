const FIELDS = [
  { label: '分钟', hint: '0-59' },
  { label: '小时', hint: '0-23' },
  { label: '日期', hint: '1-31' },
  { label: '月份', hint: '1-12' },
  { label: '星期', hint: '0-7' },
];

export default function CronFieldGuide() {
  return (
    <div style={styles.wrap} aria-label="Cron 字段说明">
      {FIELDS.map((field) => (
        <div key={field.label} style={styles.item}>
          <span style={styles.label}>{field.label}</span>
          <span style={styles.hint}>{field.hint}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '6px',
    margin: '6px 0 6px',
  },
  item: {
    minWidth: 0,
    padding: '5px 6px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg)',
    textAlign: 'center',
  },
  label: {
    display: 'block',
    color: 'var(--ink)',
    fontSize: '0.75rem',
    fontWeight: 600,
    lineHeight: 1.2,
  },
  hint: {
    display: 'block',
    marginTop: '2px',
    color: 'var(--ink-tertiary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    lineHeight: 1.2,
  },
};
