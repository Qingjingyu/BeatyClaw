import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConfiguredRuntimeAdapter,
  createOpenAiDirectRuntimeAdapter,
  createRuntimeAdapter,
  createZylosRuntimeAdapter,
  getConfiguredRuntimeProvider,
  getConfiguredRuntimeStatus,
} from '../../packages/server/src/services/agentic/runtime-sdk'

describe('BeatyClaw runtime SDK', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('uses none as the product-shell default runtime provider', () => {
    process.env = { ...originalEnv, BEATYCLAW_RUNTIME_PROVIDER: '' }

    expect(getConfiguredRuntimeProvider()).toBe('none')
    expect(createConfiguredRuntimeAdapter().provider).toBe('none')
    expect(getConfiguredRuntimeStatus()).toMatchObject({
      provider: 'none',
      available: false,
      mode: 'not_configured',
      missingConfig: ['AI_ENGINE'],
    })
  })

  it('reads the deployment runtime provider from BEATYCLAW_RUNTIME_PROVIDER', () => {
    process.env = { ...originalEnv, BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct' }

    expect(getConfiguredRuntimeProvider()).toBe('openai-direct')
    expect(createConfiguredRuntimeAdapter().provider).toBe('openai-direct')
  })

  it('wraps the current Zylos/HXA main agent path behind a product runtime interface', async () => {
    const runtime = createZylosRuntimeAdapter({
      runMainAgent: async (input) => {
        expect(input).toBe('帮我整理今天的任务')
        return {
          id: 'hxa_run_1',
          model: 'hxa:zylos-main',
          outputText: '已整理。',
          channelId: 'channel-1',
          messageId: 'message-1',
        }
      },
    })

    const result = await runtime.sendMessage({
      userId: 'owner',
      sessionId: 'session-1',
      channel: 'web',
      text: '帮我整理今天的任务',
    })

    expect(result).toEqual({
      id: 'hxa_run_1',
      provider: 'zylos',
      model: 'hxa:zylos-main',
      outputText: '已整理。',
      channelId: 'channel-1',
      messageId: 'message-1',
    })
  })

  it('returns null from the Zylos adapter when the current HXA path is not configured', async () => {
    const runtime = createZylosRuntimeAdapter({
      runMainAgent: async () => null,
    })

    await expect(runtime.sendMessage({ text: 'hello' })).resolves.toBeNull()
  })

  it('reports planned providers as unsupported instead of leaking product logic into callers', async () => {
    const runtime = createRuntimeAdapter('openclaw')

    expect(runtime.getStatus()).toMatchObject({
      provider: 'openclaw',
      available: false,
      mode: 'unsupported',
    })
    await expect(runtime.sendMessage({ text: 'hello' })).rejects.toThrow('openclaw runtime adapter is not implemented yet')
  })

  it('keeps the product shell online when no AI engine is installed', async () => {
    const runtime = createRuntimeAdapter('none')

    expect(runtime.getStatus()).toMatchObject({
      provider: 'none',
      available: false,
      mode: 'not_configured',
      missingConfig: ['AI_ENGINE'],
    })
    await expect(runtime.sendMessage({ text: 'hello' })).rejects.toThrow('No AI engine is installed')
  })

  it('calls an OpenAI-compatible API through the openai-direct provider', async () => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/v1',
      AGENTIC_DEFAULT_MODEL: 'gpt-5.5',
    }
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      expect(_url).toBe('https://example.test/v1/chat/completions')
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      })
      expect(JSON.parse(String(init.body))).toMatchObject({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: '你好' }],
      })
      return new Response(JSON.stringify({
        id: 'chatcmpl_1',
        model: 'gpt-5.5',
        choices: [{ message: { content: '你好，我是 OpenAI Direct。' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const runtime = createOpenAiDirectRuntimeAdapter()
    const result = await runtime.sendMessage({ sessionId: 's1', channel: 'web', text: '你好' })

    expect(result).toMatchObject({
      id: 'chatcmpl_1',
      provider: 'openai-direct',
      model: 'gpt-5.5',
      outputText: '你好，我是 OpenAI Direct。',
    })
  })

  it('reports configured runtime status without calling the runtime', () => {
    process.env = {
      ...originalEnv,
      BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct',
      OPENAI_API_KEY: 'test-key',
    }

    expect(getConfiguredRuntimeStatus()).toMatchObject({
      provider: 'openai-direct',
      available: true,
      mode: 'active',
    })
  })

  it('explains missing openai-direct deployment configuration', () => {
    process.env = {
      ...originalEnv,
      BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct',
      OPENAI_API_KEY: '',
    }

    expect(getConfiguredRuntimeStatus()).toMatchObject({
      provider: 'openai-direct',
      available: false,
      mode: 'not_configured',
      missingConfig: ['OPENAI_API_KEY'],
      checks: [
        { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', ok: false, required: true },
        { key: 'OPENAI_BASE_URL', label: 'OpenAI Base URL', ok: true, required: false },
      ],
    })
  })
})
