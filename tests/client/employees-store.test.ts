// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockEmployeesApi = vi.hoisted(() => ({
  fetchEmployees: vi.fn(),
  createEmployee: vi.fn(),
  selectEmployee: vi.fn(),
  deployEmployee: vi.fn(),
  startEmployee: vi.fn(),
  stopEmployee: vi.fn(),
}))

vi.mock('@/api/agentic/employees', () => mockEmployeesApi)

import { useEmployeesStore } from '@/stores/agentic/employees'

describe('Employees Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads employees and resolves the current employee', async () => {
    mockEmployeesApi.fetchEmployees.mockResolvedValue({
      currentEmployeeId: 'emp_1',
      employees: [
        { id: 'default', name: 'BeatyClaw 数字员工', engineType: 'openclaw', status: 'draft' },
        { id: 'emp_1', name: '客服小美', engineType: 'hms', status: 'installed' },
      ],
    })

    const store = useEmployeesStore()
    await store.loadEmployees()

    expect(store.currentEmployee?.name).toBe('客服小美')
    expect(store.employees).toHaveLength(2)
  })

  it('creates and upserts an employee', async () => {
    mockEmployeesApi.createEmployee.mockResolvedValue({
      id: 'emp_1',
      name: '销售小白',
      engineType: 'openclaw',
      status: 'draft',
    })

    const store = useEmployeesStore()
    await store.createEmployee({ name: '销售小白', engineType: 'openclaw' })

    expect(store.employees[0].name).toBe('销售小白')
  })
})
