#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$DIR/app/scripts" ]; then
  ROOT="$DIR/app"
else
  ROOT="$(cd "$DIR/../.." && pwd)"
fi

"$ROOT/scripts/stop.sh"

echo ""
echo "AICron 已停止。"
