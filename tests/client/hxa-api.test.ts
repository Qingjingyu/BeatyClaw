// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('../../packages/client/src/api/client', () => ({
  request: mockRequest,
}))

import { fetchHxaOverview } from '../../packages/client/src/api/agentic/hxa'

describe('Agentic HXA API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches hxa overview through the Agentic backend', async () => {
    mockRequest.mockResolvedValue({ online: true, stats: { bot_count: 2 } })

    await expect(fetchHxaOverview()).resolves.toEqual({ online: true, stats: { bot_count: 2 } })

    expect(mockRequest).toHaveBeenCalledWith('/api/agentic/hxa/overview')
  })
})
