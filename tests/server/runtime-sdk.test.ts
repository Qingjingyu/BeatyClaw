import { describe, expect, it } from 'vitest'
import {
  createRuntimeAdapter,
  createZylosRuntimeAdapter,
} from '../../packages/server/src/services/agentic/runtime-sdk'

describe('BeatyClaw runtime SDK', () => {
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

  it('reports planned providers as unsupported instead of leaking product logic into callers', async () => {
    const runtime = createRuntimeAdapter('openclaw')

    expect(runtime.getStatus()).toMatchObject({
      provider: 'openclaw',
      available: false,
      mode: 'unsupported',
    })
    await expect(runtime.sendMessage({ text: 'hello' })).rejects.toThrow('openclaw runtime adapter is not implemented yet')
  })
})
