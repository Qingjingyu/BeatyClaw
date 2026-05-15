import { afterEach, describe, expect, it } from 'vitest'
import {
  buildHxaInputFromTelegram,
  extractTelegramText,
  getTelegramRuntimeStatus,
  resetTelegramRuntimeForTest,
  shouldHandleTelegramUpdate,
} from '../../packages/server/src/services/agentic/telegram-runtime'

describe('Telegram runtime helpers', () => {
  afterEach(() => {
    resetTelegramRuntimeForTest()
  })

  it('extracts text or caption from Telegram updates', () => {
    expect(extractTelegramText({
      update_id: 1,
      message: { message_id: 10, text: 'hello', chat: { id: 123 } },
    })).toBe('hello')

    expect(extractTelegramText({
      update_id: 2,
      message: { message_id: 11, caption: 'caption text', chat: { id: 123 } },
    })).toBe('caption text')
  })

  it('filters bot, empty, and non-chat updates', () => {
    const base = {
      update_id: 1,
      message: {
        message_id: 10,
        text: '你好',
        chat: { id: 123 },
        from: { id: 456, is_bot: false },
      },
    }

    expect(shouldHandleTelegramUpdate(base)).toBe(true)
    expect(shouldHandleTelegramUpdate({ ...base, message: { ...base.message, from: { id: 456, is_bot: true } } })).toBe(false)
    expect(shouldHandleTelegramUpdate({ ...base, message: { ...base.message, text: '' } })).toBe(false)
    expect(shouldHandleTelegramUpdate({ ...base, message: { ...base.message, chat: undefined } })).toBe(false)
  })

  it('builds hxa input with source metadata and user text', () => {
    expect(buildHxaInputFromTelegram({
      update_id: 1,
      message: {
        message_id: 10,
        text: '帮我创建一个任务',
        chat: { id: 123 },
        from: { id: 456, username: 'subai' },
      },
    }, '帮我创建一个任务')).toBe([
      '[Telegram inbound]',
      'chat=123',
      'from=subai',
      '',
      '帮我创建一个任务',
    ].join('\n'))
  })

  it('reports disabled status without exposing tokens', () => {
    const status = getTelegramRuntimeStatus()
    expect(status.running).toBe(false)
    expect(status.configured).toBe(false)
    expect(JSON.stringify(status)).not.toContain('token')
  })
})
