#!/usr/bin/env bash

set -euo pipefail

APP_NAME="鹦鹉剪贴板"
VERSION="$(node -p "require('./package.json').version")"
ARCH_RAW="$(uname -m)"

case "$ARCH_RAW" in
  arm64)
    ARCH_SUFFIX="aarch64"
    ;;
  x86_64)
    ARCH_SUFFIX="x64"
    ;;
  *)
    ARCH_SUFFIX="$ARCH_RAW"
    ;;
esac

APP_BUNDLE="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DMG_DIR="src-tauri/target/release/bundle/dmg"
DMG_PATH="${DMG_DIR}/${APP_NAME}_${VERSION}_${ARCH_SUFFIX}.dmg"
STAGING_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

if [[ "$(uname)" != "Darwin" ]]; then
  echo "package-macos-dmg.sh 只能在 macOS 上执行" >&2
  exit 1
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "未找到 app bundle：$APP_BUNDLE" >&2
  exit 1
fi

mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"

cp -R "$APP_BUNDLE" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "已生成 macOS DMG：$DMG_PATH"
