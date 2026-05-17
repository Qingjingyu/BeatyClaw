// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('../../packages/client/src/api/client', () => ({
  request: mockRequest,
}))

import { fetchRuntimeDiagnostics, fetchRuntimeStatus } from '../../packages/client/src/api/hermes/runtime'

describe('Runtime API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the deployment runtime status', async () => {
    mockRequest.mockResolvedValue({
      provider: 'openai-direct',
      runtime: {
        provider: 'openai-direct',
        available: false,
        mode: 'not_configured',
        missingConfig: ['OPENAI_API_KEY'],
      },
    })

    await expect(fetchRuntimeStatus()).resolves.toMatchObject({
      provider: 'openai-direct',
      runtime: {
        provider: 'openai-direct',
        missingConfig: ['OPENAI_API_KEY'],
      },
    })
    expect(mockRequest).toHaveBeenCalledWith('/api/hermes/runtime/status')
  })

  it('fetches runtime self-check diagnostics', async () => {
    mockRequest.mockResolvedValue({
      provider: 'zylos',
      status: 'ok',
      generatedAt: '2026-05-17T10:00:00.000Z',
      checks: [{ key: 'runtime', label: 'Runtime SDK', status: 'ok', detail: 'ok' }],
    })

    await expect(fetchRuntimeDiagnostics()).resolves.toMatchObject({
      provider: 'zylos',
      status: 'ok',
      checks: [expect.objectContaining({ key: 'runtime' })],
    })
    expect(mockRequest).toHaveBeenCalledWith('/api/hermes/runtime/diagnostics')
  })
})
