import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Conversation Hub web history visibility', () => {
  let db: any = null

  beforeEach(async () => {
    vi.resetModules()
    const { DatabaseSync } = await import('node:sqlite')
    db = new DatabaseSync(':memory:')

    vi.doMock('../../packages/server/src/db/index', () => ({
      getDb: () => db,
      getStoragePath: () => ':memory:',
      isSqliteAvailable: () => true,
      jsonSet: vi.fn(),
      jsonGet: vi.fn(),
      jsonGetAll: vi.fn(),
      jsonDelete: vi.fn(),
    }))
    vi.doMock('../../packages/server/src/services/hermes/hermes-profile', () => ({
      getActiveProfileName: () => 'default',
      getActiveProfileDir: () => '/tmp/unused',
    }))
    vi.doMock('../../packages/server/src/routes/hermes/group-chat', () => ({
      getGroupChatServer: () => null,
    }))
    vi.doMock('../../packages/server/src/services/logger', () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }))
  })

  afterEach(() => {
    db?.close()
    db = null
    vi.doUnmock('../../packages/server/src/db/index')
    vi.doUnmock('../../packages/server/src/services/hermes/hermes-profile')
    vi.doUnmock('../../packages/server/src/routes/hermes/group-chat')
    vi.doUnmock('../../packages/server/src/services/logger')
    vi.resetModules()
  })

  it('makes a Weixin channel conversation visible through the Web history controller', async () => {
    const { initAllHermesTables } = await import('../../packages/server/src/db/hermes/schemas')
    initAllHermesTables()

    const { createConversationHub } = await import('../../packages/server/src/services/agentic/conversation-hub')
    const hub = createConversationHub({
      createRuntimeAdapter: () => ({
        provider: 'zylos',
        sendMessage: async () => ({
          id: 'hxa_run_1',
          provider: 'zylos',
          model: 'hxa:zylos-main',
          outputText: '微信回复',
          channelId: 'channel-1',
        }),
        getStatus: () => ({ provider: 'zylos', available: true, mode: 'active' }),
      }),
      countTokens: (text) => String(text).length,
      nowSeconds: () => 1778933000,
      logger: { warn: vi.fn() },
    })

    const result = await hub.receiveMessage({
      channel: 'weixin',
      externalUserId: 'wx-user-1',
      text: '微信问题',
      profile: 'default',
    })

    const sessionsController = await import('../../packages/server/src/controllers/hermes/sessions')
    const listCtx: any = { query: {}, body: null }
    await sessionsController.listConversations(listCtx)

    expect(listCtx.body.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: result.sessionId,
        title: 'Weixin wx-user-1',
        workspace: 'channel:weixin',
        message_count: 2,
      }),
    ]))

    const detailCtx: any = { params: { id: result.sessionId }, query: {}, body: null }
    await sessionsController.getConversationMessages(detailCtx)

    expect(detailCtx.body).toMatchObject({
      session_id: result.sessionId,
      visible_count: 2,
      thread_session_count: 1,
    })
    expect(detailCtx.body.messages.map((message: any) => ({
      role: message.role,
      content: message.content,
    }))).toEqual([
      { role: 'user', content: '微信问题' },
      { role: 'assistant', content: '微信回复' },
    ])
  })

  it('keeps runtime trace visible in the Web conversation monitor detail', async () => {
    const { initAllHermesTables } = await import('../../packages/server/src/db/hermes/schemas')
    initAllHermesTables()

    const { createConversationHub } = await import('../../packages/server/src/services/agentic/conversation-hub')
    const hub = createConversationHub({
      createRuntimeAdapter: () => ({
        provider: 'zylos',
        sendMessage: async () => ({
          id: 'hxa_run_trace_1',
          provider: 'zylos',
          model: 'hxa:zylos-main',
          outputText: '带来源的回复',
          channelId: 'channel-trace-1',
          messageId: 'message-trace-1',
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
      sessionId: 'web-session-trace',
      text: 'Web 来源追踪',
      profile: 'default',
    })

    const sessionsController = await import('../../packages/server/src/controllers/hermes/sessions')
    const detailCtx: any = { params: { id: result.sessionId }, query: {}, body: null }
    await sessionsController.getConversationMessages(detailCtx)

    expect(detailCtx.body.messages[1]).toMatchObject({
      role: 'assistant',
      content: '带来源的回复',
      runtime_trace: expect.objectContaining({
        channel: 'web',
        runtime_provider: 'zylos',
        runtime_model: 'hxa:zylos-main',
        hxa_channel_id: 'channel-trace-1',
        hxa_message_id: 'message-trace-1',
        worker_dispatched: true,
        worker_bot: 'worker-bot',
        status: 'ok',
      }),
    })
  })
})
