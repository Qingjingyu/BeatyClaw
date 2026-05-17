import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Employee } from '../../packages/server/src/services/agentic/employees'

describe('Employee process runtime adapter', () => {
  let instanceRoot = ''
  const originalEnv = process.env

  beforeEach(async () => {
    instanceRoot = await mkdtemp(join(tmpdir(), 'beautyclaw-runtime-process-'))
    process.env = { ...originalEnv }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(instanceRoot, { recursive: true, force: true })
  })

  function employee(id = 'emp_process', root = instanceRoot): Employee {
    return {
      id,
      name: '进程员工',
      engineType: 'hms',
      status: 'draft',
      systemRole: '',
      instanceRoot: root,
      runtimeUrl: '',
      containerName: `beautyclaw-employee-${id}`,
      port: null,
      healthStatus: 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async function waitForHealthy(adapter: Awaited<ReturnType<typeof import('../../packages/server/src/services/agentic/employee-runtime')>>['EmployeeRuntimeAdapter'], target: Employee) {
    let latest
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await adapter.health(target)
      if (latest.healthStatus === 'healthy') return latest
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    return latest
  }

  it('installs an HMS process runtime when deploy runs without explicit config', async () => {
    const { createEmployeeRuntimeAdapter } = await import('../../packages/server/src/services/agentic/employee-runtime')

    const state = await createEmployeeRuntimeAdapter('hms').deploy(employee())

    expect(state).toMatchObject({ mode: 'process', status: 'installed', healthStatus: 'stopped' })
  })

  it('writes process runtime state when engine command config is enabled', async () => {
    process.env.BEATYCLAW_HMS_ENABLED = '1'
    process.env.BEATYCLAW_HMS_START_COMMAND = process.execPath
    process.env.BEATYCLAW_HMS_START_ARGS = '-e setTimeout(() => {}, 200)'
    process.env.BEATYCLAW_HMS_HEALTH_URL = ''
    process.env.BEATYCLAW_HMS_PORT = '4567'

    const { createEmployeeRuntimeAdapter, getRuntimeStatePath } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee()

    await expect(adapter.deploy(target)).resolves.toMatchObject({ mode: 'process', status: 'installed', port: 4567 })
    await expect(adapter.start(target)).resolves.toMatchObject({ mode: 'process', status: 'running', port: 4567 })
    await expect(adapter.stop(target)).resolves.toMatchObject({ mode: 'process', status: 'stopped', healthStatus: 'stopped', pid: null })

    expect(JSON.parse(await readFile(getRuntimeStatePath(target), 'utf-8'))).toMatchObject({
      employeeId: 'emp_process',
      engineType: 'hms',
      mode: 'process',
      status: 'stopped',
      port: 4567,
    })
  })

  it('tracks an employee runtime as unhealthy when the process exits', async () => {
    process.env.BEATYCLAW_HMS_ENABLED = '1'
    process.env.BEATYCLAW_HMS_START_COMMAND = process.execPath
    process.env.BEATYCLAW_HMS_START_ARGS = '-e process.exit(0)'
    process.env.BEATYCLAW_HMS_HEALTH_URL = ''
    process.env.BEATYCLAW_HMS_PORT = '4569'

    const { createEmployeeRuntimeAdapter, getRuntimeStatePath } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee()

    const started = await adapter.start(target)
    expect(started).toMatchObject({
      mode: 'process',
      status: 'running',
      port: 4569,
      logPath: join(target.instanceRoot, 'logs', 'runtime.log'),
    })

    await new Promise(resolve => setTimeout(resolve, 80))
    await expect(adapter.health(target)).resolves.toMatchObject({
      status: 'failed',
      healthStatus: 'unhealthy',
      pid: null,
      lastError: 'Runtime process is not running',
    })
    expect(JSON.parse(await readFile(getRuntimeStatePath(target), 'utf-8'))).toMatchObject({
      status: 'failed',
      healthStatus: 'unhealthy',
      logPath: join(target.instanceRoot, 'logs', 'runtime.log'),
    })
  })

  it('uses command and env from the install manifest after deploy', async () => {
    process.env.BEATYCLAW_HMS_START_COMMAND = process.execPath
    process.env.BEATYCLAW_HMS_START_ARGS = '-e setTimeout(() => {}, 200)'
    process.env.BEATYCLAW_HMS_PORT = '4568'
    const { createEmployeeRuntimeAdapter, getRuntimeStatePath } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee()

    await adapter.deploy(target)
    const started = await adapter.start(target)
    expect(started).toMatchObject({ mode: 'process', status: 'running', port: 4568 })
    await expect(stat(started.logPath)).resolves.toBeTruthy()
    await expect(adapter.stop(target)).resolves.toMatchObject({ mode: 'process', status: 'stopped' })
    expect(JSON.parse(await readFile(getRuntimeStatePath(target), 'utf-8'))).toMatchObject({
      employeeId: target.id,
      mode: 'process',
      port: 4568,
      logPath: join(target.instanceRoot, 'logs', 'runtime.log'),
    })
  })

  it('can run two employee runtimes with isolated roots, ports, pids, and logs', async () => {
    const { createEmployeeRuntimeAdapter } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')

    process.env.BEATYCLAW_HMS_PORT = '4571'
    const first = employee('emp_process_a', join(instanceRoot, 'employee-a'))
    await adapter.deploy(first)
    const firstStarted = await adapter.start(first)

    process.env.BEATYCLAW_HMS_PORT = '4572'
    const second = employee('emp_process_b', join(instanceRoot, 'employee-b'))
    await adapter.deploy(second)
    const secondStarted = await adapter.start(second)

    expect(firstStarted).toMatchObject({
      employeeId: first.id,
      status: 'running',
      port: 4571,
      logPath: join(first.instanceRoot, 'logs', 'runtime.log'),
    })
    expect(secondStarted).toMatchObject({
      employeeId: second.id,
      status: 'running',
      port: 4572,
      logPath: join(second.instanceRoot, 'logs', 'runtime.log'),
    })
    expect(firstStarted.pid).toEqual(expect.any(Number))
    expect(secondStarted.pid).toEqual(expect.any(Number))
    expect(firstStarted.pid).not.toBe(secondStarted.pid)

    await expect(stat(firstStarted.logPath)).resolves.toBeTruthy()
    await expect(stat(secondStarted.logPath)).resolves.toBeTruthy()
    await expect(waitForHealthy(adapter, first)).resolves.toMatchObject({ employeeId: first.id, status: 'running', healthStatus: 'healthy', port: 4571 })
    await expect(waitForHealthy(adapter, second)).resolves.toMatchObject({ employeeId: second.id, status: 'running', healthStatus: 'healthy', port: 4572 })

    await expect(adapter.stop(first)).resolves.toMatchObject({ employeeId: first.id, status: 'stopped', pid: null })
    await expect(adapter.stop(second)).resolves.toMatchObject({ employeeId: second.id, status: 'stopped', pid: null })
  })
})
