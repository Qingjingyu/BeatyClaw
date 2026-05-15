import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { createHxaMainAgentRun } from './runtime'
import { getActiveEnvPath, getActiveProfileDir } from '../hermes/hermes-profile'
import { logger } from '../logger'

const DEFAULT_API_BASE = 'https://api.telegram.org'
const DEFAULT_POLL_TIMEOUT_SECONDS = 25
const DEFAULT_ERROR_BACKOFF_MS = 5000
const MAX_RECENT_IDS = 500

interface TelegramRuntimeConfig {
  token: string
  apiBase: string
  pollTimeoutSeconds: number
  errorBackoffMs: number
  statePath: string
}

interface TelegramRuntimeState {
  version: 1
  offset?: number
  primed?: boolean
  recent_ids?: string[]
  updated_at?: string
}

export interface TelegramRuntimeStatus {
  running: boolean
  configured: boolean
  bot_username?: string
  offset_ready: boolean
  primed: boolean
  last_poll_at?: string
  last_message_at?: string
  last_error?: string
  messages_received: number
  messages_forwarded: number
  replies_sent: number
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

export interface TelegramMessage {
  message_id: number
  text?: string
  caption?: string
  message_thread_id?: number
  chat?: {
    id: number | string
    type?: string
    title?: string
    username?: string
  }
  from?: {
    id?: number
    is_bot?: boolean
    username?: string
    first_name?: string
    last_name?: string
  }
}

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
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

function readTelegramRuntimeConfig(): TelegramRuntimeConfig | null {
  let env: Record<string, string> = {}
  try {
    env = parseEnv(readFileSync(getActiveEnvPath(), 'utf8'))
  } catch {
    env = {}
  }

  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return null

  return {
    token,
    apiBase: (env.TELEGRAM_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ''),
    pollTimeoutSeconds: Number(env.TELEGRAM_RUNTIME_POLL_TIMEOUT_SECONDS || DEFAULT_POLL_TIMEOUT_SECONDS),
    errorBackoffMs: Number(env.TELEGRAM_RUNTIME_ERROR_BACKOFF_MS || DEFAULT_ERROR_BACKOFF_MS),
    statePath: env.TELEGRAM_RUNTIME_STATE_FILE || join(getActiveProfileDir(), 'telegram-runtime-state.json'),
  }
}

function loadState(path: string): TelegramRuntimeState {
  if (!existsSync(path)) return { version: 1, recent_ids: [], primed: false }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<TelegramRuntimeState>
    return {
      version: 1,
      offset: typeof parsed.offset === 'number' ? parsed.offset : undefined,
      primed: Boolean(parsed.primed),
      recent_ids: Array.isArray(parsed.recent_ids) ? parsed.recent_ids.filter(Boolean).slice(-MAX_RECENT_IDS) : [],
      updated_at: parsed.updated_at,
    }
  } catch (err) {
    logger.warn({ err, path }, '[telegram-runtime] failed to load state')
    return { version: 1, recent_ids: [], primed: false }
  }
}

function saveState(path: string, state: TelegramRuntimeState): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (err) {
    logger.warn({ err, path }, '[telegram-runtime] failed to save state')
  }
}

export function extractTelegramText(update: TelegramUpdate): string {
  const message = update.message || update.edited_message
  return String(message?.text || message?.caption || '').trim()
}

export function shouldHandleTelegramUpdate(update: TelegramUpdate): boolean {
  const message = update.message || update.edited_message
  if (!message?.chat?.id) return false
  if (message.from?.is_bot) return false
  return Boolean(extractTelegramText(update))
}

export function buildHxaInputFromTelegram(update: TelegramUpdate, text: string): string {
  const message = update.message || update.edited_message
  const from = message?.from?.username || message?.from?.first_name || message?.from?.id || 'unknown'
  return [
    '[Telegram inbound]',
    `chat=${message?.chat?.id || 'unknown'}`,
    `from=${from}`,
    '',
    text,
  ].join('\n')
}

class TelegramApiClient {
  constructor(private readonly config: TelegramRuntimeConfig) {}

  private url(method: string): string {
    return `${this.config.apiBase}/bot${this.config.token}/${method}`
  }

  async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(this.url(method), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Telegram ${method} failed with ${res.status}: ${text || res.statusText}`)
    const parsed = text ? JSON.parse(text) as TelegramApiResponse<T> : { ok: true, result: undefined as T }
    if (!parsed.ok) throw new Error(parsed.description || `Telegram ${method} failed with error_code=${parsed.error_code}`)
    return parsed.result as T
  }

  async getMe(): Promise<{ username?: string }> {
    return this.call('getMe', {})
  }

  async getUpdates(offset: number | undefined, timeout: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'edited_message'],
    }, signal)
  }

  async sendText(message: TelegramMessage, text: string): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: message.chat!.id,
      text,
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true,
    }
    if (message.message_thread_id) body.message_thread_id = message.message_thread_id
    await this.call('sendMessage', body)
  }
}

class TelegramRuntime {
  private running = false
  private stopRequested = false
  private loopPromise: Promise<void> | null = null
  private abortController: AbortController | null = null
  private state: TelegramRuntimeState = { version: 1, recent_ids: [], primed: false }
  private lastPollAt: string | undefined
  private lastMessageAt: string | undefined
  private lastError: string | undefined
  private messagesReceived = 0
  private messagesForwarded = 0
  private repliesSent = 0
  private activeConfig: TelegramRuntimeConfig | null = null
  private botUsername: string | undefined

  start(): void {
    if (this.running) return
    const config = readTelegramRuntimeConfig()
    if (!config) {
      this.activeConfig = null
      logger.info('[telegram-runtime] disabled or missing bot token')
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
    this.loopPromise.catch(err => logger.error({ err }, '[telegram-runtime] stopped unexpectedly'))
    logger.info('[telegram-runtime] started')
  }

  stop(): void {
    this.stopRequested = true
    this.abortController?.abort()
  }

  restart(): void {
    if (this.running && this.loopPromise) {
      this.stop()
      this.loopPromise
        .finally(() => this.start())
        .catch(err => logger.error({ err }, '[telegram-runtime] restart failed'))
      return
    }
    this.start()
  }

  status(): TelegramRuntimeStatus {
    const config = this.activeConfig || readTelegramRuntimeConfig()
    return {
      running: this.running,
      configured: Boolean(config),
      bot_username: this.botUsername,
      offset_ready: typeof this.state.offset === 'number',
      primed: Boolean(this.state.primed),
      last_poll_at: this.lastPollAt,
      last_message_at: this.lastMessageAt,
      last_error: this.lastError,
      messages_received: this.messagesReceived,
      messages_forwarded: this.messagesForwarded,
      replies_sent: this.repliesSent,
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
    this.lastError = undefined
    this.messagesReceived = 0
    this.messagesForwarded = 0
    this.repliesSent = 0
    this.activeConfig = null
    this.botUsername = undefined
  }

  private async loop(config: TelegramRuntimeConfig): Promise<void> {
    const client = new TelegramApiClient(config)
    try {
      const me = await client.getMe()
      this.botUsername = me.username
    } catch (err) {
      logger.warn({ err }, '[telegram-runtime] getMe failed')
    }

    while (!this.stopRequested) {
      try {
        await this.pollOnce(client, config)
        this.lastError = undefined
      } catch (err: any) {
        if (this.stopRequested) break
        this.lastError = err?.message || String(err)
        logger.warn({ err }, '[telegram-runtime] poll failed')
        await this.sleep(config.errorBackoffMs)
      }
    }
  }

  private async pollOnce(client: TelegramApiClient, config: TelegramRuntimeConfig): Promise<void> {
    this.abortController = new AbortController()
    const timeout = setTimeout(() => this.abortController?.abort(), (config.pollTimeoutSeconds + 10) * 1000)
    timeout.unref?.()
    try {
      const updates = await client.getUpdates(this.state.offset, config.pollTimeoutSeconds, this.abortController.signal)
      this.lastPollAt = new Date().toISOString()
      this.advanceOffset(updates)

      if (!this.state.primed) {
        this.state.primed = true
        this.rememberUpdates(updates)
        saveState(config.statePath, this.state)
        logger.info({ skipped: updates.length }, '[telegram-runtime] primed offset and skipped existing updates')
        return
      }

      for (const update of updates) {
        await this.handleUpdate(client, config, update)
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

  private advanceOffset(updates: TelegramUpdate[]): void {
    for (const update of updates) {
      if (typeof update.update_id === 'number') {
        this.state.offset = Math.max(this.state.offset || 0, update.update_id + 1)
      }
    }
  }

  private rememberUpdates(updates: TelegramUpdate[]): void {
    for (const update of updates) {
      this.addRecentId(this.messageKey(update))
    }
  }

  private async handleUpdate(client: TelegramApiClient, config: TelegramRuntimeConfig, update: TelegramUpdate): Promise<void> {
    const key = this.messageKey(update)
    if (this.state.recent_ids?.includes(key)) return
    this.addRecentId(key)

    if (!shouldHandleTelegramUpdate(update)) return

    const message = (update.message || update.edited_message)!
    const text = extractTelegramText(update)
    this.messagesReceived += 1
    this.lastMessageAt = new Date().toISOString()

    const run = await createHxaMainAgentRun(buildHxaInputFromTelegram(update, text))
    const reply = run?.outputText?.trim() || '我收到消息了，但当前没有生成有效回复。'
    this.messagesForwarded += 1

    await client.sendText(message, reply)
    this.repliesSent += 1
    saveState(config.statePath, this.state)
  }

  private messageKey(update: TelegramUpdate): string {
    const message = update.message || update.edited_message
    return `${update.update_id}:${message?.chat?.id || 'unknown'}:${message?.message_id || 'unknown'}`
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

const runtime = new TelegramRuntime()

export function startTelegramRuntime(): void {
  runtime.start()
}

export function stopTelegramRuntime(): void {
  runtime.stop()
}

export function restartTelegramRuntime(): void {
  runtime.restart()
}

export function getTelegramRuntimeStatus(): TelegramRuntimeStatus {
  return runtime.status()
}

export function resetTelegramRuntimeForTest(): void {
  runtime.resetForTest()
}
