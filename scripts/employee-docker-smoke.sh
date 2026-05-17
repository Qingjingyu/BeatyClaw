#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/agent-stack}"
APP_NAME="${APP_NAME:-agentic}"
SMOKE_ROOT="${SMOKE_ROOT:-${DEPLOY_ROOT}/employee-docker-smoke}"
IMAGE="${BEATYCLAW_SMOKE_DOCKER_IMAGE:-$(docker inspect "$APP_NAME" --format '{{.Config.Image}}')}"
CONTAINER_NAME="${CONTAINER_NAME:-beautyclaw-employee-smoke}"
PORT="${PORT:-4899}"

log() {
  printf '[employee-docker-smoke] %s\n' "$*"
}

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

mkdir -p "$SMOKE_ROOT"/{config,data,logs,workspace}
trap cleanup EXIT

log "image=${IMAGE}"
log "root=${SMOKE_ROOT}"
cleanup

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:${PORT}" \
  -v "${SMOKE_ROOT}:/home/agent/employee" \
  -e BEATYCLAW_EMPLOYEE_ID=smoke \
  -e BEATYCLAW_EMPLOYEE_ROOT=/home/agent/employee \
  -e BEATYCLAW_EMPLOYEE_ENGINE=hms \
  --entrypoint node \
  "$IMAGE" \
  -e "setInterval(() => {}, 1000)" >/dev/null

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]]; then
  log "container did not reach running state"
  exit 1
fi

log "container running"
cleanup
log "container cleanup ok"
