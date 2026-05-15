import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAgenticChatCompletionBody,
  createHxaMainAgentRun,
  getAgenticRuntimeTarget,
  mapOpenAIChatCompletionChunk,
} from '../../packages/server/src/services/agentic/runtime'

describe('Agentic runtime adapter', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('uses OpenAI-compatible runtime only when server-side key is configured', () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: '', AGENTIC_DEFAULT_MODEL: 'gpt-4.1-mini' }
    expect(getAgenticRuntimeTarget()).toBeNull()

    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/',
      AGENTIC_DEFAULT_MODEL: 'gpt-4.1-mini',
    }

    expect(getAgenticRuntimeTarget()).toEqual({
      upstream: 'https://example.test',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
    })
    expect(getAgenticRuntimeTarget('custom-model')?.model).toBe('custom-model')

    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/v1/',
    }
    expect(getAgenticRuntimeTarget()?.upstream).toBe('https://example.test')
  })

  it('builds chat-completions messages without exposing secrets', () => {
    const body = buildAgenticChatCompletionBody(
      { upstream: 'https://example.test', apiKey: 'secret', model: 'gpt-4.1-mini' },
      {
        instructions: 'You are Agentic.',
        conversation_history: [
          { role: 'user', content: 'old question' },
          { role: 'assistant', content: 'old answer' },
        ],
      },
      'new question',
    )

    expect(body).toEqual({
      model: 'gpt-4.1-mini',
      stream: true,
      messages: [
        { role: 'system', content: 'You are Agentic.' },
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'new question' },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('maps OpenAI chat completion chunks to response-style stream events', () => {
    expect(mapOpenAIChatCompletionChunk({
      id: 'chatcmpl_1',
      model: 'gpt-test',
      choices: [{ delta: { content: 'hello' } }],
    })).toEqual({
      eventType: 'response.output_text.delta',
      responseId: 'chatcmpl_1',
      delta: 'hello',
      model: 'gpt-test',
      usage: undefined,
    })

    expect(mapOpenAIChatCompletionChunk({
      id: 'chatcmpl_1',
      model: 'gpt-test',
      choices: [{ finish_reason: 'stop' }],
    })).toMatchObject({
      eventType: 'response.completed',
      responseId: 'chatcmpl_1',
      model: 'gpt-test',
      finishReason: 'stop',
    })

    expect(mapOpenAIChatCompletionChunk('[DONE]')).toEqual({ eventType: 'response.completed' })
  })

  it('sends Agentic chat input through hxa main agent when hxa runtime is configured', async () => {
    process.env = {
      ...originalEnv,
      AGENTIC_HXA_RUNTIME_ENABLED: '1',
      AGENTIC_HXA_BASE_URL: 'http://hxa.test/',
      AGENTIC_HXA_TOKEN: 'hxa-token',
      AGENTIC_HXA_MAIN_BOT: 'zylos-main',
      AGENTIC_HXA_REPLY_TIMEOUT_MS: '250',
      AGENTIC_HXA_POLL_INTERVAL_MS: '25',
    }

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'http://hxa.test/api/send') {
        expect(init?.method).toBe('POST')
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer hxa-token')
        expect(JSON.parse(String(init?.body))).toEqual({
          to: 'zylos-main',
          content: 'new question',
        })
        return new Response(JSON.stringify({
          channel_id: 'channel-1',
          message: { id: 'outbound-1', created_at: 1000 },
        }), { status: 200 })
      }
      if (url === 'http://hxa.test/api/channels/channel-1/messages?limit=20') {
        return new Response(JSON.stringify({
          messages: [
            { id: 'reply-1', sender_name: 'zylos-main', content: 'main agent answer', created_at: 1200 },
            { id: 'outbound-1', sender_name: 'agentic', content: 'new question', created_at: 1000 },
          ],
        }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const run = await createHxaMainAgentRun('new question')

    expect(run).toMatchObject({
      id: 'hxa_channel-1_reply-1',
      model: 'hxa:zylos-main',
      outputText: 'main agent answer',
      channelId: 'channel-1',
    })
    expect(JSON.stringify(run)).not.toContain('hxa-token')
  })
})
