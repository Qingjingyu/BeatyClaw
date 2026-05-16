import { afterEach, describe, expect, it } from 'vitest'
import {
  buildHxaInputFromWeixin,
  extractWeixinText,
  getWeixinSkipReason,
  getWeixinRuntimeStatus,
  resetWeixinRuntimeForTest,
  shouldHandleWeixinMessage,
} from '../../packages/server/src/services/agentic/weixin-runtime'

describe('Weixin runtime helpers', () => {
  afterEach(() => {
    resetWeixinRuntimeForTest()
  })

  it('extracts text content from Weixin text items only', () => {
    expect(extractWeixinText({
      item_list: [
        { type: 1, text_item: { text: '第一句' } },
        { type: 2 },
        { type: 1, text_item: { text: '第二句' } },
      ],
    })).toBe('第一句\n第二句')
  })

  it('filters outbound, self, empty, and non-replyable messages', () => {
    const base = {
      from_user_id: 'user-1',
      context_token: 'ctx-1',
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    }

    expect(shouldHandleWeixinMessage(base, 'bot-1')).toBe(true)
    expect(shouldHandleWeixinMessage({ ...base, message_type: 2 }, 'bot-1')).toBe(false)
    expect(shouldHandleWeixinMessage({ ...base, from_user_id: 'bot-1' }, 'bot-1')).toBe(false)
    expect(shouldHandleWeixinMessage({ ...base, context_token: undefined }, 'bot-1')).toBe(false)
    expect(shouldHandleWeixinMessage({ ...base, item_list: [] }, 'bot-1')).toBe(false)
  })

  it('reports concrete skip reasons for unhandled messages', () => {
    const base = {
      from_user_id: 'user-1',
      context_token: 'ctx-1',
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    }

    expect(getWeixinSkipReason(base, 'bot-1')).toBeNull()
    expect(getWeixinSkipReason({ ...base, message_type: 2 }, 'bot-1')).toBe('outbound_message')
    expect(getWeixinSkipReason({ ...base, from_user_id: 'bot-1' }, 'bot-1')).toBe('self_message')
    expect(getWeixinSkipReason({ ...base, from_user_id: undefined }, 'bot-1')).toBe('missing_from_user_id')
    expect(getWeixinSkipReason({ ...base, context_token: undefined }, 'bot-1')).toBe('missing_context_token')
    expect(getWeixinSkipReason({ ...base, item_list: [] }, 'bot-1')).toBe('missing_text')
  })

  it('builds hxa input with source metadata and user text', () => {
    expect(buildHxaInputFromWeixin({
      from_user_id: 'user-1',
      context_token: 'ctx-1',
    }, '帮我创建一个任务')).toBe([
      '[Weixin inbound]',
      'from=user-1',
      '',
      '帮我创建一个任务',
    ].join('\n'))
  })

  it('reports disabled status without exposing tokens', () => {
    const status = getWeixinRuntimeStatus()
    expect(status.running).toBe(false)
    expect(status.configured).toBe(false)
    expect(status.messages_seen).toBe(0)
    expect(status.messages_skipped_recent).toBe(0)
    expect(status.messages_skipped_unhandled).toBe(0)
    expect(JSON.stringify(status)).not.toContain('token')
  })
})
