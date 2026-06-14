import { useState, useEffect } from 'react';
import {
  getSettings,
  detectEngines,
  updateSettings,
  testEngine,
  testFeishu,
} from '../api/client';
import { isNewerVersion } from '../utils/version';
import { selectLatestRelease } from '../utils/releases';

const FALLBACK_APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const RELEASE_API_URL = 'https://api.github.com/repos/liangjfblue/aicron/releases?per_page=10';
const RELEASES_PAGE_URL = 'https://github.com/liangjfblue/aicron/releases';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [engineDetection, setEngineDetection] = useState(null);
  const [detectingEngines, setDetectingEngines] = useState(false);
  const [appVersion, setAppVersion] = useState(FALLBACK_APP_VERSION);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [desktop, setDesktop] = useState({
    available: Boolean(window.aicronDesktop?.isDesktop),
    startupEnabled: false,
    loading: Boolean(window.aicronDesktop?.isDesktop),
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 1000);
  };

  useEffect(() => {
    getSettings()
      .then(async (data) => {
        const nextSettings = data || {};
        setSettings(nextSettings);
        await handleDetectEngines(nextSettings, { silent: true });
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!window.aicronDesktop?.getStartupEnabled) return;
    window.aicronDesktop.getStartupEnabled()
      .then((enabled) => setDesktop({ available: true, startupEnabled: Boolean(enabled), loading: false }))
      .catch(() => setDesktop({ available: true, startupEnabled: false, loading: false }));
  }, []);

  useEffect(() => {
    if (!window.aicronDesktop?.getAppVersion) return;
    window.aicronDesktop.getAppVersion()
      .then((version) => {
        if (version) setAppVersion(version);
      })
      .catch(() => {});
  }, []);

  const update = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const applyDetectedEnginePaths = (currentSettings, detection) => {
    const patch = {};
    if (!currentSettings.claudePath && detection?.claude?.displayPath) patch.claudePath = detection.claude.displayPath;
    if (!currentSettings.codexPath && detection?.codex?.displayPath) patch.codexPath = detection.codex.displayPath;
    if (Object.keys(patch).length > 0) {
      setSettings((prev) => ({ ...prev, ...patch }));
    }
  };

  const handleDetectEngines = async (currentSettings = settings || {}, options = {}) => {
    setDetectingEngines(true);
    try {
      const detection = await detectEngines();
      setEngineDetection(detection);
      applyDetectedEnginePaths(currentSettings, detection);
      if (!options.silent) {
        const found = [detection?.claude?.found, detection?.codex?.found].filter(Boolean).length;
        showToast(found ? `已检测到 ${found} 个执行引擎路径` : '未检测到执行引擎，请手动填写', found ? 'success' : 'error');
      }
    } catch (err) {
      if (!options.silent) showToast(err.message || '检测失败', 'error');
    } finally {
      setDetectingEngines(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(settings);
      showToast('设置已保存');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSkillToken = async () => {
    const token = 'sk-aicron-' + Math.random().toString(36).slice(2, 18);
    update('skillToken', token);
    try {
      await updateSettings({ skillToken: token });
      navigator.clipboard.writeText(token).catch(() => {});
      showToast('令牌已生成、保存并复制到剪贴板');
    } catch (err) {
      showToast(err.message || '令牌保存失败', 'error');
    }
  };

  const handleTestEngine = async (path) => {
    try {
      const result = await testEngine(path);
      if (result.success) {
        const pathText = result.resolvedPath ? `路径：${result.resolvedPath}` : result.output;
        showToast(`✓ ${pathText}`, 'success');
      } else {
        showToast(`✕ ${result.output || '测试失败'}`, 'error');
      }
    } catch (err) {
      showToast(`✕ ${err.message}`, 'error');
    }
  };

  const handleTestFeishu = async () => {
    const appId = settings?.feishuAppId || '';
    const appSecret = settings?.feishuAppSecret || '';
    if (!appId || !appSecret) {
      showToast('请先填写 App ID 和 Secret', 'error');
      return;
    }
    try {
      const result = await testFeishu(appId, appSecret);
      if (result.success) {
        showToast('✓ 飞书连接成功', 'success');
      } else {
        showToast(`✕ ${result.message}`, 'error');
      }
    } catch (err) {
      showToast(`✕ ${err.message}`, 'error');
    }
  };

  const handleStartupToggle = async () => {
    if (!window.aicronDesktop?.setStartupEnabled) return;
    const next = !desktop.startupEnabled;
    setDesktop((prev) => ({ ...prev, startupEnabled: next, loading: true }));
    try {
      const actual = await window.aicronDesktop.setStartupEnabled(next);
      setDesktop({ available: true, startupEnabled: Boolean(actual), loading: false });
      showToast(actual ? '已开启开机自启动' : '已关闭开机自启动');
    } catch (err) {
      setDesktop((prev) => ({ ...prev, startupEnabled: !next, loading: false }));
      showToast(err.message || '自启动设置失败', 'error');
    }
  };

  const handleStartMinimizedToggle = async () => {
    const current = settings.startMinimizedToTray === 'true' ? 'true' : 'false';
    const next = current === 'true' ? 'false' : 'true';
    update('startMinimizedToTray', next);
    try {
      await updateSettings({ startMinimizedToTray: next });
      showToast(next === 'true' ? '已开启启动后最小化' : '已关闭启动后最小化');
    } catch (err) {
      update('startMinimizedToTray', current);
      showToast(err.message || '启动后最小化设置失败', 'error');
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const res = await fetch(RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.status === 404) throw new Error('无法访问更新源：仓库可能未公开或 Release 不可见');
      if (!res.ok) throw new Error(`检查失败 (${res.status})`);
      const release = selectLatestRelease(await res.json());
      if (!release) throw new Error('未找到可下载版本');
      const latestVersion = release.tag_name || release.name;
      const hasUpdate = isNewerVersion(latestVersion, appVersion);
      const downloadUrl = release.html_url || RELEASES_PAGE_URL;
      setUpdateInfo({
        hasUpdate,
        latestVersion,
        downloadUrl,
        publishedAt: release.published_at,
      });
      showToast(hasUpdate ? `发现新版本 ${latestVersion}` : '当前已是最新版本');
    } catch (err) {
      setUpdateInfo({
        error: err.message || '检查更新失败',
        downloadUrl: RELEASES_PAGE_URL,
      });
      showToast(err.message || '检查更新失败', 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenUpdatePage = (url = RELEASES_PAGE_URL) => {
    if (window.aicronDesktop?.openExternal) {
      window.aicronDesktop.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-tertiary)' }}>加载中...</div>;
  if (!settings) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-tertiary)' }}>无法加载设置</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700 }}>系统设置</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 999,
          padding: '14px 28px', borderRadius: 'var(--radius-md)',
          background: toast.type === 'error' ? 'var(--error-light)' : 'var(--success-light)',
          color: toast.type === 'error' ? 'var(--error)' : 'var(--success)',
          fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(26,25,21,0.12)',
          border: `1px solid ${toast.type === 'error' ? 'var(--error)' : 'var(--success)'}`,
        }}>
          {toast.message}
        </div>
      )}

      {/* 执行引擎 */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>⚡ 执行引擎</h2>
          <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => handleDetectEngines(settings)} disabled={detectingEngines}>
            {detectingEngines ? '检测中...' : '重新检测'}
          </button>
        </div>
        <div style={{ ...styles.row, gridTemplateColumns: '200px 500px auto' }}>
          <label style={styles.label}>Claude CLI 路径</label>
          <div>
            <input className="form-input" value={settings.claudePath || ''} onChange={(e) => update('claudePath', e.target.value)} placeholder="/usr/local/bin/claude" style={styles.input} />
            <EnginePathHint detection={engineDetection?.claude} value={settings.claudePath} />
          </div>
          <button className="btn" style={{ fontSize: '13px' }} onClick={() => handleTestEngine(settings.claudePath || 'claude')}>测试</button>
        </div>
        <div style={{ ...styles.row, gridTemplateColumns: '200px 500px auto' }}>
          <label style={styles.label}>Codex CLI 路径</label>
          <div>
            <input className="form-input" value={settings.codexPath || ''} onChange={(e) => update('codexPath', e.target.value)} placeholder="/usr/local/bin/codex" style={styles.input} />
            <EnginePathHint detection={engineDetection?.codex} value={settings.codexPath} />
          </div>
          <button className="btn" style={{ fontSize: '13px' }} onClick={() => handleTestEngine(settings.codexPath || 'codex')}>测试</button>
        </div>
      </section>

      {/* 飞书应用 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>💬 飞书应用</h2>
        <div style={styles.row}>
          <label style={styles.label}>App ID</label>
          <input className="form-input" value={settings.feishuAppId || ''} onChange={(e) => update('feishuAppId', e.target.value)} placeholder="cli_xxxxxxxx" style={styles.input} />
        </div>
        <div style={styles.row}>
          <label style={styles.label}>App Secret</label>
          <input className="form-input" type="password" value={settings.feishuAppSecret || ''} onChange={(e) => update('feishuAppSecret', e.target.value)} placeholder="飞书应用密钥" style={styles.input} />
          <button className="btn" style={{ fontSize: '13px' }} onClick={handleTestFeishu}>验证</button>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>默认群聊 ID</label>
          <input className="form-input" value={settings.defaultChatId || ''} onChange={(e) => update('defaultChatId', e.target.value)} placeholder="oc_xxxxxxxxxxxxxxxx" style={styles.input} />
        </div>
      </section>

      {/* 数据存储 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>📂 数据存储</h2>
        <div style={styles.row}>
          <label style={styles.label}>结果目录</label>
          <input className="form-input" value={settings.resultsDir || '~/.aicron/data/runs'} onChange={(e) => update('resultsDir', e.target.value)} style={styles.input} />
        </div>
        <div style={styles.row}>
          <label style={styles.label}>保留策略</label>
          <select className="form-input" value={settings.retention || 'keep-all'} onChange={(e) => update('retention', e.target.value)} style={{ ...styles.input, fontFamily: 'var(--font-display)' }}>
            <option value="keep-all">永久保留</option>
            <option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option>
            <option value="100-per-task">每个任务最近 100 次</option>
          </select>
        </div>
      </section>

      {/* Skill 接口 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🤖 Skill 接口（供 Hermes 调用）</h2>
        <div style={styles.row}>
          <label style={styles.label}>API 地址</label>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent)', background: 'var(--accent-light)', padding: '5px 10px', borderRadius: '2px' }}>http://localhost:3000/api/skill/*</code>
          <button className="btn" style={{ fontSize: '13px' }} onClick={() => navigator.clipboard.writeText('http://localhost:3000/api/skill/*')}>复制</button>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>认证令牌</label>
          <input className="form-input" type="text" value={settings.skillToken || ''} onChange={(e) => update('skillToken', e.target.value)} placeholder="sk-aicron-xxxx" style={styles.input} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn" style={{ fontSize: '13px' }} onClick={handleGenerateSkillToken}>生成并复制</button>
            {settings.skillToken && (
              <button className="btn" style={{ fontSize: '13px' }} onClick={() => {
                navigator.clipboard.writeText(settings.skillToken).catch(() => {});
                showToast('已复制到剪贴板');
              }}>复制</button>
            )}
          </div>
        </div>
      </section>

      {/* 桌面应用 */}
      {desktop.available && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>桌面应用</h2>
          <div style={styles.row}>
            <label style={styles.label}>开机自启动</label>
            <button
              className={`btn ${desktop.startupEnabled ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '13px', width: '120px' }}
              onClick={handleStartupToggle}
              disabled={desktop.loading}
            >
              {desktop.loading ? '读取中...' : desktop.startupEnabled ? '已开启' : '未开启'}
            </button>
            <span style={{ color: 'var(--ink-tertiary)', fontSize: '13px' }}>
              关闭窗口后任务仍会在托盘后台运行
            </span>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>启动后最小化到托盘</label>
            <button
              className={`btn ${settings.startMinimizedToTray === 'true' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '13px', width: '120px' }}
              onClick={handleStartMinimizedToggle}
            >
              {settings.startMinimizedToTray === 'true' ? '已开启' : '未开启'}
            </button>
            <span style={{ color: 'var(--ink-tertiary)', fontSize: '13px' }}>
              下次启动时不弹出主窗口，任务会在托盘后台运行
            </span>
          </div>
        </section>
      )}

      {/* 应用更新 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>应用更新</h2>
        <div style={styles.row}>
          <label style={styles.label}>当前版本</label>
          <span style={{ fontSize: '15px', fontFamily: 'var(--font-mono)' }}>v{appVersion}</span>
          <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={handleCheckUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? '检查中...' : '检查更新'}
          </button>
        </div>
        {updateInfo && (
          <div style={styles.row}>
            <label style={styles.label}>检查结果</label>
            <div style={styles.updateResult}>
              {updateInfo.error ? (
                <span style={styles.hintError}>{updateInfo.error}</span>
              ) : updateInfo.hasUpdate ? (
                <span style={styles.hint}>发现新版本 {updateInfo.latestVersion}</span>
              ) : (
                <span style={styles.hint}>当前已是最新版本</span>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '13px' }}
                onClick={() => handleOpenUpdatePage(updateInfo.downloadUrl || RELEASES_PAGE_URL)}
              >
                打开下载页
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 账号安全 */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🔐 账号安全</h2>
        <div style={styles.row}>
          <label style={styles.label}>会话有效期</label>
          <span style={{ fontSize: '15px' }}>3 天</span>
        </div>
      </section>
    </div>
  );
}

function EnginePathHint({ detection, value }) {
  if (!detection) return null;
  if (!detection.found && !value) {
    return <div style={styles.hintError}>未检测到，请手动填写安装路径</div>;
  }
  if (detection.source === 'configured') {
    return <div style={styles.hint}>使用已保存路径</div>;
  }
  if (detection.source === 'environment') {
    return <div style={styles.hint}>系统检测：{detection.displayPath}</div>;
  }
  if (detection.displayPath && value === detection.displayPath) {
    return <div style={styles.hint}>自动检测：{detection.displayPath}</div>;
  }
  if (detection.displayPath) {
    return <div style={styles.hint}>检测到：{detection.displayPath}</div>;
  }
  return null;
}

const styles = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '24px 28px',
    marginBottom: '18px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '17px',
    fontWeight: 600,
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '200px 400px auto',
    gap: '14px',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--bg)',
  },
  label: {
    fontFamily: 'var(--font-display)',
    fontSize: '15px',
    color: 'var(--ink-secondary)',
  },
  input: {
    fontSize: '14px',
    fontFamily: 'var(--font-mono)',
  },
  hint: {
    marginTop: '6px',
    fontSize: '12px',
    color: 'var(--ink-tertiary)',
    fontFamily: 'var(--font-display)',
  },
  hintError: {
    marginTop: '6px',
    fontSize: '12px',
    color: 'var(--error)',
    fontFamily: 'var(--font-display)',
  },
  updateResult: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
};
