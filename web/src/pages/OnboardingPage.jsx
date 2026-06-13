import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeBootstrap, detectBootstrapEngines } from '../api/client';

export default function OnboardingPage({ onComplete }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    claudePath: '',
    codexPath: '',
    feishuAppId: '',
    feishuAppSecret: '',
    defaultChatId: '',
    startupEnabled: false,
    startMinimizedToTray: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    handleDetectEngines({ silent: true });
    if (!window.aicronDesktop?.getStartupEnabled) return;
    window.aicronDesktop.getStartupEnabled()
      .then((enabled) => update('startupEnabled', Boolean(enabled)))
      .catch(() => {});
  }, []);

  const handleDetectEngines = async (options = {}) => {
    setDetecting(true);
    try {
      const detection = await detectBootstrapEngines();
      setForm((prev) => ({
        ...prev,
        claudePath: prev.claudePath || detection?.claude?.displayPath || '',
        codexPath: prev.codexPath || detection?.codex?.displayPath || '',
      }));
    } catch (err) {
      if (!options.silent) setError(err.message || '执行引擎检测失败');
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.username.trim()) {
      setError('请输入账号名称');
      return;
    }
    if (form.password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      if (window.aicronDesktop?.setStartupEnabled) {
        await window.aicronDesktop.setStartupEnabled(form.startupEnabled);
      }
      await completeBootstrap({
        username: form.username.trim(),
        password: form.password,
        claudePath: form.claudePath.trim(),
        codexPath: form.codexPath.trim(),
        feishuAppId: form.feishuAppId.trim(),
        feishuAppSecret: form.feishuAppSecret.trim(),
        defaultChatId: form.defaultChatId.trim(),
        startMinimizedToTray: form.startMinimizedToTray,
      });
      onComplete?.();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || '初始化失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <form style={styles.panel} onSubmit={handleSubmit}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>欢迎使用 AICron</h1>
            <p style={styles.subtitle}>先创建本地账号，再确认 Agent 执行环境。</p>
          </div>
          <span style={styles.badge}>首次引导</span>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>账号</h2>
          <div style={styles.grid}>
            <Field label="用户名">
              <input className="form-input" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="例如 admin" autoComplete="username" />
            </Field>
            <Field label="密码">
              <input className="form-input" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
            </Field>
            <Field label="确认密码">
              <input className="form-input" type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} placeholder="再次输入密码" autoComplete="new-password" />
            </Field>
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>执行引擎</h2>
            <button type="button" className="btn btn-secondary" onClick={() => handleDetectEngines()} disabled={detecting}>
              {detecting ? '检测中...' : '重新检测'}
            </button>
          </div>
          <div style={styles.grid}>
            <Field label="Claude CLI 路径">
              <input className="form-input" value={form.claudePath} onChange={(e) => update('claudePath', e.target.value)} placeholder="/usr/local/bin/claude" />
            </Field>
            <Field label="Codex CLI 路径">
              <input className="form-input" value={form.codexPath} onChange={(e) => update('codexPath', e.target.value)} placeholder="/usr/local/bin/codex" />
            </Field>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>飞书通知</h2>
          <div style={styles.grid}>
            <Field label="App ID">
              <input className="form-input" value={form.feishuAppId} onChange={(e) => update('feishuAppId', e.target.value)} placeholder="cli_xxxxxxxx" />
            </Field>
            <Field label="App Secret">
              <input className="form-input" type="password" value={form.feishuAppSecret} onChange={(e) => update('feishuAppSecret', e.target.value)} placeholder="飞书应用密钥" />
            </Field>
            <Field label="默认群聊 ID">
              <input className="form-input" value={form.defaultChatId} onChange={(e) => update('defaultChatId', e.target.value)} placeholder="oc_xxxxxxxxxxxxxxxx" />
            </Field>
          </div>
        </section>

        {window.aicronDesktop?.isDesktop && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>桌面偏好</h2>
            <div style={styles.checkboxGroup}>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.startupEnabled}
                  onChange={(e) => update('startupEnabled', e.target.checked)}
                />
                <span>开机自启动</span>
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.startMinimizedToTray}
                  onChange={(e) => update('startMinimizedToTray', e.target.checked)}
                />
                <span>启动后最小化到托盘</span>
              </label>
            </div>
          </section>
        )}

        <div style={styles.actions}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '正在完成初始化...' : '完成并进入 AICron'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '32px',
  },
  panel: {
    width: 'min(920px, 100%)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    padding: '30px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '20px',
    marginBottom: '22px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '6px',
  },
  subtitle: {
    color: 'var(--ink-tertiary)',
    fontSize: '14px',
  },
  badge: {
    background: 'var(--accent-light)',
    color: 'var(--accent)',
    borderRadius: '999px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 600,
  },
  section: {
    borderTop: '1px solid var(--border)',
    paddingTop: '18px',
    marginTop: '18px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '17px',
    fontWeight: 600,
    marginBottom: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },
  label: {
    fontSize: '14px',
    color: 'var(--ink-secondary)',
  },
  checkbox: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: 'var(--ink-secondary)',
  },
  checkboxGroup: {
    display: 'flex',
    gap: '22px',
    flexWrap: 'wrap',
  },
  error: {
    background: 'var(--error-light)',
    color: 'var(--error)',
    border: '1px solid var(--error)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    fontSize: '14px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
};
