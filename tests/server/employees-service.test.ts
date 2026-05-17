import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('Employees service', () => {
  let authHome = ''
  const originalEnv = process.env

  beforeEach(async () => {
    authHome = await mkdtemp(join(tmpdir(), 'beautyclaw-employees-'))
    process.env = {
      ...originalEnv,
      YOYOO_AUTH_HOME: authHome,
    }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(authHome, { recursive: true, force: true })
  })

  async function waitForHealthy(service: typeof import('../../packages/server/src/services/agentic/employees'), id: string) {
    let latest
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await service.checkEmployeeHealth(id)
      if (latest.employee.healthStatus === 'healthy') return latest
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    return latest
  }

  it('seeds the default employee and selects it as current', async () => {
    const service = await import('../../packages/server/src/services/agentic/employees')

    const store = await service.listEmployees()

    expect(store.currentEmployeeId).toBe('default')
    expect(store.employees).toHaveLength(1)
    expect(store.employees[0]).toMatchObject({
      id: 'default',
      name: 'BeatyClaw 数字员工',
      engineType: 'openclaw',
      status: 'draft',
      instanceRoot: join(authHome, 'employees', 'default'),
      containerName: 'beautyclaw-employee-default',
      port: null,
      runtimeUrl: '',
      healthStatus: 'unknown',
    })
    await expect(stat(join(authHome, 'employees', 'default', 'config'))).resolves.toBeTruthy()
    await expect(stat(join(authHome, 'employees', 'default', 'data'))).resolves.toBeTruthy()
    await expect(stat(join(authHome, 'employees', 'default', 'logs'))).resolves.toBeTruthy()
    await expect(stat(join(authHome, 'employees', 'default', 'workspace'))).resolves.toBeTruthy()
  })

  it('creates, selects, deploys, starts, and stops an employee', async () => {
    const service = await import('../../packages/server/src/services/agentic/employees')

    const employee = await service.createEmployee({
      name: '客服小美',
      engineType: 'hms',
      systemRole: '你是客服数字员工。',
    })

    expect(employee).toMatchObject({
      name: '客服小美',
      engineType: 'hms',
      status: 'draft',
      systemRole: '你是客服数字员工。',
      instanceRoot: join(authHome, 'employees', employee.id),
      containerName: `beautyclaw-employee-${employee.id}`,
      port: null,
      runtimeUrl: '',
      healthStatus: 'unknown',
    })
    await expect(stat(join(employee.instanceRoot, 'config'))).resolves.toBeTruthy()
    await expect(stat(join(employee.instanceRoot, 'data'))).resolves.toBeTruthy()
    await expect(stat(join(employee.instanceRoot, 'logs'))).resolves.toBeTruthy()
    await expect(stat(join(employee.instanceRoot, 'workspace'))).resolves.toBeTruthy()

    await service.selectEmployee(employee.id)
    expect((await service.getCurrentEmployee()).id).toBe(employee.id)

    expect(await service.deployEmployee(employee.id)).toMatchObject({ id: employee.id, status: 'installed', healthStatus: 'stopped' })
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      employeeId: employee.id,
      engineType: 'hms',
      status: 'installed',
      healthStatus: 'stopped',
      mode: 'process',
      pid: null,
      lastError: '',
    })

    expect(await service.startEmployee(employee.id)).toMatchObject({ id: employee.id, status: 'running' })
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      status: 'running',
    })

    expect(await waitForHealthy(service, employee.id)).toMatchObject({
      employee: { id: employee.id, status: 'running', healthStatus: 'healthy' },
      runtime: { employeeId: employee.id, status: 'running', healthStatus: 'healthy' },
    })

    expect(await service.stopEmployee(employee.id)).toMatchObject({ id: employee.id, status: 'stopped', healthStatus: 'stopped' })
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      status: 'stopped',
      healthStatus: 'stopped',
    })
  })

  it('creates and provisions an employee into a healthy running runtime', async () => {
    const service = await import('../../packages/server/src/services/agentic/employees')

    const employee = await service.createProvisionedEmployee({
      name: '自动上岗员工',
      engineType: 'hms',
      systemRole: '你是自动部署测试员工。',
    })

    expect(employee).toMatchObject({
      name: '自动上岗员工',
      engineType: 'hms',
      status: 'running',
      healthStatus: 'healthy',
      systemRole: '你是自动部署测试员工。',
      instanceRoot: join(authHome, 'employees', employee.id),
      containerName: `beautyclaw-employee-${employee.id}`,
      visibility: 'visible',
      deletedAt: null,
    })
    await expect(stat(join(employee.instanceRoot, 'config'))).resolves.toBeTruthy()
    await expect(stat(join(employee.instanceRoot, 'workspace'))).resolves.toBeTruthy()
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      employeeId: employee.id,
      engineType: 'hms',
      status: 'running',
      healthStatus: 'healthy',
    })
  })

  it('marks only the new employee failed when auto provisioning cannot start', async () => {
    process.env.BEATYCLAW_HMS_START_ARGS = '/tmp/beautyclaw-missing-runtime-entry.mjs'
    process.env.BEATYCLAW_HMS_HEALTH_URL = 'http://127.0.0.1:9/health'
    const service = await import('../../packages/server/src/services/agentic/employees')

    const existing = await service.createProvisionedEmployee({ name: '正常员工', engineType: 'zylos' })
    const failed = await service.createProvisionedEmployee({ name: '失败员工', engineType: 'hms' }, { healthAttempts: 1, healthIntervalMs: 0 })

    expect(existing).toMatchObject({
      name: '正常员工',
      status: 'running',
      healthStatus: 'healthy',
    })
    expect(await service.getEmployee(existing.id)).toMatchObject({
      id: existing.id,
      status: 'running',
      healthStatus: 'healthy',
    })
    expect(failed).toMatchObject({
      name: '失败员工',
      status: 'failed',
      healthStatus: 'unhealthy',
    })
    await expect(stat(join(failed.instanceRoot, 'config'))).resolves.toBeTruthy()
    await expect(stat(join(failed.instanceRoot, 'workspace'))).resolves.toBeTruthy()
  })

  it('hides, restores, and soft deletes employees without removing instance data', async () => {
    const service = await import('../../packages/server/src/services/agentic/employees')

    const first = await service.createEmployee({ name: '常用员工', engineType: 'hms' })
    const second = await service.createEmployee({ name: '待删除员工', engineType: 'hms' })
    await service.selectEmployee(second.id)

    expect(await service.hideEmployee(first.id)).toMatchObject({
      id: first.id,
      visibility: 'hidden',
      deletedAt: null,
    })
    expect((await service.listEmployees()).employees.find(employee => employee.id === first.id)).toMatchObject({
      visibility: 'hidden',
    })

    expect(await service.showEmployee(first.id)).toMatchObject({
      id: first.id,
      visibility: 'visible',
      deletedAt: null,
    })

    const deleted = await service.softDeleteEmployee(second.id)
    expect(deleted).toMatchObject({
      id: second.id,
      visibility: 'hidden',
      deletedAt: expect.any(String),
      status: 'stopped',
      healthStatus: 'stopped',
    })
    await expect(stat(join(second.instanceRoot, 'workspace'))).resolves.toBeTruthy()
    expect((await service.getCurrentEmployee()).id).not.toBe(second.id)

    const restored = await service.restoreEmployee(second.id)
    expect(restored).toMatchObject({
      id: second.id,
      visibility: 'visible',
      deletedAt: null,
    })
  })
})
