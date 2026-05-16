import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { receiveConversationMessage } from './conversation-hub'
import { logger } from '../logger'
import { getActiveEnvPath, getActiveProfileDir } from '../hermes/hermes-profile'

const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'
const DEFAULT_CHANNEL_VERSION = '2.1.3'
const DEFAULT_CLIENT_VERSION = '131331'
const DEFAULT_POLL_TIMEOUT_MS = 40000
const DEFAULT_ERROR_BACKOFF_MS = 5000
const MAX_RECENT_IDS = 500

interface WeixinRuntimeConfig {
  accountId: string
  token: string
  baseUrl: string
  channelVersion: string
  clientVersion: string
  pollTimeoutMs: number
  errorBackoffMs: number
  statePath: string
}

export interface WeixinRuntimeStatus {
  running: boolean
  configured: boolean
  account_id?: string
  base_url?: string
  cursor_ready: boolean
  primed: boolean
  last_poll_at?: string
  last_message_at?: string
  last_seen_message_at?: string
  last_skipped_reason?: string
  last_error?: string
  messages_seen: number
  messages_received: number
  messages_forwarded: number
  replies_sent: number
  messages_skipped_recent: number
  messages_skipped_unhandled: number
}

interface WeixinRuntimeState {
  version: 1
  get_updates_buf?: string
  primed?: boolean
  recent_ids?: string[]
  updated_at?: string
}

interface WeixinMessageItem {
  type?: number
  text_item?: {
    text?: string
  }
}

export interface WeixinInboundMessage {
  message_id?: string
  client_id?: string
  from_user_id?: string
  to_user_id?: string
  message_type?: number
  context_token?: string
  item_list?: WeixinMessageItem[]
  [key: string]: unknown
}

interface WeixinUpdatesResponse {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeixinInboundMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key && value) env[key] = value
  }
  return env
}

function readWeixinRuntimeConfig(): WeixinRuntimeConfig | null {
  let env: Record<string, string> = {}
  try {
    env = parseEnv(readFileSync(getActiveEnvPath(), 'utf8'))
  } catch {
    env = {}
  }

  const accountId = env.WEIXIN_ACCOUNT_ID?.trim()
  const token = env.WEIXIN_TOKEN?.trim()
  if (!accountId || !token) return null

  return {
    accountId,
    token,
    baseUrl: (env.WEIXIN_BASE_URL || DEFAULT_ILINK_BASE_URL).replace(/\/+$/, ''),
    channelVersion: env.WEIXIN_CHANNEL_VERSION || DEFAULT_CHANNEL_VERSION,
    clientVersion: env.WEIXIN_CLIENT_VERSION || DEFAULT_CLIENT_VERSION,
    pollTimeoutMs: Number(env.WEIXIN_RUNTIME_POLL_TIMEOUT_MS || DEFAULT_POLL_TIMEOUT_MS),
    errorBackoffMs: Number(env.WEIXIN_RUNTIME_ERROR_BACKOFF_MS || DEFAULT_ERROR_BACKOFF_MS),
    statePath: env.WEIXIN_RUNTIME_STATE_FILE || join(getActiveProfileDir(), 'weixin-runtime-state.json'),
  }
}

function createWechatUin(): string {
  const value = Math.floor(Math.random() * 0xffffffff).toString()
  return Buffer.from(value, 'utf8').toString('base64')
}

function loadState(path: string): WeixinRuntimeState {
  if (!existsSync(path)) return { version: 1, recent_ids: [], primed: false }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WeixinRuntimeState>
    return {
      version: 1,
      get_updates_buf: parsed.get_updates_buf,
      primed: Boolean(parsed.primed),
      recent_ids: Array.isArray(parsed.recent_ids) ? parsed.recent_ids.filter(Boolean).slice(-MAX_RECENT_IDS) : [],
      updated_at: parsed.updated_at,
    }
  } catch (err) {
    logger.warn({ err, path }, '[weixin-runtime] failed to load state')
    return { version: 1, recent_ids: [], primed: false }
  }
}

function saveState(path: string, state: WeixinRuntimeState): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (err) {
    logger.warn({ err, path }, '[weixin-runtime] failed to save state')
  }
}

export function extractWeixinText(message: WeixinInboundMessage): string {
  return (message.item_list || [])
    .map(item => item?.type === 1 ? item.text_item?.text || '' : '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function shouldHandleWeixinMessage(message: WeixinInboundMessage, accountId: string): boolean {
  return getWeixinSkipReason(message, accountId) === null
}

export function getWeixinSkipReason(message: WeixinInboundMessage, accountId: string): string | null {
  if (!message) return 'missing_message'
  if (message.message_type === 2) return 'outbound_message'
  if (message.from_user_id && message.from_user_id === accountId) return 'self_message'
  if (!message.from_user_id) return 'missing_from_user_id'
  if (!message.context_token) return 'missing_context_token'
  if (!extractWeixinText(message)) return 'missing_text'
  return null
}

export function buildHxaInputFromWeixin(message: WeixinInboundMessage, text: string): string {
  return [
    '[Weixin inbound]',
    `from=${message.from_user_id || 'unknown'}`,
    '',
    text,
  ].join('\n')
}

class WeixinApiClient {
  constructor(private readonly config: WeixinRuntimeConfig) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${this.config.token}`,
      'X-WECHAT-UIN': createWechatUin(),
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': this.config.clientVersion,
    }
  }

  private async post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify({
        ...body,
        base_info: {
          channel_version: this.config.channelVersion,
          bot_agent: 'openai',
          ...(body.base_info as Record<string, unknown> | undefined),
        },
      }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Weixin ${path} failed with ${res.status}: ${text || res.statusText}`)
    return text ? JSON.parse(text) as T : ({} as T)
  }

  async getUpdates(cursor: string | undefined, signal: AbortSignal): Promise<WeixinUpdatesResponse> {
    return this.post<WeixinUpdatesResponse>('/ilink/bot/getupdates', {
      get_updates_buf: cursor || '',
    }, signal)
  }

  async sendText(toUserId: string, contextToken: string, text: string): Promise<void> {
    await this.post('/ilink/bot/sendmessage', {
      msg: {
        from_user_id: '',
        to_user_id: toUserId,
        client_id: `agentic:${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [
          {
            type: 1,
            text_item: { text },
          },
        ],
      },
    })
  }
}

class WeixinRuntime {
  private running = false
  private stopRequested = false
  private loopPromise: Promise<void> | null = null
  private abortController: AbortController | null = null
  private state: WeixinRuntimeState = { version: 1, recent_ids: [], primed: false }
  private lastPollAt: string | undefined
  private lastMessageAt: string | undefined
  private lastSeenMessageAt: string | undefined
  private lastSkippedReason: string | undefined
  private lastError: string | undefined
  private messagesSeen = 0
  private messagesReceived = 0
  private messagesForwarded = 0
  private repliesSent = 0
  private messagesSkippedRecent = 0
  private messagesSkippedUnhandled = 0
  private activeConfig: WeixinRuntimeConfig | null = null

  start(): void {
    if (this.running) return
    const config = readWeixinRuntimeConfig()
    if (!config) {
      this.activeConfig = null
      logger.info('[weixin-runtime] disabled or missing account/token')
      return
    }

    this.activeConfig = config
    this.state = loadState(config.statePath)
    this.stopRequested = false
    this.running = true
    this.loopPromise = this.loop(config).finally(() => {
      this.running = false
      this.loopPromise = null
    })
    this.loopPromise.catch(err => logger.error({ err }, '[weixin-runtime] stopped unexpectedly'))
    logger.info({ accountId: config.accountId, baseUrl: config.baseUrl }, '[weixin-runtime] started')
  }

  stop(): void {
    this.stopRequested = true
    this.abortController?.abort()
  }

  status(): WeixinRuntimeStatus {
    const config = this.activeConfig || readWeixinRuntimeConfig()
    return {
      running: this.running,
      configured: Boolean(config),
      account_id: config?.accountId,
      base_url: config?.baseUrl,
      cursor_ready: Boolean(this.state.get_updates_buf),
      primed: Boolean(this.state.primed),
      last_poll_at: this.lastPollAt,
      last_message_at: this.lastMessageAt,
      last_seen_message_at: this.lastSeenMessageAt,
      last_skipped_reason: this.lastSkippedReason,
      last_error: this.lastError,
      messages_seen: this.messagesSeen,
      messages_received: this.messagesReceived,
      messages_forwarded: this.messagesForwarded,
      replies_sent: this.repliesSent,
      messages_skipped_recent: this.messagesSkippedRecent,
      messages_skipped_unhandled: this.messagesSkippedUnhandled,
    }
  }

  resetForTest(): void {
    this.stop()
    this.running = false
    this.stopRequested = false
    this.loopPromise = null
    this.abortController = null
    this.state = { version: 1, recent_ids: [], primed: false }
    this.lastPollAt = undefined
    this.lastMessageAt = undefined
    this.lastSeenMessageAt = undefined
    this.lastSkippedReason = undefined
    this.lastError = undefined
    this.messagesSeen = 0
    this.messagesReceived = 0
    this.messagesForwarded = 0
    this.repliesSent = 0
    this.messagesSkippedRecent = 0
    this.messagesSkippedUnhandled = 0
    this.activeConfig = null
  }

  private async loop(config: WeixinRuntimeConfig): Promise<void> {
    const client = new WeixinApiClient(config)
    while (!this.stopRequested) {
      try {
        await this.pollOnce(client, config)
        this.lastError = undefined
      } catch (err: any) {
        if (this.stopRequested) break
        this.lastError = err?.message || String(err)
        logger.warn({ err }, '[weixin-runtime] poll failed')
        await this.sleep(config.errorBackoffMs)
      }
    }
  }

  private async pollOnce(client: WeixinApiClient, config: WeixinRuntimeConfig): Promise<void> {
    this.abortController = new AbortController()
    const timeout = setTimeout(() => this.abortController?.abort(), config.pollTimeoutMs)
    timeout.unref?.()
    try {
      const updates = await client.getUpdates(this.state.get_updates_buf, this.abortController.signal)
      this.lastPollAt = new Date().toISOString()

      if (updates.ret && updates.ret !== 0) throw new Error(updates.errmsg || `Weixin ret=${updates.ret}`)
      if (updates.errcode && updates.errcode !== 0) throw new Error(updates.errmsg || `Weixin errcode=${updates.errcode}`)

      if (updates.get_updates_buf) this.state.get_updates_buf = updates.get_updates_buf
      const messages = Array.isArray(updates.msgs) ? updates.msgs : []
      this.messagesSeen += messages.length
      if (messages.length > 0) this.lastSeenMessageAt = new Date().toISOString()

      if (!this.state.primed) {
        this.state.primed = true
        this.messagesSkippedRecent += messages.length
        if (messages.length > 0) this.lastSkippedReason = 'priming_existing_messages'
        this.rememberMessages(messages, config)
        saveState(config.statePath, this.state)
        logger.info({ skipped: messages.length }, '[weixin-runtime] primed cursor and skipped existing messages')
        return
      }

      for (const message of messages) {
        await this.handleMessage(client, config, message)
      }
      saveState(config.statePath, this.state)
    } catch (err: any) {
      if (err?.name !== 'AbortError') throw err
      this.lastPollAt = new Date().toISOString()
    } finally {
      clearTimeout(timeout)
      this.abortController = null
    }
  }

  private rememberMessages(messages: WeixinInboundMessage[], config: WeixinRuntimeConfig): void {
    for (const message of messages) {
      const key = this.messageKey(message, config)
      if (key) this.addRecentId(key)
    }
  }

  private async handleMessage(client: WeixinApiClient, config: WeixinRuntimeConfig, message: WeixinInboundMessage): Promise<void> {
    const key = this.messageKey(message, config)
    if (!key) {
      this.messagesSkippedUnhandled += 1
      this.lastSkippedReason = 'missing_message_key'
      logger.info({ reason: this.lastSkippedReason }, '[weixin-runtime] skipped message')
      return
    }
    if (this.state.recent_ids?.includes(key)) {
      this.messagesSkippedRecent += 1
      this.lastSkippedReason = 'duplicate_recent_message'
      logger.info({ reason: this.lastSkippedReason, key }, '[weixin-runtime] skipped message')
      return
    }
    this.addRecentId(key)

    const skipReason = getWeixinSkipReason(message, config.accountId)
    if (skipReason) {
      this.messagesSkippedUnhandled += 1
      this.lastSkippedReason = skipReason
      logger.info({
        reason: skipReason,
        message_id: message.message_id,
        client_id: message.client_id,
        message_type: message.message_type,
        has_from_user_id: Boolean(message.from_user_id),
        has_context_token: Boolean(message.context_token),
        item_count: message.item_list?.length || 0,
      }, '[weixin-runtime] skipped message')
      return
    }

    const text = extractWeixinText(message)
    this.messagesReceived += 1
    this.lastMessageAt = new Date().toISOString()

    const result = await receiveConversationMessage({
      channel: 'weixin',
      externalUserId: message.from_user_id!,
      text,
      profile: process.env.PROFILE || 'default',
      runtimeProvider: 'zylos',
      metadata: {
        account_id: config.accountId,
        context_token: message.context_token,
        message_id: message.message_id,
        client_id: message.client_id,
      },
    })
    const reply = result.replyText.trim() || '我收到消息了，但当前没有生成有效回复。'
    this.messagesForwarded += 1

    await client.sendText(message.from_user_id!, message.context_token!, reply)
    this.repliesSent += 1
  }

  private messageKey(message: WeixinInboundMessage, config: WeixinRuntimeConfig): string | null {
    const id = message.message_id || message.client_id
    if (id) return `${config.accountId}:${id}`
    const text = extractWeixinText(message)
    if (!message.from_user_id || !message.context_token || !text) return null
    return `${config.accountId}:${message.from_user_id}:${message.context_token}:${text.slice(0, 80)}`
  }

  private addRecentId(key: string): void {
    const recent = this.state.recent_ids || []
    if (!recent.includes(key)) recent.push(key)
    this.state.recent_ids = recent.slice(-MAX_RECENT_IDS)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const runtime = new WeixinRuntime()

export function startWeixinRuntime(): void {
  runtime.start()
}

export function stopWeixinRuntime(): void {
  runtime.stop()
}

export function getWeixinRuntimeStatus(): WeixinRuntimeStatus {
  return runtime.status()
}

export function resetWeixinRuntimeForTest(): void {
  runtime.resetForTest()
}
