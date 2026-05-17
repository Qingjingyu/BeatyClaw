import { createHash } from 'crypto'
import {
  addMessage,
  createSession,
  getSession,
  updateSessionStats,
} from '../../db/hermes/session-store'
import { updateUsage } from '../../db/hermes/usage-store'
import { countTokens } from '../../lib/context-compressor'
import { getCurrentEmployee, type Employee } from './employees'
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
  sessionId?: string
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
  trace: ConversationHubTrace
}

export interface ConversationHubTrace {
  channel: ConversationHubMessageInput['channel']
  runtimeProvider: BeatyClawRuntimeProvider
  runtimeModel?: string
  runtimeRunId?: string
  hxaChannelId?: string
  hxaMessageId?: string
  workerDispatched: boolean
  workerBot?: string
  status: 'ok' | 'failed' | 'empty'
  error?: string
}

interface ConversationHubDeps {
  getSession: typeof getSession
  createSession: typeof createSession
  addMessage: typeof addMessage
  updateSessionStats: typeof updateSessionStats
  updateUsage: typeof updateUsage
  createRuntimeAdapter: typeof createRuntimeAdapter
  getConfiguredRuntimeProvider: typeof getConfiguredRuntimeProvider
  getCurrentEmployee: typeof getCurrentEmployee
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
const NO_RUNTIME_REPLY = '我收到消息了，但当前还没有安装 AI 引擎。请先在 AI 引擎页面安装 HMS、COCO 或 OpenClaw。'

const defaultDeps: ConversationHubDeps = {
  getSession,
  createSession,
  addMessage,
  updateSessionStats,
  updateUsage,
  createRuntimeAdapter,
  getConfiguredRuntimeProvider,
  getCurrentEmployee,
  countTokens,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  logger,
}

function runtimeProviderFromEmployee(employee: Employee | null): BeatyClawRuntimeProvider | null {
  if (!employee || employee.status !== 'running' || employee.healthStatus !== 'healthy') return null
  if (employee.engineType === 'hms') return 'hms'
  if (employee.engineType === 'zylos' || employee.engineType === 'coco') return 'zylos'
  return null
}

async function resolveRuntimeProvider(
  input: ConversationHubMessageInput,
  deps: ConversationHubDeps,
): Promise<BeatyClawRuntimeProvider> {
  if (input.runtimeProvider) return input.runtimeProvider

  const configured = deps.getConfiguredRuntimeProvider()
  let employeeProvider: BeatyClawRuntimeProvider | null = null
  try {
    employeeProvider = runtimeProviderFromEmployee(await deps.getCurrentEmployee())
  } catch (err) {
    deps.logger.warn({ err }, '[conversation-hub] failed to resolve current employee runtime')
  }

  if (employeeProvider === configured) return configured
  if (employeeProvider && configured === 'none') return employeeProvider
  if (configured === 'none') return 'none'
  if (configured === 'hms' && employeeProvider !== 'hms') {
    const zylosRuntime = deps.createRuntimeAdapter('zylos')
    return zylosRuntime.getStatus().available ? 'zylos' : configured
  }

  const configuredRuntime = deps.createRuntimeAdapter(configured)
  if (configuredRuntime.getStatus().available) return configured

  if (employeeProvider) return employeeProvider

  const zylosRuntime = deps.createRuntimeAdapter('zylos')
  if (zylosRuntime.getStatus().available) return 'zylos'

  return configured
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

function toTraceDetails(trace: ConversationHubTrace): string {
  return JSON.stringify({
    channel: trace.channel,
    runtime_provider: trace.runtimeProvider,
    runtime_model: trace.runtimeModel,
    runtime_run_id: trace.runtimeRunId,
    hxa_channel_id: trace.hxaChannelId,
    hxa_message_id: trace.hxaMessageId,
    worker_dispatched: trace.workerDispatched,
    worker_bot: trace.workerBot,
    status: trace.status,
    error: trace.error,
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createConversationHub(deps: Partial<ConversationHubDeps> = {}) {
  const d: ConversationHubDeps = { ...defaultDeps, ...deps }

  return {
    async receiveMessage(input: ConversationHubMessageInput): Promise<ConversationHubMessageResult> {
      const profile = input.profile || 'default'
      const runtimeProvider = await resolveRuntimeProvider(input, d)
      const sessionId = input.sessionId || stableSessionId(input.channel, input.externalUserId)
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
      let trace: ConversationHubTrace = {
        channel: input.channel,
        runtimeProvider,
        workerDispatched: false,
        status: 'empty',
      }

      try {
        if (runtimeProvider === 'none') {
          throw new Error('No AI engine is installed.')
        }
        const runtime: BeatyClawRuntime = d.createRuntimeAdapter(runtimeProvider)
        runtimeResult = await runtime.sendMessage({
          userId: input.externalUserId,
          sessionId,
          channel: input.channel,
          text: buildRuntimeText(input),
          metadata: input.metadata,
        })
        replyText = runtimeResult?.outputText?.trim() || DEFAULT_REPLY
        trace = {
          channel: input.channel,
          runtimeProvider,
          runtimeModel: runtimeResult?.model,
          runtimeRunId: runtimeResult?.id,
          hxaChannelId: runtimeResult?.channelId,
          hxaMessageId: runtimeResult?.messageId,
          workerDispatched: Boolean(runtimeResult?.workerDispatched),
          workerBot: runtimeResult?.workerBot,
          status: runtimeResult?.outputText?.trim() ? 'ok' : 'empty',
        }
      } catch (err) {
        d.logger.warn({ err, channel: input.channel, sessionId }, '[conversation-hub] runtime message failed')
        replyText = runtimeProvider === 'none' ? NO_RUNTIME_REPLY : RUNTIME_ERROR_REPLY
        trace = {
          channel: input.channel,
          runtimeProvider,
          workerDispatched: false,
          status: 'failed',
          error: errorMessage(err),
        }
      }

      d.addMessage({
        session_id: sessionId,
        role: 'assistant',
        content: replyText,
        timestamp: d.nowSeconds(),
        reasoning_details: toTraceDetails(trace),
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
        trace,
      }
    },
  }
}

const defaultHub = createConversationHub()

export function receiveConversationMessage(input: ConversationHubMessageInput): Promise<ConversationHubMessageResult> {
  return defaultHub.receiveMessage(input)
}
