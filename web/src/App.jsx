import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getBootstrapStatus, getToken } from './api/client';
import { getTasks } from './api/client';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import TaskListPage from './pages/TaskListPage';
import TaskEditorPage from './pages/TaskEditorPage';
import RunHistoryPage from './pages/RunHistoryPage';
import RunDetailPage from './pages/RunDetailPage';
import HealthPage from './pages/HealthPage';
import SettingsPage from './pages/SettingsPage';

const DEFAULT_FILTERS = {
  status: 'all',
  engine: 'all',
  tag: null,
};

function ProtectedRoute({ children, tasks, filters, onFilterChange }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;

  return (
    <Layout tasks={tasks} filters={filters} onFilterChange={onFilterChange}>
      {children}
    </Layout>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [bootstrap, setBootstrap] = useState(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const location = useLocation();

  const isLoggedIn = !!getToken();
  const needsOnboarding = Boolean(bootstrap?.needsOnboarding);

  const refreshBootstrap = () => getBootstrapStatus()
    .then((data) => setBootstrap(data || { needsOnboarding: false }))
    .catch(() => setBootstrap({ needsOnboarding: false }))
    .finally(() => setBootstrapLoading(false));

  useEffect(() => {
    refreshBootstrap();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || needsOnboarding) return;
    getTasks()
      .then((data) => setTasks(data || []))
      .catch(() => setTasks([]));
  }, [isLoggedIn, needsOnboarding, location.pathname]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  if (bootstrapLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-tertiary)' }}>加载中...</div>;
  }

  return (
    <Routes>
      <Route
        path="/onboarding"
        element={needsOnboarding ? <OnboardingPage onComplete={refreshBootstrap} /> : <Navigate to={isLoggedIn ? '/' : '/login'} replace />}
      />
      <Route
        path="/login"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : isLoggedIn ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskListPage filters={filters} onFilterChange={handleFilterChange} />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/tasks/new"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskEditorPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/tasks/:id/edit"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskEditorPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/history"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunHistoryPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/runs/:runId"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunDetailPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/tasks/:taskId/history"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunHistoryPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/health"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <HealthPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/settings"
        element={needsOnboarding ? <Navigate to="/onboarding" replace /> : (
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <SettingsPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to={needsOnboarding ? '/onboarding' : '/'} replace />} />
    </Routes>
  );
}
