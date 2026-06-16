#!/usr/bin/env bash
#
# Regenerate the vendored Flatpak sources for offline builds:
#   - flatpak/cargo-sources.json  (from src-tauri/Cargo.lock)
#   - flatpak/node-sources.json   (from pnpm-lock.yaml)
#
# Run this whenever Cargo.lock or pnpm-lock.yaml changes. Requires network
# access (it downloads crate/npm metadata) but the resulting build is fully
# offline, as Flathub requires.
#
# Usage:
#   flatpak/generate-sources.sh
#
# Optional env:
#   FLATPAK_BUILDER_TOOLS  Path to an existing flatpak-builder-tools checkout
#                          (otherwise a shallow clone is made in a temp dir).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/flatpak"

TOOLS_DIR="${FLATPAK_BUILDER_TOOLS:-}"
if [ -z "$TOOLS_DIR" ]; then
  TOOLS_DIR="$(mktemp -d)/flatpak-builder-tools"
  echo "==> Cloning flatpak-builder-tools into $TOOLS_DIR"
  git clone --depth 1 https://github.com/flatpak/flatpak-builder-tools.git "$TOOLS_DIR"
fi

echo "==> Setting up Python environment"
python3 -m venv "$TOOLS_DIR/.venv"
# shellcheck disable=SC1091
source "$TOOLS_DIR/.venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet "aiohttp>=3.9.5" "PyYAML>=6.0.2" "tomlkit>=0.13.3"

echo "==> Generating cargo-sources.json"
python3 "$TOOLS_DIR/cargo/flatpak-cargo-generator.py" \
  "$REPO_ROOT/src-tauri/Cargo.lock" \
  -o "$OUT_DIR/cargo-sources.json"

echo "==> Generating node-sources.json (pnpm)"
( cd "$TOOLS_DIR/node" && python3 -m flatpak_node_generator pnpm \
    "$REPO_ROOT/pnpm-lock.yaml" \
    -o "$OUT_DIR/node-sources.json" )

echo "==> Done. Updated:"
echo "    $OUT_DIR/cargo-sources.json"
echo "    $OUT_DIR/node-sources.json"
