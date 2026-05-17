import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Employee } from '../../packages/server/src/services/agentic/employees'

describe('Employee runtime installer', () => {
  let instanceRoot = ''
  const originalEnv = process.env

  beforeEach(async () => {
    instanceRoot = await mkdtemp(join(tmpdir(), 'beautyclaw-runtime-installer-'))
    process.env = { ...originalEnv }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(instanceRoot, { recursive: true, force: true })
  })

  function employee(portSeed = 'emp_hms'): Employee {
    return {
      id: portSeed,
      name: 'HMS 员工',
      engineType: 'hms',
      status: 'draft',
      systemRole: '',
      instanceRoot,
      runtimeUrl: '',
      containerName: `beautyclaw-employee-${portSeed}`,
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

  it('writes an HMS install manifest and placeholder launcher', async () => {
    process.env.BEATYCLAW_HMS_PORT = '4611'
    const { getInstallManifestPath, installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const target = employee()

    const manifest = await installEmployeeRuntime(target)

    expect(manifest).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      port: 4611,
      runtimeUrl: 'http://127.0.0.1:4611/health',
      startCommand: process.execPath,
    })
    expect(manifest.startArgs[0]).toContain('start-hms-placeholder.mjs')
    await expect(stat(manifest.startArgs[0])).resolves.toBeTruthy()
    expect(JSON.parse(await readFile(getInstallManifestPath(target), 'utf-8'))).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      port: 4611,
      installMode: 'placeholder',
    })
  })

  it('writes a Hermes gateway install manifest when requested', async () => {
    process.env.BEATYCLAW_HMS_INSTALL_MODE = 'hermes-gateway'
    process.env.BEATYCLAW_HMS_PORT = '4621'
    process.env.HERMES_BIN = '/usr/local/bin/hermes-test'
    const { getInstallManifestPath, installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const target = employee('emp_hms_gateway')

    const manifest = await installEmployeeRuntime(target)

    expect(manifest).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      installMode: 'hermes-gateway',
      port: 4621,
      runtimeUrl: 'http://127.0.0.1:4621/health',
      startCommand: '/usr/local/bin/hermes-test',
      startArgs: ['gateway', 'run', '--replace'],
      env: {
        HERMES_HOME: join(target.instanceRoot, 'config', 'hermes-home'),
        YOYOO_HOME: join(target.instanceRoot, 'data', 'yoyoo-home'),
        YOYOO_WORKSPACE: join(target.instanceRoot, 'workspace'),
        YOYOO_USER_ID: target.id,
      },
    })
    await expect(stat(join(target.instanceRoot, 'config', 'hermes-home', 'config.yaml'))).resolves.toBeTruthy()
    expect(await readFile(join(target.instanceRoot, 'config', 'hermes-home', 'config.yaml'), 'utf-8')).toContain('api_server')
    expect(JSON.parse(await readFile(getInstallManifestPath(target), 'utf-8'))).toMatchObject({
      installMode: 'hermes-gateway',
      startArgs: ['gateway', 'run', '--replace'],
    })
  })

  it('deploys and health-checks the placeholder HMS runtime through the process adapter', async () => {
    process.env.BEATYCLAW_HMS_PORT = '4612'
    const { createEmployeeRuntimeAdapter } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee('emp_hms_process')

    await expect(adapter.deploy(target)).resolves.toMatchObject({
      mode: 'process',
      status: 'installed',
      port: 4612,
      runtimeUrl: 'http://127.0.0.1:4612/health',
    })
    await expect(adapter.start(target)).resolves.toMatchObject({ mode: 'process', status: 'running' })
    await expect(waitForHealthy(adapter, target)).resolves.toMatchObject({ status: 'running', healthStatus: 'healthy' })
    await expect(adapter.stop(target)).resolves.toMatchObject({ status: 'stopped', healthStatus: 'stopped' })
  })
})
