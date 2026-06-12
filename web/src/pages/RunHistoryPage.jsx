import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteRun, getRun, getRuns, getRunResult } from '../api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_LABELS = {
  succeeded: '成功',
  failed: '失败',
  running: '执行中',
  timeout: '超时',
  queued: '等待中',
  canceled: '已取消',
};

const STATUS_DOT = {
  succeeded: 'var(--success)',
  failed: 'var(--error)',
  running: 'var(--warn)',
  timeout: 'var(--error)',
  queued: 'var(--ink-tertiary)',
  canceled: 'var(--ink-tertiary)',
};

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN');
}

function formatDay(ts) {
  if (!ts) return '未知日期';
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  });
}

function formatClock(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatEventTime(ts) {
  if (!ts) return '--:--:--';
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getRunPreview(run) {
  if (run.status === 'running') {
    const event = run.latest_event;
    const stage = event?.title || '任务正在执行';
    const message = event?.message ? `：${event.message}` : '';
    return `${stage}${message}`;
  }
  const text = run.summary || run.stdout || run.stderr || run.resolved_prompt || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 180) || '暂无输出摘要';
}

function formatEventTitle(event) {
  if (event.type === 'stderr' && event.title === '收到错误输出') return '收到运行日志';
  return event.title;
}

function formatEventMessage(event) {
  if (event.type === 'stderr' && event.message === '执行过程中产生 stderr 输出') {
    return '执行引擎输出了运行日志';
  }
  return event.message;
}

function groupRunsByDay(runs) {
  return runs.reduce((groups, run) => {
    const key = formatDay(run.started_at || run.finished_at || run.startedAt || run.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
    return groups;
  }, new Map());
}

function getRunDuration(run, now = Date.now()) {
  if (!run) return null;
  if (run.duration_ms !== null && run.duration_ms !== undefined) return run.duration_ms;
  if (run.elapsed_ms !== null && run.elapsed_ms !== undefined && run.status !== 'running') return run.elapsed_ms;
  const started = run.started_at ? Date.parse(run.started_at) : null;
  if (run.status === 'running' && started) return Math.max(0, now - started);
  return null;
}

export default function RunHistoryPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const [runDetails, setRunDetails] = useState({});
  const [runResults, setRunResults] = useState({});
  const [loadingResults, setLoadingResults] = useState({});
  const [deletingRunId, setDeletingRunId] = useState(null);
  const [runToDelete, setRunToDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const runGroups = groupRunsByDay(runs);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRuns(taskId)
      .then((data) => {
        if (!cancelled) setRuns(data || []);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    const hasRunning = runs.some((run) => run.status === 'running');
    if (!hasRunning) return undefined;

    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      getRuns(taskId).then((data) => setRuns(data || [])).catch(() => {});
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [runs, taskId]);

  useEffect(() => {
    if (!expandedRunId) return undefined;
    const expandedRun = runs.find((run) => run.id === expandedRunId);
    if (expandedRun?.status !== 'running') return undefined;

    const pollDetail = setInterval(() => {
      getRun(expandedRunId)
        .then((detail) => setRunDetails((prev) => ({ ...prev, [expandedRunId]: detail })))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(pollDetail);
  }, [expandedRunId, runs]);

  const handleSelectRun = useCallback(async (run) => {
    navigate(`/runs/${run.id}`);
  }, [navigate]);

  const handleExpandRun = useCallback(async (run) => {
    setExpandedRunId((current) => (current === run.id ? null : run.id));
    if (runDetails[run.id] && (runResults[run.id] || loadingResults[run.id])) return;
    setLoadingResults((prev) => ({ ...prev, [run.id]: true }));
    try {
      const [detail, result] = await Promise.all([
        runDetails[run.id] ? Promise.resolve(runDetails[run.id]) : getRun(run.id),
        runResults[run.id] ? Promise.resolve(runResults[run.id]) : getRunResult(run.id).catch(() => null),
      ]);
      setRunDetails((prev) => ({ ...prev, [run.id]: detail }));
      setRunResults((prev) => ({ ...prev, [run.id]: result }));
    } catch {
      setRunResults((prev) => ({ ...prev, [run.id]: null }));
    } finally {
      setLoadingResults((prev) => ({ ...prev, [run.id]: false }));
    }
  }, [loadingResults, runDetails, runResults]);

  const toggleDay = useCallback((day) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  const handleRequestDeleteRun = useCallback((event, run) => {
    event.stopPropagation();
    if (run.status === 'running') {
      showToast('运行中的记录不能删除', 'error');
      return;
    }
    setRunToDelete(run);
  }, [showToast]);

  const handleCancelDeleteRun = useCallback(() => {
    if (deletingRunId) return;
    setRunToDelete(null);
  }, [deletingRunId]);

  const handleConfirmDeleteRun = useCallback(async () => {
    if (!runToDelete) return;
    const run = runToDelete;

    setDeletingRunId(run.id);
    try {
      await deleteRun(run.id);
      setRuns((prev) => prev.filter((item) => item.id !== run.id));
      setExpandedRunId((current) => (current === run.id ? null : current));
      setRunDetails((prev) => {
        const next = { ...prev };
        delete next[run.id];
        return next;
      });
      setRunResults((prev) => {
        const next = { ...prev };
        delete next[run.id];
        return next;
      });
      setLoadingResults((prev) => {
        const next = { ...prev };
        delete next[run.id];
        return next;
      });
      showToast('执行记录已删除');
    } catch (err) {
      showToast(err.message || '删除失败', 'error');
    } finally {
      setDeletingRunId(null);
      setRunToDelete(null);
    }
  }, [runToDelete, showToast]);

  if (loading) return <div className="loading-spinner">加载中...</div>;

  return (
    <div>
      <h1 className="section-title">执行历史</h1>

      <div style={styles.timeline}>
        {runs.length === 0 ? (
          <div className="empty-state">
            <h3>暂无执行记录</h3>
          </div>
        ) : (
          Array.from(runGroups.entries()).map(([day, dayRuns]) => {
            const collapsed = collapsedDays.has(day);
            return (
              <section key={day} style={styles.daySection}>
                <button
                  type="button"
                  style={styles.dayHeader}
                  onClick={() => toggleDay(day)}
                  aria-label={`${day}，${dayRuns.length} 次执行，${collapsed ? '已折叠' : '已展开'}`}
                >
                  <span style={styles.dayTitle}>{day}</span>
                  <span style={styles.chevron} aria-hidden="true">{collapsed ? '›' : '⌄'}</span>
                </button>

                {!collapsed && (
                  <div style={styles.dayRuns}>
                    {dayRuns.map((run) => {
                      const expanded = expandedRunId === run.id;
                      const detail = runDetails[run.id] || run;
                      const events = detail.events || [];
                      const result = runResults[run.id];
                      const isLoadingResult = loadingResults[run.id];
                      return (
                        <div key={run.id} style={styles.timelineRow}>
                          <div style={styles.timeRail}>
                            <div style={styles.clock}>{formatClock(run.started_at || run.finished_at || run.startedAt || run.createdAt)}</div>
                            <div
                              style={{
                                ...styles.dot,
                                backgroundColor: STATUS_DOT[run.status] || STATUS_DOT.queued,
                              }}
                            />
                          </div>
                          <article
                            className={`run-history-card${expanded ? ' is-expanded' : ''}`}
                            style={{ ...styles.runCard, ...(expanded ? styles.runCardExpanded : null) }}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label={`查看执行记录：${run.task_name || '未知任务'}，${STATUS_LABELS[run.status] || run.status}`}
                              style={styles.runSummaryButton}
                              onClick={() => handleSelectRun(run)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleSelectRun(run);
                                }
                              }}
                            >
                              <div style={styles.runCardHeader}>
                                <div style={styles.runTitleBlock}>
                                  <div style={styles.runTitle}>{run.task_name || '未知任务'}</div>
                                  <div className="text-tertiary text-sm">
                                    {formatTime(run.started_at || run.finished_at || run.startedAt || run.createdAt)}
                                  </div>
                                </div>
                                <div style={styles.runBadges}>
                                  <span className="badge badge-accent">{run.engine || '-'}</span>
                                  <span
                                    className={`badge ${
                                      run.status === 'succeeded'
                                        ? 'badge-success'
                                        : run.status === 'failed' || run.status === 'timeout'
                                          ? 'badge-error'
                                          : run.status === 'running'
                                            ? 'badge-warn'
                                            : 'badge-neutral'
                                    }`}
                                  >
                                    {STATUS_LABELS[run.status] || run.status}
                                  </span>
                                </div>
                              </div>
                              <p style={styles.runPreview}>{getRunPreview(run)}</p>
                              <div style={styles.runFooter}>
                                <span className="text-mono text-sm">{run.id?.slice(0, 8)}</span>
                                <span>{run.trigger_type === 'manual' ? '手动触发' : run.trigger_type || '触发'}</span>
                                <span>
                                  {run.status === 'running' ? '已执行 ' : '耗时 '}
                                  {formatDuration(getRunDuration(run, now))}
                                </span>
                              </div>
                            </div>
                            <div style={styles.runActions}>
                              <button
                                type="button"
                                style={styles.expandButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleExpandRun(run);
                                }}
                              >
                                {expanded ? '收起' : '预览'}
                              </button>
                              <button
                                type="button"
                                style={styles.deleteRunButton}
                                onClick={(event) => handleRequestDeleteRun(event, run)}
                                disabled={run.status === 'running' || deletingRunId === run.id}
                                title={run.status === 'running' ? '运行中的记录不能删除' : '删除执行记录'}
                              >
                                {deletingRunId === run.id ? '删除中' : '删除'}
                              </button>
                            </div>

                            {expanded && (
                              <div style={styles.inlineResult}>
                                <div style={styles.runDetailGrid}>
                                  <div style={styles.detailItem}>
                                    <span>状态</span>
                                    <strong>{STATUS_LABELS[detail.status] || detail.status}</strong>
                                  </div>
                                  <div style={styles.detailItem}>
                                    <span>开始</span>
                                    <strong>{formatTime(detail.started_at)}</strong>
                                  </div>
                                  <div style={styles.detailItem}>
                                    <span>结束</span>
                                    <strong>{formatTime(detail.finished_at)}</strong>
                                  </div>
                                  <div style={styles.detailItem}>
                                    <span>{detail.status === 'running' ? '已运行' : '耗时'}</span>
                                    <strong>{formatDuration(getRunDuration(detail, now))}</strong>
                                  </div>
                                </div>

                                <div style={styles.progressBlock}>
                                  <div style={styles.inlineResultHeader}>
                                    <span>执行进度</span>
                                    <span className="text-mono text-sm">{events.length} 个事件</span>
                                  </div>
                                  {events.length > 0 ? (
                                    <div style={styles.eventList}>
                                      {events.map((event) => (
                                        <div key={event.id} style={styles.eventRow}>
                                          <span style={styles.eventTime}>{formatEventTime(event.created_at)}</span>
                                          <span style={styles.eventDot} />
                                          <div style={styles.eventBody}>
                                            <strong>{formatEventTitle(event)}</strong>
                                            {formatEventMessage(event) ? <span>{formatEventMessage(event)}</span> : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-tertiary">暂无进度事件</div>
                                  )}
                                </div>

                                <div style={styles.inlineResultHeader}>
                                  <span>执行结果</span>
                                  <span className="text-mono text-sm">{run.id?.slice(0, 8)}</span>
                                </div>
                                {isLoadingResult ? (
                                  <div className="text-tertiary">加载结果中...</div>
                                ) : result ? (
                                  <div className="markdown-body" style={styles.resultContent}>
                                    {typeof result === 'string' ? (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                                    ) : result.output || result.result ? (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output || result.result}</ReactMarkdown>
                                    ) : (
                                      <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-tertiary">暂无结果内容</div>
                                )}
                              </div>
                            )}
                          </article>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
      <ConfirmDialog
        open={!!runToDelete}
        title="删除执行记录？"
        message="删除后，这条执行记录和对应的结果文件都会被移除，无法在历史里继续查看。"
        confirmText="删除"
        cancelText="返回"
        danger
        loading={!!deletingRunId}
        onCancel={handleCancelDeleteRun}
        onConfirm={handleConfirmDeleteRun}
      />
    </div>
  );
}

const styles = {
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  daySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  dayHeader: {
    width: '180px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'left',
    padding: '8px 0 8px 18px',
    borderBottom: '1px solid var(--border)',
  },
  dayTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.05rem',
    fontWeight: 600,
    color: 'var(--ink)',
  },
  chevron: {
    color: 'var(--accent)',
    fontSize: '1.2rem',
    fontWeight: 600,
    lineHeight: 1,
  },
  dayRuns: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    position: 'relative',
  },
  timelineRow: {
    display: 'grid',
    gridTemplateColumns: '180px minmax(0, 1fr)',
    gap: '16px',
    position: 'relative',
  },
  timeRail: {
    position: 'relative',
    minHeight: '104px',
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '14px',
    borderRight: '1px solid var(--border)',
  },
  clock: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--ink)',
    paddingRight: '18px',
  },
  dot: {
    position: 'absolute',
    right: '-5px',
    top: '22px',
    width: '11px',
    height: '11px',
    borderRadius: '50%',
    boxShadow: '0 0 0 4px var(--surface)',
    zIndex: 1,
  },
  runCard: {
    position: 'relative',
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 1px 2px rgba(26,25,21,0.04)',
    overflow: 'hidden',
  },
  runCardExpanded: {
    borderColor: 'var(--border-strong)',
    boxShadow: 'var(--shadow-sm)',
  },
  runSummaryButton: {
    width: '100%',
    textAlign: 'left',
    padding: '18px 20px',
    cursor: 'pointer',
  },
  runCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '12px',
  },
  runTitleBlock: {
    minWidth: 0,
  },
  runTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: '4px',
  },
  runBadges: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  runActions: {
    position: 'absolute',
    right: '18px',
    bottom: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 2,
  },
  deleteRunButton: {
    color: 'var(--error)',
    fontSize: '0.82rem',
    fontWeight: 500,
    padding: '4px 6px',
    borderRadius: 'var(--radius-sm)',
  },
  expandButton: {
    color: 'var(--accent)',
    fontSize: '0.82rem',
    fontWeight: 500,
    padding: '2px 4px',
  },
  runPreview: {
    fontSize: '0.92rem',
    lineHeight: 1.7,
    color: 'var(--ink-secondary)',
    marginBottom: '14px',
  },
  runFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 14px',
    color: 'var(--ink-tertiary)',
    fontSize: '0.82rem',
  },
  resultContent: {
    fontFamily: 'var(--font-body)',
    lineHeight: '1.8',
  },
  runDetailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '18px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    minWidth: 0,
  },
  progressBlock: {
    marginBottom: '20px',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingRight: '6px',
    overscrollBehavior: 'contain',
  },
  eventRow: {
    display: 'grid',
    gridTemplateColumns: '74px 12px minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'flex-start',
  },
  eventTime: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    color: 'var(--ink-tertiary)',
    paddingTop: '2px',
  },
  eventDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    background: 'var(--accent)',
    marginTop: '6px',
    boxShadow: '0 0 0 4px var(--bg)',
  },
  eventBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--ink-secondary)',
    lineHeight: 1.55,
  },
  inlineResult: {
    borderTop: '1px solid var(--border)',
    padding: '18px 20px 22px',
    background: 'linear-gradient(180deg, var(--bg), var(--surface) 120px)',
  },
  inlineResultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    color: 'var(--ink)',
  },
  pre: {
    background: 'var(--bg)',
    padding: '16px',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.85rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '600px',
    overflowY: 'auto',
  },
};
