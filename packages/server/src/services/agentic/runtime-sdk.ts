import type { ContentBlock } from '../hermes/chat-run-socket'
import { createHxaMainAgentRun, type HxaMainAgentRun } from './runtime'

export type BeatyClawRuntimeProvider = 'zylos' | 'openai-direct' | 'openclaw' | 'hms'

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
}

export interface RuntimeStatus {
  provider: BeatyClawRuntimeProvider
  available: boolean
  mode: 'active' | 'not_configured' | 'unsupported'
  detail?: string
  capabilities?: string[]
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

const DEFAULT_RUNTIME_PROVIDER: BeatyClawRuntimeProvider = 'zylos'
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
  if (provider === 'openai-direct' || provider === 'zylos' || provider === 'openclaw' || provider === 'hms') {
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
      return {
        provider: 'zylos',
        available: true,
        mode: 'active',
        detail: 'Zylos runtime uses the current hxa-connect main agent path.',
        capabilities: ['chat', 'channel-reply'],
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
      const available = Boolean(process.env.OPENAI_API_KEY?.trim())
      return {
        provider: 'openai-direct',
        available,
        mode: available ? 'active' : 'not_configured',
        detail: available
          ? 'OpenAI Direct runtime uses OPENAI_BASE_URL and OPENAI_API_KEY.'
          : 'OpenAI Direct runtime requires OPENAI_API_KEY.',
        capabilities: ['chat', 'channel-reply'],
      }
    },
  }
}

export function createRuntimeAdapter(provider: BeatyClawRuntimeProvider): BeatyClawRuntime {
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

function createUnsupportedRuntimeAdapter(provider: Exclude<BeatyClawRuntimeProvider, 'zylos' | 'openai-direct'>): BeatyClawRuntime {
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
      }
    },
  }
}
