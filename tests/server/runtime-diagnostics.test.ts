import { describe, expect, it } from 'vitest'
import { getRuntimeDiagnostics } from '../../packages/server/src/services/agentic/runtime-diagnostics'
import type { RuntimeStatus } from '../../packages/server/src/services/agentic/runtime-sdk'

const activeZylosRuntime: RuntimeStatus = {
  provider: 'zylos',
  available: true,
  mode: 'active',
  capabilities: ['chat', 'channel-reply'],
  missingConfig: [],
}

describe('Runtime diagnostics', () => {
  it('reports ok when the zylos runtime chain is configured and hxa has multiple bots online', async () => {
    const diagnostics = await getRuntimeDiagnostics({
      getConfiguredRuntimeProvider: () => 'zylos',
      getConfiguredRuntimeStatus: () => activeZylosRuntime,
      getHxaOverview: async () => ({
        configured: true,
        online: true,
        baseUrl: 'http://hxa.test',
        stats: { online_bot_count: 2 },
      }),
      env: {
        AGENTIC_HXA_TOKEN: 'bot_agentic',
        ZYLOS_MAIN_RUNTIME_ENABLED: '1',
        ZYLOS_MAIN_HXA_TOKEN: 'bot_zylos',
        ZYLOS_MAIN_MODEL: 'gpt-5.5',
        OPENAI_API_KEY: 'key',
        OPENAI_BASE_URL: 'https://key.example',
      } as NodeJS.ProcessEnv,
      existsSync: () => true,
      now: () => new Date('2026-05-17T10:00:00.000Z'),
    })

    expect(diagnostics).toMatchObject({
      status: 'ok',
      provider: 'zylos',
      generatedAt: '2026-05-17T10:00:00.000Z',
    })
    expect(diagnostics.checks).toContainEqual(expect.objectContaining({ key: 'worker-bot', status: 'ok' }))
  })

  it('flags zylos-main when the entry bot and main bot share the same token', async () => {
    const diagnostics = await getRuntimeDiagnostics({
      getConfiguredRuntimeProvider: () => 'zylos',
      getConfiguredRuntimeStatus: () => activeZylosRuntime,
      getHxaOverview: async () => ({
        configured: true,
        online: true,
        baseUrl: 'http://hxa.test',
        stats: { online_bot_count: 2 },
      }),
      env: {
        AGENTIC_HXA_TOKEN: 'same-token',
        ZYLOS_MAIN_RUNTIME_ENABLED: '1',
        ZYLOS_MAIN_HXA_TOKEN: 'same-token',
        OPENAI_API_KEY: 'key',
      } as NodeJS.ProcessEnv,
      existsSync: () => true,
    })

    expect(diagnostics.status).toBe('error')
    expect(diagnostics.checks).toContainEqual(expect.objectContaining({
      key: 'zylos-main',
      status: 'error',
    }))
  })

  it('flags missing model configuration as an actionable error', async () => {
    const diagnostics = await getRuntimeDiagnostics({
      getConfiguredRuntimeProvider: () => 'zylos',
      getConfiguredRuntimeStatus: () => activeZylosRuntime,
      getHxaOverview: async () => ({
        configured: true,
        online: true,
        baseUrl: 'http://hxa.test',
      }),
      env: {
        AGENTIC_HXA_TOKEN: 'bot_agentic',
        ZYLOS_MAIN_RUNTIME_ENABLED: '1',
        ZYLOS_MAIN_HXA_TOKEN: 'bot_zylos',
      } as NodeJS.ProcessEnv,
      existsSync: () => true,
    })

    expect(diagnostics.status).toBe('error')
    expect(diagnostics.checks).toContainEqual(expect.objectContaining({
      key: 'model',
      status: 'error',
      action: '在服务端配置 OpenAI-compatible API Key。',
    }))
  })
})
