#!/bin/sh
# debtaur-continuity local install + smoke test (macOS / Linux).
# Usage:  sh install.sh
# Needs:  Node.js 22+ on PATH. Zero npm dependencies.
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 22+ from https://nodejs.org/ then re-run."
  exit 1
fi
ver="$(node -e 'console.log(process.versions.node)')"
major="$(echo "$ver" | cut -d. -f1)"
if [ "$major" -lt 22 ]; then
  echo "Node $ver found, but this demo needs Node 22+. Update Node, then re-run."
  exit 1
fi
echo "Node $ver OK — zero dependencies to install."
echo "Smoke test: start the console with npm run demo, then open http://localhost:8081/"
echo ""
echo "Run the console:  npm run demo   then open http://localhost:8081/"
