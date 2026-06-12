import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHealthDashboard } from '../api/client';

const LEVEL_LABELS = {
  healthy: '健康',
  warn: '关注',
  danger: '异常',
};

function formatDuration(ms) {
  if (!ms) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function levelClass(level) {
  if (level === 'danger') return 'badge-error';
  if (level === 'warn') return 'badge-warn';
  return 'badge-success';
}

export default function HealthPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getHealthDashboard()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="loading-spinner">加载中...</div>;

  const totals = data?.totals || {};
  const tasks = data?.tasks || [];
  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { danger: 0, warn: 1, healthy: 2 };
    return order[a.level] - order[b.level];
  });

  return (
    <div style={styles.page}>
      <div className="flex-between">
        <h1 className="section-title" style={{ marginBottom: 0 }}>任务健康面板</h1>
        <span className="text-tertiary text-sm">生成于 {formatTime(data?.generated_at)}</span>
      </div>

      <div style={styles.metrics}>
        <div className="card" style={styles.metric}><span>启用任务</span><strong>{totals.enabled || 0}</strong></div>
        <div className="card" style={styles.metric}><span>执行中</span><strong>{totals.running || 0}</strong></div>
        <div className="card" style={styles.metric}><span>近 7 天失败</span><strong>{totals.recent_failures || 0}</strong></div>
        <div className="card" style={styles.metric}><span>异常任务</span><strong>{totals.unhealthy || 0}</strong></div>
      </div>

      <div className="card" style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <span>任务</span>
          <span>状态</span>
          <span>问题</span>
          <span>上次成功</span>
          <span>平均耗时</span>
        </div>
        {sortedTasks.length === 0 ? (
          <div className="empty-state"><h3>暂无任务</h3></div>
        ) : (
          sortedTasks.map((task) => (
            <button
              key={task.task_id}
              type="button"
              style={styles.tableRow}
              onClick={() => navigate(`/tasks/${task.task_id}/edit`)}
            >
              <strong>{task.task_name}</strong>
              <span className={`badge ${levelClass(task.level)}`}>{LEVEL_LABELS[task.level] || task.level}</span>
              <span style={styles.issueText}>{task.issues?.join('；') || '无明显问题'}</span>
              <span>{formatTime(task.last_success_at)}</span>
              <span>{formatDuration(task.avg_duration_ms)}</span>
            </button>
          ))
        )}
      </div>

      <div style={styles.columns}>
        <section className="card">
          <h3 style={styles.sectionHeading}>正在执行</h3>
          {(data?.running_runs || []).length === 0 ? (
            <span className="text-tertiary">当前没有运行中的任务</span>
          ) : (
            <div style={styles.list}>
              {data.running_runs.map((run) => (
                <button key={run.id} type="button" style={styles.listItem} onClick={() => navigate(`/runs/${run.id}`)}>
                  <strong>{run.task_name}</strong>
                  <span>{run.latest_event?.title || '执行中'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <h3 style={styles.sectionHeading}>最近失败</h3>
          {(data?.recent_failures || []).length === 0 ? (
            <span className="text-tertiary">近 7 天没有失败或超时</span>
          ) : (
            <div style={styles.list}>
              {data.recent_failures.map((run) => (
                <button key={run.id} type="button" style={styles.listItem} onClick={() => navigate(`/runs/${run.id}`)}>
                  <strong>{run.task_name}</strong>
                  <span>{run.failure_reason || run.latest_event?.message || run.status}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '12px',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: 'var(--ink-secondary)',
  },
  tableCard: {
    padding: 0,
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1.2fr) 90px minmax(220px, 1.5fr) 150px 100px',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--ink-tertiary)',
    fontSize: '0.82rem',
  },
  tableRow: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1.2fr) 90px minmax(220px, 1.5fr) 150px 100px',
    gap: '12px',
    alignItems: 'center',
    padding: '14px 16px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  },
  issueText: {
    color: 'var(--ink-secondary)',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
  },
  sectionHeading: {
    fontSize: '1rem',
    marginBottom: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  listItem: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    color: 'var(--ink)',
  },
};
