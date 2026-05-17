import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('deploy-production script', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/deploy-production.sh'), 'utf8')

  it('allows AI runtime environment overrides during production deploys', () => {
    const requiredKeys = [
      'OPENAI_API_KEY',
      'OPENAI_BASE_URL',
      'AGENTIC_DEFAULT_MODEL',
      'AGENTIC_HXA_RUNTIME_ENABLED',
      'AGENTIC_HXA_BASE_URL',
      'AGENTIC_HXA_TOKEN',
      'AGENTIC_HXA_MAIN_BOT',
      'AGENTIC_HXA_REPLY_TIMEOUT_MS',
      'AGENTIC_HXA_POLL_INTERVAL_MS',
      'ZYLOS_MAIN_RUNTIME_ENABLED',
      'ZYLOS_MAIN_HXA_BASE_URL',
      'ZYLOS_MAIN_HXA_TOKEN',
      'ZYLOS_MAIN_BOT_NAME',
      'ZYLOS_MAIN_WORKER_BOT',
      'ZYLOS_MAIN_MODEL',
      'ZYLOS_MAIN_KANBAN_BOARD',
    ]

    for (const key of requiredKeys) {
      expect(script).toContain(key)
    }
  })
})
