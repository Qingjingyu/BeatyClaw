import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConversationHub } from '../../packages/server/src/services/agentic/conversation-hub'
import type { BeatyClawRuntime, BeatyClawRuntimeProvider } from '../../packages/server/src/services/agentic/runtime-sdk'

describe('Conversation Hub', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it('stores channel user and assistant messages in a stable product session before returning channel reply', async () => {
    const sessions = new Map<string, any>()
    const messages: any[] = []
    const usage: any[] = []
    const runtimeSendMessage = vi.fn(async (input) => ({
      id: 'hxa_run_1',
      provider: 'zylos' as const,
      model: 'hxa:zylos-main',
      outputText: '你好，我是 BeatyClaw。',
      channelId: 'channel-1',
      messageId: 'message-1',
    }))

    const runtime: BeatyClawRuntime = {
      provider: 'zylos',
      sendMessage: runtimeSendMessage,
      getStatus: () => ({ provider: 'zylos', available: true, mode: 'active' }),
    }

    const hub = createConversationHub({
      getSession: (id) => sessions.get(id) || null,
      createSession: (data) => {
        const row = { ...data, id: data.id, profile: data.profile || 'default' }
        sessions.set(data.id, row)
        return row as any
      },
      addMessage: (message) => {
        messages.push(message)
        return messages.length
      },
      updateSessionStats: vi.fn(),
      updateUsage: (sessionId, data) => usage.push({ sessionId, data }),
      createRuntimeAdapter: () => runtime,
      countTokens: (text) => String(text).length,
      nowSeconds: () => 1778933000,
      logger: { warn: vi.fn() },
    })

    const result = await hub.receiveMessage({
      channel: 'weixin',
      externalUserId: 'wx-user-1',
      text: '你好',
      profile: 'default',
    })

    expect(result.sessionId).toMatch(/^bc_weixin_[a-f0-9]{24}$/)
    expect(result.replyText).toBe('你好，我是 BeatyClaw。')
    expect(sessions.get(result.sessionId)).toMatchObject({
      id: result.sessionId,
      profile: 'default',
      title: 'Weixin wx-user-1',
      workspace: 'channel:weixin',
    })
    expect(messages).toEqual([
      expect.objectContaining({
        session_id: result.sessionId,
        role: 'user',
        content: '你好',
      }),
      expect.objectContaining({
        session_id: result.sessionId,
        role: 'assistant',
        content: '你好，我是 BeatyClaw。',
      }),
    ])
    expect(runtimeSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'wx-user-1',
      sessionId: result.sessionId,
      channel: 'weixin',
      text: '[weixin inbound]\nfrom=wx-user-1\n\n你好',
    }))
    expect(usage).toEqual([
      {
        sessionId: result.sessionId,
        data: expect.objectContaining({
          inputTokens: 2,
          outputTokens: 16,
          model: 'hxa:zylos-main',
          profile: 'default',
        }),
      },
    ])
  })

  it('reuses the same product session for the same channel user', async () => {
    const sessions = new Map<string, any>()
    const messages: any[] = []
    const hub = createConversationHub({
      getSession: (id) => sessions.get(id) || null,
      createSession: (data) => {
        sessions.set(data.id, data)
        return data as any
      },
      addMessage: (message) => {
        messages.push(message)
        return messages.length
      },
      updateSessionStats: vi.fn(),
      updateUsage: vi.fn(),
      createRuntimeAdapter: () => ({
        provider: 'zylos',
        sendMessage: async () => null,
        getStatus: () => ({ provider: 'zylos', available: true, mode: 'active' }),
      }),
      countTokens: () => 1,
      nowSeconds: () => 1778933000,
      logger: { warn: vi.fn() },
    })

    const first = await hub.receiveMessage({ channel: 'weixin', externalUserId: 'wx-user-1', text: '第一句' })
    const second = await hub.receiveMessage({ channel: 'weixin', externalUserId: 'wx-user-1', text: '第二句' })

    expect(second.sessionId).toBe(first.sessionId)
    expect(sessions.size).toBe(1)
    expect(messages.map(message => message.content)).toEqual([
      '第一句',
      '我收到消息了，但当前没有生成有效回复。',
      '第二句',
      '我收到消息了，但当前没有生成有效回复。',
    ])
  })

  it('uses the deployment configured runtime provider when the channel does not override it', async () => {
    process.env = { ...originalEnv, BEATYCLAW_RUNTIME_PROVIDER: 'openai-direct' }
    const requestedProviders: BeatyClawRuntimeProvider[] = []

    const hub = createConversationHub({
      getSession: () => null,
      createSession: (data) => data as any,
      addMessage: vi.fn(),
      updateSessionStats: vi.fn(),
      updateUsage: vi.fn(),
      createRuntimeAdapter: (provider) => {
        requestedProviders.push(provider)
        return {
          provider,
          sendMessage: async () => ({
            id: 'openai_direct_1',
            provider,
            model: 'openai-direct:gpt-5.5',
            outputText: 'direct reply',
          }),
          getStatus: () => ({ provider, available: true, mode: 'active' }),
        }
      },
      countTokens: () => 1,
      nowSeconds: () => 1778933000,
      logger: { warn: vi.fn() },
    })

    const result = await hub.receiveMessage({ channel: 'weixin', externalUserId: 'wx-user-1', text: '你好' })

    expect(requestedProviders).toEqual(['openai-direct'])
    expect(result.runtimeProvider).toBe('openai-direct')
    expect(result.replyText).toBe('direct reply')
  })

  it('lets Web chat enter the unified product session and records reply trace metadata', async () => {
    const sessions = new Map<string, any>()
    const messages: any[] = []

    const hub = createConversationHub({
      getSession: (id) => sessions.get(id) || null,
      createSession: (data) => {
        sessions.set(data.id, data)
        return data as any
      },
      addMessage: (message) => {
        messages.push(message)
        return messages.length
      },
      updateSessionStats: vi.fn(),
      updateUsage: vi.fn(),
      createRuntimeAdapter: () => ({
        provider: 'zylos',
        sendMessage: async () => ({
          id: 'hxa_run_web_1',
          provider: 'zylos',
          model: 'hxa:zylos-main',
          outputText: 'Web 统一回复',
          channelId: 'channel-web-1',
          messageId: 'message-web-1',
          workerDispatched: true,
          workerBot: 'worker-bot',
        }),
        getStatus: () => ({ provider: 'zylos', available: true, mode: 'active' }),
      }),
      countTokens: (text) => String(text).length,
      nowSeconds: () => 1778933000,
      logger: { warn: vi.fn() },
    })

    const result = await hub.receiveMessage({
      channel: 'web',
      externalUserId: 'web-user-1',
      sessionId: 'web-session-1',
      text: 'Web 问题',
      profile: 'default',
    })

    expect(result.sessionId).toBe('web-session-1')
    expect(sessions.get('web-session-1')).toMatchObject({
      id: 'web-session-1',
      title: 'Web web-user-1',
      workspace: 'channel:web',
    })
    expect(messages[1]).toMatchObject({
      session_id: 'web-session-1',
      role: 'assistant',
      content: 'Web 统一回复',
    })
    expect(JSON.parse(messages[1].reasoning_details)).toMatchObject({
      channel: 'web',
      runtime_provider: 'zylos',
      runtime_model: 'hxa:zylos-main',
      runtime_run_id: 'hxa_run_web_1',
      hxa_channel_id: 'channel-web-1',
      hxa_message_id: 'message-web-1',
      worker_dispatched: true,
      worker_bot: 'worker-bot',
      status: 'ok',
    })
    expect(result.trace).toMatchObject({
      channel: 'web',
      runtimeProvider: 'zylos',
      workerDispatched: true,
      workerBot: 'worker-bot',
      status: 'ok',
    })
  })

  it('persists an actionable assistant failure when the runtime throws', async () => {
    const messages: any[] = []
    const warn = vi.fn()

    const hub = createConversationHub({
      getSession: () => null,
      createSession: (data) => data as any,
      addMessage: (message) => {
        messages.push(message)
        return messages.length
      },
      updateSessionStats: vi.fn(),
      updateUsage: vi.fn(),
      createRuntimeAdapter: () => ({
        provider: 'openai-direct',
        sendMessage: async () => {
          throw new Error('bad gateway')
        },
        getStatus: () => ({ provider: 'openai-direct', available: true, mode: 'active' }),
      }),
      countTokens: (text) => String(text).length,
      nowSeconds: () => 1778933000,
      logger: { warn },
    })

    const result = await hub.receiveMessage({
      channel: 'weixin',
      externalUserId: 'wx-user-1',
      text: '会失败的问题',
      runtimeProvider: 'openai-direct',
    })

    expect(result.replyText).toBe('我收到消息了，但当前 AI 能力端暂时不可用，请稍后再试。')
    expect(JSON.parse(messages[1].reasoning_details)).toMatchObject({
      channel: 'weixin',
      runtime_provider: 'openai-direct',
      status: 'failed',
      error: 'bad gateway',
    })
    expect(result.trace).toMatchObject({
      channel: 'weixin',
      runtimeProvider: 'openai-direct',
      status: 'failed',
      error: 'bad gateway',
    })
    expect(warn).toHaveBeenCalled()
  })
})
