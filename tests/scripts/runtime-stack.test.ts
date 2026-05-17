import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('runtime orchestration scripts', () => {
  const stackScript = readFileSync(join(process.cwd(), 'scripts/runtime-stack.sh'), 'utf8')
  const healthcheckScript = readFileSync(join(process.cwd(), 'scripts/runtime-healthcheck.sh'), 'utf8')

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
})
