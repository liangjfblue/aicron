#!/usr/bin/env bash
# Build Mac and Windows V1 zip packages for non-technical users.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
OUT_DIR="$ROOT/dist-packages"
STAGE_DIR="$OUT_DIR/stage"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "dev")

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$OUT_DIR"

copy_app() {
  local target=$1
  mkdir -p "$target/app"
  rsync -a "$ROOT/" "$target/app/" \
    --exclude '.git/' \
    --exclude '.pids/' \
    --exclude 'data/' \
    --exclude 'node_modules/' \
    --exclude 'web/node_modules/' \
    --exclude 'web/dist/' \
    --exclude 'dist-packages/' \
    --exclude '.env' \
    --exclude '.superpowers/'
}

MAC_DIR="$STAGE_DIR/AICron-mac"
WIN_DIR="$STAGE_DIR/AICron-windows"

copy_app "$MAC_DIR"
cp "$ROOT/launchers/mac/AICron.command" "$MAC_DIR/AICron.command"
cp "$ROOT/launchers/mac/Stop AICron.command" "$MAC_DIR/Stop AICron.command"
cp "$ROOT/launchers/mac/AICron Status.command" "$MAC_DIR/AICron Status.command"
chmod +x "$MAC_DIR"/*.command

copy_app "$WIN_DIR"
cp "$ROOT/launchers/windows/AICron.bat" "$WIN_DIR/AICron.bat"
cp "$ROOT/launchers/windows/Stop AICron.bat" "$WIN_DIR/Stop AICron.bat"
cp "$ROOT/launchers/windows/AICron Status.bat" "$WIN_DIR/AICron Status.bat"
cp "$ROOT/launchers/windows/AICron Doctor.bat" "$WIN_DIR/AICron Doctor.bat"

(cd "$STAGE_DIR" && zip -qr "$OUT_DIR/AICron-mac-$VERSION.zip" AICron-mac)
(cd "$STAGE_DIR" && zip -qr "$OUT_DIR/AICron-windows-$VERSION.zip" AICron-windows)

echo "✓ V1 分享包已生成"
echo "  $OUT_DIR/AICron-mac-$VERSION.zip"
echo "  $OUT_DIR/AICron-windows-$VERSION.zip"
