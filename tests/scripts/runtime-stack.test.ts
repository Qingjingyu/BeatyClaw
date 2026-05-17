import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('runtime orchestration scripts', () => {
  const stackScript = readFileSync(join(process.cwd(), 'scripts/runtime-stack.sh'), 'utf8')
  const healthcheckScript = readFileSync(join(process.cwd(), 'scripts/runtime-healthcheck.sh'), 'utf8')
  const employeeDockerSmokeScript = readFileSync(join(process.cwd(), 'scripts/employee-docker-smoke.sh'), 'utf8')

  it('starts worker-bot with the same BeatyClaw data mounts as the product container', () => {
    expect(stackScript).toContain('AGENTIC_HERMES_DIR="${AGENTIC_HERMES_DIR:-${DEPLOY_ROOT}/agentic-hermes}"')
    expect(stackScript).toContain('AGENTIC_WEBUI_DIR="${AGENTIC_WEBUI_DIR:-${DEPLOY_ROOT}/agentic-webui}"')
    expect(stackScript).toContain('--volumes-from "$APP_NAME"')
    expect(healthcheckScript).toContain("check_mount \"$APP_NAME\" \"$AGENTIC_HERMES_DIR\" '/home/agent/.hermes'")
    expect(healthcheckScript).toContain("check_mount \"$WORKER_BOT_NAME\" \"$AGENTIC_HERMES_DIR\" '/home/agent/.hermes'")
    expect(healthcheckScript).toContain("check_mount \"$APP_NAME\" \"$AGENTIC_WEBUI_DIR\" '/home/agent/.hermes-web-ui'")
    expect(healthcheckScript).toContain("check_mount \"$WORKER_BOT_NAME\" \"$AGENTIC_WEBUI_DIR\" '/home/agent/.hermes-web-ui'")
  })

  it('keeps agentic-client, zylos-main, and worker-bot token identities separated', () => {
    expect(healthcheckScript).toContain('AGENTIC_HXA_TOKEN and ZYLOS_MAIN_HXA_TOKEN must be different bot identities')
    expect(healthcheckScript).toContain('HXA_TOKEN and ZYLOS_MAIN_HXA_TOKEN must be different bot identities')
    expect(healthcheckScript).toContain('container_env_value "$APP_NAME" AGENTIC_HXA_TOKEN')
    expect(healthcheckScript).toContain('container_env_value "$APP_NAME" ZYLOS_MAIN_HXA_TOKEN')
    expect(healthcheckScript).toContain('container_env_value "$WORKER_BOT_NAME" HXA_TOKEN')
  })

  it('runs authenticated runtime diagnostics when deploy credentials are provided', () => {
    expect(healthcheckScript).toContain('AGENTIC_DEPLOY_VERIFY_EMAIL')
    expect(healthcheckScript).toContain('/api/hermes/runtime/diagnostics')
    expect(healthcheckScript).toContain('"status":"ok"')
  })

  it('provides a server smoke test for employee docker runtime containers', () => {
    expect(employeeDockerSmokeScript).toContain('CONTAINER_NAME="${CONTAINER_NAME:-beautyclaw-employee-smoke}"')
    expect(employeeDockerSmokeScript).toContain('Dockerfile.employee-runtime')
    expect(employeeDockerSmokeScript).toContain('-v "${SMOKE_ROOT}:/home/agent/employee"')
    expect(employeeDockerSmokeScript).toContain('-e BEATYCLAW_EMPLOYEE_PORT="$PORT"')
    expect(employeeDockerSmokeScript).toContain('curl -fsS "http://127.0.0.1:${PORT}/health"')
    expect(employeeDockerSmokeScript).toContain("docker inspect -f '{{.State.Running}}'")
    expect(employeeDockerSmokeScript).toContain('docker rm -f "$CONTAINER_NAME"')
  })
})
