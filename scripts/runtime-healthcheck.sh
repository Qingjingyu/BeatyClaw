#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-agentic}"
HXA_CONNECT_NAME="${HXA_CONNECT_NAME:-hxa-connect}"
WORKER_BOT_NAME="${WORKER_BOT_NAME:-hxa-worker-bot}"
PORT="${PORT:-3457}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/agent-stack}"
AGENTIC_HERMES_DIR="${AGENTIC_HERMES_DIR:-${DEPLOY_ROOT}/agentic-hermes}"
AGENTIC_WEBUI_DIR="${AGENTIC_WEBUI_DIR:-${DEPLOY_ROOT}/agentic-webui}"
HXA_CONNECT_URL="${HXA_CONNECT_URL:-http://127.0.0.1:4800}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://agent.aibosss.com}"

status=0

ok() {
  printf '[ok] %s\n' "$*"
}

warn() {
  printf '[warn] %s\n' "$*"
}

fail() {
  status=1
  printf '[fail] %s\n' "$*" >&2
}

container_running() {
  local name="$1"
  docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -qx true
}

container_env_value() {
  local name="$1"
  local key="$2"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$key" '$1 == key { value=$0; sub(/^[^=]+=/, "", value); print value }' \
    | tail -1
}

container_mount_sources() {
  local name="$1"
  docker inspect "$name" --format '{{range .Mounts}}{{printf "%s=>%s\n" .Source .Destination}}{{end}}' 2>/dev/null
}

check_container() {
  local name="$1"
  if container_running "$name"; then
    ok "container ${name} is running"
  else
    fail "container ${name} is not running"
  fi
}

check_mount() {
  local name="$1"
  local source="$2"
  local dest="$3"
  if container_mount_sources "$name" | grep -Fxq "${source}=>${dest}"; then
    ok "${name} mounts ${source} -> ${dest}"
  else
    fail "${name} does not mount ${source} -> ${dest}"
  fi
}

check_env_present() {
  local name="$1"
  local key="$2"
  if [[ -n "$(container_env_value "$name" "$key")" ]]; then
    ok "${name} has ${key}"
  else
    fail "${name} missing ${key}"
  fi
}

check_container "$APP_NAME"
check_container "$HXA_CONNECT_NAME"
check_container "$WORKER_BOT_NAME"

check_mount "$APP_NAME" "$AGENTIC_HERMES_DIR" '/home/agent/.hermes'
check_mount "$APP_NAME" "$AGENTIC_WEBUI_DIR" '/home/agent/.hermes-web-ui'
check_mount "$WORKER_BOT_NAME" "$AGENTIC_HERMES_DIR" '/home/agent/.hermes'
check_mount "$WORKER_BOT_NAME" "$AGENTIC_WEBUI_DIR" '/home/agent/.hermes-web-ui'

check_env_present "$APP_NAME" 'AGENTIC_HXA_TOKEN'
check_env_present "$APP_NAME" 'ZYLOS_MAIN_HXA_TOKEN'
check_env_present "$APP_NAME" 'OPENAI_API_KEY'
check_env_present "$WORKER_BOT_NAME" 'HXA_TOKEN'

agentic_token="$(container_env_value "$APP_NAME" AGENTIC_HXA_TOKEN)"
zylos_token="$(container_env_value "$APP_NAME" ZYLOS_MAIN_HXA_TOKEN)"
worker_token="$(container_env_value "$WORKER_BOT_NAME" HXA_TOKEN)"
if [[ -n "$agentic_token" && -n "$zylos_token" && "$agentic_token" == "$zylos_token" ]]; then
  fail 'AGENTIC_HXA_TOKEN and ZYLOS_MAIN_HXA_TOKEN must be different bot identities'
else
  ok 'agentic-client and zylos-main tokens are separated'
fi
if [[ -n "$worker_token" && -n "$zylos_token" && "$worker_token" == "$zylos_token" ]]; then
  fail 'HXA_TOKEN and ZYLOS_MAIN_HXA_TOKEN must be different bot identities'
else
  ok 'worker-bot and zylos-main tokens are separated'
fi

if curl -fsS "${HXA_CONNECT_URL}/health" >/dev/null; then
  ok "hxa-connect health responds at ${HXA_CONNECT_URL}"
else
  fail "hxa-connect health failed at ${HXA_CONNECT_URL}"
fi

if curl -fsS "http://127.0.0.1:${PORT}/api/auth/status" >/dev/null; then
  ok "BeatyClaw local auth status responds on ${PORT}"
else
  fail "BeatyClaw local auth status failed on ${PORT}"
fi

if [[ -n "${AGENTIC_DEPLOY_VERIFY_EMAIL:-}" && -n "${AGENTIC_DEPLOY_VERIFY_PASSWORD:-}" ]]; then
  cookie_file="$(mktemp /tmp/agentic-health-cookie.XXXXXX)"
  cleanup() { rm -f "$cookie_file"; }
  trap cleanup EXIT
  if curl -fsS -c "$cookie_file" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${AGENTIC_DEPLOY_VERIFY_EMAIL}\",\"password\":\"${AGENTIC_DEPLOY_VERIFY_PASSWORD}\"}" \
    "${PUBLIC_BASE_URL}/api/yoyoo/auth/login" >/dev/null; then
    ok 'owner login succeeds'
    diagnostics="$(curl -fsS -b "$cookie_file" "${PUBLIC_BASE_URL}/api/hermes/runtime/diagnostics")"
    if printf '%s' "$diagnostics" | grep -q '"status":"ok"'; then
      ok 'runtime diagnostics are ok'
    else
      fail "runtime diagnostics are not ok: ${diagnostics}"
    fi
  else
    fail 'owner login failed'
  fi
else
  warn 'skip authenticated diagnostics: AGENTIC_DEPLOY_VERIFY_EMAIL/PASSWORD not set'
fi

exit "$status"
