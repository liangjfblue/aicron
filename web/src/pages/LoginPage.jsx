import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>AICron</div>
        <p style={styles.subtitle}>智能任务调度平台</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}

          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={styles.submitBtn}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div style={styles.footer}>本地部署 · 个人使用</div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #F6F5F1 0%, #EDE9E0 50%, #F6F5F1 100%)',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.8rem',
    fontWeight: 700,
    color: 'var(--ink)',
    marginBottom: '4px',
  },
  subtitle: {
    color: 'var(--ink-tertiary)',
    fontSize: '0.9rem',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left',
  },
  error: {
    background: 'var(--error-light)',
    color: 'var(--error)',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  submitBtn: {
    width: '100%',
    justifyContent: 'center',
    padding: '11px 18px',
    fontSize: '0.95rem',
    marginTop: '8px',
  },
  footer: {
    marginTop: '32px',
    color: 'var(--ink-tertiary)',
    fontSize: '0.8rem',
  },
};
