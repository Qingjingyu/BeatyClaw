#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-status}"
APP_NAME="${APP_NAME:-agentic}"
IMAGE_NAME="${IMAGE_NAME:-agentic-yoyoo-saas}"
HXA_CONNECT_NAME="${HXA_CONNECT_NAME:-hxa-connect}"
WORKER_BOT_NAME="${WORKER_BOT_NAME:-hxa-worker-bot}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/agent-stack}"
AGENTIC_HERMES_DIR="${AGENTIC_HERMES_DIR:-${DEPLOY_ROOT}/agentic-hermes}"
AGENTIC_WEBUI_DIR="${AGENTIC_WEBUI_DIR:-${DEPLOY_ROOT}/agentic-webui}"
HXA_CONNECT_DIR="${HXA_CONNECT_DIR:-${DEPLOY_ROOT}/hxa-connect}"
WORKER_ENV_FILE="${WORKER_ENV_FILE:-${DEPLOY_ROOT}/hxa-worker-bot/.env}"
PORT="${PORT:-3457}"

log() {
  printf '[runtime-stack] %s\n' "$*"
}

fail() {
  printf '[runtime-stack] ERROR: %s\n' "$*" >&2
  exit 1
}

container_env_value() {
  local name="$1"
  local key="$2"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$key" '$1 == key { value=$0; sub(/^[^=]+=/, "", value); print value }' \
    | tail -1
}

current_image() {
  docker inspect "$APP_NAME" --format '{{.Config.Image}}'
}

ensure_hxa_connect() {
  [[ -d "$HXA_CONNECT_DIR" ]] || fail "missing hxa-connect dir: ${HXA_CONNECT_DIR}"
  log "start ${HXA_CONNECT_NAME}"
  (cd "$HXA_CONNECT_DIR" && docker compose up -d)
}

ensure_worker_bot() {
  [[ -f "$WORKER_ENV_FILE" ]] || fail "missing worker env file: ${WORKER_ENV_FILE}"
  [[ -d "$AGENTIC_HERMES_DIR" ]] || fail "missing Hermes data dir: ${AGENTIC_HERMES_DIR}"
  [[ -d "$AGENTIC_WEBUI_DIR" ]] || fail "missing Web UI data dir: ${AGENTIC_WEBUI_DIR}"

  local image="${WORKER_IMAGE:-$(current_image)}"
  docker tag "$image" "${IMAGE_NAME}:latest"

  if docker ps -a --format '{{.Names}}' | grep -qx "$WORKER_BOT_NAME"; then
    log "replace ${WORKER_BOT_NAME}"
    docker rm -f "$WORKER_BOT_NAME" >/dev/null 2>&1 || true
  fi

  log "start ${WORKER_BOT_NAME} with ${APP_NAME} volumes"
  docker run -d --name "$WORKER_BOT_NAME" \
    --network host \
    --restart unless-stopped \
    --volumes-from "$APP_NAME" \
    --env-file "$WORKER_ENV_FILE" \
    -e HERMES_BIN=/opt/hermes/.venv/bin/hermes \
    -e HERMES_HOME=/home/agent/.hermes \
    -e HERMES_PROFILE=worker-bot \
    -e BOT_NAME=worker-bot \
    -e KANBAN_BOARD=default \
    --entrypoint node \
    "$image" dist/worker-bot/index.js >/dev/null
}

stop_worker_bot() {
  docker rm -f "$WORKER_BOT_NAME" >/dev/null 2>&1 || true
}

stop_hxa_connect() {
  if [[ -d "$HXA_CONNECT_DIR" ]]; then
    (cd "$HXA_CONNECT_DIR" && docker compose down)
  else
    docker rm -f "$HXA_CONNECT_NAME" >/dev/null 2>&1 || true
  fi
}

status() {
  docker ps --filter "name=${APP_NAME}" --format '{{.Names}} {{.Image}} {{.Status}}'
  docker ps --filter "name=${HXA_CONNECT_NAME}" --format '{{.Names}} {{.Image}} {{.Status}}'
  docker ps --filter "name=${WORKER_BOT_NAME}" --format '{{.Names}} {{.Image}} {{.Status}}'
}

case "$ACTION" in
  start|recover)
    ensure_hxa_connect
    ensure_worker_bot
    sleep 5
    "${BASH_SOURCE%/*}/runtime-healthcheck.sh"
    ;;
  stop)
    stop_worker_bot
    stop_hxa_connect
    log "stopped AI engine sidecars; ${APP_NAME} is left running"
    ;;
  restart)
    stop_worker_bot
    ensure_hxa_connect
    ensure_worker_bot
    sleep 5
    "${BASH_SOURCE%/*}/runtime-healthcheck.sh"
    ;;
  status)
    status
    ;;
  healthcheck)
    "${BASH_SOURCE%/*}/runtime-healthcheck.sh"
    ;;
  *)
    cat >&2 <<EOF
Usage: $0 {start|stop|restart|recover|status|healthcheck}

start/recover  Start hxa-connect and worker-bot, then run healthcheck.
stop           Stop AI engine sidecars only; keep BeatyClaw product container running.
restart        Restart worker-bot and verify the runtime chain.
status         Print container status.
healthcheck    Run runtime-healthcheck.sh.
EOF
    exit 2
    ;;
esac
