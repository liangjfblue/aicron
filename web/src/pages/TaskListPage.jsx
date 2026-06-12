import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRun, getTasks, runTask, toggleTask, deleteTask } from '../api/client';
import TaskCard from '../components/TaskCard';
import ConfirmDialog from '../components/ConfirmDialog';

export default function TaskListPage({ filters }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await getTasks();
      setTasks(data || []);
    } catch {
      showToast('加载任务失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    getTasks()
      .then((data) => {
        if (!cancelled) setTasks(data || []);
      })
      .catch(() => {
        if (!cancelled) showToast('加载任务失败', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const hasRunning = tasks.some((task) => task.lastRun?.status === 'running');
    if (!hasRunning) return undefined;

    const poll = setInterval(() => {
      fetchTasks();
    }, 5000);
    return () => {
      clearInterval(poll);
    };
  }, [fetchTasks, tasks]);

  const handleRun = async (id) => {
    try {
      const run = await runTask(id);
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? { ...task, lastRun: run } : task))
      );
      showToast('任务已开始执行');
      const pollRun = async () => {
        const latestRun = await getRun(run.id);
        setTasks((prev) =>
          prev.map((task) => (task.id === id ? { ...task, lastRun: latestRun } : task))
        );
        if (latestRun.status === 'running') {
          setTimeout(pollRun, 3000);
        } else {
          fetchTasks();
          showToast(latestRun.status === 'succeeded' ? '任务执行完成' : '任务执行结束', latestRun.status === 'succeeded' ? 'success' : 'error');
        }
      };
      setTimeout(pollRun, 3000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggle = async (id) => {
    try {
      const current = tasks.find((t) => t.id === id);
      await toggleTask(id, !current?.enabled);
      showToast('状态已更新');
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = (id) => {
    const task = tasks.find((item) => item.id === id);
    setTaskToDelete(task || { id, name: '此任务' });
  };

  const handleCancelDelete = () => {
    if (deletingTaskId) return;
    setTaskToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setDeletingTaskId(taskToDelete.id);
    try {
      await deleteTask(taskToDelete.id);
      showToast('任务已删除');
      setTaskToDelete(null);
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filters.status === 'enabled' && !t.enabled) return false;
    if (filters.status === 'disabled' && t.enabled) return false;
    if (filters.engine && filters.engine !== 'all' && t.engine !== filters.engine) return false;
    if (filters.tag && !(t.tags || []).includes(filters.tag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return <div className="loading-spinner">加载中...</div>;
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '20px' }}>
        <h1 className="section-title" style={{ marginBottom: 0 }}>
          任务列表
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            className="form-input"
            type="text"
            placeholder="搜索任务..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '240px' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => navigate('/tasks/new')}
          >
            + 新建任务
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="empty-state">
          <h3>暂无任务</h3>
          <p>点击「新建任务」开始创建你的第一个定时任务</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onRun={handleRun}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
      <ConfirmDialog
        open={!!taskToDelete}
        title="删除任务？"
        message={`确定要删除「${taskToDelete?.name || '此任务'}」吗？任务配置和关联执行记录可能会一起删除。`}
        confirmText="删除"
        cancelText="返回"
        danger
        loading={!!deletingTaskId}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
