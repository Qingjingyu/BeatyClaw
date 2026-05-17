#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/agent-stack}"
SMOKE_ROOT="${SMOKE_ROOT:-${DEPLOY_ROOT}/employee-docker-smoke}"
IMAGE="${BEATYCLAW_SMOKE_DOCKER_IMAGE:-beautyclaw-employee-runtime:smoke}"
BUILD_IMAGE="${BEATYCLAW_SMOKE_BUILD_IMAGE:-1}"
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

if [[ "$BUILD_IMAGE" == "1" ]]; then
  log "building image=${IMAGE}"
  docker build -f Dockerfile.employee-runtime -t "$IMAGE" .
fi

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
  -e BEATYCLAW_EMPLOYEE_PORT="$PORT" \
  -e PORT="$PORT" \
  -e BEATYCLAW_HMS_PORT="$PORT" \
  "$IMAGE" >/dev/null

for attempt in {1..30}; do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]] \
    && curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
    log "container running"
    cleanup
    log "container cleanup ok"
    exit 0
  fi
  sleep 0.5
done

log "container did not pass health check"
docker logs "$CONTAINER_NAME" 2>&1 | tail -50 || true
cleanup
exit 1
