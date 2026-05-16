import { describe, expect, it, vi } from 'vitest'
import { createConversationHub } from '../../packages/server/src/services/agentic/conversation-hub'
import type { BeatyClawRuntime } from '../../packages/server/src/services/agentic/runtime-sdk'

describe('Conversation Hub', () => {
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
})
