export interface HxaOverview {
  configured: boolean
  online: boolean
  baseUrl: string
  version?: {
    version?: string
    server?: string
  }
  health?: Record<string, unknown>
  stats?: {
    org_count?: number
    bot_count?: number
    online_bot_count?: number
    thread_count?: number
    message_count?: number
    active_thread_count?: number
  }
  orgs?: Array<{
    id: string
    name: string
    status?: string
    bot_count?: number
    created_at?: number
  }>
  error?: string
}

interface HxaRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  cookie?: string
  timeoutMs?: number
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getHxaConnectBaseUrl(): string {
  return normalizeBaseUrl(process.env.HXA_CONNECT_BASE_URL || 'http://127.0.0.1:4800')
}

function getHxaConnectAdminSecret(): string {
  return process.env.HXA_CONNECT_ADMIN_SECRET || ''
}

async function hxaRequest<T>(path: string, options: HxaRequestOptions = {}): Promise<{ data: T; cookie?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.cookie) {
    headers.Cookie = options.cookie
  }

  try {
    const res = await fetch(`${getHxaConnectBaseUrl()}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`HXA ${path} failed with ${res.status}: ${text || res.statusText}`)
    }
    const setCookie = res.headers.get('set-cookie') || undefined
    return {
      data: text ? JSON.parse(text) as T : ({} as T),
      cookie: setCookie?.split(';')[0],
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getAdminCookie(): Promise<string | undefined> {
  const adminSecret = getHxaConnectAdminSecret()
  if (!adminSecret) return undefined

  const { cookie } = await hxaRequest('/api/auth/login', {
    method: 'POST',
    body: {
      type: 'super_admin',
      admin_secret: adminSecret,
    },
  })
  return cookie
}

function safeMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function getHxaOverview(): Promise<HxaOverview> {
  const baseUrl = getHxaConnectBaseUrl()
  const configured = Boolean(baseUrl)

  try {
    const [healthResult, versionResult, statsResult] = await Promise.allSettled([
      hxaRequest<Record<string, unknown>>('/health'),
      hxaRequest<{ version?: string; server?: string }>('/api/version'),
      hxaRequest<HxaOverview['stats']>('/api/stats'),
    ])

    const overview: HxaOverview = {
      configured,
      online: healthResult.status === 'fulfilled',
      baseUrl,
    }

    if (healthResult.status === 'fulfilled') overview.health = healthResult.value.data
    if (versionResult.status === 'fulfilled') overview.version = versionResult.value.data
    if (statsResult.status === 'fulfilled') overview.stats = statsResult.value.data

    const adminCookie = await getAdminCookie().catch(() => undefined)
    if (adminCookie) {
      const orgs = await hxaRequest<HxaOverview['orgs']>('/api/orgs', { cookie: adminCookie }).catch(() => undefined)
      if (orgs?.data) overview.orgs = orgs.data
    }

    if (!overview.online) {
      overview.error = healthResult.status === 'rejected' ? safeMessage(healthResult.reason) : 'HXA Connect is offline'
    }

    return overview
  } catch (err) {
    return {
      configured,
      online: false,
      baseUrl,
      error: safeMessage(err),
    }
  }
}
