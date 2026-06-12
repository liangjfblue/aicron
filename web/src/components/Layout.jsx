import { NavLink, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import BackToTopButton from './BackToTopButton';
import { clearToken } from '../api/client';

const NAV_LINKS = [
  { to: '/', label: '任务列表' },
  { to: '/history', label: '执行历史' },
  { to: '/health', label: '健康面板' },
  { to: '/settings', label: '设置' },
];

export default function Layout({ children, tasks, filters, onFilterChange }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <>
      <header className="topbar">
        <NavLink className="topbar-brand" to="/" end>
          AICron
        </NavLink>
        <nav className="topbar-nav">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              end={link.to === '/'}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-spacer" />
        <div className="topbar-user">
          <span>admin</span>
          <button onClick={handleLogout}>退出</button>
        </div>
      </header>

      <div className="layout">
        <Sidebar tasks={tasks} filters={filters} onFilterChange={onFilterChange} />
        <main className="main-content">{children}</main>
        <BackToTopButton />
      </div>
    </>
  );
}
