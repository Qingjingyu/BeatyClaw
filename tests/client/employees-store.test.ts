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
  hideEmployee: vi.fn(),
  showEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  restoreEmployee: vi.fn(),
  checkEmployeeHealth: vi.fn(),
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
        {
          id: 'default',
          name: 'BeatyClaw 数字员工',
          engineType: 'openclaw',
          status: 'draft',
          instanceRoot: '/tmp/employees/default',
          runtimeUrl: '',
          containerName: 'beautyclaw-employee-default',
          port: null,
          healthStatus: 'unknown',
        },
        {
          id: 'emp_1',
          name: '客服小美',
          engineType: 'hms',
          status: 'installed',
          instanceRoot: '/tmp/employees/emp_1',
          runtimeUrl: '',
          containerName: 'beautyclaw-employee-emp_1',
          port: null,
          healthStatus: 'stopped',
        },
      ],
    })

    const store = useEmployeesStore()
    await store.loadEmployees()

    expect(store.currentEmployee?.name).toBe('客服小美')
    expect(store.employees).toHaveLength(2)
  })

  it('reuses a fresh employee list unless force reload is requested', async () => {
    mockEmployeesApi.fetchEmployees.mockResolvedValue({
      currentEmployeeId: 'emp_1',
      employees: [
        {
          id: 'emp_1',
          name: '缓存员工',
          engineType: 'hms',
          status: 'running',
          instanceRoot: '/tmp/employees/emp_1',
          runtimeUrl: '',
          containerName: 'beautyclaw-employee-emp_1',
          port: null,
          healthStatus: 'healthy',
        },
      ],
    })

    const store = useEmployeesStore()
    await store.loadEmployees()
    await store.loadEmployees()

    expect(mockEmployeesApi.fetchEmployees).toHaveBeenCalledTimes(1)

    await store.loadEmployees({ force: true })
    expect(mockEmployeesApi.fetchEmployees).toHaveBeenCalledTimes(2)
  })

  it('shows a deploying card while creating and replaces it with the provisioned employee', async () => {
    let resolveCreate: (employee: any) => void = () => {}
    mockEmployeesApi.createEmployee.mockReturnValue(new Promise(resolve => {
      resolveCreate = resolve
    }))

    const store = useEmployeesStore()
    const createPromise = store.createEmployee({ name: '销售小白', engineType: 'openclaw' })

    expect(store.saving).toBe(true)
    expect(store.employees).toHaveLength(1)
    expect(store.employees[0]).toMatchObject({
      name: '销售小白',
      engineType: 'openclaw',
      status: 'deploying',
      healthStatus: 'provisioning',
    })

    resolveCreate({
      id: 'emp_1',
      name: '销售小白',
      engineType: 'openclaw',
      status: 'running',
      instanceRoot: '/tmp/employees/emp_1',
      runtimeUrl: '',
      containerName: 'beautyclaw-employee-emp_1',
      port: null,
      healthStatus: 'healthy',
      visibility: 'visible',
      deletedAt: null,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    })

    await createPromise

    expect(store.saving).toBe(false)
    expect(store.employees).toHaveLength(1)
    expect(store.employees[0]).toMatchObject({
      id: 'emp_1',
      name: '销售小白',
      status: 'running',
      healthStatus: 'healthy',
    })
  })

  it('checks health and upserts returned employee', async () => {
    mockEmployeesApi.checkEmployeeHealth.mockResolvedValue({
      employee: {
        id: 'emp_1',
        name: '销售小白',
        engineType: 'openclaw',
        status: 'running',
        instanceRoot: '/tmp/employees/emp_1',
        runtimeUrl: '',
        containerName: 'beautyclaw-employee-emp_1',
        port: null,
        healthStatus: 'healthy',
      },
      runtime: { employeeId: 'emp_1', status: 'running', healthStatus: 'healthy' },
    })

    const store = useEmployeesStore()
    await store.checkEmployeeHealth('emp_1')

    expect(store.employees[0]).toMatchObject({ id: 'emp_1', status: 'running', healthStatus: 'healthy' })
  })

  it('filters visible employees and upserts lifecycle changes', async () => {
    mockEmployeesApi.hideEmployee.mockResolvedValue({
      id: 'emp_1',
      name: '隐藏员工',
      engineType: 'hms',
      status: 'running',
      visibility: 'hidden',
      deletedAt: null,
    })
    mockEmployeesApi.deleteEmployee.mockResolvedValue({
      id: 'emp_1',
      name: '隐藏员工',
      engineType: 'hms',
      status: 'stopped',
      healthStatus: 'stopped',
      visibility: 'hidden',
      deletedAt: '2026-05-17T00:00:00.000Z',
    })

    const store = useEmployeesStore()
    store.employees.push(
      { id: 'emp_1', name: '隐藏员工', engineType: 'hms', status: 'running', visibility: 'visible', deletedAt: null } as any,
      { id: 'emp_2', name: '常用员工', engineType: 'hms', status: 'running', visibility: 'visible', deletedAt: null } as any,
    )

    expect(store.sidebarEmployees.map(employee => employee.id)).toEqual(['emp_1', 'emp_2'])

    await store.hideEmployee('emp_1')
    expect(store.sidebarEmployees.map(employee => employee.id)).toEqual(['emp_2'])

    await store.deleteEmployee('emp_1')
    expect(store.deletedEmployees.map(employee => employee.id)).toEqual(['emp_1'])
  })
})
