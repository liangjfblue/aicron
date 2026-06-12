import { CRON_PRESETS, getCronPresetLabel } from '../utils/cronPresets';

export default function CronPresets({ value, onChange, compact = false, variant = 'buttons' }) {
  if (variant === 'select') {
    const presetValue = getCronPresetLabel(value) ? value : '';
    return (
      <select
        className="form-select"
        style={styles.select}
        value={presetValue}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
        aria-label="Cron 预设"
      >
        <option value="">自定义</option>
        {CRON_PRESETS.map((preset) => (
          <option key={preset.cron} value={preset.cron}>
            {preset.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div style={compact ? styles.compactWrap : styles.wrap}>
      {CRON_PRESETS.map((p) => (
        <button
          key={p.cron}
          className={`btn btn-sm ${value === p.cron ? 'btn-primary' : 'btn-secondary'}`}
          style={styles.pill}
          onClick={() => onChange(p.cron)}
          type="button"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  compactWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
  },
  select: {
    width: '100%',
    minWidth: 0,
  },
  pill: {
    borderRadius: '100px',
    fontSize: '0.78rem',
    padding: '4px 12px',
  },
};
