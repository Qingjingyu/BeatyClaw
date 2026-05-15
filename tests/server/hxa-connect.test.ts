import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadHxaService() {
  vi.resetModules()
  return import('../../packages/server/src/services/agentic/hxa-connect')
}

describe('Agentic hxa-connect service', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('aggregates public hxa health, version, stats, and admin orgs without exposing secrets', async () => {
    process.env = {
      ...originalEnv,
      HXA_CONNECT_BASE_URL: 'http://hxa.test/',
      HXA_CONNECT_ADMIN_SECRET: 'admin-secret',
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'http://hxa.test/health') {
        return new Response(JSON.stringify({ status: 'ok', connected_bots: 2 }), { status: 200 })
      }
      if (url === 'http://hxa.test/api/version') {
        return new Response(JSON.stringify({ version: '1.2.3', server: 'hxa-connect' }), { status: 200 })
      }
      if (url === 'http://hxa.test/api/stats') {
        return new Response(JSON.stringify({ org_count: 1, bot_count: 3, thread_count: 4 }), { status: 200 })
      }
      if (url === 'http://hxa.test/api/auth/login') {
        expect(JSON.parse(String(init?.body))).toEqual({ type: 'super_admin', admin_secret: 'admin-secret' })
        return new Response(JSON.stringify({ session: { role: 'super_admin' } }), {
          status: 200,
          headers: { 'set-cookie': 'hxa_session=session-1; HttpOnly; Path=/' },
        })
      }
      if (url === 'http://hxa.test/api/orgs') {
        expect((init?.headers as Record<string, string>).Cookie).toBe('hxa_session=session-1')
        return new Response(JSON.stringify([{ id: 'org-1', name: 'Default', status: 'active', bot_count: 3 }]), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getHxaOverview } = await loadHxaService()
    const overview = await getHxaOverview()

    expect(overview).toMatchObject({
      configured: true,
      online: true,
      baseUrl: 'http://hxa.test',
      version: { version: '1.2.3', server: 'hxa-connect' },
      stats: { org_count: 1, bot_count: 3, thread_count: 4 },
      orgs: [{ id: 'org-1', name: 'Default', status: 'active', bot_count: 3 }],
    })
    expect(JSON.stringify(overview)).not.toContain('admin-secret')
  })

  it('returns offline overview when hxa is unavailable', async () => {
    process.env = {
      ...originalEnv,
      HXA_CONNECT_BASE_URL: 'http://hxa.test',
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect failed')))

    const { getHxaOverview } = await loadHxaService()
    const overview = await getHxaOverview()

    expect(overview.online).toBe(false)
    expect(overview.error).toContain('connect failed')
  })
})
