#!/bin/sh
set -eu

backend_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project_root=$(CDPATH= cd -- "$backend_root/.." && pwd)
cd "$project_root"

if [ -f .env.local ]; then
  . ./.env.local
fi

export AGENT_DATA_DIR=${AGENT_DATA_DIR:-"$project_root/.data"}
export MEM0_DATA_DIR=${MEM0_DATA_DIR:-"$AGENT_DATA_DIR/mem0"}
export MEM0_BASE_URL=${MEM0_BASE_URL:-"http://127.0.0.1:8766"}
export MEM0_TELEMETRY=${MEM0_TELEMETRY:-false}
export PRONUNCIATION_ASSESSMENT_ADDR=${PRONUNCIATION_ASSESSMENT_ADDR:-"127.0.0.1:8767"}
export PRONUNCIATION_ASSESSMENT_BASE_URL=${PRONUNCIATION_ASSESSMENT_BASE_URL:-"http://127.0.0.1:8767"}

mem0_pid=""
pronunciation_pid=""
cleanup() {
  if [ -n "$pronunciation_pid" ]; then
    kill "$pronunciation_pid" 2>/dev/null || true
    wait "$pronunciation_pid" 2>/dev/null || true
  fi
  if [ -n "$mem0_pid" ]; then
    kill "$mem0_pid" 2>/dev/null || true
    wait "$mem0_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if ! curl -fsS "$MEM0_BASE_URL/health" >/dev/null 2>&1; then
  node backend/memory/mem0-sidecar.mjs &
  mem0_pid=$!
  attempts=0
  until curl -fsS "$MEM0_BASE_URL/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "Mem0 sidecar did not become ready" >&2
      exit 1
    fi
    sleep 0.1
  done
fi

assessment_enabled=$(printf '%s' "${XUNFEI_ASSESSMENT_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')
if [ "$assessment_enabled" = "1" ] || [ "$assessment_enabled" = "true" ]; then
  if ! curl -fsS "$PRONUNCIATION_ASSESSMENT_BASE_URL/health" >/dev/null 2>&1; then
    node --import tsx live-agent/src/pronunciation-sidecar.ts &
    pronunciation_pid=$!
    attempts=0
    until curl -fsS "$PRONUNCIATION_ASSESSMENT_BASE_URL/health" >/dev/null 2>&1; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 100 ]; then
        echo "Pronunciation assessment sidecar did not become ready" >&2
        exit 1
      fi
      sleep 0.1
    done
  fi
fi

cd backend
go run ./cmd/server
