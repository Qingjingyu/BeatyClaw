import type { ContentBlock } from '../hermes/chat-run-socket'
import { createHxaMainAgentRun, type HxaMainAgentRun } from './runtime'

export type BeatyClawRuntimeProvider = 'none' | 'zylos' | 'openai-direct' | 'openclaw' | 'hms'

export interface RuntimeMessageInput {
  userId?: string
  sessionId?: string
  channel?: string
  text: string | ContentBlock[]
  metadata?: Record<string, unknown>
}

export interface RuntimeMessageResult {
  id: string
  provider: BeatyClawRuntimeProvider
  model: string
  outputText: string
  channelId?: string
  messageId?: string
  workerDispatched?: boolean
  workerBot?: string
}

export interface RuntimeStatus {
  provider: BeatyClawRuntimeProvider
  available: boolean
  mode: 'active' | 'not_configured' | 'unsupported'
  detail?: string
  capabilities?: string[]
  missingConfig?: string[]
  checks?: Array<{
    key: string
    label: string
    ok: boolean
    required: boolean
    detail?: string
  }>
}

export interface BeatyClawRuntime {
  readonly provider: BeatyClawRuntimeProvider
  sendMessage(input: RuntimeMessageInput): Promise<RuntimeMessageResult | null>
  getStatus(): RuntimeStatus
}

export interface ZylosRuntimeAdapterOptions {
  runMainAgent?: (input: string | ContentBlock[]) => Promise<HxaMainAgentRun | null>
}

export interface OpenAiDirectRuntimeAdapterOptions {
  fetchImpl?: typeof fetch
}

const DEFAULT_RUNTIME_PROVIDER: BeatyClawRuntimeProvider = 'none'
const DEFAULT_OPENAI_MODEL = 'gpt-5.5'

function normalizeOpenAIBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/v1$/, '')
}

function contentToText(input: string | ContentBlock[]): string {
  if (typeof input === 'string') return input
  return input.map(block => {
    if (block.type === 'text') return block.text
    if (block.type === 'image') return `[Image: ${block.name || block.path}]`
    return `[File: ${block.name || block.path}]`
  }).join('\n')
}

function parseRuntimeProvider(value: string | undefined): BeatyClawRuntimeProvider {
  const provider = (value || '').trim().toLowerCase()
  if (provider === 'none' || provider === 'openai-direct' || provider === 'zylos' || provider === 'openclaw' || provider === 'hms') {
    return provider
  }
  return DEFAULT_RUNTIME_PROVIDER
}

export function getConfiguredRuntimeProvider(): BeatyClawRuntimeProvider {
  return parseRuntimeProvider(process.env.BEATYCLAW_RUNTIME_PROVIDER)
}

export function createZylosRuntimeAdapter(options: ZylosRuntimeAdapterOptions = {}): BeatyClawRuntime {
  const runMainAgent = options.runMainAgent || createHxaMainAgentRun

  return {
    provider: 'zylos',

    async sendMessage(input: RuntimeMessageInput): Promise<RuntimeMessageResult | null> {
      const run = await runMainAgent(input.text)
      if (!run) return null

      return {
        id: run.id,
        provider: 'zylos',
        model: run.model,
        outputText: run.outputText,
        channelId: run.channelId,
        messageId: run.messageId,
      }
    },

    getStatus(): RuntimeStatus {
      const enabled = process.env.AGENTIC_HXA_RUNTIME_ENABLED === '1'
      const hasToken = Boolean(process.env.AGENTIC_HXA_TOKEN?.trim())
      const baseUrl = process.env.AGENTIC_HXA_BASE_URL || process.env.HXA_CONNECT_BASE_URL || 'http://127.0.0.1:4800'
      const checks = [
        {
          key: 'AGENTIC_HXA_RUNTIME_ENABLED',
          label: 'HXA Runtime 开关',
          ok: enabled,
          required: true,
          detail: enabled ? '已开启' : '需要设置为 1',
        },
        {
          key: 'AGENTIC_HXA_TOKEN',
          label: 'HXA Runtime Token',
          ok: hasToken,
          required: true,
          detail: hasToken ? '已配置' : '需要配置 hxa-connect token',
        },
        {
          key: 'AGENTIC_HXA_BASE_URL',
          label: 'HXA Base URL',
          ok: Boolean(baseUrl),
          required: false,
          detail: baseUrl,
        },
      ]
      const missingConfig = checks.filter(check => check.required && !check.ok).map(check => check.key)
      return {
        provider: 'zylos',
        available: missingConfig.length === 0,
        mode: missingConfig.length === 0 ? 'active' : 'not_configured',
        detail: missingConfig.length === 0
          ? 'Zylos runtime uses the current hxa-connect main agent path.'
          : 'Zylos runtime requires HXA runtime env before it can handle messages.',
        capabilities: ['chat', 'channel-reply'],
        missingConfig,
        checks,
      }
    },
  }
}

export function createOpenAiDirectRuntimeAdapter(options: OpenAiDirectRuntimeAdapterOptions = {}): BeatyClawRuntime {
  const fetchImpl = options.fetchImpl || fetch

  return {
    provider: 'openai-direct',

    async sendMessage(input: RuntimeMessageInput): Promise<RuntimeMessageResult> {
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      if (!apiKey) throw new Error('openai-direct runtime requires OPENAI_API_KEY')

      const baseUrl = normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com')
      const model = process.env.BEATYCLAW_OPENAI_DIRECT_MODEL || process.env.AGENTIC_DEFAULT_MODEL || DEFAULT_OPENAI_MODEL
      const content = contentToText(input.text).trim()
      if (!content) throw new Error('openai-direct runtime input is empty')

      const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
        }),
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(`openai-direct runtime failed with ${res.status}: ${raw || res.statusText}`)
      const data = raw ? JSON.parse(raw) : {}
      const outputText = String(data?.choices?.[0]?.message?.content || data?.output_text || '').trim()
      if (!outputText) throw new Error('openai-direct runtime returned no output')

      return {
        id: String(data.id || `openai_direct_${Date.now()}`),
        provider: 'openai-direct',
        model: String(data.model || model),
        outputText,
      }
    },

    getStatus(): RuntimeStatus {
      const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim())
      const baseUrl = normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com')
      const checks = [
        {
          key: 'OPENAI_API_KEY',
          label: 'OpenAI API Key',
          ok: hasApiKey,
          required: true,
          detail: hasApiKey ? '已配置' : '需要配置服务端 OpenAI-compatible API Key',
        },
        {
          key: 'OPENAI_BASE_URL',
          label: 'OpenAI Base URL',
          ok: Boolean(baseUrl),
          required: false,
          detail: baseUrl,
        },
      ]
      const missingConfig = checks.filter(check => check.required && !check.ok).map(check => check.key)
      return {
        provider: 'openai-direct',
        available: missingConfig.length === 0,
        mode: missingConfig.length === 0 ? 'active' : 'not_configured',
        detail: missingConfig.length === 0
          ? 'OpenAI Direct runtime uses OPENAI_BASE_URL and OPENAI_API_KEY.'
          : 'OpenAI Direct runtime requires OPENAI_API_KEY.',
        capabilities: ['chat', 'channel-reply'],
        missingConfig,
        checks,
      }
    },
  }
}

export function createRuntimeAdapter(provider: BeatyClawRuntimeProvider): BeatyClawRuntime {
  if (provider === 'none') return createNoneRuntimeAdapter()
  if (provider === 'zylos') return createZylosRuntimeAdapter()
  if (provider === 'openai-direct') return createOpenAiDirectRuntimeAdapter()
  return createUnsupportedRuntimeAdapter(provider)
}

export function createConfiguredRuntimeAdapter(): BeatyClawRuntime {
  return createRuntimeAdapter(getConfiguredRuntimeProvider())
}

export function getConfiguredRuntimeStatus(): RuntimeStatus {
  return createConfiguredRuntimeAdapter().getStatus()
}

function createNoneRuntimeAdapter(): BeatyClawRuntime {
  return {
    provider: 'none',

    async sendMessage(): Promise<RuntimeMessageResult> {
      throw new Error('No AI engine is installed. Install HMS, COCO, or OpenClaw before sending messages to an AI runtime.')
    },

    getStatus(): RuntimeStatus {
      return {
        provider: 'none',
        available: false,
        mode: 'not_configured',
        detail: 'BeatyClaw is running as a product shell. No AI engine is installed yet.',
        capabilities: [],
        missingConfig: ['AI_ENGINE'],
        checks: [
          {
            key: 'AI_ENGINE',
            label: 'AI 引擎',
            ok: false,
            required: true,
            detail: '尚未安装 HMS、COCO 或 OpenClaw。',
          },
        ],
      }
    },
  }
}

function createUnsupportedRuntimeAdapter(provider: Exclude<BeatyClawRuntimeProvider, 'none' | 'zylos' | 'openai-direct'>): BeatyClawRuntime {
  return {
    provider,

    async sendMessage(): Promise<RuntimeMessageResult> {
      throw new Error(`${provider} runtime adapter is not implemented yet`)
    },

    getStatus(): RuntimeStatus {
      return {
        provider,
        available: false,
        mode: 'unsupported',
        detail: `${provider} runtime adapter is planned but not implemented in this phase.`,
        capabilities: [],
        missingConfig: [],
        checks: [
          {
            key: `${provider.toUpperCase()}_ADAPTER`,
            label: `${provider} adapter`,
            ok: false,
            required: true,
            detail: 'Adapter not implemented yet.',
          },
        ],
      }
    },
  }
}
