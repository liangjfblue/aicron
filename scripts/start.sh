#!/usr/bin/env bash
# AICron - start backend and frontend locally.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
PID_DIR="$ROOT/.pids"
LOG_DIR="$ROOT/data/logs"

MODE="dev"
BACKGROUND=0
OPEN_BROWSER=1

for arg in "$@"; do
  case "$arg" in
    dev|prod) MODE="$arg" ;;
    --background) BACKGROUND=1 ;;
    --no-open) OPEN_BROWSER=0 ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

export PORT="${PORT:-3000}"
export HOST="${HOST:-127.0.0.1}"
export FRONTEND_PORT="${FRONTEND_PORT:-5180}"

SERVER_URL="http://$HOST:$PORT"
FRONTEND_URL="http://$HOST:$FRONTEND_PORT"

mkdir -p "$PID_DIR" "$LOG_DIR" "$ROOT/data"

say() { [ "$BACKGROUND" -eq 1 ] || echo "$@"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

port_busy() {
  local port=$1
  if command_exists lsof; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    nc -z "$HOST" "$port" >/dev/null 2>&1
  fi
}

process_alive() {
  local pid_file=$1
  [ -f "$pid_file" ] || return 1
  local pid
  pid=$(cat "$pid_file" 2>/dev/null || true)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

wait_for_url() {
  local url=$1
  local label=$2
  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      say "  ✓ $label 已就绪"
      return 0
    fi
    sleep 1
  done
  return 1
}

url_ok() {
  local url=$1
  curl -fsS "$url" >/dev/null 2>&1
}

open_url() {
  local url=$1
  [ "$OPEN_BROWSER" -eq 1 ] || return 0
  if command_exists open; then
    open "$url" >/dev/null 2>&1 || true
  elif command_exists xdg-open; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

say "╔══════════════════════════════════╗"
say "║       AICron 启动中...            ║"
say "╚══════════════════════════════════╝"
say ""

if ! command_exists node; then
  echo "❌ 未找到 Node.js。请先安装 Node.js LTS: https://nodejs.org/"
  exit 1
fi

if ! command_exists npm; then
  echo "❌ 未找到 npm。请重新安装 Node.js LTS。"
  exit 1
fi

if ! command_exists claude; then
  say "⚠️  未找到 claude 命令。Claude 任务会不可用，请安装并登录 Claude CLI。"
fi

if ! command_exists codex; then
  say "⚠️  未找到 codex 命令。Codex 任务会不可用，可以稍后再配置。"
fi

if process_alive "$PID_DIR/server.pid"; then
  say "✓ 后端已在运行"
else
  rm -f "$PID_DIR/server.pid"
  if port_busy "$PORT"; then
    if url_ok "$SERVER_URL/api/health"; then
      say "✓ 后端端口 $PORT 已有可用服务（非当前脚本托管）"
    else
      echo "❌ 后端端口 $PORT 已被占用。请先运行 ./scripts/status.sh 查看状态，或换一个 PORT。"
      exit 1
    fi
  else
    if [ ! -d "$ROOT/node_modules" ]; then
      say "▶ 安装后端依赖..."
      npm install >> "$LOG_DIR/install.log" 2>&1
    fi

    say "▶ 启动后端: $SERVER_URL"
    nohup node "$ROOT/server/index.js" > "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_DIR/server.pid"
    say "  后端 PID: $SERVER_PID"

    if ! wait_for_url "$SERVER_URL/api/health" "后端"; then
      echo "❌ 后端启动超时，请查看 $LOG_DIR/server.log"
      kill "$SERVER_PID" 2>/dev/null || true
      rm -f "$PID_DIR/server.pid"
      exit 1
    fi
  fi
fi

if [ "$MODE" = "dev" ]; then
  if process_alive "$PID_DIR/frontend.pid"; then
    say "✓ 前端已在运行"
  else
    rm -f "$PID_DIR/frontend.pid"
    if port_busy "$FRONTEND_PORT"; then
      if url_ok "$FRONTEND_URL"; then
        say "✓ 前端端口 $FRONTEND_PORT 已有可用服务（非当前脚本托管）"
      else
        echo "❌ 前端端口 $FRONTEND_PORT 已被占用。请先运行 ./scripts/status.sh 查看状态，或换一个 FRONTEND_PORT。"
        exit 1
      fi
    else
      if [ ! -d "$ROOT/web/node_modules" ]; then
        say "▶ 安装前端依赖..."
        (cd "$ROOT/web" && npm install) >> "$LOG_DIR/install.log" 2>&1
      fi

      say "▶ 启动前端: $FRONTEND_URL"
      (cd "$ROOT/web" && nohup npx vite --host "$HOST" --port "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$PID_DIR/frontend.pid")
      FRONTEND_PID=$(cat "$PID_DIR/frontend.pid")
      say "  前端 PID: $FRONTEND_PID"

      if ! wait_for_url "$FRONTEND_URL" "前端"; then
        echo "❌ 前端启动超时，请查看 $LOG_DIR/frontend.log"
        kill "$FRONTEND_PID" 2>/dev/null || true
        rm -f "$PID_DIR/frontend.pid"
        exit 1
      fi
    fi
  fi
  open_url "$FRONTEND_URL"
else
  say "生产模式仅启动后端。请确保前端已构建并由后端或外部服务托管。"
  open_url "$SERVER_URL"
fi

say ""
say "✓ AICron 已启动"
say "  访问地址: $FRONTEND_URL"
say "  日志目录: $LOG_DIR/"
say "  停止服务: ./scripts/stop.sh"
