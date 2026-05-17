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
      mode: 'local',
      pid: null,
      lastError: '',
    })

    expect(await service.startEmployee(employee.id)).toMatchObject({ id: employee.id, status: 'running', healthStatus: 'healthy' })
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      status: 'running',
      healthStatus: 'healthy',
    })

    expect(await service.checkEmployeeHealth(employee.id)).toMatchObject({
      employee: { id: employee.id, status: 'running', healthStatus: 'healthy' },
      runtime: { employeeId: employee.id, status: 'running', healthStatus: 'healthy' },
    })

    expect(await service.stopEmployee(employee.id)).toMatchObject({ id: employee.id, status: 'stopped', healthStatus: 'stopped' })
    expect(JSON.parse(await readFile(join(employee.instanceRoot, 'config', 'runtime-state.json'), 'utf-8'))).toMatchObject({
      status: 'stopped',
      healthStatus: 'stopped',
    })
  })
})
