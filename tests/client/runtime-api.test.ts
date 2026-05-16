// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('../../packages/client/src/api/client', () => ({
  request: mockRequest,
}))

import { fetchRuntimeStatus } from '../../packages/client/src/api/hermes/runtime'

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
})
