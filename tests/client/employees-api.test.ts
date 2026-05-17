// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('../../packages/client/src/api/client', () => ({
  request: mockRequest,
}))

import { checkEmployeeHealth, createEmployee, fetchEmployees, selectEmployee } from '../../packages/client/src/api/agentic/employees'

describe('Employees API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches employees', async () => {
    mockRequest.mockResolvedValue({ currentEmployeeId: 'default', employees: [] })

    await expect(fetchEmployees()).resolves.toMatchObject({ currentEmployeeId: 'default' })
    expect(mockRequest).toHaveBeenCalledWith('/api/employees')
  })

  it('creates and selects employees', async () => {
    mockRequest.mockResolvedValueOnce({ id: 'emp_1', name: '客服小美' })
    await createEmployee({ name: '客服小美', engineType: 'hms', systemRole: '客服' })
    expect(mockRequest).toHaveBeenCalledWith('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: '客服小美', engineType: 'hms', systemRole: '客服' }),
    })

    mockRequest.mockResolvedValueOnce({ currentEmployeeId: 'emp_1', employees: [] })
    await selectEmployee('emp_1')
    expect(mockRequest).toHaveBeenCalledWith('/api/employees/emp_1/select', { method: 'POST' })
  })

  it('checks employee health', async () => {
    mockRequest.mockResolvedValueOnce({ employee: { id: 'emp_1' }, runtime: { employeeId: 'emp_1' } })

    await checkEmployeeHealth('emp_1')

    expect(mockRequest).toHaveBeenCalledWith('/api/employees/emp_1/health', { method: 'POST' })
  })
})
