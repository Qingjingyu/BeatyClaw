import { createHash } from 'crypto'
import {
  addMessage,
  createSession,
  getSession,
  updateSessionStats,
} from '../../db/hermes/session-store'
import { updateUsage } from '../../db/hermes/usage-store'
import { countTokens } from '../../lib/context-compressor'
import {
  createRuntimeAdapter,
  getConfiguredRuntimeProvider,
  type BeatyClawRuntime,
  type BeatyClawRuntimeProvider,
  type RuntimeMessageResult,
} from './runtime-sdk'
import { logger } from '../logger'

export interface ConversationHubMessageInput {
  channel: 'web' | 'weixin' | 'telegram' | 'feishu'
  externalUserId: string
  text: string
  profile?: string
  model?: string
  runtimeProvider?: BeatyClawRuntimeProvider
  metadata?: Record<string, unknown>
}

export interface ConversationHubMessageResult {
  sessionId: string
  replyText: string
  runtimeProvider: BeatyClawRuntimeProvider
  runtimeResult: RuntimeMessageResult | null
}

interface ConversationHubDeps {
  getSession: typeof getSession
  createSession: typeof createSession
  addMessage: typeof addMessage
  updateSessionStats: typeof updateSessionStats
  updateUsage: typeof updateUsage
  createRuntimeAdapter: typeof createRuntimeAdapter
  getConfiguredRuntimeProvider: typeof getConfiguredRuntimeProvider
  countTokens: typeof countTokens
  nowSeconds: () => number
  logger: Pick<typeof logger, 'warn'>
}

const CHANNEL_LABELS: Record<ConversationHubMessageInput['channel'], string> = {
  web: 'Web',
  weixin: 'Weixin',
  telegram: 'Telegram',
  feishu: 'Feishu',
}

const DEFAULT_REPLY = '我收到消息了，但当前没有生成有效回复。'
const RUNTIME_ERROR_REPLY = '我收到消息了，但当前 AI 能力端暂时不可用，请稍后再试。'

const defaultDeps: ConversationHubDeps = {
  getSession,
  createSession,
  addMessage,
  updateSessionStats,
  updateUsage,
  createRuntimeAdapter,
  getConfiguredRuntimeProvider,
  countTokens,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  logger,
}

function stableSessionId(channel: string, externalUserId: string): string {
  const digest = createHash('sha256').update(`${channel}:${externalUserId}`).digest('hex').slice(0, 24)
  return `bc_${channel}_${digest}`
}

function buildTitle(input: ConversationHubMessageInput): string {
  const label = CHANNEL_LABELS[input.channel] || input.channel
  return `${label} ${input.externalUserId}`.slice(0, 100)
}

function buildRuntimeText(input: ConversationHubMessageInput): string {
  return [
    `[${input.channel} inbound]`,
    `from=${input.externalUserId}`,
    '',
    input.text,
  ].join('\n')
}

export function createConversationHub(deps: Partial<ConversationHubDeps> = {}) {
  const d: ConversationHubDeps = { ...defaultDeps, ...deps }

  return {
    async receiveMessage(input: ConversationHubMessageInput): Promise<ConversationHubMessageResult> {
      const profile = input.profile || 'default'
      const runtimeProvider = input.runtimeProvider || d.getConfiguredRuntimeProvider()
      const sessionId = stableSessionId(input.channel, input.externalUserId)
      const now = d.nowSeconds()

      if (!d.getSession(sessionId)) {
        d.createSession({
          id: sessionId,
          profile,
          model: input.model || `runtime:${runtimeProvider}`,
          title: buildTitle(input),
          workspace: `channel:${input.channel}`,
        })
      }

      d.addMessage({
        session_id: sessionId,
        role: 'user',
        content: input.text,
        timestamp: now,
      })

      let runtimeResult: RuntimeMessageResult | null = null
      let replyText = DEFAULT_REPLY

      try {
        const runtime: BeatyClawRuntime = d.createRuntimeAdapter(runtimeProvider)
        runtimeResult = await runtime.sendMessage({
          userId: input.externalUserId,
          sessionId,
          channel: input.channel,
          text: buildRuntimeText(input),
          metadata: input.metadata,
        })
        replyText = runtimeResult?.outputText?.trim() || DEFAULT_REPLY
      } catch (err) {
        d.logger.warn({ err, channel: input.channel, sessionId }, '[conversation-hub] runtime message failed')
        replyText = RUNTIME_ERROR_REPLY
      }

      d.addMessage({
        session_id: sessionId,
        role: 'assistant',
        content: replyText,
        timestamp: d.nowSeconds(),
      })
      d.updateSessionStats(sessionId)
      d.updateUsage(sessionId, {
        inputTokens: d.countTokens(input.text),
        outputTokens: d.countTokens(replyText),
        model: runtimeResult?.model || `runtime:${runtimeProvider}`,
        profile,
      })

      return {
        sessionId,
        replyText,
        runtimeProvider,
        runtimeResult,
      }
    },
  }
}

const defaultHub = createConversationHub()

export function receiveConversationMessage(input: ConversationHubMessageInput): Promise<ConversationHubMessageResult> {
  return defaultHub.receiveMessage(input)
}
