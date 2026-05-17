import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
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

  function employee(): Employee {
    return {
      id: 'emp_process',
      name: '进程员工',
      engineType: 'hms',
      status: 'draft',
      systemRole: '',
      instanceRoot,
      runtimeUrl: '',
      containerName: 'beautyclaw-employee-emp_process',
      port: null,
      healthStatus: 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
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

  it('uses command and env from the install manifest after deploy', async () => {
    process.env.BEATYCLAW_HMS_START_COMMAND = process.execPath
    process.env.BEATYCLAW_HMS_START_ARGS = '-e setTimeout(() => {}, 200)'
    process.env.BEATYCLAW_HMS_PORT = '4568'
    const { createEmployeeRuntimeAdapter, getRuntimeStatePath } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee()

    await adapter.deploy(target)
    await expect(adapter.start(target)).resolves.toMatchObject({ mode: 'process', status: 'running', port: 4568 })
    await expect(adapter.stop(target)).resolves.toMatchObject({ mode: 'process', status: 'stopped' })
    expect(JSON.parse(await readFile(getRuntimeStatePath(target), 'utf-8'))).toMatchObject({
      employeeId: target.id,
      mode: 'process',
      port: 4568,
    })
  })
})
