#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
if [ -f "$project_root/.env.local" ]; then
  set -a
  . "$project_root/.env.local"
  set +a
fi

exec "$project_root/node_modules/.bin/tsx" "$project_root/live-agent/src/worker.ts" start
