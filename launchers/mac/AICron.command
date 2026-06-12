#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$DIR/app/scripts" ]; then
  ROOT="$DIR/app"
else
  ROOT="$(cd "$DIR/../.." && pwd)"
fi

"$ROOT/scripts/start.sh" dev

echo ""
echo "可以关闭这个窗口，AICron 会继续在后台运行。"
echo "停止服务请双击 Stop AICron.command。"
