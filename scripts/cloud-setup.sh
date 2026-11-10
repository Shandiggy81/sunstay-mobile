#!/usr/bin/env bash
# Install step for a Claude Code cloud environment (or any fresh Linux container).
# Needs Node 22 and network access to the npm registry and Playwright's browser CDN.
# Needs no API credentials: unit tests, the build and the smoke tests all run without any.
# Do not add secrets here. The seed and Supabase scripts are deliberately not run.
set -euo pipefail

cd "$(dirname "$0")/.."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" != "22" ]; then
  echo "warning: Node $node_major found; CI and Netlify use Node 22." >&2
fi

npm ci

# Chromium for `npm run test:smoke`. If the download is blocked, the unit tests and
# build still work; point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at an installed Chromium instead.
if ! npx playwright install --with-deps chromium; then
  echo "warning: Chromium was not installed, so 'npm run test:smoke' will not run." >&2
  echo "         Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an existing Chromium to use it." >&2
fi

echo "Ready: npm test | npm run build | npm run test:smoke | npm run dev -- --port 5173 --strictPort"
