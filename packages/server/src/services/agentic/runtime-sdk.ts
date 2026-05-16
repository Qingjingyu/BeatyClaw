import type { ContentBlock } from '../hermes/chat-run-socket'
import { createHxaMainAgentRun, type HxaMainAgentRun } from './runtime'

export type BeatyClawRuntimeProvider = 'zylos' | 'openclaw' | 'hms'

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
}

export interface BeatyClawRuntime {
  readonly provider: BeatyClawRuntimeProvider
  sendMessage(input: RuntimeMessageInput): Promise<RuntimeMessageResult | null>
  getStatus(): RuntimeStatus
}

export interface ZylosRuntimeAdapterOptions {
  runMainAgent?: (input: string | ContentBlock[]) => Promise<HxaMainAgentRun | null>
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
      }
    },
  }
}

export function createRuntimeAdapter(provider: BeatyClawRuntimeProvider): BeatyClawRuntime {
  if (provider === 'zylos') return createZylosRuntimeAdapter()
  return createUnsupportedRuntimeAdapter(provider)
}

function createUnsupportedRuntimeAdapter(provider: Exclude<BeatyClawRuntimeProvider, 'zylos'>): BeatyClawRuntime {
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
      }
    },
  }
}
