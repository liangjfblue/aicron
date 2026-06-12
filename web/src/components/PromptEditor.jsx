import { useEffect, useState } from 'react';
import { resolvePrompt } from '../api/client';
import { formatMarkdownText } from '../utils/formatMarkdown';

const VARIABLES = [
  { key: 'task_name', label: '任务名称' },
  { key: 'date', label: '日期' },
  { key: 'time', label: '时间' },
  { key: 'datetime', label: '日期时间' },
  { key: 'weekday', label: '星期' },
  { key: 'last_result', label: '上次结果' },
  { key: 'prev_output', label: '前任务输出' },
];

export default function PromptEditor({ value, onChange, onFormat, previewTask }) {
  const [tab, setTab] = useState('edit');
  const [preview, setPreview] = useState({ status: 'idle', text: '', source: '' });
  const textareaId = 'prompt-textarea';
  const previewSource = JSON.stringify({ value: value || '', task: previewTask || {} });

  const insertVariable = (varKey) => {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `{{${varKey}}}`;
    const newValue = value.slice(0, start) + insertion + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + insertion.length;
      textarea.selectionEnd = start + insertion.length;
      textarea.focus();
    });
  };

  const formatValue = () => {
    const formatted = formatMarkdownText(value || '');
    if (formatted === (value || '')) {
      onFormat?.({ changed: false });
      return;
    }
    onChange(formatted);
    onFormat?.({ changed: true, value: formatted });
  };

  useEffect(() => {
    if (tab !== 'preview') return undefined;
    if (!value) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await resolvePrompt(value, previewTask || {});
        if (!active) return;
        setPreview({ status: 'success', text: result.resolved_prompt || '', source: previewSource });
      } catch (err) {
        if (!active) return;
        setPreview({ status: 'error', text: err.message || '预览失败', source: previewSource });
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [tab, value, previewTask, previewSource]);

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <div style={styles.tabs}>
          <button
            className={`tab ${tab === 'edit' ? 'active' : ''}`}
            onClick={() => setTab('edit')}
            type="button"
          >
            编辑
          </button>
          <button
            className={`tab ${tab === 'preview' ? 'active' : ''}`}
            onClick={() => setTab('preview')}
            type="button"
          >
            预览
          </button>
        </div>
        {tab === 'edit' && (
          <div style={styles.editTools}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={formatValue}
              type="button"
              disabled={!value}
            >
              整理格式
            </button>
            <div style={styles.variables}>
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  className="btn btn-sm btn-ghost"
                  style={styles.varBtn}
                  onClick={() => insertVariable(v.key)}
                  type="button"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === 'edit' ? (
        <textarea
          id={textareaId}
          className="form-textarea"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入 Agent 任务模板..."
          style={styles.textarea}
        />
      ) : (
        <div style={styles.preview}>
          {value && preview.source !== previewSource ? (
            <span style={styles.previewMuted}>正在替换变量...</span>
          ) : preview.status === 'error' ? (
            <span style={styles.previewError}>{preview.text}</span>
          ) : value && preview.text ? (
            preview.text
          ) : (
            <span style={styles.previewMuted}>暂无内容</span>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    marginBottom: 0,
  },
  variables: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  editTools: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  varBtn: {
    fontSize: '0.75rem',
    padding: '2px 8px',
    fontFamily: 'var(--font-mono)',
    borderRadius: '4px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
  },
  textarea: {
    flex: 1,
    minHeight: 0,
    resize: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9rem',
    lineHeight: '1.7',
    padding: '16px',
  },
  preview: {
    flex: 1,
    minHeight: 0,
    padding: '16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    lineHeight: '1.8',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
  },
  previewMuted: {
    color: 'var(--ink-tertiary)',
  },
  previewError: {
    color: 'var(--error)',
  },
};
