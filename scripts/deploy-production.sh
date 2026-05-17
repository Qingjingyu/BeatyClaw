#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-agentic}"
IMAGE_NAME="${IMAGE_NAME:-agentic-yoyoo-saas}"
REPO_URL="${REPO_URL:-https://github.com/Qingjingyu/BeatyClaw.git}"
BRANCH="${BRANCH:-main}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/agent-stack}"
BUILD_DIR="${BUILD_DIR:-${DEPLOY_ROOT}/agentic-build-current}"
PORT="${PORT:-}"
CHECK_PORT="${CHECK_PORT:-}"

timestamp="$(date +%Y%m%d%H%M%S)"
image_tag="${IMAGE_TAG:-${IMAGE_NAME}:prod-${timestamp}}"
prev_name="${APP_NAME}-prev-${timestamp}"
next_name="${APP_NAME}-next-${timestamp}"
env_file="$(mktemp "/tmp/${APP_NAME}-env-${timestamp}.XXXXXX")"
next_env_file="$(mktemp "/tmp/${APP_NAME}-next-env-${timestamp}.XXXXXX")"
cookie_file="$(mktemp "/tmp/${APP_NAME}-cookie-${timestamp}.XXXXXX")"

cleanup() {
  rm -f "$env_file" "$next_env_file" "$cookie_file"
}
trap cleanup EXIT

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

container_env() {
  docker inspect "$APP_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}'
}

env_value() {
  local key="$1"
  grep -E "^${key}=" "$env_file" | tail -1 | cut -d= -f2- || true
}

write_env_with_port() {
  local source_file="$1"
  local target_file="$2"
  local target_port="$3"
  if grep -q '^PORT=' "$source_file"; then
    sed "s/^PORT=.*/PORT=${target_port}/" "$source_file" > "$target_file"
  else
    cp "$source_file" "$target_file"
    printf 'PORT=%s\n' "$target_port" >> "$target_file"
  fi
}

set_env_value() {
  local target_file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$target_file"; then
    sed -i.bak "s/^${key}=.*/${key}=${value}/" "$target_file"
    rm -f "${target_file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$target_file"
  fi
}

curl_public_health() {
  local target_port="$1"
  curl -fsS "http://127.0.0.1:${target_port}/api/auth/status" >/dev/null
}

curl_authenticated_checks() {
  local target_port="$1"
  local include_connectors="${2:-1}"
  local expected_provider="${BEATYCLAW_DEPLOY_EXPECTED_RUNTIME_PROVIDER:-}"
  if [[ -z "${AGENTIC_DEPLOY_VERIFY_EMAIL:-}" || -z "${AGENTIC_DEPLOY_VERIFY_PASSWORD:-}" ]]; then
    log "skip protected API verification: AGENTIC_DEPLOY_VERIFY_EMAIL/PASSWORD not set"
    return 0
  fi

  rm -f "$cookie_file"
  curl -fsS -c "$cookie_file" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${AGENTIC_DEPLOY_VERIFY_EMAIL}\",\"password\":\"${AGENTIC_DEPLOY_VERIFY_PASSWORD}\"}" \
    "http://127.0.0.1:${target_port}/api/yoyoo/auth/login" >/dev/null

  local runtime_json
  runtime_json="$(curl -fsS -b "$cookie_file" "http://127.0.0.1:${target_port}/api/hermes/runtime/status")"
  if [[ -n "$expected_provider" ]]; then
    printf '%s' "$runtime_json" | grep -q "\"provider\":\"${expected_provider}\""
  fi

  if [[ "$include_connectors" == "1" ]]; then
    if printf '%s' "$runtime_json" | grep -q '"provider":"zylos"'; then
      curl -fsS -b "$cookie_file" "http://127.0.0.1:${target_port}/api/agentic/hxa/overview" | grep -q '"online":true'
    fi
    if [[ "${BEATYCLAW_DEPLOY_VERIFY_CONNECTORS:-0}" == "1" ]]; then
      curl -fsS -b "$cookie_file" "http://127.0.0.1:${target_port}/api/hermes/weixin/status" | grep -q '"running":true'
      curl -fsS -b "$cookie_file" "http://127.0.0.1:${target_port}/api/hermes/sessions/conversations?limit=20" | grep -q 'channel:weixin'
    fi
  fi
}

rollback() {
  local reason="$1"
  log "rollback: ${reason}"
  docker logs --tail 100 "$APP_NAME" >&2 || true
  docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
  if docker ps -a --format '{{.Names}}' | grep -qx "$prev_name"; then
    docker rename "$prev_name" "$APP_NAME"
    docker start "$APP_NAME" >/dev/null
  fi
  fail "$reason"
}

require_cmd git
require_cmd docker
require_cmd curl
require_cmd grep
require_cmd sed

docker ps -a --format '{{.Names}}' | grep -qx "$APP_NAME" || fail "container ${APP_NAME} not found"

log "sync source: ${REPO_URL} ${BRANCH}"
if [[ -d "${BUILD_DIR}/.git" ]]; then
  git -C "$BUILD_DIR" fetch origin "$BRANCH"
  git -C "$BUILD_DIR" reset --hard "origin/${BRANCH}"
else
  rm -rf "$BUILD_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$BUILD_DIR"
fi

commit="$(git -C "$BUILD_DIR" rev-parse --short HEAD)"
log "build image: ${image_tag} from ${commit}"
docker build -t "$image_tag" "$BUILD_DIR"

container_env > "$env_file"
for deploy_env_key in \
  BEATYCLAW_RUNTIME_PROVIDER \
  BEATYCLAW_HMS_INSTALL_MODE \
  BEATYCLAW_HMS_PORT \
  BEATYCLAW_HMS_HOST \
  BEATYCLAW_HMS_HEALTH_URL \
  BEATYCLAW_HMS_START_COMMAND \
  BEATYCLAW_HMS_START_ARGS \
  BEATYCLAW_HMS_MODEL \
  BEATYCLAW_HMS_MODEL_PROVIDER \
  BEATYCLAW_HMS_MODEL_BASE_URL \
  BEATYCLAW_HMS_MODEL_API_KEY
do
  if [[ -n "${!deploy_env_key:-}" ]]; then
    set_env_value "$env_file" "$deploy_env_key" "${!deploy_env_key}"
  fi
done
if [[ -z "$PORT" ]]; then
  PORT="$(env_value PORT)"
fi
PORT="${PORT:-3457}"
if [[ -z "$CHECK_PORT" ]]; then
  CHECK_PORT="$((PORT + 1))"
fi

write_env_with_port "$env_file" "$next_env_file" "$CHECK_PORT"
# The candidate container must not run external channel pollers in parallel with production.
sed -i.bak \
  -e 's/^WEIXIN_ACCOUNT_ID=.*/WEIXIN_ACCOUNT_ID=/' \
  -e 's/^WEIXIN_TOKEN=.*/WEIXIN_TOKEN=/' \
  -e 's/^TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=/' \
  "$next_env_file"
rm -f "${next_env_file}.bak"

log "start candidate container on port ${CHECK_PORT}: ${next_name}"
docker rm -f "$next_name" >/dev/null 2>&1 || true
docker run -d --name "$next_name" \
  --network host \
  --restart no \
  --volumes-from "$APP_NAME" \
  --env-file "$next_env_file" \
  "$image_tag" dist/server/index.js >/dev/null

sleep 10
docker ps --filter "name=${next_name}" --format '{{.Names}} {{.Status}}' | grep -q "^${next_name} Up" \
  || fail "candidate container failed to start"
curl_public_health "$CHECK_PORT"
curl_authenticated_checks "$CHECK_PORT" 0
docker rm -f "$next_name" >/dev/null

log "switch production container on port ${PORT}"
docker stop "$APP_NAME" >/dev/null
docker rename "$APP_NAME" "$prev_name"

docker run -d --name "$APP_NAME" \
  --network host \
  --restart unless-stopped \
  --volumes-from "$prev_name" \
  --env-file "$env_file" \
  "$image_tag" dist/server/index.js >/dev/null

sleep 10
docker ps --filter "name=${APP_NAME}" --format '{{.Names}} {{.Status}}' | grep -q "^${APP_NAME} Up" \
  || rollback "new production container failed to start"
curl_public_health "$PORT" || rollback "public health check failed"
curl_authenticated_checks "$PORT" 1 || rollback "protected API verification failed"

log "deployed ${image_tag}"
log "previous container retained as ${prev_name}"
