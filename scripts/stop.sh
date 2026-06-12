#!/bin/bash
# AICron - AI 任务调度平台停止脚本
set -e

cd "$(dirname "$0")/.."
ROOT=$(pwd)
PID_DIR="$ROOT/.pids"

echo "■ 停止 AICron..."

# 停止前端
if [ -f "$PID_DIR/frontend.pid" ]; then
  PID=$(cat "$PID_DIR/frontend.pid")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    echo "  ✓ 前端已停止 (PID: $PID)"
  else
    echo "  - 前端进程已不存在"
  fi
  rm -f "$PID_DIR/frontend.pid"
else
  echo "  - 未找到前端 PID 文件"
fi

# 停止后端
if [ -f "$PID_DIR/server.pid" ]; then
  PID=$(cat "$PID_DIR/server.pid")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    # 等待进程退出
    for i in $(seq 1 10); do
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    # 强制杀掉
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null
      echo "  ✓ 后端已强制停止 (PID: $PID)"
    else
      echo "  ✓ 后端已停止 (PID: $PID)"
    fi
  else
    echo "  - 后端进程已不存在"
  fi
  rm -f "$PID_DIR/server.pid"
else
  echo "  - 未找到后端 PID 文件"
fi

echo ""
echo "✓ AICron 已停止"
