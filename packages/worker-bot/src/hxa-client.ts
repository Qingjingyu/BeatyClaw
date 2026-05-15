export interface HxaClientOptions {
  url: string
  token: string
  timeoutMs?: number
  reconnect?: boolean
}

export interface HxaMessageEvent {
  sender_name?: string
  sender_id?: string
  message?: {
    content?: string
  }
}

type EventHandler = (event: any) => void | Promise<void>

const WS_OPEN = 1

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function toWebSocketUrl(baseUrl: string, ticket: string): string {
  const wsBase = baseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return `${wsBase}/ws?ticket=${encodeURIComponent(ticket)}`
}

export class HxaBotClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number
  private readonly reconnect: boolean
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private intentionalClose = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: HxaClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.url)
    this.token = options.token
    this.timeoutMs = options.timeoutMs || 30000
    this.reconnect = options.reconnect ?? true
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)?.add(handler)
  }

  async connect(): Promise<void> {
    this.intentionalClose = false
    await this.openSocket()
  }

  disconnect(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  async getProfile(): Promise<{ id?: string; name?: string }> {
    return this.request('/api/me')
  }

  async send(to: string, content: string): Promise<{ channel_id: string; message?: unknown }> {
    return this.request('/api/send', {
      method: 'POST',
      body: { to, content },
    })
  }

  private async openSocket(): Promise<void> {
    const { ticket } = await this.request<{ ticket: string }>('/api/ws-ticket', { method: 'POST' })
    const socket = new WebSocket(toWebSocketUrl(this.baseUrl, ticket))

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('HXA WebSocket connection failed')), { once: true })
    })

    this.ws = socket
    socket.addEventListener('message', event => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data || '')
      if (!raw) return
      try {
        const parsed = JSON.parse(raw)
        this.emit(parsed.type, parsed)
        this.emit('*', parsed)
      } catch (err) {
        this.emit('error', err)
      }
    })
    socket.addEventListener('error', event => this.emit('error', event))
    socket.addEventListener('close', event => {
      this.ws = null
      this.emit('close', event)
      if (!this.intentionalClose && this.reconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.openSocket()
            .then(() => this.emit('reconnected', {}))
            .catch(err => this.emit('error', err))
        }, 1000)
      }
    })
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: init.method || 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HXA ${path} failed with ${res.status}: ${text || res.statusText}`)
      return text ? JSON.parse(text) as T : ({} as T)
    } finally {
      clearTimeout(timer)
    }
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) || []) {
      Promise.resolve(handler(payload)).catch(err => this.emit('error', err))
    }
  }
}
