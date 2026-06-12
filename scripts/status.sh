#!/bin/bash
# AICron - 查看服务状态
cd "$(dirname "$0")/.."
ROOT=$(pwd)
PID_DIR="$ROOT/.pids"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5180}"

echo "AICron 状态:"
echo ""

check_process() {
  local name=$1
  local pid_file="$PID_DIR/$2.pid"
  local url=$3

  if [ ! -f "$pid_file" ]; then
    if [ -n "$url" ] && curl -s "$url" > /dev/null 2>&1; then
      printf "  %-8s ⚠️  可访问，但不是当前脚本托管\n" "$name"
      return
    fi
    printf "  %-8s ❌ 未运行 (无 PID 文件)\n" "$name"
    return
  fi

  PID=$(cat "$pid_file")
  if ! kill -0 "$PID" 2>/dev/null; then
    if [ -n "$url" ] && curl -s "$url" > /dev/null 2>&1; then
      printf "  %-8s ⚠️  可访问，但 PID 文件已过期\n" "$name"
      return
    fi
    printf "  %-8s ❌ 已停止 (PID %s 已退出)\n" "$name" "$PID"
    return
  fi

  if [ -n "$url" ]; then
    if curl -s "$url" > /dev/null 2>&1; then
      printf "  %-8s ✅ 运行中 (PID: %s)\n" "$name" "$PID"
    else
      printf "  %-8s ⚠️  进程在但无响应 (PID: %s)\n" "$name" "$PID"
    fi
  else
    printf "  %-8s ✅ 运行中 (PID: %s)\n" "$name" "$PID"
  fi
}

check_process "后端" "server" "http://$HOST:$PORT/api/health"
check_process "前端" "frontend" "http://$HOST:$FRONTEND_PORT"

PLIST_PATH="$HOME/Library/LaunchAgents/com.aicron.app.plist"
if [ -f "$PLIST_PATH" ]; then
  printf "  %-8s ✅ 已启用\n" "自启动"
else
  printf "  %-8s - 未启用\n" "自启动"
fi

echo ""
echo "访问地址: http://$HOST:$FRONTEND_PORT"
echo "日志目录: $ROOT/data/logs"
