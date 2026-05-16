import { afterEach, describe, expect, it } from 'vitest'
import { status } from '../../packages/server/src/controllers/hermes/runtime'

describe('Runtime controller', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns the deployment configured runtime provider status', async () => {
    process.env = {
      ...originalEnv,
      BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct',
      OPENAI_API_KEY: 'test-key',
    }
    const ctx: any = {}

    await status(ctx)

    expect(ctx.body).toMatchObject({
      provider: 'openai-direct',
      runtime: {
        provider: 'openai-direct',
        available: true,
        mode: 'active',
        missingConfig: [],
      },
    })
  })

  it('returns actionable diagnostics when the runtime is not configured', async () => {
    process.env = {
      ...originalEnv,
      BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct',
      OPENAI_API_KEY: '',
    }
    const ctx: any = {}

    await status(ctx)

    expect(ctx.body).toMatchObject({
      provider: 'openai-direct',
      runtime: {
        provider: 'openai-direct',
        available: false,
        mode: 'not_configured',
        missingConfig: ['OPENAI_API_KEY'],
      },
    })
    expect(ctx.body.runtime.checks).toContainEqual(expect.objectContaining({
      key: 'OPENAI_API_KEY',
      ok: false,
      required: true,
    }))
  })
})
