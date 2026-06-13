import { useNavigate } from 'react-router-dom';
import { getCronPresetLabel } from '../utils/cronPresets';

const ENGINE_LABELS = { claude: 'Claude', codex: 'Codex' };
const CHAIN_MODE_LABELS = {
  chain_only: '父任务触发',
  both: '定时+链',
  cron_only: '仅定时',
};

function formatNextRun(cron) {
  if (!cron) return '未设置';
  return getCronPresetLabel(cron) || cron;
}

function normalizeScheduleSegments(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getScheduleDisplay(task, scheduleSegments) {
  if (scheduleSegments.length === 0) {
    return formatNextRun(task.cron_expression || task.cron);
  }

  const first = scheduleSegments[0] || {};
  const cron = first.cron_expression || first.cronExpression;
  const prefix = scheduleSegments.length === 1 ? '多段' : `多段 1/${scheduleSegments.length}`;
  return `${prefix} · ${formatNextRun(cron)}`;
}

function getRunTime(run) {
  if (!run) return null;
  return run.started_at || run.finished_at || run.startedAt || run.createdAt || null;
}

function formatLastRunTime(run) {
  const ts = getRunTime(run);
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return `上次 ${date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

function getRunStage(run) {
  if (!run?.latest_event) return null;
  return run.latest_event.title || run.latest_event.type || null;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatActiveWindow(task) {
  const start = formatDateTime(task.active_start_at || task.activeStartAt);
  const end = formatDateTime(task.active_end_at || task.activeEndAt);
  if (start && end) return `生效 ${start} - ${end}`;
  if (start) return `自 ${start} 生效`;
  if (end) return `至 ${end} 生效`;
  return null;
}

export default function TaskCard({ task, onRun, onToggle, onDelete }) {
  const navigate = useNavigate();

  const handleEdit = () => navigate(`/tasks/${task.id}/edit`);
  const stopAndRun = (handler) => (event) => {
    event.stopPropagation();
    handler(task.id);
  };

  const borderColor = task.lastRun?.status === 'running'
    ? 'var(--warn)'
    : task.enabled
      ? 'transparent'
      : 'var(--border)';
  const lastRunTime = formatLastRunTime(task.lastRun);
  const runStage = getRunStage(task.lastRun);
  const activeWindow = formatActiveWindow(task);
  const scheduleSegments = normalizeScheduleSegments(task.schedule_segments || task.scheduleSegments);
  const scheduleSegmentCount = scheduleSegments.length;
  const scheduleDisplay = getScheduleDisplay(task, scheduleSegments);
  const hasParentTask = Boolean(task.chain_parent_id || task.chainParentId);
  const chainMode = task.chain_trigger_mode || task.chainTriggerMode || 'both';

  return (
    <div
      className="card task-card"
      tabIndex={0}
      aria-label={`编辑任务 ${task.name}`}
      onClick={handleEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleEdit();
        }
      }}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        opacity: task.enabled ? 1 : 0.65,
        cursor: 'pointer',
      }}
    >
      <div style={styles.headerRow}>
        <div style={styles.titleBlock}>
          <h3 style={styles.title}>
            {task.name}
          </h3>
          {task.description && (
            <p style={styles.desc}>{task.description}</p>
          )}
        </div>
        <span className={`badge ${task.enabled ? 'badge-success' : 'badge-neutral'}`}>
          {task.enabled ? '已启用' : '已停用'}
        </span>
      </div>

      <div style={styles.footerRow}>
        <div style={styles.metaChips}>
          <span style={styles.scheduleChip}>
            <span className="text-mono">{scheduleDisplay}</span>
          </span>
          {scheduleSegmentCount > 0 && (
            <span className="badge badge-neutral">多段调度 x {scheduleSegmentCount}</span>
          )}
          {lastRunTime && (
            <span style={styles.runMeta}>
              {lastRunTime}
            </span>
          )}
          {task.lastRun?.status === 'running' && runStage && (
            <button
              type="button"
              className="badge badge-warn"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/runs/${task.lastRun.id}`);
              }}
              title="查看执行详情"
            >
              执行中 · {runStage}
            </button>
          )}
          {activeWindow && (
            <span className="badge badge-neutral">
              {activeWindow}
            </span>
          )}
          <span className="badge badge-accent">
            {ENGINE_LABELS[task.engine] || task.engine}
          </span>
          {hasParentTask && (
            <span className="badge badge-warn">{CHAIN_MODE_LABELS[chainMode] || '任务链'}</span>
          )}
          {(task.tags || []).map((tag) => (
            <span key={tag} className="badge badge-neutral">{tag}</span>
          ))}
        </div>

        <div
          style={styles.actions}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {task.enabled && (
            <button
              className="btn btn-primary btn-sm"
              onClick={stopAndRun(onRun)}
              disabled={task.lastRun?.status === 'running'}
            >
              {task.lastRun?.status === 'running' ? '执行中' : '执行'}
            </button>
          )}
          <button
            className={`btn btn-sm ${task.enabled ? 'btn-ghost' : 'btn-secondary'}`}
            onClick={stopAndRun(onToggle)}
          >
            {task.enabled ? '停用' : '启用'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={stopAndRun(onDelete)}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '14px',
  },
  titleBlock: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: '4px',
  },
  desc: {
    fontSize: '0.85rem',
    color: 'var(--ink-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  metaChips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
  },
  scheduleChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 10px',
    borderRadius: '100px',
    fontSize: '0.78rem',
    color: 'var(--ink-secondary)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  runMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 10px',
    borderRadius: '100px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--ink-secondary)',
    fontSize: '0.78rem',
  },
};
