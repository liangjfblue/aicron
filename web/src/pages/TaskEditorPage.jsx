import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTask,
  createTask,
  updateTask,
  testRun,
  dryRun,
  analyzeTaskImport,
  analyzeCron,
} from '../api/client';
import CronPresets from '../components/CronPresets';
import CronFieldGuide from '../components/CronFieldGuide';
import PromptEditor from '../components/PromptEditor';
import { formatMarkdownText } from '../utils/formatMarkdown';
import { getCronPresetLabel } from '../utils/cronPresets';

const EMPTY_TASK = {
  name: '',
  description: '',
  cron: '0 9 * * *',
  activeStartAt: '',
  activeEndAt: '',
  scheduleSegments: [],
  engine: 'claude',
  timeout: 300,
  prompt: '',
  chainParentId: '',
  autoIncludeLastResult: false,
  tags: [],
  feishuNotify: true,
  feishuMode: 'full',
  feishuChatIds: [],
  enabled: true,
};

const TIMEOUT_UNLIMITED = null;
const CONFIDENCE_FIELD_LABELS = {
  name: '任务名称',
  description: '描述',
  cron_expression: 'Cron',
  tags: '标签',
};
const CONFIDENCE_LEVEL_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
};

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeScheduleSegments(value) {
  const parsed = parseJsonArray(value);
  return parsed
    .filter((segment) => segment && typeof segment === 'object')
    .map((segment) => ({
      label: segment.label || '',
      cron_expression: segment.cron_expression || segment.cronExpression || '',
      active_start_at: segment.active_start_at || segment.activeStartAt || '',
      active_end_at: segment.active_end_at || segment.activeEndAt || '',
    }));
}

function formatDateTimeValue(value) {
  if (!value) return '';
  return value.replace('T', ' ').replace(/:00$/, '');
}

function summarizeCron(cron) {
  return getCronPresetLabel(cron) || cron || '未设置 Cron';
}

function formatActiveWindowBadge(start, end) {
  const startText = formatDateTimeValue(start);
  const endText = formatDateTimeValue(end);
  if (startText && endText) {
    const [startDate, startTime] = startText.split(' ');
    const [endDate, endTime] = endText.split(' ');
    if (startDate && startDate === endDate && startTime && endTime) {
      return `${startDate} ${startTime} → ${endTime}`;
    }
    return `${startText} → ${endText}`;
  }
  if (startText) return `${startText} 起`;
  if (endText) return `截至 ${endText}`;
  return '';
}

function summarizeScheduleSegment(segment, index) {
  const label = segment.label ? `${segment.label} · ` : '';
  const range = formatActiveWindowBadge(segment.active_start_at, segment.active_end_at) || '不限时间';
  return `第 ${index + 1} 段 · ${label}${summarizeCron(segment.cron_expression)} · ${range}`;
}

function formatTagText(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function parseTagText(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getWindowMode(start, end) {
  if (start && end) return 'range';
  if (start) return 'start';
  if (end) return 'end';
  return 'none';
}

function toFormTask(data = {}) {
  return {
    ...EMPTY_TASK,
    ...data,
    cron: data.cron_expression ?? data.cron ?? EMPTY_TASK.cron,
    activeStartAt: data.active_start_at ?? data.activeStartAt ?? EMPTY_TASK.activeStartAt,
    activeEndAt: data.active_end_at ?? data.activeEndAt ?? EMPTY_TASK.activeEndAt,
    scheduleSegments: normalizeScheduleSegments(data.schedule_segments ?? data.scheduleSegments),
    timeout: data.timeout_seconds ?? data.timeout ?? TIMEOUT_UNLIMITED,
    prompt: data.prompt_template ?? data.prompt ?? EMPTY_TASK.prompt,
    chainParentId: data.chain_parent_id ?? data.chainParentId ?? EMPTY_TASK.chainParentId,
    autoIncludeLastResult:
      data.auto_include_last_result ?? data.autoIncludeLastResult ?? EMPTY_TASK.autoIncludeLastResult,
    feishuMode: data.feishu_mode ?? data.feishuMode ?? EMPTY_TASK.feishuMode,
    feishuChatIds: parseJsonArray(data.feishu_chat_ids ?? data.feishuChatIds),
    tags: Array.isArray(data.tags) ? data.tags : EMPTY_TASK.tags,
  };
}

function toApiTask(task) {
  const timeoutSeconds =
    task.timeout === TIMEOUT_UNLIMITED || task.timeout === ''
      ? null
      : Number(task.timeout);
  return {
    name: task.name.trim(),
    description: task.description || '',
    prompt_template: task.prompt,
    engine: task.engine,
    cron_expression: task.cron || null,
    active_start_at: task.activeStartAt || null,
    active_end_at: task.activeEndAt || null,
    schedule_segments: JSON.stringify(task.scheduleSegments || []),
    timeout_seconds: Number.isFinite(timeoutSeconds) ? timeoutSeconds : null,
    chain_parent_id: task.chainParentId || null,
    auto_include_last_result: Boolean(task.autoIncludeLastResult),
    feishu_mode: task.feishuMode || 'full',
    feishu_chat_ids: JSON.stringify(task.feishuChatIds || []),
    notify_on_change: false,
    tags: JSON.stringify(task.tags || []),
  };
}

export default function TaskEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [task, setTask] = useState(EMPTY_TASK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importDraft, setImportDraft] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [cronText, setCronText] = useState('');
  const [cronDraft, setCronDraft] = useState(null);
  const [cronAnalyzing, setCronAnalyzing] = useState(false);
  const [tagText, setTagText] = useState(formatTagText(EMPTY_TASK.tags));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cronGuideOpen, setCronGuideOpen] = useState(false);
  const [activeWindowMode, setActiveWindowMode] = useState('none');
  const [expandedScheduleSegment, setExpandedScheduleSegment] = useState(null);
  const promptPreviewTask = useMemo(
    () => ({ name: task.name, description: task.description }),
    [task.name, task.description]
  );
  const scheduleSegmentCount = (task.scheduleSegments || []).length;
  const selectedScheduleSegmentIndex =
    scheduleSegmentCount > 0
      ? Math.min(Math.max(expandedScheduleSegment ?? 0, 0), scheduleSegmentCount - 1)
      : null;
  const selectedScheduleSegment =
    selectedScheduleSegmentIndex === null ? null : task.scheduleSegments[selectedScheduleSegmentIndex];
  const activeWindowBadge = formatActiveWindowBadge(task.activeStartAt, task.activeEndAt);
  const collapsedScheduleSummary =
    scheduleSegmentCount > 0
      ? `${summarizeScheduleSegment(task.scheduleSegments[0], 0)}${
          scheduleSegmentCount > 1 ? `，另 ${scheduleSegmentCount - 1} 段` : ''
        }`
      : activeWindowBadge || '不限时间';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!isEdit) return;
    getTask(id)
      .then((data) => {
        const formTask = toFormTask(data);
        setTask(formTask);
        setTagText(formatTagText(formTask.tags));
        setActiveWindowMode(getWindowMode(formTask.activeStartAt, formTask.activeEndAt));
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const update = (field, value) => {
    setTask((prev) => ({ ...prev, [field]: value }));
  };

  const updateScheduleSegment = (index, field, value) => {
    setTask((prev) => ({
      ...prev,
      scheduleSegments: (prev.scheduleSegments || []).map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, [field]: value } : segment
      ),
    }));
  };

  const updateTagsText = (value) => {
    setTagText(value);
    update('tags', parseTagText(value));
  };

  const selectScheduleSegment = (index) => {
    if (scheduleSegmentCount === 0) return;
    setExpandedScheduleSegment(Math.min(Math.max(index, 0), scheduleSegmentCount - 1));
  };

  const addScheduleSegment = () => {
    const nextIndex = (task.scheduleSegments || []).length;
    setScheduleOpen(true);
    setTask((prev) => ({
      ...prev,
      scheduleSegments: [
        ...(prev.scheduleSegments || []),
        { label: '', cron_expression: prev.cron || '0 9 * * 1', active_start_at: '', active_end_at: '' },
      ],
    }));
    setExpandedScheduleSegment(nextIndex);
  };

  const updateActiveWindowMode = (mode) => {
    setActiveWindowMode(mode);
    if (mode === 'none') {
      setTask((prev) => ({ ...prev, activeStartAt: '', activeEndAt: '' }));
    } else if (mode === 'start') {
      setTask((prev) => ({ ...prev, activeEndAt: '' }));
    } else if (mode === 'end') {
      setTask((prev) => ({ ...prev, activeStartAt: '' }));
    }
  };

  const removeScheduleSegment = (index) => {
    setTask((prev) => ({
      ...prev,
      scheduleSegments: (prev.scheduleSegments || []).filter((_, segmentIndex) => segmentIndex !== index),
    }));
    setExpandedScheduleSegment((current) => {
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  };

  const formatTextValue = (value, applyValue) => {
    const formatted = formatMarkdownText(value || '');
    if (formatted === (value || '')) {
      showToast('格式已经很干净了');
      return;
    }
    applyValue(formatted);
    showToast('格式已整理');
  };

  const handleFormatImportText = () => {
    if (!importText.trim()) {
      showToast('请先粘贴内容', 'error');
      return;
    }
    formatTextValue(importText, setImportText);
  };

  const handleAnalyzeImport = async () => {
    const text = importText.trim();
    if (!text) {
      showToast('请先粘贴要导入的内容', 'error');
      return;
    }

    setImporting(true);
    setImportDraft(null);
    setImportError(null);
    try {
      const draft = await analyzeTaskImport(text);
      setImportDraft(draft);
      showToast('AI 解析完成');
    } catch (err) {
      setImportError(err.details || { error: err.message });
      showToast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleAnalyzeCron = async () => {
    const text = cronText.trim();
    if (!text) {
      showToast('请先输入定时描述', 'error');
      return;
    }
    setCronAnalyzing(true);
    setCronDraft(null);
    try {
      const draft = await analyzeCron(text);
      setCronDraft(draft);
      showToast('Cron 已生成');
    } catch (err) {
      showToast(err.message || 'Cron 生成失败', 'error');
    } finally {
      setCronAnalyzing(false);
    }
  };

  const handleApplyCronDraft = () => {
    if (!cronDraft?.cron_expression) {
      showToast('这个描述不能稳定生成 Cron，请手动设置', 'error');
      return;
    }
    setTask((prev) => {
      if ((prev.scheduleSegments || []).length > 0 && selectedScheduleSegmentIndex !== null) {
        return {
          ...prev,
          scheduleSegments: prev.scheduleSegments.map((segment, index) =>
            index === selectedScheduleSegmentIndex
              ? { ...segment, cron_expression: cronDraft.cron_expression }
              : segment
          ),
        };
      }
      return { ...prev, cron: cronDraft.cron_expression };
    });
    setScheduleOpen(true);
    showToast('Cron 已应用到调度设置');
  };

  const handleApplyImportDraft = () => {
    if (!importDraft) return;
    const nextTags = Array.isArray(importDraft.tags) ? importDraft.tags : task.tags;
    setTask((prev) => ({
      ...prev,
      name: importDraft.name || prev.name,
      description: importDraft.description || prev.description,
      prompt: importDraft.prompt_template || prev.prompt,
      engine: importDraft.engine || prev.engine,
      cron: importDraft.cron_expression || '',
      scheduleSegments: importDraft.schedule_segments
        ? normalizeScheduleSegments(importDraft.schedule_segments)
        : prev.scheduleSegments,
      timeout: importDraft.timeout_seconds ?? prev.timeout,
      feishuMode: importDraft.feishu_mode || prev.feishuMode,
      tags: nextTags,
    }));
    setTagText(formatTagText(nextTags));
    setTestResult(null);
    setImportError(null);
    setImportOpen(false);
    setExpandedScheduleSegment(null);
    showToast('已应用 AI 解析草稿');
  };

  const handleCloseImport = () => {
    if (importing) return;
    setImportOpen(false);
  };

  const handleSave = async () => {
    if (!task.name.trim()) {
      showToast('请输入任务名称', 'error');
      return;
    }
    if (!task.prompt.trim()) {
      showToast('请输入 Agent 任务模板', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = toApiTask(task);
      if (isEdit) {
        await updateTask(id, payload);
        showToast('任务已更新');
      } else {
        const created = await createTask(payload);
        showToast('任务已创建');
        navigate(`/tasks/${created.id}/edit`, { replace: true });
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestRun = async () => {
    setTestResult(null);
    showToast('测试执行已开始');
    try {
      const result = await testRun(toApiTask(task));
      setTestResult(result);
      if (result.status === 'succeeded') {
        showToast('测试执行完成，不发送飞书通知');
      } else if (result.status === 'timeout') {
        showToast('测试执行超时', 'error');
      } else {
        showToast(result.output || result.stderr || '测试执行失败', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDryRun = async () => {
    try {
      const result = await dryRun(id);
      setTestResult(result);
      showToast('预演完成');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) return <div className="loading-spinner">加载中...</div>;

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div className="flex-between" style={styles.editorTopbar}>
        <h1 className="section-title" style={{ marginBottom: 0 }}>
          {isEdit ? '编辑任务' : '新建任务'}
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/')} type="button">
            返回
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setImportOpen((open) => !open)}
            type="button"
          >
            AI 解析导入
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {isEdit ? (
            <button className="btn btn-secondary" onClick={handleDryRun} type="button">
              预演
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={handleTestRun} type="button">
            测试执行
          </button>
        </div>
      </div>

      {importOpen && (
        <div style={styles.modalOverlay} role="presentation" onMouseDown={handleCloseImport}>
          <div
            className="card"
            style={styles.importModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-import-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={styles.importHeader}>
              <div>
                <h3 id="ai-import-title" style={styles.importTitle}>AI 解析导入</h3>
                <p style={styles.importDesc}>
                  粘贴半整理内容，或直接粘贴 AICron 任务模板整包；确认后再应用，不会直接保存任务。
                </p>
              </div>
              <div style={styles.importActions}>
                <button className="btn btn-secondary" type="button" onClick={handleCloseImport} disabled={importing}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleAnalyzeImport}
                  disabled={importing}
                >
                  {importing ? '解析中...' : 'AI 解析'}
                </button>
              </div>
            </div>
            <div style={styles.importBody}>
              <div style={styles.importInputPane}>
                <div style={styles.paneHeader}>
                  <span style={styles.paneTitle}>原始内容</span>
                  <div style={styles.paneTools}>
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={handleFormatImportText}
                      disabled={importing || !importText}
                    >
                      整理格式
                    </button>
                    <span className="text-tertiary text-sm">{importText.length} 字</span>
                  </div>
                </div>
                <textarea
                  className="form-textarea"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="可粘贴 AICron 任务模板整包，或把 /your-skill、【持久上下文】、【本次任务】、【输出要求】等内容粘贴到这里..."
                  style={styles.importTextarea}
                />
              </div>

              <div style={styles.importResultPane}>
                <div style={styles.cronAssistantBox}>
                  <div style={styles.cronAssistantHeader}>
                    <div>
                      <strong>自然语言生成 Cron</strong>
                      <div className="text-tertiary text-sm">例如：每周一早上 9 点、每个工作日 18:30</div>
                    </div>
                  </div>
                  <div style={styles.cronAssistantRow}>
                    <input
                      className="form-input"
                      value={cronText}
                      onChange={(event) => setCronText(event.target.value)}
                      placeholder="输入定时描述"
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={handleAnalyzeCron}
                      disabled={cronAnalyzing}
                    >
                      {cronAnalyzing ? '生成中...' : '生成'}
                    </button>
                  </div>
                  {cronDraft ? (
                    <div style={styles.cronDraftBox}>
                      <span className="text-mono">{cronDraft.cron_expression || '无法稳定生成 Cron'}</span>
                      <span className={`badge ${
                        cronDraft.confidence === 'high'
                          ? 'badge-success'
                          : cronDraft.confidence === 'medium'
                            ? 'badge-warn'
                            : 'badge-neutral'
                      }`}>
                        可信度：{CONFIDENCE_LEVEL_LABELS[cronDraft.confidence] || cronDraft.confidence}
                      </span>
                      <span style={styles.cronDraftExplanation}>{cronDraft.explanation}</span>
                      <button className="btn btn-primary btn-sm" type="button" onClick={handleApplyCronDraft}>
                        应用 Cron
                      </button>
                    </div>
                  ) : null}
                </div>

                <div style={styles.importDraftHeader}>
                  <h4 style={styles.importDraftTitle}>表单草稿</h4>
                  {importDraft && (
                    <button className="btn btn-primary btn-sm" type="button" onClick={handleApplyImportDraft}>
                      应用到表单
                    </button>
                  )}
                </div>
                {importDraft ? (
                  <div style={styles.draftGrid}>
                    {importDraft.confidence && (
                      <div style={{ ...styles.draftItem, ...styles.confidenceItem, gridColumn: '1 / -1' }}>
                        <span style={styles.draftLabel}>解析可信度</span>
                        <div style={styles.confidenceRow}>
                          {Object.entries(importDraft.confidence).map(([field, level]) => (
                            <span key={field} className={`badge ${
                              level === 'high' ? 'badge-success' : level === 'medium' ? 'badge-warn' : 'badge-neutral'
                            }`}>
                              {CONFIDENCE_FIELD_LABELS[field] || field}：{CONFIDENCE_LEVEL_LABELS[level] || level}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={styles.draftItem}>
                      <span style={styles.draftLabel}>任务名称</span>
                      <strong>{importDraft.name || '未识别'}</strong>
                    </div>
                    <div style={styles.draftItem}>
                      <span style={styles.draftLabel}>执行引擎</span>
                      <strong>{importDraft.engine || 'claude'}</strong>
                    </div>
                    <div style={styles.draftItem}>
                      <span style={styles.draftLabel}>Cron</span>
                      <strong>{importDraft.cron_expression || '未设置'}</strong>
                    </div>
                    <div style={styles.draftItem}>
                      <span style={styles.draftLabel}>超时</span>
                      <strong>{importDraft.timeout_seconds ? `${importDraft.timeout_seconds}s` : '未设置'}</strong>
                    </div>
                    <div style={{ ...styles.draftItem, gridColumn: '1 / -1' }}>
                      <span style={styles.draftLabel}>描述</span>
                      <span>{importDraft.description || '未识别'}</span>
                    </div>
                    <div style={{ ...styles.draftItem, gridColumn: '1 / -1' }}>
                      <span style={styles.draftLabel}>标签</span>
                      <span>{(importDraft.tags || []).join(' / ') || '无'}</span>
                    </div>
                    {(importDraft.schedule_segments || []).length > 0 && (
                      <div style={{ ...styles.draftItem, gridColumn: '1 / -1' }}>
                        <span style={styles.draftLabel}>多段调度</span>
                        <span>
                          {importDraft.schedule_segments
                            .map((segment) =>
                              `${segment.label || '未命名'}：${segment.cron_expression || '需手动设置'}${segment.notes ? `（${segment.notes}）` : ''}`
                            )
                            .join('；')}
                        </span>
                      </div>
                    )}
                    {(importDraft.schedule_segments || []).some((segment) => !segment.cron_expression || segment.notes) && (
                      <div style={{ ...styles.draftItem, ...styles.warningDraftItem, gridColumn: '1 / -1' }}>
                        <span style={styles.draftLabel}>需要确认</span>
                        <span>
                          {(importDraft.schedule_segments || [])
                            .filter((segment) => !segment.cron_expression || segment.notes)
                            .map((segment) => `${segment.label || '未命名'}：${segment.notes || 'Cron 未设置'}`)
                            .join('；')}
                        </span>
                      </div>
                    )}
                    <div style={{ ...styles.draftItem, gridColumn: '1 / -1' }}>
                      <span style={styles.draftLabel}>说明</span>
                      <span>{(importDraft.notes || []).join('；') || '无'}</span>
                    </div>
                    <div style={{ ...styles.draftItem, gridColumn: '1 / -1' }}>
                      <span style={styles.draftLabel}>模板来源</span>
                      <span>应用时 Agent 任务模板会使用左侧原文，包括 /xxx skill 调用前缀；AI 只提取表单字段。</span>
                    </div>
                  </div>
                ) : importError ? (
                  <div style={styles.importErrorBox}>
                    <strong>{importError.error || 'AI 解析失败'}</strong>
                    {importError.parse_message && (
                      <span style={styles.errorDetail}>JSON 错误：{importError.parse_message}</span>
                    )}
                    {importError.raw_output && (
                      <pre style={styles.rawOutputPre}>{importError.raw_output}</pre>
                    )}
                  </div>
                ) : (
                  <div style={styles.emptyDraft}>
                    <strong>先粘贴内容，再点击 AI 解析</strong>
                    <span>如果包含“建议任务信息”和“Agent 任务模板”，会自动提取表格字段和模板代码块。</span>
                    <span>普通半结构化内容则会由 AI 提取任务名称、描述、引擎、Cron、超时、标签和说明。</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={styles.columns}>
        {/* Left column */}
        <div style={styles.leftCol}>
          <div className="card" style={styles.formCard}>
            <div className="form-group">
              <label className="form-label">任务名称 *</label>
              <input
                className="form-input"
                value={task.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="例如：每日新闻摘要"
              />
            </div>

            <div className="form-group">
              <label className="form-label">描述</label>
              <textarea
                className="form-textarea"
                value={task.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="简要描述任务目的"
                rows={2}
              />
            </div>

            <div className="form-group" style={styles.cronFieldBlock}>
              <div style={styles.cronFieldHeader}>
                <label className="form-label" style={styles.cronTitle}>Cron 调度</label>
              </div>
              {scheduleSegmentCount === 0 ? (
                <>
                <div style={styles.cronInlineWithHelpRow}>
                  <input
                    className="form-input text-mono"
                    value={task.cron}
                    onChange={(e) => update('cron', e.target.value)}
                    placeholder="0 9 * * *"
                    style={styles.cronInput}
                  />
                  <CronPresets value={task.cron} onChange={(c) => update('cron', c)} variant="select" />
                  <button
                    type="button"
                    style={styles.cronHelpButton}
                    onClick={() => setCronGuideOpen((open) => !open)}
                    aria-label={cronGuideOpen ? '隐藏 Cron 字段说明' : '查看 Cron 字段说明'}
                    aria-expanded={cronGuideOpen}
                    title={cronGuideOpen ? '隐藏 Cron 字段说明' : '查看 Cron 字段说明'}
                  >
                    ?
                  </button>
                </div>
                <div style={styles.scheduleStatusRow}>
                  <span style={styles.scheduleStatusBadge}>
                    <span style={styles.scheduleStatusLabel}>频率</span>
                    {summarizeCron(task.cron)}
                  </span>
                  {activeWindowBadge ? (
                    <span style={styles.scheduleStatusBadge} title={activeWindowBadge}>
                      <span style={styles.scheduleStatusLabel}>有效期</span>
                      {activeWindowBadge}
                    </span>
                  ) : null}
                </div>
                {cronGuideOpen ? <CronFieldGuide /> : null}
                </>
              ) : null}

              <div style={styles.schedulePanel}>
              <div
                style={styles.schedulePanelHeader}
              >
                <span style={styles.scheduleHeaderText}>
                  <span className="form-label" style={styles.schedulePanelTitle}>
                    {scheduleSegmentCount > 0 ? '多段调度' : '有效期 / 多段'}
                  </span>
                  <span style={styles.scheduleHeaderBadge}>
                    {scheduleSegmentCount > 0 ? `${scheduleSegmentCount} 段` : collapsedScheduleSummary}
                  </span>
                </span>
                <span style={styles.scheduleHeaderActions}>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    onClick={addScheduleSegment}
                  >
                    {scheduleSegmentCount > 0 ? '添加一段' : '添加多段'}
                  </button>
                  <button
                    type="button"
                    style={styles.scheduleHeaderAction}
                    onClick={() => setScheduleOpen((open) => !open)}
                    aria-expanded={scheduleOpen}
                  >
                    {scheduleOpen ? '收起' : scheduleSegmentCount > 0 ? '编辑' : '修改'}
                  </button>
                </span>
              </div>

              {scheduleOpen ? (
                <>
                  <div
                    style={{
                      ...styles.schedulePanelBody,
                      ...(scheduleSegmentCount > 0 ? styles.schedulePanelBodySegmentMode : null),
                    }}
                  >
                    {scheduleSegmentCount === 0 ? (
                      <div style={styles.scheduleBlock}>
                        <div style={styles.scheduleBlockHeader}>
                          <span style={styles.scheduleBlockTitle}>时间范围</span>
                        </div>
                        <div style={styles.scheduleCompactGrid}>
                          <div className="form-group">
                            <label className="form-label">生效区间</label>
                            <select
                              className="form-select"
                              value={activeWindowMode}
                              onChange={(e) => updateActiveWindowMode(e.target.value)}
                            >
                              <option value="none">不限时间</option>
                              <option value="start">指定开始时间</option>
                              <option value="end">指定结束时间</option>
                              <option value="range">指定时间区间</option>
                            </select>
                            {activeWindowMode !== 'none' ? (
                              <div style={styles.activeWindowGrid}>
                                {activeWindowMode === 'start' || activeWindowMode === 'range' ? (
                                  <input
                                    className="form-input"
                                    type="datetime-local"
                                    value={task.activeStartAt || ''}
                                    onChange={(e) => update('activeStartAt', e.target.value)}
                                    aria-label="生效开始时间"
                                  />
                                ) : null}
                                {activeWindowMode === 'end' || activeWindowMode === 'range' ? (
                                  <input
                                    className="form-input"
                                    type="datetime-local"
                                    value={task.activeEndAt || ''}
                                    onChange={(e) => update('activeEndAt', e.target.value)}
                                    aria-label="生效结束时间"
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {selectedScheduleSegment ? (
                      <div style={{ ...styles.scheduleBlock, ...styles.scheduleSegmentEditor }}>
                        <div style={styles.segmentHeaderRow}>
                          <div style={styles.segmentPager}>
                            <button
                              type="button"
                              style={styles.segmentNavButton}
                              onClick={() => selectScheduleSegment(selectedScheduleSegmentIndex - 1)}
                              disabled={selectedScheduleSegmentIndex === 0}
                              aria-label="上一段"
                            >
                              ‹
                            </button>
                          <div style={styles.segmentPagerText}>
                            <strong>
                              第 {selectedScheduleSegmentIndex + 1} / {scheduleSegmentCount} 段
                            </strong>
                            <span className="text-tertiary text-sm">
                              {selectedScheduleSegment.label || '未命名阶段'}
                            </span>
                          </div>
                            <button
                              type="button"
                              style={styles.segmentNavButton}
                              onClick={() => selectScheduleSegment(selectedScheduleSegmentIndex + 1)}
                              disabled={selectedScheduleSegmentIndex === scheduleSegmentCount - 1}
                              aria-label="下一段"
                            >
                              ›
                            </button>
                          </div>
                          <button
                            type="button"
                            style={styles.segmentDeleteButton}
                            onClick={() => removeScheduleSegment(selectedScheduleSegmentIndex)}
                            aria-label={`删除第 ${selectedScheduleSegmentIndex + 1} 段调度`}
                            title="删除当前段"
                          >
                            删除
                          </button>
                        </div>

                        <div style={styles.scheduleSegmentDetail}>
                          <input
                            className="form-input"
                            value={selectedScheduleSegment.label || ''}
                            onChange={(e) =>
                              updateScheduleSegment(selectedScheduleSegmentIndex, 'label', e.target.value)
                            }
                            placeholder="阶段名称，例如：解禁风险窗口"
                          />
                          <div style={styles.cronInlineRow}>
                            <input
                              className="form-input text-mono"
                              value={selectedScheduleSegment.cron_expression || ''}
                              onChange={(e) =>
                                updateScheduleSegment(selectedScheduleSegmentIndex, 'cron_expression', e.target.value)
                              }
                              placeholder="Cron，例如：0 9 * * 1"
                              style={styles.cronInput}
                            />
                            <CronPresets
                              value={selectedScheduleSegment.cron_expression || ''}
                              onChange={(cron) =>
                                updateScheduleSegment(selectedScheduleSegmentIndex, 'cron_expression', cron)
                              }
                              variant="select"
                            />
                          </div>
                          <div style={styles.segmentDateTimeStack}>
                            <label style={styles.segmentDateTimeField}>
                              <span className="form-label">开始</span>
                              <input
                                className="form-input"
                                type="datetime-local"
                                value={selectedScheduleSegment.active_start_at || ''}
                                onChange={(e) =>
                                  updateScheduleSegment(selectedScheduleSegmentIndex, 'active_start_at', e.target.value)
                                }
                                aria-label={`第 ${selectedScheduleSegmentIndex + 1} 段生效开始时间`}
                              />
                            </label>
                            <label style={styles.segmentDateTimeField}>
                              <span className="form-label">结束</span>
                              <input
                                className="form-input"
                                type="datetime-local"
                                value={selectedScheduleSegment.active_end_at || ''}
                                onChange={(e) =>
                                  updateScheduleSegment(selectedScheduleSegmentIndex, 'active_end_at', e.target.value)
                                }
                                aria-label={`第 ${selectedScheduleSegmentIndex + 1} 段生效结束时间`}
                              />
                            </label>
                          </div>
                          {selectedScheduleSegment.notes ? (
                            <div style={styles.segmentNotice}>
                              {selectedScheduleSegment.notes}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div style={styles.scheduleCollapsedSummary} title={collapsedScheduleSummary}>
                  {collapsedScheduleSummary}
                </div>
              )}
            </div>
            </div>

            <div style={styles.twoColumnRow}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">执行引擎</label>
                <select
                  className="form-select"
                  value={task.engine}
                  onChange={(e) => update('engine', e.target.value)}
                >
                  <option value="claude">Claude</option>
                  <option value="codex">Codex</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">超时</label>
                <div style={styles.timeoutRow}>
                  <select
                    className="form-select"
                    value={task.timeout === TIMEOUT_UNLIMITED ? 'unlimited' : 'limited'}
                    onChange={(e) => {
                      update('timeout', e.target.value === 'unlimited' ? TIMEOUT_UNLIMITED : task.timeout || 300);
                    }}
                  >
                    <option value="limited">限制</option>
                    <option value="unlimited">不限制</option>
                  </select>
                  <input
                    className="form-input"
                    type="number"
                    value={task.timeout === TIMEOUT_UNLIMITED ? '' : task.timeout}
                    placeholder="秒"
                    onChange={(e) => update('timeout', e.target.value === '' ? '' : Number(e.target.value))}
                    min={1}
                    max={3600}
                    disabled={task.timeout === TIMEOUT_UNLIMITED}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">任务链父任务</label>
              <input
                className="form-input"
                value={task.chainParentId || ''}
                onChange={(e) => update('chainParentId', e.target.value || '')}
                placeholder="父任务 ID（可选）"
              />
            </div>

            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={Boolean(task.autoIncludeLastResult)}
                onChange={(e) => update('autoIncludeLastResult', e.target.checked)}
              />
              <span>执行时自动引用上次成功结果</span>
            </label>

            <div className="form-group">
              <label className="form-label">标签（逗号分隔）</label>
              <input
                className="form-input"
                value={tagText}
                onChange={(e) => updateTagsText(e.target.value)}
                placeholder="新闻, 日报, AI"
              />
            </div>

            <div style={styles.sectionDivider}>
              <div className="form-group">
                <label className="form-label">飞书通知</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className={`btn btn-sm ${task.feishuMode === 'full' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => update('feishuMode', 'full')}
                    type="button"
                  >
                    全文
                  </button>
                  <button
                    className={`btn btn-sm ${task.feishuMode === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => update('feishuMode', 'summary')}
                    type="button"
                  >
                    摘要
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">通知群聊 ID</label>
                <input
                  className="form-input text-mono"
                  value={(task.feishuChatIds || []).join(', ')}
                  onChange={(e) =>
                    update(
                      'feishuChatIds',
                      e.target.value
                        .split(',')
                        .map((chatId) => chatId.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="oc_xxxxxxxxxxxxxxxx"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={styles.rightCol}>
          <div
            style={styles.promptCard}
          >
            <PromptEditor
              value={task.prompt}
              onChange={(p) => update('prompt', p)}
              onFormat={(result) => showToast(result?.changed ? '格式已整理' : '格式已经很干净了')}
              previewTask={promptPreviewTask}
            />
          </div>

          {testResult && (
            <div className="card" style={{ marginTop: '12px' }}>
              <h4 style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                测试执行结果
                <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--ink-tertiary)', fontWeight: 400 }}>
                  预览执行，不触发飞书通知
                </span>
              </h4>
              <pre style={styles.resultPre}>
                {typeof testResult === 'string'
                  ? testResult
                  : testResult.output || testResult.result || JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}

const styles = {
  columns: {
    display: 'flex',
    gap: '20px',
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
  },
  page: {
    height: 'calc(100vh - 104px)',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  editorTopbar: {
    flexShrink: 0,
    marginBottom: '24px',
  },
  leftCol: {
    width: '420px',
    minWidth: '420px',
    minHeight: 0,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(26, 25, 21, 0.36)',
  },
  importModal: {
    width: 'min(1480px, calc(100vw - 40px))',
    height: 'min(860px, calc(100vh - 40px))',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '18px 20px',
    boxShadow: 'var(--shadow-lg)',
  },
  importHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '12px',
  },
  importTitle: {
    fontSize: '1rem',
    marginBottom: '4px',
  },
  importDesc: {
    color: 'var(--ink-secondary)',
    fontSize: '0.86rem',
  },
  importActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  importBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    minHeight: 0,
    flex: 1,
  },
  importInputPane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    background: 'var(--bg)',
  },
  importResultPane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflowY: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    background: 'var(--bg)',
  },
  paneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  paneTitle: {
    fontWeight: 600,
    color: 'var(--ink)',
  },
  paneTools: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  importTextarea: {
    flex: 1,
    minHeight: 0,
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.65',
    resize: 'none',
    background: 'var(--surface)',
  },
  importDraftHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  },
  importDraftTitle: {
    fontSize: '0.95rem',
  },
  cronAssistantBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    marginBottom: '12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
  },
  cronAssistantHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
  },
  cronAssistantRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '8px',
  },
  cronDraftBox: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
  },
  cronDraftExplanation: {
    flex: '1 1 180px',
    minWidth: 0,
    color: 'var(--ink-secondary)',
    fontSize: '0.82rem',
  },
  draftGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  },
  draftItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
    padding: '10px 12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    fontSize: '0.86rem',
  },
  draftLabel: {
    color: 'var(--ink-tertiary)',
    fontSize: '0.76rem',
  },
  confidenceItem: {
    background: 'var(--surface)',
  },
  confidenceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  warningDraftItem: {
    borderColor: 'var(--warn)',
    background: 'var(--warn-light)',
  },
  emptyDraft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textAlign: 'center',
    color: 'var(--ink-secondary)',
    padding: '24px',
  },
  importErrorBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--error)',
    background: 'var(--error-light)',
    color: 'var(--error)',
    fontSize: '0.86rem',
  },
  errorDetail: {
    color: 'var(--ink-secondary)',
  },
  rawOutputPre: {
    maxHeight: '420px',
    overflow: 'auto',
    padding: '12px',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    lineHeight: '1.55',
  },
  formCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
    padding: '28px',
  },
  activeWindowGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '10px',
  },
  cronFieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
  },
  cronFieldHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    minWidth: 0,
  },
  cronTitle: {
    flexShrink: 0,
    marginBottom: 0,
    whiteSpace: 'nowrap',
  },
  scheduleStatusRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  scheduleStatusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '100%',
    padding: '3px 8px',
    borderRadius: '999px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--ink-secondary)',
    fontSize: '0.78rem',
    lineHeight: 1.45,
  },
  scheduleStatusLabel: {
    flexShrink: 0,
    color: 'var(--ink-tertiary)',
  },
  schedulePanel: {
    borderTop: '1px solid var(--border)',
    marginTop: 0,
    paddingTop: 0,
    overflow: 'hidden',
  },
  schedulePanelHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 12px 0',
    paddingLeft: 0,
    paddingRight: 0,
    textAlign: 'left',
    color: 'var(--ink)',
  },
  schedulePanelTitle: {
    marginBottom: 0,
    whiteSpace: 'nowrap',
  },
  scheduleHeaderText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
  },
  scheduleHeaderBadge: {
    display: 'inline-flex',
    maxWidth: '100%',
    padding: '2px 7px',
    borderRadius: '999px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--ink-tertiary)',
    fontSize: '0.76rem',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scheduleCollapsedSummary: {
    minWidth: 0,
    marginTop: '8px',
    padding: '7px 9px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    color: 'var(--ink-secondary)',
    fontSize: '0.82rem',
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scheduleHeaderAction: {
    flexShrink: 0,
    color: 'var(--accent)',
    fontSize: '0.84rem',
    fontWeight: 500,
  },
  scheduleHeaderActions: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  schedulePanelBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '0 0 4px',
    maxHeight: 'min(420px, calc(100vh - 330px))',
    minHeight: 0,
    overflowY: 'auto',
    scrollbarGutter: 'stable',
  },
  schedulePanelBodySegmentMode: {
    maxHeight: 'min(360px, calc(100vh - 370px))',
  },
  scheduleBlock: {
    padding: '16px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
  },
  scheduleBlockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  },
  scheduleBlockTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--ink)',
  },
  scheduleCompactGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '14px',
  },
  twoColumnRow: {
    display: 'flex',
    gap: '18px',
  },
  cronInlineRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 112px',
    alignItems: 'stretch',
    gap: '8px',
    minWidth: 0,
    maxWidth: '100%',
  },
  cronInlineWithHelpRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 112px 28px',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    maxWidth: '100%',
  },
  cronInput: {
    width: '100%',
  },
  cronHelpButton: {
    width: '28px',
    height: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink-secondary)',
    fontWeight: 600,
    lineHeight: 1,
  },
  timeoutRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(90px, 0.8fr)',
    gap: '8px',
  },
  scheduleSegments: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  scheduleSegmentEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  segmentDateTimeStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  segmentDateTimeField: {
    display: 'grid',
    gridTemplateColumns: '36px minmax(0, 1fr)',
    alignItems: 'center',
    gap: '8px',
  },
  segmentHeaderRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '10px',
  },
  segmentPager: {
    display: 'grid',
    gridTemplateColumns: '30px minmax(0, 1fr) 30px',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  segmentNavButton: {
    width: '30px',
    height: '30px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: '999px',
    background: 'var(--surface)',
    color: 'var(--ink)',
    fontSize: '1.25rem',
    lineHeight: 1,
  },
  segmentPagerText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    color: 'var(--ink)',
  },
  segmentDeleteButton: {
    flexShrink: 0,
    minWidth: '34px',
    color: 'var(--error)',
    fontSize: '0.82rem',
    fontWeight: 500,
    padding: '4px 2px',
    textAlign: 'right',
  },
  segmentNotice: {
    padding: '8px 10px',
    borderRadius: 'var(--radius)',
    background: 'var(--warn-light)',
    color: 'var(--warn)',
    fontSize: '0.82rem',
    lineHeight: 1.6,
  },
  scheduleSegment: {
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
  },
  scheduleSegmentSummary: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(80px, 1fr) auto',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    textAlign: 'left',
    color: 'var(--ink)',
  },
  segmentSummaryMain: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  segmentTitle: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.9rem',
  },
  segmentCron: {
    flexShrink: 0,
    color: 'var(--ink-secondary)',
    fontSize: '0.8rem',
    padding: '1px 7px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  segmentRange: {
    color: 'var(--ink-tertiary)',
    fontSize: '0.78rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  segmentChevron: {
    color: 'var(--accent)',
    fontSize: '0.78rem',
    fontWeight: 500,
  },
  scheduleSegmentDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 10px 10px',
  },
  promptCard: {
    height: '100%',
    minHeight: 0,
  },
  sectionDivider: {
    borderTop: '1px solid var(--border)',
    paddingTop: '24px',
    marginTop: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    color: 'var(--ink-secondary)',
    cursor: 'pointer',
  },
  resultPre: {
    background: 'var(--bg)',
    padding: '12px',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.85rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '400px',
    overflowY: 'auto',
  },
};
