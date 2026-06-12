#!/usr/bin/env bash
# Disable AICron autostart on macOS.
set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.aicron.app.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "✓ 已关闭 AICron 开机自动启动"
else
  echo "- AICron 未启用开机自动启动"
fi
