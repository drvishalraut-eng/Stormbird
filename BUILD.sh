#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# BUILD.sh — Stormbird macOS build script
# Produces: dist-mac/Stormbird-darwin-x64/Stormbird.app
#
# Requirements:
#   - Node.js 18+
#   - npm install --ignore-scripts  (run once, or when packages change)
#
# Usage:
#   chmod +x BUILD.sh
#   ./BUILD.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "⚡ Stormbird macOS build"
echo "========================"

# Step 1 — Build React UI
echo ""
echo "→ Building React UI..."
npm run build

# Step 2 — Package with electron-packager
echo ""
echo "→ Packaging .app bundle..."
npx electron-packager . Stormbird \
  --platform=darwin \
  --arch=x64 \
  --out=dist-mac \
  --overwrite \
  --no-asar \
  --icon=build-assets/icon.icns \
  --prune=true \
  --ignore=src \
  --ignore=dist-mac \
  --ignore=dist-win \
  --app-version=$(node -e "console.log(require('./package.json').version)")

echo ""
echo "✓ Build complete!"
echo ""
echo "App bundle: dist-mac/Stormbird-darwin-x64/Stormbird.app"
echo ""
echo "To run:"
echo "  open dist-mac/Stormbird-darwin-x64/Stormbird.app"
echo ""
echo "To create a DMG (requires create-dmg):"
echo "  npx create-dmg dist-mac/Stormbird-darwin-x64/Stormbird.app dist-mac"
