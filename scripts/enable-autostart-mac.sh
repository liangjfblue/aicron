#!/usr/bin/env bash
# Enable AICron autostart on macOS through launchd.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.aicron.app.plist"

mkdir -p "$PLIST_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aicron.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ROOT/scripts/start.sh</string>
    <string>dev</string>
    <string>--background</string>
    <string>--no-open</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/data/logs/autostart.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/data/logs/autostart-error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "✓ 已启用 AICron 开机自动启动"
echo "  $PLIST_PATH"
