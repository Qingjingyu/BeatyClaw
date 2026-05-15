import type { ContentBlock } from '../hermes/chat-run-socket'

export interface AgenticRuntimeTarget {
  upstream: string
  apiKey: string
  model: string
}

const DEFAULT_AGENTIC_MODEL = 'gpt-5.5'

export interface HxaMainAgentRun {
  id: string
  model: string
  outputText: string
  channelId: string
  messageId?: string
}

interface HxaMessage {
  id?: string
  sender_name?: string
  sender_id?: string
  content?: string
  created_at?: number
}

function normalizeOpenAIBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/v1$/, '')
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getAgenticRuntimeTarget(model?: string): AgenticRuntimeTarget | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  return {
    upstream: normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com'),
    apiKey,
    model: model || process.env.AGENTIC_DEFAULT_MODEL || DEFAULT_AGENTIC_MODEL,
  }
}

function getHxaRuntimeConfig(): { baseUrl: string; token: string; mainBot: string; timeoutMs: number; pollIntervalMs: number } | null {
  if (process.env.AGENTIC_HXA_RUNTIME_ENABLED !== '1') return null
  const token = process.env.AGENTIC_HXA_TOKEN?.trim()
  if (!token) return null

  return {
    baseUrl: normalizeBaseUrl(process.env.AGENTIC_HXA_BASE_URL || process.env.HXA_CONNECT_BASE_URL || 'http://127.0.0.1:4800'),
    token,
    mainBot: process.env.AGENTIC_HXA_MAIN_BOT || 'zylos-main',
    timeoutMs: Number(process.env.AGENTIC_HXA_REPLY_TIMEOUT_MS || 20000),
    pollIntervalMs: Number(process.env.AGENTIC_HXA_POLL_INTERVAL_MS || 1000),
  }
}

function hxaHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HXA request failed with ${res.status}: ${text || res.statusText}`)
  }
  return text ? JSON.parse(text) : {}
}

async function hxaFetch(config: NonNullable<ReturnType<typeof getHxaRuntimeConfig>>, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...hxaHeaders(config.token),
      ...(init?.headers || {}),
    },
  })
  return readJson(res)
}

function extractHxaMessages(payload: any): HxaMessage[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.messages)) return payload.messages
  return []
}

function findMainAgentReply(messages: HxaMessage[], mainBot: string, sinceCreatedAt: number): HxaMessage | null {
  return messages
    .filter(message => {
      const sender = message.sender_name || message.sender_id || ''
      return sender === mainBot && Number(message.created_at || 0) >= sinceCreatedAt && String(message.content || '').trim()
    })
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0] || null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function createHxaMainAgentRun(input: string | ContentBlock[]): Promise<HxaMainAgentRun | null> {
  const config = getHxaRuntimeConfig()
  if (!config) return null

  const content = contentToText(input).trim()
  if (!content) throw new Error('HXA main agent input is empty')

  const sent = await hxaFetch(config, '/api/send', {
    method: 'POST',
    body: JSON.stringify({
      to: config.mainBot,
      content,
    }),
  })
  const channelId = sent.channel_id
  const createdAt = Number(sent.message?.created_at || Date.now())
  if (!channelId) throw new Error('HXA main agent did not return a channel_id')

  const deadline = Date.now() + config.timeoutMs
  while (Date.now() <= deadline) {
    const payload = await hxaFetch(config, `/api/channels/${encodeURIComponent(channelId)}/messages?limit=20`)
    const reply = findMainAgentReply(extractHxaMessages(payload), config.mainBot, createdAt)
    if (reply) {
      return {
        id: `hxa_${channelId}_${reply.id || reply.created_at || Date.now()}`,
        model: `hxa:${config.mainBot}`,
        outputText: String(reply.content || ''),
        channelId,
        messageId: reply.id,
      }
    }
    await sleep(config.pollIntervalMs)
  }

  throw new Error(`HXA main agent reply timed out after ${config.timeoutMs}ms`)
}

function contentToText(input: string | ContentBlock[]): string {
  if (typeof input === 'string') return input
  return input.map(block => {
    if (block.type === 'text') return block.text
    if (block.type === 'image') return `[Image: ${block.name || block.path}]`
    return `[File: ${block.name || block.path}]`
  }).join('\n')
}

function historyToMessages(history: any[] | undefined): Array<{ role: string; content: string }> {
  if (!Array.isArray(history)) return []
  return history
    .filter(item => item && (item.role === 'user' || item.role === 'assistant' || item.role === 'system'))
    .map(item => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
    }))
    .filter(item => item.content.trim())
}

export function buildAgenticChatCompletionBody(
  target: AgenticRuntimeTarget,
  body: Record<string, any>,
  input: string | ContentBlock[],
): Record<string, any> {
  const messages: Array<{ role: string; content: string }> = []
  if (body.instructions && String(body.instructions).trim()) {
    messages.push({ role: 'system', content: String(body.instructions) })
  }
  messages.push(...historyToMessages(body.conversation_history))
  messages.push({ role: 'user', content: contentToText(input) })

  return {
    model: target.model,
    messages,
    stream: true,
  }
}

export function mapOpenAIChatCompletionChunk(parsed: any): {
  eventType: string
  responseId?: string
  delta?: string
  model?: string
  finishReason?: string | null
  usage?: any
} | null {
  if (!parsed || parsed === '[DONE]') {
    return { eventType: 'response.completed' }
  }
  const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null
  if (!choice) return null
  const responseId = parsed.id
  const delta = choice.delta?.content || ''
  if (delta) {
    return {
      eventType: 'response.output_text.delta',
      responseId,
      delta,
      model: parsed.model,
      usage: parsed.usage,
    }
  }
  if (choice.finish_reason) {
    return {
      eventType: 'response.completed',
      responseId,
      model: parsed.model,
      finishReason: choice.finish_reason,
      usage: parsed.usage,
    }
  }
  return null
}
