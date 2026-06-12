import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getToken } from './api/client';
import { getTasks } from './api/client';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
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
  const location = useLocation();

  const isLoggedIn = !!getToken();

  useEffect(() => {
    if (!isLoggedIn) return;
    getTasks()
      .then((data) => setTasks(data || []))
      .catch(() => setTasks([]));
  }, [isLoggedIn, location.pathname]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={isLoggedIn ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskListPage filters={filters} onFilterChange={handleFilterChange} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/new"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/:id/edit"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <TaskEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/runs/:runId"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/:taskId/history"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <RunHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/health"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <HealthPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute tasks={tasks} filters={filters} onFilterChange={handleFilterChange}>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
