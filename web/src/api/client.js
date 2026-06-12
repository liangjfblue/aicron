const TOKEN_KEY = 'aicron_token';

let desktopApiBasePromise = null;

function normalizeApiBase(base) {
  return String(base || '').replace(/\/$/, '');
}

async function getApiBase() {
  if (!window.aicronDesktop?.getApiBaseUrl) return '';
  if (!desktopApiBasePromise) {
    desktopApiBasePromise = window.aicronDesktop.getApiBaseUrl().then(normalizeApiBase).catch(() => '');
  }
  return desktopApiBasePromise;
}

async function apiUrl(path) {
  const base = await getApiBase();
  return `${base}${path}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(await apiUrl(path), {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.hash = '#/login';
    throw new Error('未授权，请重新登录');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${res.status})`);
  }

  if (res.status === 204) return null;
  return res.json();
}

/* ---------- Auth ---------- */
export async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data;
}

/* ---------- Tasks ---------- */
export async function getTasks(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const path = qs ? `/api/tasks?${qs}` : '/api/tasks';
  return request(path);
}

export async function getTask(id) {
  return request(`/api/tasks/${id}`);
}

export async function createTask(task) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateTask(id, task) {
  return request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(task),
  });
}

export async function deleteTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export async function toggleTask(id, enabled) {
  return request(`/api/tasks/${id}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function analyzeTaskImport(text) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(await apiUrl('/api/tasks/import/analyze'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `请求失败 (${res.status})`);
    error.details = body;
    throw error;
  }
  return body;
}

export async function analyzeCron(text) {
  return request('/api/tasks/import/cron', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/* ---------- Runs ---------- */
export async function runTask(id) {
  return request(`/api/tasks/${id}/run`, { method: 'POST' });
}

export async function testRun(task) {
  return request('/api/tasks/test-run', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function dryRun(id) {
  return request(`/api/tasks/${id}/dry-run`, { method: 'POST' });
}

export async function cancelRun(taskId, runId) {
  return request(`/api/tasks/${taskId}/runs/${runId}/cancel`, { method: 'POST' });
}

export async function getRuns(taskId, params = {}) {
  const qs = new URLSearchParams(params).toString();
  if (!taskId) {
    const path = qs ? `/api/runs?${qs}` : '/api/runs';
    return request(path);
  }
  const path = qs ? `/api/tasks/${taskId}/runs?${qs}` : `/api/tasks/${taskId}/runs`;
  return request(path);
}

export async function getHealthDashboard() {
  return request('/api/dashboard/health');
}

export async function getRun(runId) {
  return request(`/api/runs/${runId}`);
}

export async function deleteRun(runId) {
  return request(`/api/runs/${runId}`, { method: 'DELETE' });
}

export async function getRunResult(runId) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(await apiUrl(`/api/runs/${runId}/result`), { headers });
  if (!res.ok) throw new Error('获取结果失败');
  return res.text();
}

export async function compareRuns(runIdA, runIdB) {
  const qs = new URLSearchParams({ runId1: runIdA, runId2: runIdB }).toString();
  return request(`/api/runs/compare?${qs}`);
}

/* ---------- Prompt ---------- */
export async function resolvePrompt(template, task = {}) {
  return request('/api/prompt/resolve', {
    method: 'POST',
    body: JSON.stringify({ prompt_template: template, task }),
  });
}

export async function optimizePrompt(template) {
  return request('/api/prompt/optimize', {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

/* ---------- Settings ---------- */
export async function getSettings() {
  return request('/api/settings');
}

export async function detectEngines() {
  return request('/api/settings/detect-engines');
}

export async function updateSettings(settings) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function testEngine(path) {
  return request('/api/settings/test-engine', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function testFeishu(appId, appSecret) {
  return request('/api/settings/test-feishu', {
    method: 'POST',
    body: JSON.stringify({ appId, appSecret }),
  });
}

/* ---------- Skill ---------- */
export async function executeSkill(skillName, params) {
  return request('/api/skill/execute', {
    method: 'POST',
    body: JSON.stringify({ skill: skillName, params }),
  });
}

export async function getSkillStatus() {
  return request('/api/skill/status');
}
