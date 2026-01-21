#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKGROOT="$ROOT_DIR/build/pkgroot"
OUTDIR="$ROOT_DIR/packaged"

VERSION="${VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
IDENTIFIER="${IDENTIFIER:-ai.opencode.mcp-skill-tool}"

BIN_SRC="${BIN_SRC:-$ROOT_DIR/packaged/mcp-skill-tool-macos-arm64}"
BIN_NAME="mcp-skill-tool"
PKG_BASENAME="${PKG_BASENAME:-mcp-skill-tool-${VERSION}}"

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Missing binary: $BIN_SRC"
  echo "Run: npm run package"
  exit 1
fi

rm -rf "$PKGROOT"
mkdir -p "$PKGROOT/usr/local/bin" "$OUTDIR"

cp "$BIN_SRC" "$PKGROOT/usr/local/bin/$BIN_NAME"
chmod 755 "$PKGROOT/usr/local/bin/$BIN_NAME"

pkgbuild \
  --root "$PKGROOT" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location "/" \
  "$OUTDIR/${PKG_BASENAME}.pkg"

echo "Wrote: $OUTDIR/${PKG_BASENAME}.pkg"
