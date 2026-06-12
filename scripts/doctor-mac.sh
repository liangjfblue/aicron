#!/usr/bin/env bash
# AICron - environment doctor for macOS/Linux.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5180}"

check() {
  local name=$1
  local ok=$2
  local fix=$3
  if [ "$ok" = "1" ]; then
    echo "✅ $name"
  else
    echo "❌ $name"
    echo "   修复建议: $fix"
  fi
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

port_free() {
  local port=$1
  if command_exists lsof; then
    ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    ! nc -z "$HOST" "$port" >/dev/null 2>&1
  fi
}

url_ok() {
  local url=$1
  curl -fsS "$url" >/dev/null 2>&1
}

echo "AICron 环境检查"
echo ""

command_exists node && check "Node.js" 1 "" || check "Node.js" 0 "安装 Node.js LTS: https://nodejs.org/"
command_exists npm && check "npm" 1 "" || check "npm" 0 "重新安装 Node.js LTS，确保 npm 可用。"
command_exists claude && check "Claude CLI" 1 "" || check "Claude CLI" 0 "安装并登录 Claude CLI；如果暂时不用 Claude 任务，可以稍后再配。"
command_exists codex && check "Codex CLI" 1 "" || check "Codex CLI" 0 "安装并登录 Codex CLI；如果暂时不用 Codex 任务，可以稍后再配。"

mkdir -p "$ROOT/data"
if touch "$ROOT/data/.write-test" >/dev/null 2>&1; then
  rm -f "$ROOT/data/.write-test"
  check "数据目录可写" 1 ""
else
  check "数据目录可写" 0 "把 AICron 放到当前用户有权限的目录，例如桌面或文档目录。"
fi

if port_free "$PORT" || url_ok "http://$HOST:$PORT/api/health"; then
  check "后端端口 $PORT" 1 ""
else
  check "后端端口 $PORT" 0 "端口被占用。请停止旧的 AICron，或设置新的 PORT。"
fi

if port_free "$FRONTEND_PORT" || url_ok "http://$HOST:$FRONTEND_PORT"; then
  check "前端端口 $FRONTEND_PORT" 1 ""
else
  check "前端端口 $FRONTEND_PORT" 0 "端口被占用。请停止旧的 AICron，或设置新的 FRONTEND_PORT。"
fi

PLIST_PATH="$HOME/Library/LaunchAgents/com.aicron.app.plist"
if [ -f "$PLIST_PATH" ]; then
  check "开机自启动配置" 1 ""
else
  check "开机自启动配置" 0 "如需开机自启动，请运行 ./scripts/enable-autostart-mac.sh。"
fi

echo ""
echo "项目目录: $ROOT"
echo "后端地址: http://$HOST:$PORT"
echo "前端地址: http://$HOST:$FRONTEND_PORT"
