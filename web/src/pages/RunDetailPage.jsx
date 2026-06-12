import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getRun, getRunResult } from '../api/client';

const STATUS_LABELS = {
  succeeded: '成功',
  failed: '失败',
  running: '执行中',
  timeout: '超时',
  queued: '等待中',
  canceled: '已取消',
};

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function getProgress(run) {
  const events = run?.events || [];
  const eventProgress = events
    .map((event) => Number(event.metadata?.progress))
    .filter((value) => Number.isFinite(value));
  if (eventProgress.length) return Math.max(...eventProgress);
  if (run?.status === 'succeeded') return 100;
  if (['failed', 'timeout', 'canceled'].includes(run?.status)) return 100;
  if (run?.status === 'running') return 35;
  return 0;
}

function eventColor(event) {
  const severity = event.metadata?.severity;
  if (severity === 'success') return 'var(--success)';
  if (severity === 'error') return 'var(--error)';
  if (severity === 'warn') return 'var(--warn)';
  return 'var(--accent)';
}

export default function RunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRun(runId)
      .then(async (detail) => {
        const content = await getRunResult(runId).catch(() => '');
        if (cancelled) return;
        setRun(detail);
        setResult(content);
      })
      .catch(() => {
        if (!cancelled) setRun(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (run?.status !== 'running') return undefined;
    const timer = setInterval(() => {
      getRun(runId)
        .then((detail) => setRun(detail))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [run?.status, runId]);

  if (loading) return <div className="loading-spinner">加载中...</div>;
  if (!run) return <div className="empty-state"><h3>执行记录不存在</h3></div>;

  const progress = getProgress(run);
  const failureVisible = ['failed', 'timeout', 'canceled'].includes(run.status);

  return (
    <div style={styles.page}>
      <div className="flex-between" style={styles.header}>
        <div>
          <h1 className="section-title" style={{ marginBottom: '4px' }}>{run.task_name || '执行详情'}</h1>
          <div className="text-tertiary text-sm">
            <span className="text-mono">{run.id}</span>
            <span style={styles.dotText}> · </span>
            {run.trigger_type || 'manual'}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/history')}>
          返回历史
        </button>
      </div>

      <div style={styles.summaryGrid}>
        <div className="card" style={styles.statusCard}>
          <span className={`badge ${
            run.status === 'succeeded' ? 'badge-success' : failureVisible ? 'badge-error' : 'badge-warn'
          }`}>
            {STATUS_LABELS[run.status] || run.status}
          </span>
          <strong style={styles.statusTitle}>{run.latest_event?.title || STATUS_LABELS[run.status]}</strong>
          <span className="text-tertiary">{run.latest_event?.message || run.summary || '暂无阶段说明'}</span>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span className="text-mono text-sm">{progress}%</span>
        </div>
        <div className="card" style={styles.metricCard}>
          <span>开始</span>
          <strong>{formatTime(run.started_at)}</strong>
        </div>
        <div className="card" style={styles.metricCard}>
          <span>结束</span>
          <strong>{formatTime(run.finished_at)}</strong>
        </div>
        <div className="card" style={styles.metricCard}>
          <span>{run.status === 'running' ? '已运行' : '耗时'}</span>
          <strong>{formatDuration(run.status === 'running' ? run.elapsed_ms : run.duration_ms)}</strong>
        </div>
      </div>

      {failureVisible && (
        <div className="card" style={styles.failureCard}>
          <strong>失败解释</strong>
          <span>{run.failure_reason || '执行失败，原因还不确定。'}</span>
          <span className="text-tertiary">{run.failure_hint || '查看日志后调整任务模板或执行环境。'}</span>
        </div>
      )}

      <div style={styles.columns}>
        <section className="card" style={styles.leftPanel}>
          <h3 style={styles.sectionHeading}>执行进度</h3>
          <div style={styles.eventList}>
            {(run.events || []).map((event) => (
              <div key={event.id} style={styles.eventRow}>
                <span style={{ ...styles.eventDot, background: eventColor(event) }} />
                <div style={styles.eventBody}>
                  <div style={styles.eventTitleRow}>
                    <strong>{event.title}</strong>
                    <span className="text-mono text-sm">{formatTime(event.created_at)}</span>
                  </div>
                  {event.message ? <span className="text-tertiary">{event.message}</span> : null}
                  {event.metadata?.stage ? (
                    <span className="badge badge-neutral">{event.metadata.stage}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={styles.rightPanel}>
          <h3 style={styles.sectionHeading}>执行结果</h3>
          {result ? (
            <div className="markdown-body" style={styles.resultContent}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-tertiary">暂无结果正文</div>
          )}
        </section>
      </div>

      <details className="card" style={styles.detailBlock}>
        <summary style={styles.detailSummary}>输入 Prompt 与运行日志</summary>
        <div style={styles.logGrid}>
          <div>
            <h4 style={styles.smallHeading}>Resolved Prompt</h4>
            <pre style={styles.pre}>{run.resolved_prompt || ''}</pre>
          </div>
          <div>
            <h4 style={styles.smallHeading}>stderr</h4>
            <pre style={styles.pre}>{run.stderr || '无'}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    alignItems: 'flex-start',
  },
  dotText: {
    color: 'var(--border-strong)',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1.4fr) repeat(3, minmax(130px, 0.6fr))',
    gap: '12px',
  },
  statusCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusTitle: {
    fontSize: '1.05rem',
  },
  metricCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: 'var(--ink-secondary)',
  },
  progressTrack: {
    height: '8px',
    borderRadius: '999px',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
  },
  failureCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderColor: 'var(--error)',
    background: 'var(--error-light)',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '360px minmax(0, 1fr)',
    gap: '16px',
    alignItems: 'start',
  },
  leftPanel: {
    maxHeight: 'calc(100vh - 280px)',
    overflowY: 'auto',
  },
  rightPanel: {
    minHeight: '420px',
  },
  sectionHeading: {
    fontSize: '1rem',
    marginBottom: '12px',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  eventRow: {
    display: 'grid',
    gridTemplateColumns: '12px minmax(0, 1fr)',
    gap: '10px',
  },
  eventDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginTop: '7px',
  },
  eventBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  eventTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
  },
  resultContent: {
    lineHeight: 1.8,
  },
  detailBlock: {
    marginBottom: '24px',
  },
  detailSummary: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  logGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '14px',
    marginTop: '14px',
  },
  smallHeading: {
    marginBottom: '8px',
    fontSize: '0.9rem',
  },
  pre: {
    maxHeight: '420px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    padding: '12px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82rem',
  },
};
