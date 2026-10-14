#!/usr/bin/env bash
# Run Rankcall on this computer for day-to-day use: a fast production build on http://localhost:3000.
#   npm run app            build (if the code changed) and start
#   npm run app -- --fresh always rebuild first
#   PORT=3100 npm run app  use another port
# Your data stays in ./data (back it up with: npm run backup). Stop with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/.."

export RANKCALL_LOCAL=1
export NEXT_DIST_DIR=.next-app
export NODE_ENV=production
PORT="${PORT:-3000}"

if [ ! -d node_modules ]; then echo "Installing packages (first run only)…"; npm install --no-audit --no-fund; fi

if [ "${TYPESAFE_API_KEY+set}" = set ] && [ -z "$TYPESAFE_API_KEY" ]; then
  echo "Jev: TYPESAFE_API_KEY is set to empty, so decisions use the offline mock."
elif [ -n "${TYPESAFE_API_KEY:-}" ] || { [ -f .env.local ] && grep -q '^TYPESAFE_API_KEY=.\+' .env.local; }; then
  echo "Jev: live decisions (key found in .env.local)."
else
  echo "Jev: no TYPESAFE_API_KEY in .env.local, so decisions use the offline mock (demo quality only)."
fi

# A stable local secret for encrypting stored tokens (Google, Webflow), kept with your data, never in git.
if [ -z "${APP_SECRET:-}" ] && ! grep -q '^APP_SECRET=.\+' .env.local 2>/dev/null; then
  DATA="${DATA_DIR:-data}"
  mkdir -p "$DATA"
  [ -f "$DATA/.app-secret" ] || { node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" > "$DATA/.app-secret"; chmod 600 "$DATA/.app-secret"; }
  APP_SECRET="$(cat "$DATA/.app-secret")"
  export APP_SECRET
fi
export APP_URL="${APP_URL:-http://localhost:$PORT}"

if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use (is 'npm run dev' or another copy running?). Stop it, or run: PORT=3100 npm run app"
  exit 1
fi

# Rebuild when asked, when there is no build yet, or when any source file is newer than the last build.
stamp=".next-app/BUILD_ID"
if [ "${1:-}" = "--fresh" ] || [ ! -f "$stamp" ] || [ -n "$(find src next.config.ts package.json -newer "$stamp" -type f -print -quit 2>/dev/null)" ]; then
  echo "Building Rankcall (about a minute)…"
  npx next build
  git checkout -- tsconfig.json 2>/dev/null || true
fi

echo "Rankcall is running at http://localhost:$PORT  (Ctrl+C to stop)"
exec npx next start -p "$PORT"
